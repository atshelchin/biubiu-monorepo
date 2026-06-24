<script lang="ts">
	import { t } from '$lib/i18n';
	import { Network, KeyRound, Coins, Target, Receipt, Check, X, ArrowRight, LoaderCircle } from '@lucide/svelte';
	import NetworkGrid, { type NetworkGridItem } from '$lib/widgets/NetworkGrid.svelte';
	import AddNetworkModal from '$lib/widgets/AddNetworkModal.svelte';
	import MemberFeeWaiver from '$lib/subscription/MemberFeeWaiver.svelte';
	import WalletSweepKeysEditor from '$lib/widgets/WalletSweepKeysEditor.svelte';
	import WalletSweepAddToken from '$lib/widgets/WalletSweepAddToken.svelte';
	import type { WalletSweepStore } from '$lib/pda-apps/wallet-sweep/store.svelte';

	interface Props {
		store: WalletSweepStore;
	}
	let { store }: Props = $props();

	let showAddToken = $state(false);
	let showAddNetwork = $state(false);

	const networkReady = $derived(!!store.network && !!store.readiness[store.networkSlug ?? '']?.ready);
	const keysReady = $derived(store.parseStats.valid > 0);
	const destTouched = $derived(store.destination.trim().length > 0);

	const canContinue = $derived(networkReady && keysReady && store.destinationValid);

	// What's still missing — surfaced so a disabled "Continue" never leaves the
	// user guessing why they're blocked.
	const missing = $derived(
		[
			!networkReady && t('ws.req.network'),
			!keysReady && t('ws.req.keys'),
			!store.destinationValid && t('ws.req.dest'),
		].filter(Boolean) as string[],
	);

	async function submitCustomNetwork(data: { name: string; chainId: number; rpcs: string[]; symbol: string }) {
		await store.addCustomNetwork({ name: data.name, chainId: data.chainId, symbol: data.symbol, rpc: data.rpcs[0] });
		if (store.addNetworkError) throw new Error(store.addNetworkError);
	}
</script>

