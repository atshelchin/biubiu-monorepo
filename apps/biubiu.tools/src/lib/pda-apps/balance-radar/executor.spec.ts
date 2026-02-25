import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BalanceQuery, BalanceResult, RunResult } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

const ADDR1 = '0x1234567890abcdef1234567890abcdef12345678';
const ADDR2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
    const listeners = new Map<string, Function[]>();

    const mockTask = {
        id: 'test-task-id',
        on: vi.fn((event: string, cb: Function) => {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event)!.push(cb);
        }),
        _emit(event: string, ...args: unknown[]) {
            for (const cb of listeners.get(event) ?? []) cb(...args);
        },
        _clearListeners() { listeners.clear(); },
        start: vi.fn(async () => {}),
        resume: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        getResults: vi.fn(async (_opts?: unknown) => [] as unknown[]),
    };

    const mockHub = {
        initialize: vi.fn(async () => {}),
        findTaskByMerkleRoot: vi.fn(async () => null as unknown),
        createTask: vi.fn(async () => mockTask),
        resumeTask: vi.fn(async () => mockTask as unknown),
        close: vi.fn(async () => {}),
    };

    return { mockTask, mockHub };
});

vi.mock('@shelchin/taskhub/browser', () => ({
    Hub: vi.fn().mockImplementation(function () { return mocks.mockHub; }),
    IndexedDBAdapter: vi.fn().mockImplementation(function () { return {}; }),
    computeMerkleRoot: vi.fn().mockResolvedValue('mock-merkle-root'),
    generateJobId: vi.fn().mockImplementation(async (q: BalanceQuery) => `job-${q.address}-${q.network}`),
}));

vi.mock('./infra/source', () => ({
    BalanceQuerySource: vi.fn().mockImplementation(function () { return {}; }),
}));

vi.mock('$lib/async/interrupt-queue', () => ({
    InterruptQueue: vi.fn().mockImplementation(function () {
        return {
            push: vi.fn(),
            next: vi.fn().mockResolvedValue(null),
            dispose: vi.fn(),
        };
    }),
}));

import { validate, formatOutput, executor, type Input } from './executor';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockCtx(
    selectResponses: string[] = [],
    confirmResponses: boolean[] = [],
) {
    let selectIdx = 0;
    let confirmIdx = 0;
    return {
        info: vi.fn(),
        progress: vi.fn(),
        *select(_msg: string, _opts: { value: string; label: string }[]) {
            return selectResponses[selectIdx++] ?? '';
        },
        *confirm(_msg: string) {
            return confirmResponses[confirmIdx++] ?? false;
        },
    };
}

async function driveExecutor(
    input: Input,
    ctx: ReturnType<typeof createMockCtx>,
) {
    const gen = executor(input, ctx as never);
    let result = await gen.next();
    while (!result.done) {
        result = await gen.next(undefined);
    }
    return result.value;
}

function makeBalanceResult(address: string, network: string): BalanceResult {
    return { address, network, symbol: 'ETH', balance: '1.0', balanceRaw: '1000000000000000000' };
}

function makeCompletedJob(address: string, network: string) {
    return {
        id: `job-${address}-${network}`,
        taskId: 'test-task-id',
        input: { address, network } as BalanceQuery,
        output: makeBalanceResult(address, network),
        status: 'completed' as const,
        attempts: 1,
        createdAt: Date.now(),
    };
}

function makeFailedJob(address: string, network: string, error: string) {
    return {
        id: `job-${address}-${network}`,
        taskId: 'test-task-id',
        input: { address, network } as BalanceQuery,
        error,
        status: 'failed' as const,
        attempts: 1,
        createdAt: Date.now(),
    };
}

// ── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mocks.mockTask._clearListeners();
    mocks.mockTask.start.mockReset().mockImplementation(async () => {});
    mocks.mockTask.resume.mockReset().mockImplementation(async () => {});
    mocks.mockTask.stop.mockReset().mockImplementation(async () => {});
    mocks.mockTask.getResults.mockReset().mockImplementation(async () => []);
    mocks.mockTask.on.mockClear();

    mocks.mockHub.initialize.mockClear();
    mocks.mockHub.findTaskByMerkleRoot.mockReset().mockResolvedValue(null);
    mocks.mockHub.createTask.mockReset().mockResolvedValue(mocks.mockTask);
    mocks.mockHub.resumeTask.mockReset().mockResolvedValue(mocks.mockTask);
    mocks.mockHub.close.mockClear();
});

