import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BatchInput, BatchOutput, WalletDeps } from './types';
import type { Hex } from 'viem';

// ── Constants ───────────────────────────────────────────────────────────

const ADDR1 = '0x1111111111111111111111111111111111111111' as const;
const ADDR2 = '0x2222222222222222222222222222222222222222' as const;
const ADDR3 = '0x3333333333333333333333333333333333333333' as const;
const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;

// ── Mocks ───────────────────────────────────────────────────────────────

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
        getResults: vi.fn(async () => [] as unknown[]),
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
    generateJobId: vi.fn().mockImplementation(async (q: BatchInput) =>
        `job-batch-${q.batchIndex}`
    ),
}));

vi.mock('./infra/source', () => ({
    TransferBatchSource: vi.fn().mockImplementation(function (
        this: { getJobId: (input: BatchInput) => string },
    ) {
        this.getJobId = (input: BatchInput) => `batch-${input.batchIndex}-${input.recipients.length}-${input.totalValue}`;
    }),
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

import { validate, formatOutput, createExecutor, parseRecipients, type Input } from './executor';

// ── Helpers ─────────────────────────────────────────────────────────────

function createMockWallet(overrides: Partial<WalletDeps> = {}): WalletDeps {
    return {
        account: ADDR1,
        sendTransaction: vi.fn().mockResolvedValue(TX_HASH),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
            transactionHash: TX_HASH,
            status: 'success',
            gasUsed: 21000n,
            blockNumber: 1n,
        }),
        readContract: vi.fn().mockResolvedValue(0n),
        getBalance: vi.fn().mockResolvedValue(10n ** 18n), // 1 ETH
        ...overrides,
    };
}

function createMockCtx(
    selectResponses: string[] = [],
    confirmResponses: boolean[] = [],
) {
    let selectIdx = 0;
    let confirmIdx = 0;
    return {
        info: vi.fn(),
        progress: vi.fn(),
        signal: new AbortController().signal,
        *select(_msg: string, _opts: { value: string; label: string }[]) {
            return selectResponses[selectIdx++] ?? '';
        },
        *confirm(_msg: string) {
            return confirmResponses[confirmIdx++] ?? false;
        },
    };
}

async function driveExecutor(input: Input, ctx: ReturnType<typeof createMockCtx>, wallet: WalletDeps) {
    const executor = createExecutor(wallet);
    const gen = executor(input, ctx as never);
    let result = await gen.next();
    while (!result.done) {
        result = await gen.next(undefined);
    }
    return result.value;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('parseRecipients', () => {
    it('parses address,amount lines for specified mode', () => {
        const result = parseRecipients(`${ADDR1},1.5\n${ADDR2},2.5`, 'specified', 18);
        expect(result).toHaveLength(2);
        expect(result[0].address).toBe(ADDR1);
        expect(result[0].amount).toBe(1500000000000000000n);
        expect(result[1].amount).toBe(2500000000000000000n);
    });

    it('parses tab-separated lines', () => {
        const result = parseRecipients(`${ADDR1}\t1.0`, 'specified', 18);
        expect(result).toHaveLength(1);
        expect(result[0].amount).toBe(1000000000000000000n);
    });

    it('skips invalid addresses', () => {
        const result = parseRecipients(`${ADDR1},1\nbadaddr,2\n0xshort,3`, 'specified', 18);
        expect(result).toHaveLength(1);
    });

    it('skips lines without amount in specified mode', () => {
        const result = parseRecipients(`${ADDR1},1\n${ADDR2}`, 'specified', 18);
        expect(result).toHaveLength(1);
    });

    it('computes equal amounts for equal mode', () => {
        const result = parseRecipients(`${ADDR1}\n${ADDR2}`, 'equal', 18, '3');
        expect(result).toHaveLength(2);
        const total = result[0].amount + result[1].amount;
        expect(total).toBe(3000000000000000000n);
    });

    it('gives dust to first recipient in equal mode', () => {
        const result = parseRecipients(`${ADDR1}\n${ADDR2}\n${ADDR3}`, 'equal', 18, '1');
        const total = result.reduce((sum, r) => sum + r.amount, 0n);
        expect(total).toBe(1000000000000000000n);
        // First recipient gets dust
        expect(result[0].amount).toBeGreaterThanOrEqual(result[1].amount);
    });

    it('throws when totalAmount missing for equal mode', () => {
        expect(() => parseRecipients(`${ADDR1}`, 'equal', 18)).toThrow('totalAmount is required');
    });

    it('skips comment lines starting with #', () => {
        const result = parseRecipients(`# header\n${ADDR1},1\n# comment\n${ADDR2},2`, 'specified', 18);
        expect(result).toHaveLength(2);
    });

    it('skips empty lines', () => {
        const result = parseRecipients(`\n${ADDR1},1\n\n\n${ADDR2},2\n`, 'specified', 18);
        expect(result).toHaveLength(2);
    });

    it('handles different decimal counts', () => {
        const result = parseRecipients(`${ADDR1},100`, 'specified', 6); // USDC 6 decimals
        expect(result[0].amount).toBe(100000000n);
    });
});

describe('validate', () => {
    it('validates network exists', () => {
        expect(() => validate({
            recipients: `${ADDR1},1`,
            network: 'nonexistent',
            tokenType: 'native',
            distributionMode: 'specified',
            batchSize: 200,
        })).toThrow('Unknown network');
    });

    it('requires token address for erc20', () => {
        expect(() => validate({
            recipients: `${ADDR1},1`,
            network: 'ethereum',
            tokenType: 'erc20',
            distributionMode: 'specified',
            batchSize: 200,
        })).toThrow('valid ERC20 token address');
    });

    it('rejects invalid token address for erc20', () => {
        expect(() => validate({
            recipients: `${ADDR1},1`,
            network: 'ethereum',
            tokenType: 'erc20',
            tokenAddress: '0xinvalid',
            distributionMode: 'specified',
            batchSize: 200,
        })).toThrow('valid ERC20 token address');
    });

    it('throws when no valid recipients', () => {
        expect(() => validate({
            recipients: 'badaddr,1',
            network: 'ethereum',
            tokenType: 'native',
            distributionMode: 'specified',
            batchSize: 200,
        })).toThrow('No valid recipients');
    });

    it('chunks recipients into batches', () => {
        const addrs = Array.from({ length: 5 }, (_, i) => {
            const hex = i.toString(16).padStart(40, '0');
            return `0x${hex},1`;
        }).join('\n');

        const result = validate({
            recipients: addrs,
            network: 'ethereum',
            tokenType: 'native',
            distributionMode: 'specified',
            batchSize: 2,
        });

        expect(result.batches).toHaveLength(3); // ceil(5/2) = 3
        expect(result.batches[0].recipients).toHaveLength(2);
        expect(result.batches[1].recipients).toHaveLength(2);
        expect(result.batches[2].recipients).toHaveLength(1);
    });

    it('stores amounts as strings in batches', () => {
        const result = validate({
            recipients: `${ADDR1},1\n${ADDR2},2`,
            network: 'ethereum',
            tokenType: 'native',
            distributionMode: 'specified',
            batchSize: 200,
        });

        expect(typeof result.batches[0].amounts[0]).toBe('string');
        expect(typeof result.batches[0].totalValue).toBe('string');
    });

    it('computes correct totalAmount', () => {
        const result = validate({
            recipients: `${ADDR1},1.5\n${ADDR2},2.5`,
            network: 'ethereum',
            tokenType: 'native',
            distributionMode: 'specified',
            batchSize: 200,
        });

        expect(result.totalAmount).toBe(4000000000000000000n);
    });
});

describe('formatOutput', () => {
    it('formats batch results with explorer URLs', () => {
        const output = formatOutput(
            {
                batchResults: [{
                    batchIndex: 0,
                    txHash: TX_HASH,
                    totalSent: (10n ** 18n).toString(),
                    successCount: 5,
                    failedIndices: [],
                    gasUsed: '100000',
                }],
                failures: [],
                duration: 5000,
            },
            {
                recipients: Array(5).fill({ address: ADDR1, amount: 2n * 10n ** 17n }),
                network: 'ethereum',
                tokenType: 'native',
                tokenAddress: null,
                distributionMode: 'specified',
                totalAmount: 10n ** 18n,
                batchSize: 200,
                batches: [{
                    batchIndex: 0,
                    recipients: Array(5).fill(ADDR1),
                    amounts: Array(5).fill((2n * 10n ** 17n).toString()),
                    totalValue: (10n ** 18n).toString(),
                }],
            },
        );

        expect(output.batches[0].explorerUrl).toContain('etherscan.io');
        expect(output.batches[0].txHash).toBe(TX_HASH);
        expect(output.stats.totalSent).toBe('1');
        expect(output.stats.successBatches).toBe(1);
        expect(output.stats.failedBatches).toBe(0);
        expect(output.stats.totalRecipients).toBe(5);
        expect(output.stats.duration).toBe(5000);
    });

    it('reports failed batches in stats', () => {
        const output = formatOutput(
            {
                batchResults: [{
                    batchIndex: 0,
                    txHash: TX_HASH,
                    totalSent: (5n * 10n ** 17n).toString(),
                    successCount: 3,
                    failedIndices: [1, 2],
                }],
                failures: [{ batchIndex: 1, error: 'reverted' }],
                duration: 3000,
            },
            {
                recipients: Array(5).fill({ address: ADDR1, amount: 10n ** 17n }),
                network: 'ethereum',
                tokenType: 'native',
                tokenAddress: null,
                distributionMode: 'specified',
                totalAmount: 5n * 10n ** 17n,
                batchSize: 3,
                batches: [
                    { batchIndex: 0, recipients: [ADDR1, ADDR2, ADDR3], amounts: ['100000000000000000', '100000000000000000', '100000000000000000'], totalValue: '300000000000000000' },
                    { batchIndex: 1, recipients: [ADDR1, ADDR2], amounts: ['100000000000000000', '100000000000000000'], totalValue: '200000000000000000' },
                ],
            },
        );

        expect(output.stats.successBatches).toBe(1);
        expect(output.stats.failedBatches).toBe(1);
        expect(output.stats.totalFailedIndices).toBe(2);
    });
});

describe('executor', () => {
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

    it('happy path: native distribution with one batch', async () => {
        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', {
                id: 'job-0',
                taskId: 'test-task-id',
                input: {
                    batchIndex: 0,
                    recipients: [ADDR2],
                    amounts: [(10n ** 18n).toString()],
                    totalValue: (10n ** 18n).toString(),
                },
                output: {
                    batchIndex: 0,
                    txHash: TX_HASH,
                    totalSent: (10n ** 18n).toString(),
                    successCount: 1,
                    failedIndices: [],
                },
                status: 'completed',
                attempts: 1,
                createdAt: Date.now(),
            });
        });

        const wallet = createMockWallet();
        // confirm(send?) → true
        const ctx = createMockCtx([], [true]);
        const output = await driveExecutor(
            {
                recipients: `${ADDR2},1`,
                network: 'ethereum',
                tokenType: 'native',
                distributionMode: 'specified',
                batchSize: 200,
            },
            ctx,
            wallet,
        );

        expect(output.stats.successBatches).toBe(1);
        expect(output.stats.failedBatches).toBe(0);
        expect(mocks.mockHub.createTask).toHaveBeenCalled();
        expect(mocks.mockHub.close).toHaveBeenCalled();
    });

    it('cancels when user declines confirmation', async () => {
        const wallet = createMockWallet();
        // confirm(send?) → false
        const ctx = createMockCtx([], [false]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},1`,
                    network: 'ethereum',
                    tokenType: 'native',
                    distributionMode: 'specified',
                    batchSize: 200,
                },
                ctx,
                wallet,
            ),
        ).rejects.toThrow('cancelled by user');
    });

    it('checks native balance before confirming', async () => {
        const wallet = createMockWallet({
            getBalance: vi.fn().mockResolvedValue(100n), // way too little
        });
        const ctx = createMockCtx([], [true]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},1`,
                    network: 'ethereum',
                    tokenType: 'native',
                    distributionMode: 'specified',
                    batchSize: 200,
                },
                ctx,
                wallet,
            ),
        ).rejects.toThrow('Insufficient');
    });

    it('always calls hub.close() even on error', async () => {
        const wallet = createMockWallet();
        const ctx = createMockCtx([], [true]);

        mocks.mockTask.start.mockImplementation(async () => {
            throw new Error('task boom');
        });

        // select(task failed) → abort
        const ctxWithSelect = createMockCtx(['abort'], [true]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},1`,
                    network: 'ethereum',
                    tokenType: 'native',
                    distributionMode: 'specified',
                    batchSize: 200,
                },
                ctxWithSelect,
                wallet,
            ),
        ).rejects.toThrow();

        expect(mocks.mockHub.close).toHaveBeenCalled();
    });
});
