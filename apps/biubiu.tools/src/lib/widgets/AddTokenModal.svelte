<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		networkKey: string;
		networkName: string;
		existingAddresses: string[];
		onFetchMetadata: (address: string) => Promise<{ symbol: string; decimals: number }>;
		onSubmit: (data: { address: string; symbol: string; decimals: number }) => Promise<void> | void;
	}

	let {
		open,
		onClose,
		networkKey,
		networkName,
		existingAddresses,
		onFetchMetadata,
		onSubmit,
	}: Props = $props();

	let address = $state('');
	let symbol = $state('');
	let decimals = $state('');
	let error = $state('');
	let fetching = $state(false);
	let submitting = $state(false);

	const addressValid = $derived(/^0x[a-fA-F0-9]{40}$/.test(address.trim()));

	function reset() {
		address = '';
		symbol = '';
		decimals = '';
		error = '';
		fetching = false;
		submitting = false;
	}

	function close() {
		reset();
		onClose();
	}

	async function handleFetch() {
		error = '';
		if (!addressValid) {
			error = t('br.addToken.errorAddress');
			return;
		}
		fetching = true;
		try {
			const meta = await onFetchMetadata(address.trim());
			symbol = meta.symbol;
			decimals = String(meta.decimals);
		} catch {
			error = t('br.addToken.fetchFailed');
		} finally {
			fetching = false;
		}
	}

	async function handleSubmit() {
		error = '';
		const addr = address.trim();
		const dec = Number(decimals);

		if (!addressValid) return (error = t('br.addToken.errorAddress'));
		if (existingAddresses.includes(addr.toLowerCase()))
			return (error = t('br.addToken.errorDuplicate'));
		if (!symbol.trim()) return (error = t('br.addToken.errorSymbol'));
		if (!Number.isInteger(dec) || dec < 0 || dec > 36)
			return (error = t('br.addToken.errorDecimals'));

		submitting = true;
		try {
			await onSubmit({ address: addr, symbol: symbol.trim(), decimals: dec });
			close();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			submitting = false;
		}
	}
</script>

<ResponsiveModal {open} onClose={close} title={t('br.addToken.title')}>
	<div class="form">
		<div class="network-row">
			<span class="label">{t('br.addToken.network')}</span>
			<span class="network-name">{networkName}</span>
		</div>

		<label class="field">
			<span class="label">{t('br.addToken.address')}</span>
			<div class="address-row">
				<input
					class="input mono"
					bind:value={address}
					placeholder={t('br.addToken.addressPlaceholder')}
				/>
				<button
					class="btn btn-secondary"
					onclick={handleFetch}
					disabled={!addressValid || fetching}
				>
					{fetching ? t('br.addToken.fetching') : t('br.addToken.fetch')}
				</button>
			</div>
		</label>

		<div class="row">
			<label class="field">
				<span class="label">{t('br.addToken.symbol')}</span>
				<input class="input" bind:value={symbol} />
			</label>
			<label class="field field-narrow">
				<span class="label">{t('br.addToken.decimals')}</span>
				<input class="input" type="number" bind:value={decimals} />
			</label>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-secondary" onclick={close} disabled={submitting}>
				{t('br.addToken.cancel')}
			</button>
			<button class="btn btn-primary" onclick={handleSubmit} disabled={submitting}>
				{t('br.addToken.submit')}
			</button>
		</div>
	</div>
</ResponsiveModal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.network-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.network-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.row {
		display: flex;
		gap: var(--space-3);
	}

	.address-row {
		display: flex;
		gap: var(--space-2);
	}

	.address-row .input {
		flex: 1;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
	}

	.field-narrow {
		max-width: 120px;
	}

	.label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
	}

	.input {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}

	.input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.error {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		border: none;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-primary:not(:disabled):hover {
		background: var(--accent-hover);
	}

	.btn-secondary {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.btn-secondary:not(:disabled):hover {
		border-color: var(--border-strong);
	}
</style>