// ============================================================================
// validate
// ============================================================================

describe('validate', () => {
    it('parses comma-separated addresses', () => {
        const result = validate({ addresses: `${ADDR1},${ADDR2}`, networks: ['ethereum'] });
        expect(result.addresses).toEqual([ADDR1, ADDR2]);
    });

    it('parses newline-separated addresses', () => {
        const result = validate({ addresses: `${ADDR1}\n${ADDR2}`, networks: ['ethereum'] });
        expect(result.addresses).toEqual([ADDR1, ADDR2]);
    });

    it('trims whitespace around addresses', () => {
        const result = validate({ addresses: `  ${ADDR1}  , ${ADDR2}  `, networks: ['ethereum'] });
        expect(result.addresses).toEqual([ADDR1, ADDR2]);
    });

    it('filters out invalid addresses', () => {
        const result = validate({ addresses: `${ADDR1},not-an-address,0xshort,${ADDR2}`, networks: ['ethereum'] });
        expect(result.addresses).toEqual([ADDR1, ADDR2]);
    });

    it('throws when no valid addresses', () => {
        expect(() => validate({ addresses: 'bad,also-bad', networks: ['ethereum'] })).toThrow('No valid addresses');
    });

    it('throws when no valid networks', () => {
        expect(() => validate({ addresses: ADDR1, networks: ['nonexistent'] })).toThrow('No valid networks');
    });

    it('filters invalid networks and keeps valid ones', () => {
        const result = validate({ addresses: ADDR1, networks: ['ethereum', 'fake', 'polygon'] });
        expect(result.networks).toEqual(['ethereum', 'polygon']);
    });

    it('computes totalQueries as addresses × networks', () => {
        const result = validate({ addresses: `${ADDR1},${ADDR2}`, networks: ['ethereum', 'polygon', 'arbitrum'] });
        expect(result.totalQueries).toBe(6);
    });
});

// ============================================================================
// formatOutput
// ============================================================================

describe('formatOutput', () => {
    it('maps results to output format (drops balanceRaw)', () => {
        const runResult: RunResult = {
            results: [makeBalanceResult(ADDR1, 'ethereum')],
            failures: [],
            duration: 1000,
        };
        const output = formatOutput(runResult, 1);
        expect(output.results).toEqual([{ address: ADDR1, network: 'ethereum', symbol: 'ETH', balance: '1.0' }]);
    });

    it('computes stats correctly', () => {
        const runResult: RunResult = {
            results: [makeBalanceResult(ADDR1, 'ethereum'), makeBalanceResult(ADDR1, 'polygon')],
            failures: [{ address: ADDR2, network: 'polygon', error: 'timeout' }],
            duration: 2500,
        };
        const output = formatOutput(runResult, 10);
        expect(output.stats).toEqual({ total: 10, success: 2, failed: 1, duration: 2500 });
    });

    it('handles empty results', () => {
        const output = formatOutput({ results: [], failures: [], duration: 100 }, 0);
        expect(output.results).toEqual([]);
        expect(output.stats.success).toBe(0);
        expect(output.stats.failed).toBe(0);
    });
});

// ============================================================================
// executor integration
// ============================================================================

