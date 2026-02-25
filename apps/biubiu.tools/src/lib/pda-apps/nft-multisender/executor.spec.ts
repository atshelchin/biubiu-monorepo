import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NftBatchInput, NftBatchOutput, WalletDeps } from './types';
import type { Hex } from 'viem';

// ── Constants ───────────────────────────────────────────────────────────

const ADDR1 = '0x1111111111111111111111111111111111111111' as const;
const ADDR2 = '0x2222222222222222222222222222222222222222' as const;
const ADDR3 = '0x3333333333333333333333333333333333333333' as const;
const NFT_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const TX_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;

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
    generateJobId: vi.fn().mockImplementation(async (q: NftBatchInput) =>
        `job-nft-batch-${q.batchIndex}`
    ),
}));

vi.mock('./infra/source', () => ({
    NftTransferBatchSource: vi.fn().mockImplementation(function (
        this: { getJobId: (input: NftBatchInput) => string },
    ) {
        this.getJobId = (input: NftBatchInput) => `nft-batch-${input.batchIndex}-${input.recipients.length}-${input.tokenIds[0] ?? '0'}`;
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
        readContract: vi.fn().mockResolvedValue(true), // isApprovedForAll → true
        getBalance: vi.fn().mockResolvedValue(10n ** 18n),
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
    it('parses address,tokenId lines for ERC721', () => {
        const result = parseRecipients(`${ADDR1},100\n${ADDR2},200`, 'erc721');
        expect(result).toHaveLength(2);
        expect(result[0].address).toBe(ADDR1);
        expect(result[0].tokenId).toBe('100');
        expect(result[0].amount).toBeUndefined();
        expect(result[1].tokenId).toBe('200');
    });

    it('parses address,tokenId,amount lines for ERC1155', () => {
        const result = parseRecipients(`${ADDR1},100,5\n${ADDR2},200,10`, 'erc1155');
        expect(result).toHaveLength(2);
        expect(result[0].tokenId).toBe('100');
        expect(result[0].amount).toBe('5');
        expect(result[1].tokenId).toBe('200');
        expect(result[1].amount).toBe('10');
    });

    it('parses tab-separated lines', () => {
        const result = parseRecipients(`${ADDR1}\t100`, 'erc721');
        expect(result).toHaveLength(1);
        expect(result[0].tokenId).toBe('100');
    });

    it('skips invalid addresses', () => {
        const result = parseRecipients(`${ADDR1},100\nbadaddr,200\n0xshort,300`, 'erc721');
        expect(result).toHaveLength(1);
    });

    it('skips lines without tokenId', () => {
        const result = parseRecipients(`${ADDR1},100\n${ADDR2}`, 'erc721');
        expect(result).toHaveLength(1);
    });

    it('skips non-integer tokenIds', () => {
        const result = parseRecipients(`${ADDR1},abc\n${ADDR2},1.5\n${ADDR3},100`, 'erc721');
        expect(result).toHaveLength(1);
        expect(result[0].address).toBe(ADDR3);
    });

    it('skips ERC1155 lines without amount', () => {
        const result = parseRecipients(`${ADDR1},100,5\n${ADDR2},200`, 'erc1155');
        expect(result).toHaveLength(1);
    });

    it('skips ERC1155 lines with zero amount', () => {
        const result = parseRecipients(`${ADDR1},100,0\n${ADDR2},200,5`, 'erc1155');
        expect(result).toHaveLength(1);
        expect(result[0].address).toBe(ADDR2);
    });

    it('skips comment lines starting with #', () => {
        const result = parseRecipients(`# header\n${ADDR1},100\n# comment\n${ADDR2},200`, 'erc721');
        expect(result).toHaveLength(2);
    });

    it('skips empty lines', () => {
        const result = parseRecipients(`\n${ADDR1},100\n\n\n${ADDR2},200\n`, 'erc721');
        expect(result).toHaveLength(2);
    });
});

describe('validate', () => {
    it('validates network exists', () => {
        expect(() => validate({
            recipients: `${ADDR1},100`,
            network: 'nonexistent',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        })).toThrow('Unknown network');
    });

    it('requires valid NFT address', () => {
        expect(() => validate({
            recipients: `${ADDR1},100`,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: '',
            batchSize: 50,
        })).toThrow('valid NFT contract address');
    });

    it('rejects invalid NFT address', () => {
        expect(() => validate({
            recipients: `${ADDR1},100`,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: '0xinvalid',
            batchSize: 50,
        })).toThrow('valid NFT contract address');
    });

    it('throws when no valid recipients', () => {
        expect(() => validate({
            recipients: 'badaddr,100',
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        })).toThrow('No valid recipients');
    });

    it('chunks recipients into batches', () => {
        const addrs = Array.from({ length: 5 }, (_, i) => {
            const hex = i.toString(16).padStart(40, '0');
            return `0x${hex},${i + 1}`;
        }).join('\n');

        const result = validate({
            recipients: addrs,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 2,
        });

        expect(result.batches).toHaveLength(3); // ceil(5/2) = 3
        expect(result.batches[0].recipients).toHaveLength(2);
        expect(result.batches[1].recipients).toHaveLength(2);
        expect(result.batches[2].recipients).toHaveLength(1);
    });

    it('detects duplicate tokenIds for ERC721', () => {
        expect(() => validate({
            recipients: `${ADDR1},100\n${ADDR2},100`,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        })).toThrow('Duplicate tokenId: 100');
    });

    it('allows same tokenId for ERC1155', () => {
        const result = validate({
            recipients: `${ADDR1},100,5\n${ADDR2},100,10`,
            network: 'ethereum',
            nftType: 'erc1155',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        });
        expect(result.recipients).toHaveLength(2);
    });

    it('stores tokenIds as strings in batches', () => {
        const result = validate({
            recipients: `${ADDR1},100\n${ADDR2},200`,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        });

        expect(typeof result.batches[0].tokenIds[0]).toBe('string');
        expect(result.batches[0].tokenIds[0]).toBe('100');
    });

    it('includes amounts in batches only for ERC1155', () => {
        const erc721Result = validate({
            recipients: `${ADDR1},100`,
            network: 'ethereum',
            nftType: 'erc721',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        });
        expect(erc721Result.batches[0].amounts).toBeUndefined();

        const erc1155Result = validate({
            recipients: `${ADDR1},100,5`,
            network: 'ethereum',
            nftType: 'erc1155',
            nftAddress: NFT_ADDR,
            batchSize: 50,
        });
        expect(erc1155Result.batches[0].amounts).toEqual(['5']);
    });
});

describe('formatOutput', () => {
    it('formats batch results with explorer URLs', () => {
        const output = formatOutput(
            {
                batchResults: [{
                    batchIndex: 0,
                    txHash: TX_HASH,
                    successCount: 5,
                    failedIndices: [],
                    totalSent: '5',
                    gasUsed: '100000',
                }],
                failures: [],
                duration: 5000,
            },
            {
                recipients: Array(5).fill({ address: ADDR1, tokenId: '1' }),
                network: 'ethereum',
                nftType: 'erc721',
                nftAddress: NFT_ADDR,
                batchSize: 50,
                batches: [{
                    batchIndex: 0,
                    recipients: Array(5).fill(ADDR1),
                    tokenIds: ['1', '2', '3', '4', '5'],
                }],
            },
        );

        expect(output.batches[0].explorerUrl).toContain('etherscan.io');
        expect(output.batches[0].txHash).toBe(TX_HASH);
        expect(output.batches[0].successCount).toBe(5);
        expect(output.stats.totalSent).toBe('5');
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
                    successCount: 3,
                    failedIndices: [1, 2],
                    totalSent: '3',
                }],
                failures: [{ batchIndex: 1, error: 'reverted' }],
                duration: 3000,
            },
            {
                recipients: Array(5).fill({ address: ADDR1, tokenId: '1' }),
                network: 'ethereum',
                nftType: 'erc721',
                nftAddress: NFT_ADDR,
                batchSize: 3,
                batches: [
                    { batchIndex: 0, recipients: [ADDR1, ADDR2, ADDR3], tokenIds: ['1', '2', '3'] },
                    { batchIndex: 1, recipients: [ADDR1, ADDR2], tokenIds: ['4', '5'] },
                ],
            },
        );

        expect(output.stats.successBatches).toBe(1);
        expect(output.stats.failedBatches).toBe(1);
        expect(output.stats.totalFailedIndices).toBe(2);
    });

    it('computes totalSent for ERC1155 as sum of amounts', () => {
        const output = formatOutput(
            {
                batchResults: [{
                    batchIndex: 0,
                    txHash: TX_HASH,
                    successCount: 2,
                    failedIndices: [],
                    totalSent: '15', // 5 + 10
                }],
                failures: [],
                duration: 1000,
            },
            {
                recipients: [
                    { address: ADDR1, tokenId: '100', amount: '5' },
                    { address: ADDR2, tokenId: '200', amount: '10' },
                ],
                network: 'ethereum',
                nftType: 'erc1155',
                nftAddress: NFT_ADDR,
                batchSize: 50,
                batches: [{
                    batchIndex: 0,
                    recipients: [ADDR1, ADDR2],
                    tokenIds: ['100', '200'],
                    amounts: ['5', '10'],
                }],
            },
        );

        expect(output.stats.totalSent).toBe('15');
        expect(output.stats.totalSuccessCount).toBe(2);
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

    it('happy path: ERC721 distribution with one batch', async () => {
        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', {
                id: 'job-0',
                taskId: 'test-task-id',
                input: {
                    batchIndex: 0,
                    recipients: [ADDR2],
                    tokenIds: ['100'],
                },
                output: {
                    batchIndex: 0,
                    txHash: TX_HASH,
                    successCount: 1,
                    failedIndices: [],
                    failedTokenIds: [],
                    totalSent: '1',
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
                recipients: `${ADDR2},100`,
                network: 'ethereum',
                nftType: 'erc721',
                nftAddress: NFT_ADDR,
                batchSize: 50,
            },
            ctx,
            wallet,
        );

        expect(output.stats.successBatches).toBe(1);
        expect(output.stats.failedBatches).toBe(0);
        expect(mocks.mockHub.createTask).toHaveBeenCalled();
        expect(mocks.mockHub.close).toHaveBeenCalled();
    });

    it('requests approval when not approved', async () => {
        mocks.mockTask.start.mockImplementation(async () => {
            mocks.mockTask._emit('job:complete', {
                id: 'job-0',
                taskId: 'test-task-id',
                input: {
                    batchIndex: 0,
                    recipients: [ADDR2],
                    tokenIds: ['100'],
                },
                output: {
                    batchIndex: 0,
                    txHash: TX_HASH,
                    successCount: 1,
                    failedIndices: [],
                    failedTokenIds: [],
                    totalSent: '1',
                },
                status: 'completed',
                attempts: 1,
                createdAt: Date.now(),
            });
        });

        const wallet = createMockWallet({
            readContract: vi.fn().mockResolvedValue(false), // not approved
        });
        // confirm(approve?) → true, confirm(send?) → true
        const ctx = createMockCtx([], [true, true]);
        const output = await driveExecutor(
            {
                recipients: `${ADDR2},100`,
                network: 'ethereum',
                nftType: 'erc721',
                nftAddress: NFT_ADDR,
                batchSize: 50,
            },
            ctx,
            wallet,
        );

        expect(wallet.sendTransaction).toHaveBeenCalled();
        expect(output.stats.successBatches).toBe(1);
    });

    it('cancels when user declines confirmation', async () => {
        const wallet = createMockWallet();
        // confirm(send?) → false
        const ctx = createMockCtx([], [false]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},100`,
                    network: 'ethereum',
                    nftType: 'erc721',
                    nftAddress: NFT_ADDR,
                    batchSize: 50,
                },
                ctx,
                wallet,
            ),
        ).rejects.toThrow('cancelled by user');
    });

    it('cancels when user declines approval', async () => {
        const wallet = createMockWallet({
            readContract: vi.fn().mockResolvedValue(false), // not approved
        });
        // confirm(approve?) → false
        const ctx = createMockCtx([], [false]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},100`,
                    network: 'ethereum',
                    nftType: 'erc721',
                    nftAddress: NFT_ADDR,
                    batchSize: 50,
                },
                ctx,
                wallet,
            ),
        ).rejects.toThrow('approval cancelled');
    });

    it('always calls hub.close() even on error', async () => {
        const wallet = createMockWallet();

        mocks.mockTask.start.mockImplementation(async () => {
            throw new Error('task boom');
        });

        // confirm(send?) → true, select(task failed) → abort
        const ctx = createMockCtx(['abort'], [true]);

        await expect(
            driveExecutor(
                {
                    recipients: `${ADDR2},100`,
                    network: 'ethereum',
                    nftType: 'erc721',
                    nftAddress: NFT_ADDR,
                    batchSize: 50,
                },
                ctx,
                wallet,
            ),
        ).rejects.toThrow();

        expect(mocks.mockHub.close).toHaveBeenCalled();
    });
});
