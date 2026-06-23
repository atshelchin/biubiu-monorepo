<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import type { WalletSweepStore } from '$lib/pda-apps/wallet-sweep/store.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		store: WalletSweepStore;
	}
	let { open, onClose, store }: Props = $props();

	let address = $state('');

	async function submit() {
		const before = store.tokens.length;
		await store.addTokenByAddress(address.trim());
		if (store.tokens.length > before) {
			address = '';
			onClose();
		}
	}

	function close() {
		address = '';
		store.addTokenError = null;
		onClose();
	}
</script>

<ResponsiveModal {open} onClose={close} title={t('ws.tokens.addTitle')}>
	<div class="form">
		<input
			class="input"
			placeholder={t('ws.tokens.addressPlaceholder')}
			bind:value={address}
			onkeydown={(e) => e.key === 'Enter' && submit()}
		/>
		{#if store.addTokenError}
			<p class="error">{store.addTokenError}</p>
		{/if}
		<button class="btn btn-primary" onclick={submit} disabled={store.addingToken || !address.trim()}>
			{store.addingToken ? t('ws.tokens.fetching') : t('ws.tokens.fetch')}
		</button>
	</div>
</ResponsiveModal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.input {
		padding: var(--space-3) var(--space-4);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--error);
	}
	.btn {
		padding: var(--space-3) var(--space-5);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
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
</style>
