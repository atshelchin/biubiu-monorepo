import {
    Hub, IndexedDBAdapter, computeMerkleRoot, type Job,
} from '@shelchin/taskhub/browser';
import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { isAddress, type Address } from 'viem';
import { inputSchema, outputSchema } from './schema';
import type {
    NftBatchInput, NftBatchOutput, BatchFailure,
    ValidatedInput, RunResult, NftRecipient,
    WalletDeps, NftType,
} from './types';
import { NETWORKS } from './infra/networks';
import { NftTransferBatchSource } from './infra/source';
import { buildSetApprovalForAllTx, ERC721_ABI, ERC1155_ABI } from './infra/contracts';
import { InterruptQueue } from '$lib/async/interrupt-queue';

// ── Types ───────────────────────────────────────────────────────────────

export type Input = {
    recipients: string;
    network: string;
    nftType: NftType;
    nftAddress: string;
    batchSize: number;
};

type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

// ── Validate ────────────────────────────────────────────────────────────

export function parseRecipients(
    raw: string,
    nftType: NftType,
): NftRecipient[] {
    const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

    const recipients: NftRecipient[] = [];

    for (const line of lines) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        const address = parts[0];

        if (!isAddress(address)) {
            continue;
        }

        const tokenId = parts[1];
        if (!tokenId || tokenId.length === 0) continue;
        if (!/^\d+$/.test(tokenId)) continue;

        if (nftType === 'erc721') {
            recipients.push({
                address: address as Address,
                tokenId,
            });
        } else {
            const amount = parts[2];
            if (!amount || !/^\d+$/.test(amount) || amount === '0') continue;
            recipients.push({
                address: address as Address,
                tokenId,
                amount,
            });
        }
    }

    return recipients;
}

function chunkRecipients(recipients: NftRecipient[], batchSize: number): NftBatchInput[] {
    const batches: NftBatchInput[] = [];
    for (let i = 0; i < recipients.length; i += batchSize) {
        const chunk = recipients.slice(i, i + batchSize);
        const batch: NftBatchInput = {
            batchIndex: batches.length,
            recipients: chunk.map((r) => r.address),
            tokenIds: chunk.map((r) => r.tokenId),
        };

        if (chunk[0]?.amount !== undefined) {
            batch.amounts = chunk.map((r) => r.amount!);
        }

        batches.push(batch);
    }
    return batches;
}

export function validate(input: Input): ValidatedInput {
    const networkConfig = NETWORKS[input.network];
    if (!networkConfig) {
        throw new Error(
            `Unknown network: "${input.network}". Available: ${Object.keys(NETWORKS).join(', ')}`
        );
    }

    if (!input.nftAddress || !isAddress(input.nftAddress)) {
        throw new Error('A valid NFT contract address is required');
    }

    const nftAddress = input.nftAddress as Address;

    const recipients = parseRecipients(input.recipients, input.nftType);

    if (recipients.length === 0) {
        const formatHint = input.nftType === 'erc721'
            ? '"address,tokenId"'
            : '"address,tokenId,amount"';
        throw new Error(
            `No valid recipients found. Each line should be ${formatHint}.`
        );
    }

    if (input.nftType === 'erc721') {
        const seen = new Set<string>();
        for (const r of recipients) {
            if (seen.has(r.tokenId)) {
                throw new Error(`Duplicate tokenId: ${r.tokenId}. Each ERC721 token can only be sent once.`);
            }
            seen.add(r.tokenId);
        }
    }

    const batches = chunkRecipients(recipients, input.batchSize);

    return {
        recipients,
        network: input.network,
        nftType: input.nftType,
        nftAddress,
        batchSize: input.batchSize,
        batches,
    };
}

// ── Run ─────────────────────────────────────────────────────────────────