{#snippet badges(net: NetworkGridItem)}
	{@const r = store.readiness[net.slug]}
	<span class="ws-badge">{t('ws.network.badge7702')}</span>
	{#if !r}
		<span class="ws-badge ws-badge-muted">{t('ws.network.checking')}</span>
	{:else if r.ready}
		<span class="ws-badge ws-badge-ok">{t('ws.network.ready')}</span>
	{:else}
		<span class="ws-badge ws-badge-bad" title={r.error}>{t('ws.network.unavailable')}</span>
	{/if}
{/snippet}

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><Network size={18} /></span>{t('ws.network.title')}</h2>
	<p class="ws-card-sub">{t('ws.network.subtitle')}</p>
	<NetworkGrid
		networks={store.networks}
		selectedSlug={store.networkSlug}
		onSelect={(slug) => store.selectNetwork(slug)}
		onAddCustom={() => (showAddNetwork = true)}
		addLabel={t('ws.network.addCustom')}
		onRemoveCustom={(slug) => store.removeCustomNetwork(slug)}
		testnetToggle
		testnetsOn={store.includeTestnets}
		onToggleTestnets={(on) => (store.includeTestnets = on)}
		testnetToggleLabel={t('ws.network.testnets')}
		{badges}
	/>
</section>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><KeyRound size={18} /></span>{t('ws.keys.title')}</h2>
	<p class="ws-card-sub">{t('ws.keys.subtitle')}</p>
	<WalletSweepKeysEditor onChange={(text) => store.setKeys(text)} />
	{#if store.parseStats.total > 0}
		<div class="key-stats">
			<span class="ws-chip ws-chip-ok"><Check size={12} />{t('ws.keys.summary', { valid: store.parseStats.valid })}</span>
			{#if store.parseStats.invalid > 0}<span class="ws-chip ws-chip-bad">{t('ws.keys.invalid', { count: store.parseStats.invalid })}</span>{/if}
			{#if store.parseStats.duplicates > 0}<span class="ws-chip ws-chip-muted">{t('ws.keys.duplicates', { count: store.parseStats.duplicates })}</span>{/if}
		</div>
	{/if}
</section>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><Coins size={18} /></span>{t('ws.tokens.title')}</h2>
	<p class="ws-card-sub">{t('ws.tokens.subtitle')}</p>
	<div class="token-row">
		<span class="token-chip token-native">{store.network?.symbol ?? t('ws.tokens.native')} · {t('ws.tokens.native')}</span>
		{#each store.tokens as tk (tk.address)}
			<span class="token-chip">{tk.symbol}<button class="chip-x" onclick={() => store.removeToken(tk.address)} aria-label={t('ws.tokens.remove')}><X size={13} /></button></span>
		{/each}
		<button class="token-add" onclick={() => (showAddToken = true)} disabled={!store.network} title={!store.network ? t('ws.req.network') : undefined}>+ {t('ws.tokens.add')}</button>
	</div>
</section>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><Target size={18} /></span>{t('ws.dest.title')}</h2>
	<p class="ws-card-sub">{t('ws.dest.subtitle')}</p>
	<input
		class="ws-input ws-mono"
		class:ws-input-invalid={destTouched && !store.destinationValid}
		placeholder={t('ws.dest.placeholder')}
		bind:value={store.destination}
		spellcheck="false"
	/>
	{#if destTouched && !store.destinationValid}
		<p class="ws-field-msg is-err"><X size={13} />{t('ws.dest.invalid')}</p>
	{:else if store.destinationValid}
		<p class="ws-field-msg is-ok"><Check size={13} />{t('ws.dest.valid')}</p>
	{/if}
</section>

<section class="ws-card">
	<h2 class="ws-card-title"><span class="ws-title-icon"><Receipt size={18} /></span>{t('ws.fee.title')}</h2>
	<p class="ws-card-sub">{t('ws.fee.subtitle')}</p>
	<MemberFeeWaiver proving={store.waiveProving} onProve={() => store.waiveFeeWithPasskey()} />
</section>

<div class="ws-actions">
	{#if !canContinue && missing.length}
		<span class="ws-actions-hint">{t('ws.req.prefix')} {missing.join(' · ')}</span>
	{/if}
	<button class="ws-btn ws-btn-primary ws-btn-lg" disabled={!canContinue || store.balancesLoading} onclick={() => store.preflight()}>
		{#if store.balancesLoading}<LoaderCircle size={15} class="spin" /> {t('ws.btn.checking')}{:else}{t('ws.btn.continue')} <ArrowRight size={15} />{/if}
	</button>
</div>

<WalletSweepAddToken open={showAddToken} onClose={() => (showAddToken = false)} {store} />
<AddNetworkModal
	open={showAddNetwork}
	onClose={() => (showAddNetwork = false)}
	existingChainIds={store.networks.map((n) => n.chainId)}
	onSubmit={submitCustomNetwork}
/>

<style>
	.key-stats {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}
	.token-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	.token-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.token-native {
		background: var(--accent-subtle);
		border-color: transparent;
		color: var(--fg-base);
	}
	.chip-x {
		display: inline-flex;
		border: none;
		background: none;
		color: var(--fg-subtle);
		cursor: pointer;
		padding: 0;
		border-radius: var(--radius-sm);
	}
	.chip-x:hover {
		color: var(--error);
	}
	.token-add {
		padding: var(--space-2) var(--space-3);
		background: none;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-full);
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.token-add:not(:disabled):hover {
		border-color: var(--accent);
	}
	.token-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ws-actions :global(.spin) {
		animation: ws-cfg-spin 0.8s linear infinite;
	}
	@keyframes ws-cfg-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 640px) {
		.ws-actions {
			flex-direction: column-reverse;
			align-items: stretch;
		}
		.ws-actions :global(.ws-btn) {
			width: 100%;
		}
		.ws-actions-hint {
			margin-right: 0;
			text-align: center;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ws-actions :global(.spin) {
			animation: none;
		}
	}
</style>
