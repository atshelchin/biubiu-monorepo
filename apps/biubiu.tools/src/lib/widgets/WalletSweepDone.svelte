<script lang="ts">
	import { t } from '$lib/i18n';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { CheckCircle2, ExternalLink, RefreshCw, Fuel, RotateCcw, ShieldOff } from '@lucide/svelte';
	import type { WalletSweepStore } from '$lib/pda-apps/wallet-sweep/store.svelte';

	interface Props {
		store: WalletSweepStore;
	}
	let { store }: Props = $props();

	let confirmRevoke = $state(false);

	const statusLabel: Record<string, string> = {
		completed: t('ws.status.completed'),
		failed: t('ws.status.failed'),
	};
</script>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon ok"><CheckCircle2 size={18} /></span>{t('ws.done.title')}</h2>
	<p class="ws-card-sub">{t('ws.done.subtitle')}</p>
	<div class="batches">
		{#each store.sweepRecords as r (r.index)}
			<div class="batch" class:failed={r.status === 'failed'}>
				<span class="batch-id">#{r.index + 1}</span>
				<span class="batch-count">{t('ws.done.batchCount', { count: r.count })}</span>
				<span class="batch-status" class:failed={r.status === 'failed'}>{statusLabel[r.status] ?? r.status}</span>
				{#if r.explorerUrl}<a href={r.explorerUrl} target="_blank" rel="noopener">{t('ws.done.viewTx')} <ExternalLink size={12} /></a>{/if}
			</div>
		{/each}
	</div>
	<div class="fund-actions">
		<button class="ws-btn ws-btn-primary" onclick={() => store.sweepAgain()} disabled={store.running}><RefreshCw size={15} />{t('ws.done.sweepAgain')}</button>
		<button class="ws-btn ws-btn-ghost" onclick={() => store.recoverRelayGas()} disabled={store.recovering}><Fuel size={15} />{store.recovering ? t('ws.btn.checking') : t('ws.btn.recoverGas')}</button>
		<button class="ws-btn ws-btn-ghost" onclick={() => store.reset()}><RotateCcw size={15} />{t('ws.btn.reset')}</button>
	</div>
</section>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><ShieldOff size={18} /></span>{t('ws.revoke.title')}</h2>
	<p class="ws-card-sub">{t('ws.revoke.subtitle')}</p>
	<button
		class="ws-btn ws-btn-danger"
		disabled={store.revoking || store.sweptAddresses.length === 0}
		onclick={() => (confirmRevoke = true)}
	>
		{store.revoking ? t('ws.revoke.revoking') : `${t('ws.revoke.all')} (${store.sweptAddresses.length})`}
	</button>
</section>

<ConfirmModal
	open={confirmRevoke}
	title={t('ws.revoke.confirmTitle')}
	message={t('ws.revoke.confirmBody', { count: store.sweptAddresses.length })}
	confirmText={t('ws.revoke.all')}
	destructive
	onConfirm={() => {
		confirmRevoke = false;
		store.revoke(store.sweptAddresses);
	}}
	onCancel={() => (confirmRevoke = false)}
/>

<style>
	.ws-title-icon.ok {
		color: var(--success);
	}
	.batches {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.batch {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}
	.batch.failed {
		background: var(--error-subtle);
	}
	.batch-id {
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.batch-count {
		color: var(--fg-muted);
		font-size: var(--text-xs);
	}
	.batch-status {
		margin-left: auto;
		color: var(--success);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}
	.batch-status.failed {
		color: var(--error);
	}
	.batch a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		text-decoration: none;
		font-size: var(--text-xs);
	}
	.batch a:hover {
		text-decoration: underline;
	}
	.fund-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
