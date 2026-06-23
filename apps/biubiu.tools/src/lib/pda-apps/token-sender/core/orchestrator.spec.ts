import { describe, it, expect, vi } from 'vitest';
import { type Address, type Hex } from 'viem';
import { planBatches, preflight, runSend } from './orchestrator.js';
import type { SafeSenderWallet } from './wallet.js';
import { NETWORKS } from '../infra/networks.js';
import type { FeeQuote, Recipient } from '../types.js';

const NET = NETWORKS['eth-mainnet'];

const addr = (i: number): Address => `0x${i.toString(16).padStart(40, '0')}` as Address;
const recips = (n: number, amount = 1n): Recipient[] =>
	Array.from({ length: n }, (_, i) => ({ address: addr(i + 1), amount }));
const noFee: FeeQuote = { amount: 0n, source: 'member-free' };

function mockWallet(over: Partial<SafeSenderWallet> = {}): SafeSenderWallet {
	return {
		account: addr(999),
		sendBatch: vi.fn(async () => ({ txHash: '0xtx' as Hex, explorerUrl: 'u' })),
		getNativeBalance: vi.fn(async () => 0n),
		getErc20Balance: vi.fn(async () => 0n),
		getErc20Meta: vi.fn(async () => ({ symbol: 'T', decimals: 18 })),
		...over,
	};
}

describe('planBatches', () => {
	it('chunks by size', () => {
		const b = planBatches(recips(250), 100);
		expect(b.map((x) => x.length)).toEqual([100, 100, 50]);
	});
	it('empty input → no batches', () => {
		expect(planBatches([], 100)).toEqual([]);
	});
	it('guards size 0 to 1 (never infinite loop)', () => {
		expect(planBatches(recips(3), 0)).toHaveLength(3);
	});
});

describe('preflight · native', () => {
	it('ok when balance covers total + fee', async () => {
		const wallet = mockWallet({ getNativeBalance: vi.fn(async () => 100n) });
		const r = await preflight({
			wallet, network: NET, tokenType: 'native', totalAmount: 90n,
			fee: { amount: 5n, source: 'fallback' },
		});
		expect(r.ok).toBe(true);
		expect(r.nativeNeeded).toBe(95n);
	});
	it('not ok when short', async () => {
		const wallet = mockWallet({ getNativeBalance: vi.fn(async () => 100n) });
		const r = await preflight({
			wallet, network: NET, tokenType: 'native', totalAmount: 99n,
			fee: { amount: 5n, source: 'fallback' },
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('insufficient-native');
		expect(r.nativeNeeded).toBe(104n);
	});
});

describe('preflight · erc20', () => {
	const token = addr(0xabc);
	it('ok when token covers amount and native covers fee', async () => {
		const wallet = mockWallet({
			getNativeBalance: vi.fn(async () => 10n),
			getErc20Balance: vi.fn(async () => 100n),
		});
		const r = await preflight({
			wallet, network: NET, tokenType: 'erc20', tokenAddress: token,
			totalAmount: 90n, fee: { amount: 5n, source: 'fallback' },
		});
		expect(r.ok).toBe(true);
	});
	it('flags insufficient-token', async () => {
		const wallet = mockWallet({
			getNativeBalance: vi.fn(async () => 10n),
			getErc20Balance: vi.fn(async () => 50n),
		});
		const r = await preflight({
			wallet, network: NET, tokenType: 'erc20', tokenAddress: token,
			totalAmount: 90n, fee: { amount: 5n, source: 'fallback' },
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('insufficient-token');
	});
	it('flags insufficient-native when token ok but fee not covered', async () => {
		const wallet = mockWallet({
			getNativeBalance: vi.fn(async () => 1n),
			getErc20Balance: vi.fn(async () => 100n),
		});
		const r = await preflight({
			wallet, network: NET, tokenType: 'erc20', tokenAddress: token,
			totalAmount: 90n, fee: { amount: 5n, source: 'fallback' },
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('insufficient-native');
	});
});

describe('runSend', () => {
	it('sends all batches; fee rides every batch (charged per transaction)', async () => {
		const callCounts: number[] = [];
		const wallet = mockWallet({
			sendBatch: vi.fn(async ({ calls }) => {
				callCounts.push(calls.length);
				return { txHash: `0x${callCounts.length}` as Hex, explorerUrl: 'u' };
			}),
		});
		const out = await runSend({
			wallet, network: NET, tokenType: 'native', recipients: recips(4),
			batchSize: 2, fee: { amount: 7n, source: 'fallback' },
		});
		expect(out.results).toHaveLength(2);
		expect(out.failures).toHaveLength(0);
		expect(out.aborted).toBe(false);
		// fee (>0) rides every batch → each batch = [fee, r0, r1] = 3 subs
		expect(callCounts).toEqual([3, 3]);
	});

	it('no fee sub when fee is 0 (e.g. premium member)', async () => {
		const callCounts: number[] = [];
		const wallet = mockWallet({
			sendBatch: vi.fn(async ({ calls }) => {
				callCounts.push(calls.length);
				return { txHash: '0x1' as Hex, explorerUrl: 'u' };
			}),
		});
		await runSend({
			wallet, network: NET, tokenType: 'native', recipients: recips(4),
			batchSize: 2, fee: noFee,
		});
		// fee.amount = 0 → no fee sub, each batch = just its 2 recipients
		expect(callCounts).toEqual([2, 2]);
	});

	it('skip policy: one failed batch does not stop the rest', async () => {
		let call = 0;
		const wallet = mockWallet({
			sendBatch: vi.fn(async () => {
				call++;
				if (call === 2) throw new Error('rpc down');
				return { txHash: `0x${call}` as Hex, explorerUrl: 'u' };
			}),
		});
		const out = await runSend({
			wallet, network: NET, tokenType: 'native', recipients: recips(6),
			batchSize: 2, fee: noFee,
		});
		expect(out.results).toHaveLength(2);
		expect(out.failures).toHaveLength(1);
		expect(out.failures[0].batchIndex).toBe(1);
		expect(out.aborted).toBe(false);
	});

	it('abort policy: stops at first failure', async () => {
		const wallet = mockWallet({
			sendBatch: vi.fn(async () => {
				throw new Error('x');
			}),
		});
		const out = await runSend({
			wallet, network: NET, tokenType: 'native', recipients: recips(6),
			batchSize: 2, fee: noFee, failurePolicy: 'abort',
		});
		expect(out.results).toHaveLength(0);
		expect(out.aborted).toBe(true);
		expect(wallet.sendBatch).toHaveBeenCalledTimes(1);
	});

	it('pre-aborted signal sends nothing', async () => {
		const ac = new AbortController();
		ac.abort();
		const wallet = mockWallet();
		const out = await runSend({
			wallet, network: NET, tokenType: 'native', recipients: recips(4),
			batchSize: 2, fee: noFee, signal: ac.signal,
		});
		expect(out.aborted).toBe(true);
		expect(out.results).toHaveLength(0);
		expect(wallet.sendBatch).not.toHaveBeenCalled();
	});

	it('emits progress updates', async () => {
		const phases: string[] = [];
		await runSend({
			wallet: mockWallet(), network: NET, tokenType: 'native', recipients: recips(2),
			batchSize: 2, fee: noFee, onProgress: (p) => phases.push(p.status),
		});
		expect(phases).toContain('building');
	});
});
