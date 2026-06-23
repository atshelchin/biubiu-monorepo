import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AddTokenModal from './AddTokenModal.svelte';

const ADDRESS = 'br.addToken.addressPlaceholder';
const FETCH = 'br.addToken.fetch';
const SUBMIT = 'br.addToken.submit';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function setup(
	overrides: Partial<{
		existingAddresses: string[];
		onFetchMetadata: (a: string) => Promise<{ symbol: string; decimals: number }>;
	}> = {},
) {
	const onSubmit = vi.fn().mockResolvedValue(undefined);
	const onClose = vi.fn();
	const onFetchMetadata =
		overrides.onFetchMetadata ?? vi.fn().mockResolvedValue({ symbol: 'USDC', decimals: 6 });
	render(AddTokenModal, {
		props: {
			open: true,
			onClose,
			networkKey: 'ethereum',
			networkName: 'Ethereum',
			existingAddresses: overrides.existingAddresses ?? [],
			onFetchMetadata,
			onSubmit,
		},
	});
	return { onSubmit, onClose, onFetchMetadata };
}

// address = textbox 0, symbol = textbox 1; decimals = the only spinbutton
const symbolInput = () => page.getByRole('textbox').nth(1);
const decimalsInput = () => page.getByRole('spinbutton');

describe('AddTokenModal', () => {
	it('auto-fetches and fills symbol + decimals from the contract', async () => {
		const { onFetchMetadata } = setup();

		await page.getByPlaceholder(ADDRESS).fill(USDC);
		await page.getByRole('button', { name: FETCH }).click();

		await vi.waitFor(() => expect(onFetchMetadata).toHaveBeenCalledWith(USDC));
		await expect.element(symbolInput()).toHaveValue('USDC');
		await expect.element(decimalsInput()).toHaveValue(6);
	});

	it('shows a fallback error when metadata fetch fails', async () => {
		setup({ onFetchMetadata: vi.fn().mockRejectedValue(new Error('rpc down')) });

		await page.getByPlaceholder(ADDRESS).fill(USDC);
		await page.getByRole('button', { name: FETCH }).click();

		await expect.element(page.getByText('br.addToken.fetchFailed')).toBeInTheDocument();
	});

	it('submits a manually-entered token', async () => {
		const { onSubmit } = setup();

		await page.getByPlaceholder(ADDRESS).fill(USDC);
		await symbolInput().fill('USDC');
		await decimalsInput().fill('6');
		await page.getByRole('button', { name: SUBMIT }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenCalledWith({ address: USDC, symbol: 'USDC', decimals: 6 });
	});

	it('blocks submit for a token already added on this network', async () => {
		const { onSubmit } = setup({ existingAddresses: [USDC.toLowerCase()] });

		await page.getByPlaceholder(ADDRESS).fill(USDC);
		await symbolInput().fill('USDC');
		await decimalsInput().fill('6');
		await page.getByRole('button', { name: SUBMIT }).click();

		await expect.element(page.getByText('br.addToken.errorDuplicate')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('disables fetch and rejects submit for an invalid address', async () => {
		const { onSubmit } = setup();

		await page.getByPlaceholder(ADDRESS).fill('0x1234'); // too short
		await expect.element(page.getByRole('button', { name: FETCH })).toBeDisabled();

		await page.getByRole('button', { name: SUBMIT }).click();
		await expect.element(page.getByText('br.addToken.errorAddress')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