async function* run(
    validated: ValidatedInput,
    ctx: Ctx,
    wallet: WalletDeps,
): AsyncGenerator<InteractionRequest, RunResult, InteractionResponse | undefined> {
    const { batches, network, nftType, nftAddress, recipients } = validated;
    const networkConfig = NETWORKS[network];
    const totalBatches = batches.length;

    const nftTypeLabel = nftType === 'erc721' ? 'ERC-721' : 'ERC-1155';
    ctx.info(
        `Preparing to distribute ${recipients.length} ${nftTypeLabel} NFTs to ${recipients.length} recipients in ${totalBatches} batch(es)`
    );

    // ── Preflight: Check approval ───────────────────────────────────────

    const spender = nftType === 'erc721'
        ? networkConfig.erc721DistributionAddress
        : networkConfig.erc1155DistributionAddress;

    const abi = nftType === 'erc721' ? ERC721_ABI : ERC1155_ABI;

    const isApproved = await wallet.readContract({
        address: nftAddress,
        abi,
        functionName: 'isApprovedForAll',
        args: [wallet.account, spender],
    }) as boolean;

    if (!isApproved) {
        const doApprove = yield* ctx.confirm(
            `Approval needed: the distribution contract is not approved to transfer your ${nftTypeLabel} NFTs. Approve now?`
        );

        if (!doApprove) {
            throw new Error('NFT approval cancelled');
        }

        ctx.info('Sending setApprovalForAll transaction...');
        const approveTx = buildSetApprovalForAllTx(nftAddress, spender, true, nftType);
        const approveHash = await wallet.sendTransaction(approveTx);
        ctx.info(`Approval tx sent: ${approveHash}`);

        const receipt = await wallet.waitForTransactionReceipt(approveHash);
        if (receipt.status === 'reverted') {
            throw new Error(`Approval transaction reverted: ${approveHash}`);
        }
        ctx.info('Approval confirmed');
    }

    // ── Confirmation ────────────────────────────────────────────────────

    const confirmed = yield* ctx.confirm(
        `Send ${recipients.length} ${nftTypeLabel} NFTs to ${recipients.length} addresses in ${totalBatches} batch(es)?`
    );

    if (!confirmed) {
        throw new Error('Distribution cancelled by user');
    }

    // ── TaskHub setup ───────────────────────────────────────────────────

    const startTime = Date.now();

    const source = new NftTransferBatchSource(
        batches, wallet, networkConfig, nftType, nftAddress,
    );
    const storage = new IndexedDBAdapter();
    const hub = new Hub(storage);
    await hub.initialize();

    const jobIds = batches.map((b) => source.getJobId!(b));
    const merkleRoot = await computeMerkleRoot(jobIds);

    const existing = await hub.findTaskByMerkleRoot(merkleRoot);
    let isResume = false;
    let task;

    if (existing) {
        const resumed = await hub.resumeTask(existing.id, source, {
            concurrency: { min: 1, max: 1, initial: 1 },
        });
        if (resumed) {
            task = resumed;
            isResume = true;
            ctx.info(`Resuming task ${task.id} from previous session`);
        }
    }

    if (!task) {
        task = await hub.createTask({
            name: `NFT Multisender - ${new Date().toISOString()}`,
            source,
            concurrency: { min: 1, max: 1, initial: 1 },
        });
        ctx.info(`Created task ${task.id} with ${totalBatches} batch jobs`);
    }

    // ── Track results ───────────────────────────────────────────────────

    const batchResults: NftBatchOutput[] = [];
    const failures: BatchFailure[] = [];
    let completed = 0;

    if (isResume) {
        const pageSize = 100;

        for (let offset = 0; ; offset += pageSize) {
            const batch = await task.getResults({ status: 'completed', limit: pageSize, offset });
            for (const job of batch) {
                if (job.output) batchResults.push(job.output);
            }
            if (batch.length < pageSize) break;
        }

        for (let offset = 0; ; offset += pageSize) {
            const batch = await task.getResults({ status: 'failed', limit: pageSize, offset });
            for (const job of batch) {
                failures.push({
                    batchIndex: job.input.batchIndex,
                    error: job.error ?? 'Unknown error',
                });
            }
            if (batch.length < pageSize) break;
        }

        completed = batchResults.length + failures.length;
        if (completed > 0) {
            ctx.progress(completed, totalBatches, `Restored ${completed} batch results from previous session`);
        }
    }

    // ── Event handlers + interrupt queue ─────────────────────────────────

    const interrupts = new InterruptQueue();
    let aborted = false;

    task.on('job:complete', (job: Job<NftBatchInput, NftBatchOutput>) => {
        if (aborted) return;
        completed++;
        const result = job.output;
        if (result) {
            batchResults.push(result);
            ctx.progress(
                completed,
                totalBatches,
                `Batch ${result.batchIndex + 1}/${totalBatches} confirmed: tx ${result.txHash.slice(0, 14)}...`
            );
        }
    });

    task.on('job:failed', (job: Job<NftBatchInput, NftBatchOutput>, error: Error) => {
        if (aborted) return;
        completed++;
        failures.push({
            batchIndex: job.input.batchIndex,
            error: error.message,
        });

        ctx.progress(
            completed,
            totalBatches,
            `Batch ${job.input.batchIndex + 1}/${totalBatches} failed: ${error.message.slice(0, 60)}`
        );

        interrupts.push({
            type: 'batch-failed',
            data: { batchIndex: job.input.batchIndex, error: error.message },
        });
    });

    // ── Start task in background ────────────────────────────────────────

    let taskCompleted = false;
    let taskError: Error | null = null;

    const launchTask = () => {
        taskCompleted = false;
        taskError = null;
        const done = isResume ? task.resume() : task.start();
        done
            .then(() => { taskCompleted = true; })
            .catch((err: Error) => { taskCompleted = true; taskError = err; })
            .catch(() => {}); // suppress any unhandled rejection from the chain
    };

    try {
        launchTask();

        let done = false;
        while (!done) {
            while (!taskCompleted) {
                const interrupt = await interrupts.next(2000);

                if (interrupt?.type === 'batch-failed') {
                    const { batchIndex, error } = interrupt.data as {
                        batchIndex: number; error: string;
                    };

                    const action = yield* ctx.select(
                        `Batch ${batchIndex + 1} failed: ${error}\nWhat would you like to do?`,
                        [
                            { value: 'continue', label: 'Skip this batch and continue' },
                            { value: 'abort', label: 'Stop and return partial results' },
                        ]
                    );

                    if (action === 'abort') {
                        aborted = true;
                        await task.stop();
                        break;
                    }
                }
            }

            if (!taskError) {
                done = true;
            } else {
                const err = taskError as Error;
                const action = yield* ctx.select(
                    `Task failed: ${err.message}`,
                    [
                        { value: 'retry', label: 'Retry' },
                        {
                            value: 'partial',
                            label: `Return partial results (${batchResults.length} batches succeeded)`,
                        },
                        { value: 'abort', label: 'Abort' },
                    ]
                );

                if (action === 'retry') {
                    launchTask();
                } else if (action === 'abort') {
                    throw err;
                } else {
                    done = true;
                }
            }
        }
    } finally {
        interrupts.dispose();
        await hub.close();
    }

    return {
        batchResults,
        failures,
        duration: Date.now() - startTime,
    };
}

