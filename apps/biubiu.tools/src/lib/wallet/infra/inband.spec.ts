import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import {
	calculateInBandFeeAmount,
	buildInBandFeeLeg,
	findInBandGasQuote,
	sameAssetFeeLimit,
	loadInBandFeeTokenOptions,
	type InBandGasQuote
} from './inband.js';

const RECIPIENT = '0x1111111111111111111111111111111111111111' as Address;
const USDC = '0x2222222222222222222222222222222222222222' as Address;

const nativeQuote = (usdPrice: string | null = '2000', balance = 0n): InBandGasQuote => ({
	recipient: RECIPIENT,
	asset: 'native',
	feeToken: null,
	balance,
	decimals: 18,
	symbol: 'ETH',
	usdBalance: '0',
	usdPrice
});

const usdcQuote = (balance = 0n): InBandGasQuote => ({
	recipient: RECIPIENT,
	asset: 'erc20',
	feeToken: USDC,
	balance,
	decimals: 6,
	symbol: 'USDC',
	usdBalance: '0',
	usdPrice: '1'
});

describe('calculateInBandFeeAmount', () => {
	it('prices native gas as gas × price × 3', () => {
		// 1e6 gas × 1 gwei × 3 = 3e15 wei = 0.003 ETH
		const amount = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, nativeQuote(), nativeQuote());
		expect(amount).toBe(3_000_000_000_000_000n);
	});

	it('floors native gas at 0.00001 native', () => {
		// tiny gas × price × 3 < 1e13 → floored to 1e13 (0.00001 ETH)
		const amount = calculateInBandFeeAmount(1n, 1n, nativeQuote(), nativeQuote());
		expect(amount).toBe(10_000_000_000_000n);
	});

	it('does not need a native USD price to pay native gas', () => {
		const amount = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, nativeQuote(null), nativeQuote(null));
		expect(amount).toBe(3_000_000_000_000_000n);
	});

	it('converts native cost to a stablecoin via USD prices', () => {
		// native 0.003 ETH × $2000 = $6 → 6 USDC (6 decimals) = 6_000_000
		const amount = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, usdcQuote(), nativeQuote('2000'));
		expect(amount).toBe(6_000_000n);
	});

	it('floors a stablecoin fee at $0.01', () => {
		// negligible gas → native floor 1e13 wei (0.00001) × $100 = $0.001 → below $0.01 stable floor
		const amount = calculateInBandFeeAmount(1n, 1n, usdcQuote(), nativeQuote('100'));
		expect(amount).toBe(10_000n); // $0.01 USDC = 10_000 base units
	});

	it('returns null when a stablecoin conversion lacks the native price', () => {
		const amount = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, usdcQuote(), nativeQuote(null));
		expect(amount).toBeNull();
	});

	it('never undercharges: rounds native price up and fee-token price down', () => {
		// native $2000.9999999999 (rounds UP past 8dp), USDC $1.00000001 (kept, rounds DOWN)
		const native = { ...nativeQuote('2000.999999999'), asset: 'native' as const };
		const usdc = { ...usdcQuote(), usdPrice: '1.000000009' };
		const a = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, usdc, native);
		const exact = calculateInBandFeeAmount(1_000_000n, 1_000_000_000n, usdcQuote(), nativeQuote('2000'));
		expect(a).not.toBeNull();
		expect(a! >= exact!).toBe(true);
	});
});

describe('buildInBandFeeLeg', () => {
	it('native leg is a plain value transfer to the recipient', () => {
		const leg = buildInBandFeeLeg(null, RECIPIENT, 3_000_000_000_000_000n);
		expect(leg).toEqual({ to: RECIPIENT, value: 3_000_000_000_000_000n, data: '0x' });
	});

	it('stablecoin leg is an ERC-20 transfer(recipient, amount) to the token', () => {
		const leg = buildInBandFeeLeg(USDC, RECIPIENT, 6_000_000n);
		expect(leg.to).toBe(USDC);
		expect(leg.value).toBe(0n);
		expect(leg.data.startsWith('0xa9059cbb')).toBe(true); // transfer selector
		expect(leg.data.toLowerCase()).toContain(RECIPIENT.slice(2).toLowerCase());
	});
});

describe('findInBandGasQuote', () => {
	const quotes = [nativeQuote('2000', 5n), usdcQuote(100n)];
	it('returns the native row when no fee token requested', () => {
		expect(findInBandGasQuote(quotes, null)?.asset).toBe('native');
		expect(findInBandGasQuote(quotes)?.asset).toBe('native');
	});
	it('matches a stablecoin case-insensitively', () => {
		expect(findInBandGasQuote(quotes, USDC.toUpperCase() as Address)?.feeToken).toBe(USDC);
	});
	it('returns null for an unknown fee token', () => {
		expect(findInBandGasQuote(quotes, '0x9999999999999999999999999999999999999999' as Address)).toBeNull();
	});
});

describe('sameAssetFeeLimit', () => {
	it('reserves the native fee from a native transfer', () => {
		const r = sameAssetFeeLimit(100n, null, null, 1000n);
		expect(r).toEqual({ feeAmount: 100n, maxTransferAmount: 900n });
	});
	it('reserves a stablecoin fee only from the same token', () => {
		expect(sameAssetFeeLimit(10n, USDC, USDC, 50n)).toEqual({ feeAmount: 10n, maxTransferAmount: 40n });
		expect(sameAssetFeeLimit(10n, USDC, null, 50n)).toBeNull();
		expect(sameAssetFeeLimit(10n, null, USDC, 50n)).toBeNull();
	});
	it('clamps at zero when the fee exceeds the balance', () => {
		expect(sameAssetFeeLimit(100n, null, null, 50n)?.maxTransferAmount).toBe(0n);
	});
});

describe('loadInBandFeeTokenOptions', () => {
	it('keeps the native row even when empty, drops zero-balance stablecoins', () => {
		const opts = loadInBandFeeTokenOptions([nativeQuote('2000', 0n), usdcQuote(0n), usdcQuote(100n)]);
		expect(opts).not.toBeNull();
		expect(opts!.some((o) => o.asset === 'native')).toBe(true);
		expect(opts!.filter((o) => o.asset === 'erc20').length).toBe(1);
		expect(opts!.find((o) => o.asset === 'erc20')!.balance).toBe(100n);
	});
	it('returns null when there is no quote', () => {
		expect(loadInBandFeeTokenOptions(null)).toBeNull();
	});
});