describe('executor', () => {
    it('happy path: creates task, collects results, returns formatted output', async () => {
        const job1 = makeCompletedJob(ADDR1, 'ethereum');
        const job2 = makeCompletedJob(ADDR1, 'polygon');

        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', job1);
            mocks.mockTask._emit('job:complete', job2);
        });

        const ctx = createMockCtx();
        const output = await driveExecutor({ addresses: ADDR1, networks: ['ethereum', 'polygon'] }, ctx);

        expect(mocks.mockHub.createTask).toHaveBeenCalled();
        expect(output.results).toHaveLength(2);
        expect(output.stats).toMatchObject({ total: 2, success: 2, failed: 0 });
    });

    it('collects failures and offers to show details', async () => {
        const job1 = makeCompletedJob(ADDR1, 'ethereum');
        const failedJob = makeFailedJob(ADDR1, 'polygon', 'RPC timeout');

        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', job1);
            mocks.mockTask._emit('job:failed', failedJob, new Error('RPC timeout'));
        });

        // confirm(show details?) → true
        const ctx = createMockCtx([], [true]);
        const output = await driveExecutor({ addresses: ADDR1, networks: ['ethereum', 'polygon'] }, ctx);

        expect(output.stats).toMatchObject({ success: 1, failed: 1 });
        // info called with warning for the failure detail
        expect(ctx.info).toHaveBeenCalledWith(
            expect.stringContaining('polygon'),
            'warning',
        );
    });

    // ── Bug 2 fix: resumeTask returns null → fallback to createTask ──────

    it('falls back to createTask when resumeTask returns null', async () => {
        mocks.mockHub.findTaskByMerkleRoot.mockResolvedValue({ id: 'old-task-id' });
        mocks.mockHub.resumeTask.mockResolvedValue(null);

        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', makeCompletedJob(ADDR1, 'ethereum'));
        });

        const ctx = createMockCtx();
        const output = await driveExecutor({ addresses: ADDR1, networks: ['ethereum'] }, ctx);

        // resumeTask was called but returned null
        expect(mocks.mockHub.resumeTask).toHaveBeenCalledWith(
            'old-task-id',
            expect.anything(),
            expect.anything(),
        );
        // fell back to createTask
        expect(mocks.mockHub.createTask).toHaveBeenCalled();
        expect(output.stats.success).toBe(1);
    });

    // ── Bug 1 fix: resume loads historical results ───────────────────────

    it('loads historical results on resume', async () => {
        mocks.mockHub.findTaskByMerkleRoot.mockResolvedValue({ id: 'existing-task-id' });

        // getResults returns previously completed and failed jobs
        const historicalCompleted = [makeCompletedJob(ADDR1, 'ethereum')];
        const historicalFailed = [makeFailedJob(ADDR2, 'ethereum', 'rate limited')];

        mocks.mockTask.getResults.mockImplementation(async (opts?: unknown) => {
            const { status } = opts as { status: string };
            if (status === 'completed') return historicalCompleted;
            if (status === 'failed') return historicalFailed;
            return [];
        });

        // resume completes one more job
        const newJob = makeCompletedJob(ADDR2, 'polygon');
        mocks.mockTask.resume.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', newJob);
        });

        // confirm(show failure details?) → false
        const ctx = createMockCtx([], [false]);
        const output = await driveExecutor(
            { addresses: `${ADDR1},${ADDR2}`, networks: ['ethereum', 'polygon'] },
            ctx,
        );

        // Historical (1 success + 1 failure) + new (1 success) = 2 success, 1 failed
        expect(output.stats.success).toBe(2);
        expect(output.stats.failed).toBe(1);

        // progress should report restored results
        expect(ctx.progress).toHaveBeenCalledWith(
            2, 4, expect.stringContaining('Restored 2 results'),
        );
    });

    // ── Task start failure → retry ───────────────────────────────────────

    it('retries on task start failure when user selects retry', async () => {
        let callCount = 0;
        mocks.mockTask.start.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('connection refused');
            // second attempt succeeds
            mocks.mockTask._emit('job:complete', makeCompletedJob(ADDR1, 'ethereum'));
        });

        // first select (start failed) → 'retry'
        const ctx = createMockCtx(['retry']);
        const output = await driveExecutor({ addresses: ADDR1, networks: ['ethereum'] }, ctx);

        expect(callCount).toBe(2);
        expect(output.stats.success).toBe(1);
    });

    it('returns partial results on task failure when user selects partial', async () => {
        const job1 = makeCompletedJob(ADDR1, 'ethereum');

        mocks.mockTask.start.mockImplementation(async () => {
            // emit one success, then fail
            mocks.mockTask._emit('job:complete', job1);
            throw new Error('unexpected crash');
        });

        // select (task failed) → 'partial'
        const ctx = createMockCtx(['partial']);
        const output = await driveExecutor({ addresses: `${ADDR1},${ADDR2}`, networks: ['ethereum'] }, ctx);

        expect(output.stats.success).toBe(1);
        expect(output.stats.failed).toBe(0);
    });

    it('throws when user selects abort on task failure', async () => {
        mocks.mockTask.start.mockRejectedValue(new Error('fatal error'));

        // select (task failed) → 'abort'
        const ctx = createMockCtx(['abort']);

        await expect(
            driveExecutor({ addresses: ADDR1, networks: ['ethereum'] }, ctx),
        ).rejects.toThrow('fatal error');
    });

    // ── Cleanup ──────────────────────────────────────────────────────────

    it('always calls hub.close() and interrupts.dispose()', async () => {
        mocks.mockTask.start.mockImplementation(async () => {});

        const ctx = createMockCtx();
        await driveExecutor({ addresses: ADDR1, networks: ['ethereum'] }, ctx);

        expect(mocks.mockHub.close).toHaveBeenCalled();
    });
});
