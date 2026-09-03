import { describe, it, expect, vi, afterEach } from 'vitest';
import { type Address, type Hex } from 'viem';
import { preflight } from './orchestrator.js';
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

