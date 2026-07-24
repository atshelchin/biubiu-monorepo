/**
 * FeeAssetSelector：in-band gas 费用币选择器交互测试。
 *
 * 断言：给出 native + 一个持有的稳定币报价时，渲染两个可选 chip 并默认显示原生币估费；
 * 点选稳定币后，用该 feeToken 重新估价并把费用切换成稳定币显示（用户可选稳定币付 gas）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const REC = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';
const SAFE = '0x3333333333333333333333333333333333333333';

vi.mock('$lib/wallet/infra/bundler-client.js', () => ({
	getInBandGasQuotes: vi.fn(async () => [
		{ recipient: REC, asset: 'native', feeToken: null, balance: 10n ** 18n, decimals: 18, symbol: 'ETH', usdBalance: '2000', usdPrice: '2000' },
		{ recipient: REC, asset: 'erc20', feeToken: USDC, balance: 5_000_000n, decimals: 6, symbol: 'USDC', usdBalance: '5', usdPrice: '1' }
	])
}));

const { estimateInBandFee } = vi.hoisted(() => ({ estimateInBandFee: vi.fn() }));
vi.mock('./safe-tx/send-contract-call.js', () => ({ estimateInBandFee }));

import FeeAssetSelector from './FeeAssetSelector.svelte';

function renderSelector() {
	return render(FeeAssetSelector, {
		chainId: 8453,
		safeAddress: SAFE,
		publicKeyHex: '04abcd',
		network: 'base-mainnet',
		calls: [{ to: '0x4444444444444444444444444444444444444444', value: 1n, data: '0x' }],
		active: true
	});
}

function chips(): HTMLButtonElement[] {
	return Array.from(document.querySelectorAll<HTMLButtonElement>('.fee-chip'));
}

beforeEach(() => {
	estimateInBandFee.mockReset();
	estimateInBandFee.mockImplementation(async (input: { gasFeeToken?: string | null }) =>
		input?.gasFeeToken
			? { amount: 6_000_000n, recipient: REC, asset: 'erc20', feeToken: USDC, decimals: 6, symbol: 'USDC' }
			: { amount: 3_000_000_000_000_000n, recipient: REC, asset: 'native', feeToken: null, decimals: 18, symbol: 'ETH' }
	);
});

describe('FeeAssetSelector', () => {
	it('lists native + held stablecoin and defaults to a native fee estimate', async () => {
		renderSelector();
		const symbols = await vi.waitFor(() => {
			const c = chips();
			if (c.length < 2) throw new Error('chips not rendered yet');
			return c.map((b) => b.textContent?.trim());
		});
		expect(symbols).toEqual(['ETH', 'USDC']);

		const feeText = await vi.waitFor(() => {
			const el = document.querySelector('.fee-amount');
			if (!el || !/ETH/.test(el.textContent ?? '')) throw new Error('native fee not shown yet');
			return el.textContent ?? '';
		});
		expect(feeText).toContain('ETH');
	});

	it('re-quotes in the chosen stablecoin when the user picks it', async () => {
		renderSelector();
		const usdcChip = await vi.waitFor(() => {
			const c = chips().find((b) => b.textContent?.trim() === 'USDC');
			if (!c) throw new Error('USDC chip not rendered yet');
			return c;
		});
		usdcChip.click();

		await vi.waitFor(() => {
			const el = document.querySelector('.fee-amount');
			if (!el || !/USDC/.test(el.textContent ?? '')) throw new Error('stablecoin fee not shown yet');
		});
		const lastCall = estimateInBandFee.mock.calls.at(-1)?.[0];
		expect(lastCall?.gasFeeToken).toBe(USDC);
	});
});
