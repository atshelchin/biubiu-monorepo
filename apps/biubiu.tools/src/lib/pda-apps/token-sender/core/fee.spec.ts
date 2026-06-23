import { describe, it, expect, vi, beforeEach } from 'vitest';

// 文件级 mock：价格可控；fee-config 注入一个固定费用网络以测 config 分支
vi.mock('./price.js', () => ({ fetchNativeUsdPrice: vi.fn() }));
vi.mock('../infra/fee-config.js', () => ({
	FEE_USD: 5,
	FEE_FIXED_NATIVE: { 'gnosis-mainnet': 500n },
	FEE_FALLBACK_NATIVE: 10n ** 18n,
}));

import { quoteFee } from './fee.js';
import { fetchNativeUsdPrice } from './price.js';
import { NETWORKS } from '../infra/networks.js';

const price = vi.mocked(fetchNativeUsdPrice);

beforeEach(() => price.mockReset());

describe('quoteFee · priority ladder', () => {
	it('① member → free, never fetches price', async () => {
		const q = await quoteFee({ network: NETWORKS['eth-mainnet'], isMember: true });
		expect(q).toEqual({ amount: 0n, source: 'member-free' });
		expect(price).not.toHaveBeenCalled();
	});

	it('② configured fixed native beats price', async () => {
		const q = await quoteFee({ network: NETWORKS['gnosis-mainnet'], isMember: false });
		expect(q).toEqual({ amount: 500n, source: 'config' });
		expect(price).not.toHaveBeenCalled();
	});

	it('③ $5 equivalent when a price is available', async () => {
		price.mockResolvedValue(2500); // 1 native = $2500 → $5 = 0.002 native
		const q = await quoteFee({ network: NETWORKS['eth-mainnet'], isMember: false });
		expect(q.source).toBe('usd');
		expect(q.amount).toBe(2_000_000_000_000_000n);
		expect(q.usd).toBe(5);
		expect(q.nativeUsdPrice).toBe(2500);
	});

	it('④ fallback to 1 native when price is unavailable', async () => {
		price.mockResolvedValue(null);
		const q = await quoteFee({ network: NETWORKS['eth-mainnet'], isMember: false });
		expect(q).toEqual({ amount: 10n ** 18n, source: 'fallback' });
	});
});
