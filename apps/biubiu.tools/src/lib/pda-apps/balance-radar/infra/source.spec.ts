import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenSpec, NetworkConfig } from '../types.js';

// Stub client shared by the mocked pool; tests configure it per case.
const mc = vi.hoisted(() => ({
	multicall: vi.fn(),
	getBalance: vi.fn(),
	readContract: vi.fn(),
}));

// Mock the EVM pool factory: build a pool per network key whose `do()` simply
// executes the EVMCall against the stub client (exercising the real call code).
vi.mock('$lib/evm/network-pool', () => ({
	createEVMPools: vi.fn((networks: Record<string, unknown>) => {
		const pool = { do: async (call: { execute: (c: unknown) => unknown }) => ({ result: await call.execute(mc) }) };
		const map = new Map<string, typeof pool>();
		for (const key of Object.keys(networks)) map.set(key, pool);
		return map;
	}),
}));

import { BalanceQuerySource } from './source.js';

const ADDR = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const NATIVE: TokenSpec = { kind: 'native', symbol: 'ETH', decimals: 18 };
const USDC: TokenSpec = {
	kind: 'erc20',
	address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
	symbol: 'USDC',
	decimals: 6,
};

beforeEach(() => {
	mc.multicall.mockReset();
	mc.getBalance.mockReset();
	mc.readContract.mockReset();
});

// ── buildJobs fan-out ────────────────────────────────────────────────────────

describe('BalanceQuerySource.buildJobs (via getData)', () => {
	it('fans out network × token × address-chunk', () => {
		const addrs = [ADDR(1), ADDR(2), ADDR(3)];
		const source = new BalanceQuerySource(addrs, { ethereum: [NATIVE, USDC] }, [], 2);
		const jobs = source.getData();

		// 2 tokens × ceil(3/2)=2 chunks = 4 jobs
		expect(jobs).toHaveLength(4);
		// each job carries its token and an address chunk ≤ chunkSize
		for (const job of jobs) {
			expect(job.network).toBe('ethereum');
			expect(['ETH', 'USDC']).toContain(job.token.symbol);
			expect(job.addresses.length).toBeLessThanOrEqual(2);
		}
		// chunk boundaries preserved
		const ethJobs = jobs.filter((j) => j.token.symbol === 'ETH');
		expect(ethJobs.map((j) => j.addresses)).toEqual([[ADDR(1), ADDR(2)], [ADDR(3)]]);
	});

	it('skips networks that are not in the registry', () => {
		const source = new BalanceQuerySource([ADDR(1)], { nope: [NATIVE] }, [], 100);
		expect(source.getData()).toEqual([]);
	});

	it('includes custom networks passed to the constructor', () => {
		const custom: NetworkConfig = {
			name: 'BNB',
			chainId: 56,
			rpcs: ['https://bsc-rpc.publicnode.com'],
			symbol: 'BNB',
			decimals: 18,
		};
		const source = new BalanceQuerySource([ADDR(1)], { 'custom-56': [NATIVE] }, [custom], 100);
		const jobs = source.getData();
		expect(jobs).toHaveLength(1);
		expect(jobs[0].network).toBe('custom-56');
	});
});

// ── handler: native vs erc20 branching ───────────────────────────────────────

describe('BalanceQuerySource.handler', () => {
	function makeSource(tokens: TokenSpec[] = [NATIVE], custom: NetworkConfig[] = []) {
		const key = custom.length ? `custom-${custom[0].chainId}` : 'ethereum';
		return new BalanceQuerySource([ADDR(1), ADDR(2)], { [key]: tokens }, custom, 100);
	}

	it('uses getEthBalance multicall for the native coin', async () => {
		mc.multicall.mockResolvedValue([
			{ status: 'success', result: 10n },
			{ status: 'success', result: 20n },
		]);
		const source = makeSource([NATIVE]);
		const out = await source.handler(
			{ network: 'ethereum', token: NATIVE, addresses: [ADDR(1), ADDR(2)] },
			{} as never,
		);

		expect(out).toMatchObject({ network: 'ethereum', token: NATIVE });
		expect(out.results).toEqual([
			{ address: ADDR(1), balance: '10' },
			{ address: ADDR(2), balance: '20' },
		]);
		expect(mc.multicall.mock.calls[0][0].contracts[0].functionName).toBe('getEthBalance');
	});

	it('uses balanceOf multicall on the token contract for ERC20', async () => {
		mc.multicall.mockResolvedValue([
			{ status: 'success', result: 1n },
			{ status: 'success', result: 2n },
		]);
		const source = makeSource([USDC]);
		const out = await source.handler(
			{ network: 'ethereum', token: USDC, addresses: [ADDR(1), ADDR(2)] },
			{} as never,
		);

		expect(out.token).toEqual(USDC);
		const arg = mc.multicall.mock.calls[0][0];
		expect(arg.contracts[0].functionName).toBe('balanceOf');
		expect(arg.contracts[0].address).toBe(USDC.address);
	});

	it('throws for an unknown network', async () => {
		const source = makeSource([NATIVE]);
		await expect(
			source.handler({ network: 'mars', token: NATIVE, addresses: [ADDR(1)] }, {} as never),
		).rejects.toThrow('Unknown network');
	});

	it('falls back to individual reads when the chain lacks Multicall3', async () => {
		const noMc: NetworkConfig = {
			name: 'NoMulticall',
			chainId: 99999,
			rpcs: ['https://rpc.example.com'],
			symbol: 'X',
			decimals: 18,
			hasMulticall3: false,
		};
		mc.getBalance.mockResolvedValueOnce(5n).mockResolvedValueOnce(6n);
		const source = makeSource([NATIVE], [noMc]);
		const out = await source.handler(
			{ network: 'custom-99999', token: NATIVE, addresses: [ADDR(1), ADDR(2)] },
			{} as never,
		);

		expect(mc.multicall).not.toHaveBeenCalled();
		expect(mc.getBalance).toHaveBeenCalledTimes(2);
		expect(out.results).toEqual([
			{ address: ADDR(1), balance: '5' },
			{ address: ADDR(2), balance: '6' },
		]);
	});

	it('falls back to individual ERC20 reads on a non-Multicall3 chain', async () => {
		const noMc: NetworkConfig = {
			name: 'NoMulticall',
			chainId: 99999,
			rpcs: ['https://rpc.example.com'],
			symbol: 'X',
			decimals: 18,
			hasMulticall3: false,
		};
		mc.readContract.mockResolvedValueOnce(7n).mockResolvedValueOnce(8n);
		const source = makeSource([USDC], [noMc]);
		const out = await source.handler(
			{ network: 'custom-99999', token: USDC, addresses: [ADDR(1), ADDR(2)] },
			{} as never,
		);

		expect(mc.multicall).not.toHaveBeenCalled();
		expect(mc.readContract).toHaveBeenCalledTimes(2);
		expect(out.results).toEqual([
			{ address: ADDR(1), balance: '7' },
			{ address: ADDR(2), balance: '8' },
		]);
	});
});
