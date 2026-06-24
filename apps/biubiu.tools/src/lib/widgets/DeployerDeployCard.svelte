<script lang="ts">
	/**
	 * Deploy section — the deterministic CREATE2 address, salt + gas behind an
	 * "Advanced" disclosure, and the one primary action. Surfaces exactly why the
	 * button is disabled. Single-screen flow.
	 */
	import { t } from '$lib/i18n';
	import { Copy, ExternalLink, AlertTriangle, Rocket } from '@lucide/svelte';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	const EMPTY_SALT = '0x0000000000000000000000000000000000000000000000000000000000000000';

	const predictedLink = $derived(
		store.explorerUrl && store.predictedAddress ? `${store.explorerUrl}/address/${store.predictedAddress}` : null
	);
	const blockerText = $derived(store.deployBlocker ? t(`deploy.gate.${store.deployBlocker}` as never) : '');

	// Debounce-check whether the predicted address is already occupied on-chain.
	let checkTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const _addr = store.predictedAddress;
		const _rpc = store.effectiveRpc;
		clearTimeout(checkTimer);
		if (_addr && _rpc) checkTimer = setTimeout(() => store.checkAddressDeployed(), 500);
		return () => clearTimeout(checkTimer);
	});

	function copy(text: string) {
		navigator.clipboard.writeText(text);
		store.log(t('deploy.action.copied'), 'info');
	}
</script>

<section class="dp-panel">
	<h2 class="dp-sec-h"><span class="dp-sec-icon"><Rocket size={17} /></span> {t('deploy.review.heading')}</h2>

	{#if store.predictedAddress}
		<div class="predicted" class:taken={store.addressAlreadyDeployed}>
			<span class="predicted-label">{t('deploy.create2.predictedAddress')}</span>
			{#if predictedLink}
				<a class="predicted-value dp-mono" href={predictedLink} target="_blank" rel="noopener">{store.predictedAddress} <ExternalLink size={12} /></a>
			{:else}
				<button class="predicted-value dp-mono" onclick={() => copy(store.predictedAddress ?? '')}>{store.predictedAddress} <Copy size={12} /></button>
			{/if}
			{#if store.checkingAddress}
				<span class="predicted-note">{t('deploy.create2.checking')}</span>
			{:else if store.addressAlreadyDeployed}
				<span class="predicted-note err"><AlertTriangle size={12} /> {t('deploy.create2.alreadyDeployed')}</span>
			{:else}
				<span class="predicted-note">{t('deploy.help.predicted')}</span>
			{/if}
		</div>
	{/if}

	<div class="advanced">
		<Disclosure title={t('deploy.review.advanced')} marked={store.salt !== EMPTY_SALT}>
			<label class="dp-label" for="dp-salt">{t('deploy.create2.salt')}</label>
			<input id="dp-salt" class="dp-input dp-mono" bind:value={store.salt} oninput={() => store.updatePredictedAddress()} />
			<p class="dp-help">{t('deploy.help.salt')}</p>

			<div class="dp-label">{t('deploy.gas.title')}</div>
			<div class="gas">
				<div class="gas-field">
					<label class="gas-label" for="dp-gas-limit">{t('deploy.gas.limit')}</label>
					<input id="dp-gas-limit" class="dp-input dp-mono" bind:value={store.gasLimitInput} />
				</div>
				<div class="gas-field">
					<label class="gas-label" for="dp-max-fee">{t('deploy.gas.maxFee', { unit: store.gasPriceUnit })}</label>
					<input id="dp-max-fee" class="dp-input dp-mono" bind:value={store.maxFeePerGasGwei} placeholder={t('deploy.gas.fetching')} />
				</div>
				<div class="gas-field">
					<label class="gas-label" for="dp-prio">{t('deploy.gas.priority', { unit: store.gasPriceUnit })}</label>
					<input id="dp-prio" class="dp-input dp-mono" bind:value={store.maxPriorityFeePerGasGwei} placeholder={t('deploy.gas.fetching')} />
				</div>
			</div>
		</Disclosure>
	</div>

	<button class="dp-btn dp-btn-primary dp-btn-block dp-btn-lg deploy" disabled={!store.canDeploy} onclick={() => store.deploy()}>
		{#if store.deploying}
			<span class="dp-spinner"></span> {t('deploy.action.deploying')}
		{:else}
			<Rocket size={16} /> {t('deploy.action.deploy')}
		{/if}
	</button>

	{#if store.deploying && store.deployStatus}
		<p class="status">{t(`deploy.status.${store.deployStatus}` as never)}</p>
	{:else if blockerText}
		<p class="status muted">{blockerText}</p>
	{/if}
</section>

<style>
	.dp-panel :global(.dp-sec-h) {
		margin-bottom: var(--space-4);
	}
	.predicted {
		padding: var(--space-4);
		background: var(--accent-subtle);
		border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
		border-radius: var(--radius-md);
	}
	.predicted.taken {
		background: var(--error-muted);
		border-color: color-mix(in srgb, var(--error) 25%, transparent);
	}
	.predicted-label {
		display: block;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-bottom: var(--space-2);
	}
	.predicted-value {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--accent);
		word-break: break-all;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}
	.predicted-value:hover {
		text-decoration: underline;
	}
	.predicted-note {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		line-height: var(--leading-relaxed);
	}
	.predicted-note.err {
		color: var(--error);
	}
	.advanced {
		margin: var(--space-4) 0;
	}
	.gas {
		display: flex;
		gap: var(--space-2);
	}
	.gas-field {
		flex: 1;
		min-width: 0;
	}
	.gas-label {
		display: block;
		font-size: 10px;
		color: var(--fg-faint);
		margin-bottom: 2px;
	}
	.deploy {
		margin-top: var(--space-2);
	}
	.status {
		text-align: center;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin-top: var(--space-3);
	}
	.status.muted {
		color: var(--fg-subtle);
	}
	@media (max-width: 480px) {
		.gas {
			flex-direction: column;
		}
	}
</style>
