<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { TriangleAlert } from '@lucide/svelte';
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
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="ws-input ws-mono"
			placeholder={t('ws.tokens.addressPlaceholder')}
			bind:value={address}
			autofocus
			spellcheck="false"
			onkeydown={(e) => e.key === 'Enter' && submit()}
		/>
		{#if store.addTokenError}
			<p class="form-err"><TriangleAlert size={14} /> {store.addTokenError}</p>
		{/if}
		<button class="ws-btn ws-btn-primary" onclick={submit} disabled={store.addingToken || !address.trim()}>
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
	.form-err {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-sm);
		color: var(--error);
	}
</style>
