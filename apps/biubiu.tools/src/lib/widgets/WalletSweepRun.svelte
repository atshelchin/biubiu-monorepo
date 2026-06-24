<script lang="ts">
	import { t } from '$lib/i18n';
	import QrCanvas from '$lib/ui/QrCanvas.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { fmtAmount, shortAddr } from '$lib/pda-apps/wallet-sweep/format';
	import type { WalletSweepStore } from '$lib/pda-apps/wallet-sweep/store.svelte';
	import { Download, Upload, Check, RefreshCw, Fingerprint, Copy, ArrowLeft, LoaderCircle } from '@lucide/svelte';

	interface Props {
		store: WalletSweepStore;
	}
	let { store }: Props = $props();

	let copied = $state(false);
	let confirmRotate = $state(false);

	const stageLabel = $derived.by(() => {
		switch (store.runStage) {
			case 'deploying':
				return t('ws.run.deploying');
			case 'sweeping':
				return t('ws.run.sweeping');
			default:
				return t('ws.run.start');
		}
	});

	function copyAddr() {
		if (!store.relay) return;
		navigator.clipboard?.writeText(store.relay.address);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
	async function onRelayFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		store.verifyUpload(await file.text());
		input.value = '';
	}
</script>

{#if store.plan && store.relay}
	<section class="ws-card">
		<h2 class="ws-card-title">{t('ws.run.title')}</h2>
		<div class="summary">
			<div class="stat"><span class="stat-n">{store.plan.sweepable.length}</span><span class="stat-l">{t('ws.run.wallets')}</span></div>
			<div class="stat"><span class="stat-n">{fmtAmount(store.totalNative)}</span><span class="stat-l">{t('ws.preview.totalNative')} {store.network?.symbol}</span></div>
			{#if store.fee}
				<div class="stat"><span class="stat-n">{store.fee.source === 'member-free' ? t('ws.fee.free') : `${fmtAmount(store.fee.amount)} ${store.network?.symbol}`}</span><span class="stat-l">{t('ws.fee.label')}</span></div>
			{/if}
			{#if store.plan.contracts.length}
				<div class="stat"><span class="stat-n">{store.plan.contracts.length}</span><span class="stat-l">{t('ws.preview.contractsSkipped')}</span></div>
			{/if}
		</div>
		<details class="details">
			<summary>{t('ws.run.details')}</summary>
			<div class="table-wrap">
				<table class="preview-table">
					<thead><tr><th>{t('ws.preview.address')}</th><th>{store.network?.symbol}</th>{#each store.tokens as tk (tk.address)}<th>{tk.symbol}</th>{/each}</tr></thead>
					<tbody>
						{#each store.balances as b (b.address)}
							<tr><td class="ws-mono">{shortAddr(b.address)}</td><td>{fmtAmount(b.native)}</td>{#each store.tokens as tk (tk.address)}<td>{fmtAmount(b.tokens[(tk.address ?? '').toLowerCase()] ?? 0n, tk.decimals)}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</section>

	<!-- Relay: download → verify → fund -->
	<section class="ws-card">
		<h2 class="ws-card-title">{t('ws.relay.title')}</h2>
		<p class="ws-card-sub">{t('ws.relay.subtitle')}</p>

		<!-- Step 1: download -->
		<div class="relay-step" class:done={store.relayDownloaded}>
			<span class="rs-num">{#if store.relayDownloaded}<Check size={14} />{:else}1{/if}</span>
			<div class="rs-body">
				<strong>{t('ws.relay.step1')}</strong>
				<p class="note">{t('ws.relay.downloadHint')}</p>
				<div class="rs-actions">
					<button class="ws-btn ws-btn-primary" onclick={() => store.downloadRelay()}><Download size={15} />{t('ws.btn.download')}</button>
					<button class="ws-btn ws-btn-ghost" onclick={() => (confirmRotate = true)}>{t('ws.relay.rotate')}</button>
				</div>
			</div>
		</div>

		<!-- Step 2: verify upload -->
		{#if store.relayDownloaded}
			<div class="relay-step" class:done={store.relayVerified}>
				<span class="rs-num">{#if store.relayVerified}<Check size={14} />{:else}2{/if}</span>
				<div class="rs-body">
					<strong>{t('ws.relay.step2')}</strong>
					<p class="note">{t('ws.relay.verifyHint')}</p>
					{#if !store.relayVerified}
						<label class="upload">
							<Upload size={15} /> {t('ws.btn.verifyUpload')}
							<input type="file" accept=".txt,text/plain" onchange={onRelayFile} hidden />
						</label>
						{#if store.verifyError}<p class="ws-field-msg is-err">{store.verifyError}</p>{/if}
					{:else}
						<p class="ws-field-msg is-ok"><Check size={14} /> {t('ws.relay.verified')}</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Step 3: fund (gated on verify) -->
		{#if store.relayVerified}
			<div class="relay-step" class:done={store.relayerFunded}>
				<span class="rs-num">{#if store.relayerFunded}<Check size={14} />{:else}3{/if}</span>
				<div class="rs-body">
					<strong>{t('ws.relay.step3')}</strong>
					<p class="note">{t('ws.relay.fundHint')}</p>
					<div class="fund">
						<QrCanvas value={store.relay.address} />
						<div class="fund-info">
							<button class="addr-copy" onclick={copyAddr}>
								<code>{shortAddr(store.relay.address)}</code>
								<span class="copy-hint"><Copy size={12} />{copied ? t('ws.copied') : t('ws.copy')}</span>
							</button>
							<div class="kv"><span>{t('ws.relay.needed')}</span><strong>{fmtAmount(store.fundNeeded)} {store.network?.symbol}</strong></div>
							<div class="kv"><span>{t('ws.relay.balance')}</span><strong>{fmtAmount(store.relayBal)} {store.network?.symbol}</strong></div>
							<button class="ws-btn ws-btn-ghost ws-btn-sm" onclick={() => store.refreshRelayerBalance()}><RefreshCw size={13} />{t('ws.btn.refresh')}</button>
							<div class="fund-state" class:ok={store.relayerFunded}>{store.relayerFunded ? t('ws.relay.funded') : t('ws.relay.notFunded')}</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</section>

	{#if store.running}
		<section class="ws-card ws-card-center">
			<div class="timeline">
				{#if store.needBatchSweeperDeploy || store.needSweeperDeploy || store.runStage === 'deploying'}
					<span class="tl" class:on={store.runStage === 'deploying'} class:past={store.runStage === 'sweeping'}>{t('ws.run.deploying')}</span>
				{/if}
				<span class="tl" class:on={store.runStage === 'sweeping'}>{t('ws.step.sweep')}</span>
			</div>
			{#if store.progress}
				<p class="progress-text">{t('ws.run.batch', { done: store.progress.chunk, total: store.progress.total })}</p>
			{/if}
			<div class="spinner"></div>
		</section>
	{/if}

	<div class="ws-actions ws-actions-split">
		<button class="ws-btn ws-btn-ghost" onclick={() => store.back()} disabled={store.running}><ArrowLeft size={15} />{t('ws.btn.back')}</button>
		<button class="ws-btn ws-btn-primary ws-btn-lg" onclick={() => store.proceed()} disabled={store.running || !store.relayerFunded}>
			{#if store.running}<LoaderCircle size={15} class="spin" />{:else}<Fingerprint size={15} />{/if}{stageLabel}
		</button>
	</div>
{/if}

<ConfirmModal
	open={confirmRotate}
	title={t('ws.relay.rotateTitle')}
	message={t('ws.relay.rotateBody')}
	confirmText={t('ws.relay.rotate')}
	destructive
	onConfirm={() => {
		confirmRotate = false;
		store.rotateRelay();
	}}
	onCancel={() => (confirmRotate = false)}
/>

<style>
	.summary {
		display: flex;
		gap: var(--space-6);
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat-n {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		letter-spacing: -0.01em;
	}
	.stat-l {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.details summary {
		font-size: var(--text-sm);
		color: var(--accent);
		cursor: pointer;
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: var(--space-3);
	}
	.preview-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.preview-table th,
	.preview-table td {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border-subtle);
		white-space: nowrap;
	}
	.preview-table th {
		color: var(--fg-subtle);
		font-weight: var(--weight-medium);
		font-size: var(--text-xs);
	}

	/* Relay steps */
	.relay-step {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-4) 0;
		border-top: 1px solid var(--border-subtle);
	}
	.relay-step:first-of-type {
		border-top: none;
		padding-top: var(--space-2);
	}
	.rs-num {
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		display: grid;
		place-items: center;
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--fg-muted);
		transition: all var(--motion-fast) var(--easing);
	}
	.relay-step.done .rs-num {
		background: var(--success-muted);
		color: var(--success);
		border-color: transparent;
	}
	.rs-body {
		flex: 1;
		min-width: 0;
	}
	.rs-body strong {
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.rs-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}
	.note {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		line-height: var(--leading-relaxed);
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--space-3);
		padding: var(--space-3) var(--space-5);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.upload:hover {
		border-color: var(--accent);
	}
	.fund {
		display: flex;
		gap: var(--space-5);
		margin-top: var(--space-3);
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.fund-info {
		flex: 1;
		min-width: 220px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.addr-copy {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		font-family: var(--font-mono);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.addr-copy:hover {
		border-color: var(--border-strong);
	}
	.copy-hint {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		color: var(--accent);
	}
	.kv {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.kv strong {
		color: var(--fg-base);
	}
	.fund-state {
		margin-top: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		text-align: center;
		background: var(--warning-muted);
		color: var(--warning);
	}
	.fund-state.ok {
		background: var(--success-muted);
		color: var(--success);
	}
	.timeline {
		display: flex;
		justify-content: center;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
		font-size: var(--text-xs);
	}
	.tl {
		color: var(--fg-subtle);
		padding: 2px 10px;
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
	}
	.tl.on {
		color: var(--accent-fg);
		background: var(--accent);
	}
	.tl.past {
		color: var(--accent);
		background: var(--accent-muted);
	}
	.progress-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.spinner {
		width: 28px;
		height: 28px;
		margin: var(--space-3) auto 0;
		border: 3px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: var(--radius-full);
		animation: ws-run-spin 0.8s linear infinite;
	}
	.ws-actions-split {
		justify-content: space-between;
	}
	:global(.spin) {
		animation: ws-run-spin 0.8s linear infinite;
	}
	@keyframes ws-run-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 640px) {
		.ws-actions-split {
			flex-direction: column-reverse;
			align-items: stretch;
		}
		.ws-actions-split :global(.ws-btn) {
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner,
		:global(.spin) {
			animation: none;
		}
	}
</style>
