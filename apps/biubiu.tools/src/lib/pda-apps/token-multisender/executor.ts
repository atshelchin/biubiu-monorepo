import {
    Hub, IndexedDBAdapter, computeMerkleRoot, type Job,
} from '@shelchin/taskhub/browser';
import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { isAddress, parseUnits, formatUnits, type Address } from 'viem';
import { inputSchema, outputSchema } from './schema';
import type {
    BatchInput, BatchOutput, BatchFailure,
    ValidatedInput, RunResult, Recipient,
    WalletDeps, TokenType, DistributionMode,
} from './types';
import { NETWORKS } from './infra/networks';
import { TransferBatchSource } from './infra/source';
import { buildApproveTx, ERC20_ABI } from './infra/contracts';
import { InterruptQueue } from '$lib/async/interrupt-queue';

// ── Types ───────────────────────────────────────────────────────────────

export type Input = {
    recipients: string;
    network: string;
    tokenType: TokenType;
    tokenAddress?: string;
    distributionMode: DistributionMode;
    totalAmount?: string;
    batchSize: number;
};

type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

// ── Validate ────────────────────────────────────────────────────────────

export function parseRecipients(
    raw: string,
    mode: DistributionMode,
    decimals: number,
    totalAmount?: string,
): Recipient[] {
    const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

    const recipients: Recipient[] = [];

    for (const line of lines) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        const address = parts[0];

        if (!isAddress(address)) {
            continue;
        }

        let amount: bigint;
        if (mode === 'specified') {
            const amountStr = parts[1];
            if (!amountStr) continue;
            amount = parseUnits(amountStr, decimals);
        } else {
            amount = 0n;
        }

        recipients.push({ address: address as Address, amount });
    }

    if (mode === 'equal') {
        if (!totalAmount) {
            throw new Error('totalAmount is required for equal distribution mode');
        }
        const total = parseUnits(totalAmount, decimals);
        const perRecipient = total / BigInt(recipients.length);
        const dust = total - perRecipient * BigInt(recipients.length);

        for (let i = 0; i < recipients.length; i++) {
            recipients[i].amount = i === 0 ? perRecipient + dust : perRecipient;
        }
    }

    return recipients;
}

