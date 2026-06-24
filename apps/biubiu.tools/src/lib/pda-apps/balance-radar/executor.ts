import { createTaskHub, computeMerkleRoot, generateJobId, type Job } from '@shelchin/taskhub/browser';
import { formatUnits } from 'viem';
import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { inputSchema, outputSchema } from './schema';
import type {
    BalanceResult,
    BalanceFailure,
    ValidatedInput,
    RunResult,
    NetworkJob,
    NetworkJobResult,
    NetworkConfig,
    NetworkTokenSelection,
    TokenSpec,
} from './types';
import { mergeNetworks, nativeToken } from './infra/networks';
import { BalanceQuerySource } from './infra/source';
import { runControl } from './infra/run-control';
import { InterruptQueue } from '$lib/async/interrupt-queue';

export type Input = {
    addresses: string;
    networks: string[];
    tokenSelections?: NetworkTokenSelection[];
    customNetworks?: NetworkConfig[];
};
type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

export function validate(input: Input): ValidatedInput {
    const customNetworks = (input.customNetworks ?? []).map((n) => ({ ...n, isCustom: true }));
    const { networks: registry } = mergeNetworks(customNetworks);

    // Parse, validate, and de-duplicate (case-insensitive) so 100k pasted rows
    // with repeats don't turn into wasted RPC calls.
    const seen = new Set<string>();
    const addresses: string[] = [];
    for (const raw of input.addresses.split(/[,\n]/)) {
        const a = raw.trim();
        if (!a.startsWith('0x') || a.length !== 42) continue;
        const key = a.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(a);
    }

    const networks = input.networks.filter((n) => registry[n]);

    if (addresses.length === 0) {
        throw new Error(
            'No valid addresses provided. Addresses must start with 0x and be 42 characters long.'
        );
    }

    if (networks.length === 0) {
        throw new Error('No valid networks selected.');
    }

    // Resolve which tokens to query per network. Default = native coin only.
    const selectionByNetwork = new Map<string, TokenSpec[]>();
    for (const sel of input.tokenSelections ?? []) {
        if (sel.tokens.length > 0) selectionByNetwork.set(sel.network, sel.tokens);
    }

    const tokensByNetwork: Record<string, TokenSpec[]> = {};
    let totalQueries = 0;
    for (const network of networks) {
        const tokens = selectionByNetwork.get(network) ?? [nativeToken(registry[network])];
        tokensByNetwork[network] = tokens;
        totalQueries += addresses.length * tokens.length;
    }

    return {
        addresses,
        networks,
        tokensByNetwork,
        networkConfigs: registry,
        customNetworks,
        totalQueries,
    };
}

function flattenJobResult(jobOutput: NetworkJobResult): BalanceResult[] {
    const { token } = jobOutput;
    return jobOutput.results.map(({ address, balance }) => ({
        address,
        network: jobOutput.network,
        symbol: token.symbol,
        tokenAddress: token.kind === 'erc20' ? token.address : undefined,
        balance: formatUnits(BigInt(balance), token.decimals),
        balanceRaw: balance,
    }));
}

