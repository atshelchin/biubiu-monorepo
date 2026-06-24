<script lang="ts">
	/**
	 * Verify section — publish source to a block explorer, plus deployment history.
	 * Reveals itself once there's at least one deployment. Single-screen flow.
	 */
	import { t, formatRelativeTime } from '$lib/i18n';
	import { Check, ExternalLink, Copy, BadgeCheck } from '@lucide/svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { deployStore as store, explorerForChain } from '$lib/deploy/deploy-store.svelte.js';

	let confirmClear = $state(false);
	const canVerify = $derived(!store.verifying && !!store.verifyAddress.trim() && store.serverStatus === 'connected');

	function shortHash(h: string): string {
		return h && h.length >= 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
	}
	function copy(text: string) {
		navigator.clipboard.writeText(text);
		store.log(t('deploy.action.copied'), 'info');
	}
</script>

<section class="dp-panel">
	<h2 class="dp-sec-h"><span class="dp-sec-icon"><BadgeCheck size={18} /></span> {t('deploy.verify.heading')}</h2>
	<p class="dp-intro v-intro">{t('deploy.verify.intro')}</p>

	<div class="seg" role="group" aria-label={t('deploy.verify.verifier')}>
		<button class="seg-btn" class:active={store.verifier === 'etherscan'} onclick={() => (store.verifier = 'etherscan')}>{t('deploy.verify.etherscan')}</button>
		<button class="seg-btn" class:active={store.verifier === 'blockscout'} onclick={() => (store.verifier = 'blockscout')}>{t('deploy.verify.blockscout')}</button>
	</div>

	{#if store.verifier === 'etherscan'}
		<div class="key-head">
			<label class="dp-label key-label" for="dp-etherscan-key">{t('deploy.verify.etherscanKey')}</label>
			<a class="get-key" href="https://etherscan.io/apidashboard" target="_blank" rel="noopener">{t('deploy.verify.getKey')} <ExternalLink size={11} /></a>
		</div>
		<input id="dp-etherscan-key" class="dp-input dp-mono" bind:value={store.etherscanKey} />
	{/if}

	<label class="dp-label" for="dp-verify-addr">{t('deploy.verify.address')}</label>
	<input id="dp-verify-addr" class="dp-input dp-mono" placeholder="0x…" bind:value={store.verifyAddress} />

	<button class="dp-btn dp-btn-primary dp-btn-block verify" disabled={!canVerify} onclick={() => store.verifyContract()}>
		{#if store.verifying}<span class="dp-spinner"></span> {t('deploy.verify.verifying')}{:else}<Check size={15} /> {t('deploy.verify.btn')}{/if}
	</button>

	{#if store.history.length > 0}
		<div class="hist">
			<div class="hist-head">
				<span class="hist-title">{t('deploy.history.title')}</span>
				<button class="hist-clear" onclick={() => (confirmClear = true)}>{t('deploy.history.clearAll')}</button>
			</div>
			<div class="hist-list">
				{#each store.history as r (r.id)}
					{@const exp = r.explorerUrl?.replace(/\/$/, '') ?? explorerForChain(r.chainId)}
					<div class="hist-item">
						<div class="hist-row">
							<span class="hist-name">{r.contractName}</span>
							<span class="hist-chain">{r.chainName}</span>
							{#if r.verified}<span class="dp-pill dp-pill-ok tiny"><Check size={11} /> {t('deploy.history.verified')}</span>{/if}
							<span class="hist-time">{formatRelativeTime(r.timestamp)}</span>
						</div>
						<div class="hist-row">
							{#if exp}
								<a class="hist-link dp-mono" href={`${exp}/address/${r.address}`} target="_blank" rel="noopener">{shortHash(r.address)} <ExternalLink size={11} /></a>
							{:else}
								<button class="hist-link dp-mono" onclick={() => copy(r.address)}>{shortHash(r.address)} <Copy size={11} /></button>
							{/if}
							{#if r.txHash && exp}
								<a class="hist-link dp-mono dim" href={`${exp}/tx/${r.txHash}`} target="_blank" rel="noopener">tx {shortHash(r.txHash)}</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>

<ConfirmModal
	open={confirmClear}
	title={t('deploy.history.title')}
	message={t('deploy.history.clearConfirm')}
	confirmText={t('deploy.history.clearAll')}
	destructive
	onConfirm={() => { store.clearHistory(); confirmClear = false; }}
	onCancel={() => (confirmClear = false)}
/>

<style>
	.dp-panel :global(.dp-sec-h) {
		margin-bottom: var(--space-2);
	}
	.v-intro {
		margin-top: 0;
		margin-bottom: var(--space-4);
	}
	.seg {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
	}
	.seg-btn {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		transition: all var(--motion-fast) var(--easing);
	}
	.seg-btn.active {
		background: var(--bg-elevated);
		color: var(--fg-base);
		box-shadow: var(--shadow-sm);
	}
	.key-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.key-label {
		margin-bottom: var(--space-2);
	}
	.get-key {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
		white-space: nowrap;
	}
	.get-key:hover {
		text-decoration: underline;
	}
	.verify {
		margin-top: var(--space-4);
	}
	.hist {
		margin-top: var(--space-6);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-4);
	}
	.hist-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	.hist-title {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--fg-subtle);
	}
	.hist-clear {
		background: none;
		border: none;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.hist-clear:hover {
		color: var(--error);
	}
	.hist-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hist-item {
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.hist-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.hist-row + .hist-row {
		margin-top: var(--space-2);
	}
	.hist-name {
		font-weight: var(--weight-semibold);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.hist-chain {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.tiny {
		padding: 1px var(--space-2);
		font-size: 10px;
	}
	.hist-time {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-left: auto;
	}
	.hist-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.hist-link:hover {
		text-decoration: underline;
	}
	.hist-link.dim {
		color: var(--fg-subtle);
	}
</style>