// ── Format Output ───────────────────────────────────────────────────────

export function formatOutput(
    result: RunResult,
    validated: ValidatedInput,
) {
    const networkConfig = NETWORKS[validated.network];

    const totalSuccessCount = result.batchResults.reduce(
        (sum, r) => sum + r.successCount, 0
    );
    const totalFailedIndices = result.batchResults.reduce(
        (sum, r) => sum + r.failedIndices.length, 0
    );
    const totalSent = result.batchResults.reduce(
        (sum, r) => sum + BigInt(r.totalSent), 0n
    );

    return {
        batches: result.batchResults.map((b) => ({
            batchIndex: b.batchIndex,
            txHash: b.txHash,
            successCount: b.successCount,
            failedCount: b.failedIndices.length,
            totalSent: b.totalSent,
            explorerUrl: `${networkConfig.explorerUrl}/tx/${b.txHash}`,
        })),
        stats: {
            totalBatches: validated.batches.length,
            successBatches: result.batchResults.length,
            failedBatches: result.failures.length,
            totalRecipients: validated.recipients.length,
            totalSuccessCount,
            totalFailedIndices,
            totalSent: totalSent.toString(),
            duration: result.duration,
        },
    };
}

// ── Executor Factory ────────────────────────────────────────────────────

export function createExecutor(
    wallet: WalletDeps,
): AppConfig<typeof inputSchema, typeof outputSchema>['executor'] {
    return async function* (input, ctx) {
        const validated = validate(input);
        const result = yield* run(validated, ctx, wallet);

        if (result.failures.length > 0) {
            const showDetails = yield* ctx.confirm(
                `${result.failures.length} batch(es) failed. Show details?`
            );
            if (showDetails) {
                for (const f of result.failures.slice(0, 5)) {
                    ctx.info(`Batch ${f.batchIndex + 1}: ${f.error}`, 'warning');
                }
                if (result.failures.length > 5) {
                    ctx.info(`... and ${result.failures.length - 5} more failures`, 'warning');
                }
            }
        }

        const nftTypeLabel = validated.nftType === 'erc721' ? 'ERC-721' : 'ERC-1155';
        ctx.info(
            `Completed in ${(result.duration / 1000).toFixed(2)}s: ` +
            `${result.batchResults.length} batches sent, ` +
            `${result.batchResults.reduce((s, r) => s + r.successCount, 0)} ${nftTypeLabel} NFTs distributed`
        );

        return formatOutput(result, validated);
    };
}
