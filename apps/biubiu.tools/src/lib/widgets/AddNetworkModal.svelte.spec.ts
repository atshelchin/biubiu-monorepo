import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AddNetworkModal from './AddNetworkModal.svelte';

// i18n is not loaded in the browser test env, so t() returns the raw key —
// which makes button text / placeholders deterministic to query against.
const NAME = 'widgets.addNetwork.namePlaceholder';
const CHAIN = 'widgets.addNetwork.chainIdPlaceholder';
const SYMBOL = 'widgets.addNetwork.symbolPlaceholder';
const RPCS = 'widgets.addNetwork.rpcsPlaceholder';
const SUBMIT = 'widgets.addNetwork.submit';
const CANCEL = 'widgets.addNetwork.cancel';

function setup(overrides: Partial<{ existingChainIds: number[] }> = {}) {
	const onSubmit = vi.fn().mockResolvedValue(undefined);
	const onClose = vi.fn();
	render(AddNetworkModal, {
		props: { open: true, onClose, onSubmit, existingChainIds: overrides.existingChainIds ?? [] },
	});
	return { onSubmit, onClose };
}

describe('AddNetworkModal', () => {
	it('submits a parsed config and filters out non-URL RPC lines', async () => {
		const { onSubmit } = setup();

		await page.getByPlaceholder(NAME).fill('BNB Chain');
		await page.getByPlaceholder(CHAIN).fill('56');
		await page.getByPlaceholder(SYMBOL).fill('BNB');
		await page.getByPlaceholder(RPCS).fill('https://bsc-rpc.publicnode.com\nnot-a-url\nhttps://b.example');

		await page.getByRole('button', { name: SUBMIT }).click();

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenCalledWith({
			name: 'BNB Chain',
			chainId: 56,
			rpcs: ['https://bsc-rpc.publicnode.com', 'https://b.example'],
			symbol: 'BNB',
			decimals: 18, // default
		});
	});

	it('blocks submit and shows an error for a duplicate chainId', async () => {
		const { onSubmit } = setup({ existingChainIds: [56] });

		await page.getByPlaceholder(NAME).fill('Dup');
		await page.getByPlaceholder(CHAIN).fill('56');
		await page.getByPlaceholder(SYMBOL).fill('BNB');
		await page.getByPlaceholder(RPCS).fill('https://rpc.example');

		await page.getByRole('button', { name: SUBMIT }).click();

		await expect.element(page.getByText('widgets.addNetwork.errorDuplicate')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('blocks submit when the name is missing', async () => {
		const { onSubmit } = setup();

		await page.getByPlaceholder(CHAIN).fill('10');
		await page.getByPlaceholder(SYMBOL).fill('ETH');
		await page.getByPlaceholder(RPCS).fill('https://rpc.example');

		await page.getByRole('button', { name: SUBMIT }).click();

		await expect.element(page.getByText('widgets.addNetwork.errorName')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('blocks submit when no valid RPC URL is provided', async () => {
		const { onSubmit } = setup();

		await page.getByPlaceholder(NAME).fill('X');
		await page.getByPlaceholder(CHAIN).fill('10');
		await page.getByPlaceholder(SYMBOL).fill('ETH');
		await page.getByPlaceholder(RPCS).fill('ftp://nope\nnot-a-url');

		await page.getByRole('button', { name: SUBMIT }).click();

		await expect.element(page.getByText('widgets.addNetwork.errorRpcs')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('cancel closes without submitting', async () => {
		const { onSubmit, onClose } = setup();
		await page.getByRole('button', { name: CANCEL }).click();
		expect(onClose).toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
