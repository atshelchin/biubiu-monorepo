import { createTaskHub, computeMerkleRoot, generateJobId, type Job } from '@shelchin/taskhub/browser';
import { formatUnits } from 'viem';
import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { inputSchema, outputSchema } from './schema';
import type { BalanceResult, BalanceFailure, ValidatedInput, RunResult, NetworkJob, NetworkJobResult } from './types';
import { NETWORKS } from './infra/networks';
import { BalanceQuerySource } from './infra/source';
import { InterruptQueue } from '$lib/async/interrupt-queue';

export type Input = { addresses: string; networks: string[] };
type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

export function validate(input: Input): ValidatedInput {
    const addresses = input.addresses
        .split(/[,\n]/)
        .map((a) => a.trim())
        .filter((a) => a.startsWith('0x') && a.length === 42);

    const networks = input.networks.filter((n) => NETWORKS[n]);

    if (addresses.length === 0) {
        throw new Error(
            'No valid addresses provided. Addresses must start with 0x and be 42 characters long.'
        );
    }

    if (networks.length === 0) {
        throw new Error('No valid networks selected.');
    }

    return {
        addresses,
        networks,
        totalQueries: addresses.length * networks.length,
    };
}

function flattenJobResult(jobOutput: NetworkJobResult): BalanceResult[] {
    const config = NETWORKS[jobOutput.network];
    return jobOutput.results.map(({ address, balance }) => ({
        address,
        network: jobOutput.network,
        symbol: config.symbol,
        balance: formatUnits(BigInt(balance), config.decimals),
        balanceRaw: balance,
    }));
}

async function* run(
    validated: ValidatedInput,
    ctx: Ctx
): AsyncGenerator<InteractionRequest, RunResult, InteractionResponse | undefined> {
    const { addresses, networks, totalQueries } = validated;

    ctx.info(
        `Starting batch query: ${addresses.length} addresses × ${networks.length} networks = ${totalQueries} queries`
    );

    const startTime = Date.now();

    const CHUNK_SIZE = 100;
    const source = new BalanceQuerySource(addresses, networks, CHUNK_SIZE);
    const hub = await createTaskHub();

    // Compute merkle root from the chunked jobs for idempotent lookup
    const jobs = source.getData();
    const jobIds = await Promise.all(jobs.map((q) => generateJobId(q)));
    const merkleRoot = await computeMerkleRoot(jobIds);

    // Try to resume existing task, or create new one
    const existing = await hub.findTaskByMerkleRoot(merkleRoot);
    let isResume = false;
    let task;

    if (existing) {
        const resumed = await hub.resumeTask(existing.id, source, {
            concurrency: { min: 1, max: 6, initial: 3 },
        });
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
            concurrency: { min: 1, max: 6, initial: 3 },
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
                for (const addr of job.input.addresses) {
                    failures.push({
                        address: addr,
                        network: job.input.network,
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
        for (const addr of jobInput.addresses) {
            failures.push({ address: addr, network: jobInput.network, error: error.message });
        }
        completedQueries += jobInput.addresses.length;

        ctx.progress(
            completedQueries,
            totalQueries,
            `Failed ${jobInput.network}: ${jobInput.addresses.length} addresses`
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
        while (!done) {
            while (!taskCompleted) {
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

            if (!taskError) {
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
            balance: r.balance,
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