function chunkRecipients(recipients: Recipient[], batchSize: number): BatchInput[] {
    const batches: BatchInput[] = [];
    for (let i = 0; i < recipients.length; i += batchSize) {
        const chunk = recipients.slice(i, i + batchSize);
        const batchRecipients = chunk.map((r) => r.address);
        const batchAmounts = chunk.map((r) => r.amount.toString());
        const totalValue = chunk.reduce((sum, r) => sum + r.amount, 0n);

        batches.push({
            batchIndex: batches.length,
            recipients: batchRecipients,
            amounts: batchAmounts,
            totalValue: totalValue.toString(),
        });
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

    let tokenAddress: Address | null = null;
    if (input.tokenType === 'erc20') {
        if (!input.tokenAddress || !isAddress(input.tokenAddress)) {
            throw new Error('A valid ERC20 token address is required');
        }
        tokenAddress = input.tokenAddress as Address;
    }

    const decimals = networkConfig.decimals;

    const recipients = parseRecipients(
        input.recipients,
        input.distributionMode,
        decimals,
        input.totalAmount,
    );

    if (recipients.length === 0) {
        throw new Error(
            'No valid recipients found. Each line should be "address,amount" (for specified mode) or "address" (for equal mode).'
        );
    }

    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0n);
    if (totalAmount === 0n) {
        throw new Error('Total amount is zero');
    }

    const batches = chunkRecipients(recipients, input.batchSize);

    return {
        recipients,
        network: input.network,
        tokenType: input.tokenType,
        tokenAddress,
        distributionMode: input.distributionMode,
        totalAmount,
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
    const { batches, network, tokenType, tokenAddress, totalAmount, recipients } = validated;
    const networkConfig = NETWORKS[network];
    const totalBatches = batches.length;
    const decimals = networkConfig.decimals;

    ctx.info(
        `Preparing to send ${formatUnits(totalAmount, decimals)} ${networkConfig.symbol} to ${recipients.length} recipients in ${totalBatches} batch(es)`
    );

    // ── Preflight: ERC20 checks ─────────────────────────────────────────

    let tokenSymbol = networkConfig.symbol;
    let tokenDecimals = decimals;

    if (tokenType === 'erc20' && tokenAddress) {
        const [symbol, fetchedDecimals] = await Promise.all([
            wallet.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'symbol',
            }) as Promise<string>,
            wallet.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'decimals',
            }) as Promise<number>,
        ]);

        tokenSymbol = symbol;
        tokenDecimals = fetchedDecimals;
        ctx.info(`Token: ${tokenSymbol} (${tokenDecimals} decimals)`);

        // Check balance
        const balance = await wallet.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [wallet.account],
        }) as bigint;

        if (balance < totalAmount) {
            throw new Error(
                `Insufficient ${tokenSymbol} balance: have ${formatUnits(balance, tokenDecimals)}, need ${formatUnits(totalAmount, tokenDecimals)}`
            );
        }

        // Check allowance
        const spender = networkConfig.erc20DistributionAddress;
        const allowance = await wallet.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [wallet.account, spender],
        }) as bigint;

        if (allowance < totalAmount) {
            const doApprove = yield* ctx.confirm(
                `Approval needed: current allowance is ${formatUnits(allowance, tokenDecimals)} ${tokenSymbol}, ` +
                `need ${formatUnits(totalAmount, tokenDecimals)}. Approve now?`
            );

            if (!doApprove) {
                throw new Error('Token approval cancelled');
            }

            ctx.info('Sending approval transaction...');
            const maxApproval = 2n ** 256n - 1n;
            const approveTx = buildApproveTx(tokenAddress, spender, maxApproval);
            const approveHash = await wallet.sendTransaction(approveTx);
            ctx.info(`Approval tx sent: ${approveHash}`);

            const receipt = await wallet.waitForTransactionReceipt(approveHash);
            if (receipt.status === 'reverted') {
                throw new Error(`Approval transaction reverted: ${approveHash}`);
            }
            ctx.info('Approval confirmed');
        }
    } else {
        // Native token: check balance
        const balance = await wallet.getBalance(wallet.account);
        if (balance < totalAmount) {
            throw new Error(
                `Insufficient ${networkConfig.symbol} balance: have ${formatUnits(balance, decimals)}, need ${formatUnits(totalAmount, decimals)}`
            );
        }
    }

    // ── Confirmation ────────────────────────────────────────────────────

    const confirmed = yield* ctx.confirm(
        `Send ${formatUnits(totalAmount, tokenDecimals)} ${tokenSymbol} to ${recipients.length} addresses in ${totalBatches} batch(es)?`
    );

    if (!confirmed) {
        throw new Error('Distribution cancelled by user');
    }

    // ── TaskHub setup ───────────────────────────────────────────────────

    const startTime = Date.now();

    const source = new TransferBatchSource(
        batches, wallet, networkConfig, tokenType, tokenAddress,
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
            name: `Token Multisender - ${new Date().toISOString()}`,
            source,
            concurrency: { min: 1, max: 1, initial: 1 },
        });
        ctx.info(`Created task ${task.id} with ${totalBatches} batch jobs`);
    }

    // ── Track results ───────────────────────────────────────────────────

    const batchResults: BatchOutput[] = [];
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

    task.on('job:complete', (job: Job<BatchInput, BatchOutput>) => {
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

    task.on('job:failed', (job: Job<BatchInput, BatchOutput>, error: Error) => {
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
            .catch((err: Error) => { taskCompleted = true; taskError = err; });
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

    const totalSent = result.batchResults.reduce(
        (sum, r) => sum + BigInt(r.totalSent), 0n
    );
    const totalSuccessCount = result.batchResults.reduce(
        (sum, r) => sum + r.successCount, 0
    );
    const totalFailedIndices = result.batchResults.reduce(
        (sum, r) => sum + r.failedIndices.length, 0
    );

    return {
        batches: result.batchResults.map((b) => ({
            batchIndex: b.batchIndex,
            txHash: b.txHash,
            totalSent: formatUnits(BigInt(b.totalSent), networkConfig.decimals),
            successCount: b.successCount,
            failedCount: b.failedIndices.length,
            explorerUrl: `${networkConfig.explorerUrl}/tx/${b.txHash}`,
        })),
        stats: {
            totalBatches: validated.batches.length,
            successBatches: result.batchResults.length,
            failedBatches: result.failures.length,
            totalRecipients: validated.recipients.length,
            totalSent: formatUnits(totalSent, networkConfig.decimals),
            totalSuccessCount,
            totalFailedIndices,
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

        const networkConfig = NETWORKS[validated.network];
        const totalSent = result.batchResults.reduce(
            (sum, r) => sum + BigInt(r.totalSent), 0n
        );
        ctx.info(
            `Completed in ${(result.duration / 1000).toFixed(2)}s: ` +
            `${result.batchResults.length} batches sent, ` +
            `${formatUnits(totalSent, networkConfig.decimals)} ${networkConfig.symbol} distributed`
        );

        return formatOutput(result, validated);
    };
}