async function* run(
    validated: ValidatedInput,
    ctx: Ctx
): AsyncGenerator<InteractionRequest, RunResult, InteractionResponse | undefined> {
    const { addresses, networks, tokensByNetwork, customNetworks, totalQueries } = validated;

    ctx.info(
        `Starting batch query: ${addresses.length} addresses × ${networks.length} networks = ${totalQueries} queries`
    );

    const startTime = Date.now();

    // 200 addresses per multicall: one eth_call carries the whole chunk, but kept
    // modest so a single response stays within public-RPC gas/size limits (500 was
    // rejected by weaker endpoints). The vendor pool retries failed chunks elsewhere.
    const CHUNK_SIZE = 200;
    const source = new BalanceQuerySource(addresses, tokensByNetwork, customNetworks, CHUNK_SIZE);
    const hub = await createTaskHub();

    // Scale worker concurrency with the number of networks so per-network RPC
    // pools aren't starved by a fixed global cap; per-endpoint rate limiting in
    // the vendor pool is the safety valve against hammering any single RPC.
    const networkCount = Math.max(1, networks.length);
    const concurrency = {
        min: 1,
        initial: Math.min(12, Math.max(3, networkCount * 2)),
        max: Math.min(24, Math.max(6, networkCount * 4)),
    };

    // Compute merkle root from the chunked jobs for idempotent lookup
    const jobs = source.getData();
    const jobIds = await Promise.all(jobs.map((q) => generateJobId(q)));
    const merkleRoot = await computeMerkleRoot(jobIds);

    // Try to resume existing task, or create new one
    const existing = await hub.findTaskByMerkleRoot(merkleRoot);
    let isResume = false;
    let task;

    if (existing) {
        const resumed = await hub.resumeTask(existing.id, source, { concurrency });
        if (resumed) {
            task = resumed;
            isResume = true;
            ctx.info(`Resuming task ${task.id} from previous session`);
        }
    }

    if (!task) {
        task = await hub.createTask({
            name: `Balance Query - ${new Date().toISOString()}`,
            source,
            concurrency,
        });
        ctx.info(`Created task ${task.id} with ${jobs.length} jobs (${totalQueries} total queries)`);
    }

    // Track results and failures
    const results: BalanceResult[] = [];
    const failures: BalanceFailure[] = [];
    let completedQueries = 0;

    // On resume, load results from previous session
    if (isResume) {
        const pageSize = 100;

        for (let offset = 0; ; offset += pageSize) {
            const batch = await task.getResults({ status: 'completed', limit: pageSize, offset });
            for (const job of batch) {
                if (job.output) {
                    const flattened = flattenJobResult(job.output);
                    results.push(...flattened);
                }
            }
            if (batch.length < pageSize) break;
        }

        for (let offset = 0; ; offset += pageSize) {
            const batch = await task.getResults({ status: 'failed', limit: pageSize, offset });
            for (const job of batch) {
                const token = job.input.token;
                for (const addr of job.input.addresses) {
                    failures.push({
                        address: addr,
                        network: job.input.network,
                        symbol: token?.symbol,
                        tokenAddress: token?.kind === 'erc20' ? token.address : undefined,
                        error: job.error ?? 'Unknown error',
                    });
                }
            }
            if (batch.length < pageSize) break;
        }

        completedQueries = results.length + failures.length;
        if (completedQueries > 0) {
            ctx.progress(completedQueries, totalQueries, `Restored ${completedQueries} results from previous session`);
        }
    }

    // Interrupt queue: bridges TaskHub events → generator yield points
    const interrupts = new InterruptQueue();

    task.on('job:complete', (job: Job<NetworkJob, NetworkJobResult>) => {
        const output = job.output;
        if (output) {
            const flattened = flattenJobResult(output);
            results.push(...flattened);
            completedQueries += flattened.length;
            ctx.progress(
                completedQueries,
                totalQueries,
                `Queried ${output.network}: ${flattened.length} addresses`
            );
        }
    });

    task.on('job:failed', (job: Job<NetworkJob, NetworkJobResult>, error: Error) => {
        const jobInput = job.input;
        const token = jobInput.token;
        for (const addr of jobInput.addresses) {
            failures.push({
                address: addr,
                network: jobInput.network,
                symbol: token?.symbol,
                tokenAddress: token?.kind === 'erc20' ? token.address : undefined,
                error: error.message,
            });
        }
        completedQueries += jobInput.addresses.length;

        ctx.progress(
            completedQueries,
            totalQueries,
            `Failed ${jobInput.network} ${token?.symbol ?? ''}: ${jobInput.addresses.length} addresses`
        );
    });

    task.on('rate-limited', (concurrency: number) => {
        if (concurrency <= 1) {
            interrupts.push({
                type: 'rate-limited',
                data: { concurrency },
            });
        }
    });

    // Start task in background (don't await — we need the loop for interrupts)
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

        // Outer loop: retry on task-level failure
        // Inner loop: poll interrupts while task is running
        let done = false;
        let userAborted = false;
        while (!done) {
            while (!taskCompleted) {
                // User pressed Stop: halt the task, keep whatever we've collected.
                if (runControl.aborted) {
                    ctx.info('Stopped by user — returning partial results', 'warning');
                    await task.stop();
                    userAborted = true;
                    break;
                }

                const interrupt = await interrupts.next(1000);

                if (interrupt?.type === 'rate-limited') {
                    ctx.info('All RPC endpoints are rate-limited, task paused', 'warning');

                    const action = yield* ctx.select(
                        'All RPC endpoints are being rate-limited. What would you like to do?',
                        [
                            { value: 'wait', label: 'Wait and retry automatically' },
                            { value: 'abort', label: 'Stop and return partial results' },
                        ]
                    );

                    if (action === 'abort') {
                        await task.stop();
                        break;
                    }

                    ctx.info('Continuing... task will retry with backoff');
                }
            }

            if (userAborted) {
                done = true;
            } else if (!taskError) {
                done = true;
            } else {
                const err = taskError as Error;
                const action = yield* ctx.select(
                    `Task ${isResume ? 'resume' : 'start'} failed: ${err.message}`,
                    [
                        { value: 'retry', label: 'Retry' },
                        { value: 'partial', label: `Return partial results (${results.length} succeeded)` },
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
        results,
        failures,
        duration: Date.now() - startTime,
    };
}

export function formatOutput({ results, failures, duration }: RunResult, totalQueries: number) {
    return {
        results: results.map((r) => ({
            address: r.address,
            network: r.network,
            symbol: r.symbol,
            tokenAddress: r.tokenAddress,
            balance: r.balance,
        })),
        failures: failures.map((f) => ({
            address: f.address,
            network: f.network,
            symbol: f.symbol,
            tokenAddress: f.tokenAddress,
            error: f.error,
        })),
        stats: {
            total: totalQueries,
            success: results.length,
            failed: failures.length,
            duration,
        },
    };
}

// ============================================================================
// Executor: validate → run (with mid-run interaction) → formatOutput
// ============================================================================

export const executor: AppConfig<typeof inputSchema, typeof outputSchema>['executor'] = async function* (input, ctx) {
    const validated = validate(input);
    const result = yield* run(validated, ctx);

    // Post-run interaction (app-specific)
    if (result.failures.length > 0) {
        const showDetails = yield* ctx.confirm(`${result.failures.length} queries failed. Show details?`);
        if (showDetails) {
            for (const f of result.failures.slice(0, 5)) {
                ctx.info(`${f.network}:${f.address.slice(0, 10)}... - ${f.error}`, 'warning');
            }
            if (result.failures.length > 5) {
                ctx.info(`... and ${result.failures.length - 5} more failures`, 'warning');
            }
        }
    }

    ctx.info(
        `Completed in ${(result.duration / 1000).toFixed(2)}s: ${result.results.length} success, ${result.failures.length} failed`
    );

    return formatOutput(result, validated.totalQueries);
};
