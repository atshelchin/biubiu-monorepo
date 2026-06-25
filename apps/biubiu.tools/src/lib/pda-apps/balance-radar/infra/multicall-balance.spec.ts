import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import {
	createMulticallBalanceCall,
	createIndividualBalanceCall,
	createErc20BalanceCall,
	createIndividualErc20BalanceCall,
	createTokenMetadataCall,
} from './multicall-balance.js';

const ADDR1 = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

/** Minimal PublicClient stub with only the methods the calls use. */
function mockClient(overrides: Partial<PublicClient> = {}): PublicClient {
	return {
		multicall: vi.fn(),
		getBalance: vi.fn(),
		readContract: vi.fn(),
		...overrides,
	} as unknown as PublicClient;
}

// ── createMulticallBalanceCall (native via Multicall3) ───────────────────────

describe('createMulticallBalanceCall', () => {
	it('batches getEthBalance over Multicall3 and maps successes', async () => {
		const multicall = vi.fn().mockResolvedValue([
			{ status: 'success', result: 100n },
			{ status: 'success', result: 250n },
		]);
		const client = mockClient({ multicall: multicall as never });

		const call = createMulticallBalanceCall([ADDR1, ADDR2]);
		const result = await call.execute(client);

		expect(result).toEqual([
			{ address: ADDR1, balance: '100' },
			{ address: ADDR2, balance: '250' },
		]);

		const arg = multicall.mock.calls[0][0];
		expect(arg.allowFailure).toBe(true);
		// Must pass the canonical Multicall3 address explicitly, else viem throws
		// ChainDoesNotSupportContract on user-added (custom) networks.
		expect(arg.multicallAddress).toBe(MULTICALL3);
		expect(arg.contracts).toHaveLength(2);
		expect(arg.contracts[0]).toMatchObject({
			address: MULTICALL3,
			functionName: 'getEthBalance',
			args: [ADDR1],
		});
	});

	it('maps a failed multicall entry to null (NOT a fake "0" balance)', async () => {
		const multicall = vi.fn().mockResolvedValue([
			{ status: 'failure', error: new Error('revert') },
			{ status: 'success', result: 7n },
		]);
		const call = createMulticallBalanceCall([ADDR1, ADDR2]);
		const result = await call.execute(mockClient({ multicall: multicall as never }));
		// A failed sub-call must be distinguishable from a real zero balance: a
		// balance-reporting tool surfacing a failed read as "0" would silently hide
		// funds. null = "failed to read"; "0" is reserved for a genuine zero.
		expect(result).toEqual([
			{ address: ADDR1, balance: null },
			{ address: ADDR2, balance: '7' },
		]);
	});

	it('reports a genuine zero balance as the string "0", not null', async () => {
		const multicall = vi.fn().mockResolvedValue([{ status: 'success', result: 0n }]);
		const call = createMulticallBalanceCall([ADDR1]);
		const result = await call.execute(mockClient({ multicall: multicall as never }));
		expect(result).toEqual([{ address: ADDR1, balance: '0' }]);
	});
});

// ── createErc20BalanceCall (balanceOf via Multicall3) ────────────────────────

describe('createErc20BalanceCall', () => {
	it('batches balanceOf on the token contract and maps results', async () => {
		const multicall = vi.fn().mockResolvedValue([
			{ status: 'success', result: 5_000_000n },
			{ status: 'failure', error: new Error('x') },
		]);
		const call = createErc20BalanceCall([ADDR1, ADDR2], TOKEN);
		const result = await call.execute(mockClient({ multicall: multicall as never }));

		// Failed balanceOf → null (reverting token / partial response), not a fake 0.
		expect(result).toEqual([
			{ address: ADDR1, balance: '5000000' },
			{ address: ADDR2, balance: null },
		]);

		const arg = multicall.mock.calls[0][0];
		expect(arg.multicallAddress).toBe(MULTICALL3);
		expect(arg.contracts[0]).toMatchObject({
			address: TOKEN,
			functionName: 'balanceOf',
			args: [ADDR1],
		});
	});
});

// ── individual fallbacks ─────────────────────────────────────────────────────

describe('createIndividualBalanceCall', () => {
	it('reads a single native balance and wraps it in an array', async () => {
		const getBalance = vi.fn().mockResolvedValue(42n);
		const call = createIndividualBalanceCall(ADDR1);
		const result = await call.execute(mockClient({ getBalance: getBalance as never }));
		expect(result).toEqual([{ address: ADDR1, balance: '42' }]);
		expect(getBalance).toHaveBeenCalledWith({ address: ADDR1 });
	});
});

describe('createIndividualErc20BalanceCall', () => {
	it('reads a single ERC20 balance via balanceOf', async () => {
		const readContract = vi.fn().mockResolvedValue(123n);
		const call = createIndividualErc20BalanceCall(ADDR1, TOKEN);
		const result = await call.execute(mockClient({ readContract: readContract as never }));
		expect(result).toEqual([{ address: ADDR1, balance: '123' }]);
		expect(readContract).toHaveBeenCalledWith(
			expect.objectContaining({ address: TOKEN, functionName: 'balanceOf', args: [ADDR1] }),
		);
	});
});

// ── createTokenMetadataCall ──────────────────────────────────────────────────

describe('createTokenMetadataCall', () => {
	it('reads symbol + decimals and coerces decimals to a number', async () => {
		const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
			if (functionName === 'symbol') return 'USDC';
			if (functionName === 'decimals') return 6; // some tokens return number
			throw new Error(`unexpected ${functionName}`);
		});
		const call = createTokenMetadataCall(TOKEN);
		const meta = await call.execute(mockClient({ readContract: readContract as never }));
		expect(meta).toEqual({ symbol: 'USDC', decimals: 6 });
	});

	it('coerces a bigint/uint8 decimals value to a number', async () => {
		const readContract = vi.fn(async ({ functionName }: { functionName: string }) =>
			functionName === 'symbol' ? 'DAI' : (18 as unknown),
		);
		const call = createTokenMetadataCall(TOKEN);
		const meta = await call.execute(mockClient({ readContract: readContract as never }));
		expect(meta.symbol).toBe('DAI');
		expect(meta.decimals).toBe(18);
		expect(typeof meta.decimals).toBe('number');
	});
});
