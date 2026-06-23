<script lang="ts">
	import { onMount } from 'svelte';
	import { formatUnits, type Address } from 'viem';
	import { t, locale, formatNumber } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';
	import QrCanvas from '$lib/ui/QrCanvas.svelte';
	import { WalletSweepStore, type LogEntry } from '$lib/pda-apps/wallet-sweep/store.svelte';
	import type { Phase } from '$lib/pda-apps/wallet-sweep/types';
	import AddTokenModal from './components/AddTokenModal.svelte';
	import KeysEditor from './components/KeysEditor.svelte';
	import AddNetworkModal from '$lib/widgets/AddNetworkModal.svelte';
	import { Fingerprint, Download, Upload, Check, RefreshCw } from '@lucide/svelte';

	const store = new WalletSweepStore();

	const seoProps = $derived(
		getBaseSEO({
			title: `${t('ws.meta.title')} - BiuBiu Tools`,
			description: t('ws.meta.description'),
			currentLocale: locale.value,
		}),
	);

	const steps: { id: Phase; label: () => string }[] = [
		{ id: 'config', label: () => t('ws.step.config') },
		{ id: 'run', label: () => t('ws.step.run') },
		{ id: 'done', label: () => t('ws.step.done') },
	];
	const stepIndex = $derived(steps.findIndex((s) => s.id === store.phase));
	const stepLabels = $derived(steps.map((s) => s.label()));

	let showAddToken = $state(false);
	let showAddNetwork = $state(false);
	let showLogs = $state(false);
	let copied = $state('');

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

	onMount(() => {
		void store.probeAll();
		void store.loadHistory();
	});

	const canContinue = $derived(
		!!store.network &&
			store.readiness[store.networkSlug ?? '']?.ready &&
			store.parseStats.valid > 0 &&
			store.destinationValid,
	);

	function short(a: string): string {
		return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
	}
	function fmt(wei: bigint, decimals = 18): string {
		const n = Number(formatUnits(wei, decimals));
		if (n === 0) return '0';
		if (n < 0.0001) return '<0.0001';
		return formatNumber(n, { maximumFractionDigits: 6 });
	}
	function copy(text: string) {
		navigator.clipboard?.writeText(text);
		copied = text;
		setTimeout(() => (copied = ''), 1500);
	}
	async function onRelayFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		store.verifyUpload(await file.text());
		input.value = '';
	}
	async function submitCustomNetwork(data: { name: string; chainId: number; rpcs: string[]; symbol: string }) {
		await store.addCustomNetwork({ name: data.name, chainId: data.chainId, symbol: data.symbol, rpc: data.rpcs[0] });
		if (store.addNetworkError) throw new Error(store.addNetworkError);
	}
	function logClass(l: LogEntry): string {
		return `log log-${l.level}`;
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="hero">
		<h1 class="title">{t('ws.title')}</h1>
		<p class="subtitle">{t('ws.subtitle')}</p>
	</header>

	<Stepper steps={stepLabels} current={stepIndex} />

	<section class="security">
		<strong>{t('ws.security.title')}</strong>
		<span>{t('ws.security.body')}</span>
	</section>

	{#if store.error}
		<div class="banner banner-error" role="alert">{store.error}</div>
	{/if}

	<!-- ─────────── CONFIG ─────────── -->
	{#if store.phase === 'config'}
		<section class="card">
			<div class="card-head">
				<h2 class="card-title">{t('ws.network.title')}</h2>
				<button class="link" onclick={() => (showAddNetwork = true)}>+ {t('ws.network.addCustom')}</button>
			</div>
			<p class="card-sub">{t('ws.network.subtitle')}</p>
			<label class="testnet-toggle">
				<input type="checkbox" bind:checked={store.includeTestnets} />
				<span>{t('ws.network.testnets')}</span>
			</label>
			<div class="net-grid">
				{#each store.networks as net (net.slug)}
					{@const r = store.readiness[net.slug]}
					<div class="net-card-wrap">
						<button class="net-card" class:selected={store.networkSlug === net.slug} onclick={() => store.selectNetwork(net.slug)}>
							<span class="net-name">{net.name}</span>
							<span class="net-badges">
								<span class="badge">{t('ws.network.badge7702')}</span>
								{#if !r}
									<span class="badge badge-muted">{t('ws.network.checking')}</span>
								{:else if r.ready}
									<span class="badge badge-ok">{t('ws.network.ready')}</span>
								{:else}
									<span class="badge badge-bad" title={r.error}>{t('ws.network.unavailable')}</span>
								{/if}
							</span>
						</button>
						{#if net.isCustom}
							<button class="net-remove" onclick={() => store.removeCustomNetwork(net.slug)} aria-label="remove network">×</button>
						{/if}
					</div>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2 class="card-title">{t('ws.keys.title')}</h2>
			<p class="card-sub">{t('ws.keys.subtitle')}</p>
			<KeysEditor onChange={(text) => store.setKeys(text)} />
			{#if store.parseStats.total > 0}
				<div class="key-stats">
					<span class="chip chip-ok">{t('ws.keys.summary', { valid: store.parseStats.valid })}</span>
					{#if store.parseStats.invalid > 0}<span class="chip chip-bad">{t('ws.keys.invalid', { count: store.parseStats.invalid })}</span>{/if}
					{#if store.parseStats.duplicates > 0}<span class="chip chip-muted">{t('ws.keys.duplicates', { count: store.parseStats.duplicates })}</span>{/if}
				</div>
			{/if}
		</section>

		<section class="card">
			<h2 class="card-title">{t('ws.tokens.title')}</h2>
			<p class="card-sub">{t('ws.tokens.subtitle')}</p>
			<div class="token-row">
				<span class="token-chip token-native">{store.network?.symbol ?? 'Native'} · {t('ws.tokens.native')}</span>
				{#each store.tokens as tk (tk.address)}
					<span class="token-chip">{tk.symbol}<button class="chip-x" onclick={() => store.removeToken(tk.address)} aria-label="remove">×</button></span>
				{/each}
				<button class="token-add" onclick={() => (showAddToken = true)} disabled={!store.network}>+ {t('ws.tokens.add')}</button>
			</div>
		</section>

		<section class="card">
			<h2 class="card-title">{t('ws.dest.title')}</h2>
			<p class="card-sub">{t('ws.dest.subtitle')}</p>
			<input class="input mono" placeholder={t('ws.dest.placeholder')} bind:value={store.destination} spellcheck="false" />
		</section>

		<div class="actions">
			<button class="btn btn-primary lg" disabled={!canContinue || store.balancesLoading} onclick={() => store.preflight()}>
				{store.balancesLoading ? t('ws.btn.checking') : t('ws.btn.continue')}
			</button>
		</div>

	<!-- ─────────── RUN ─────────── -->
	{:else if store.phase === 'run' && store.plan && store.relay}
		<section class="card">
			<h2 class="card-title">{t('ws.run.title')}</h2>
			<div class="summary">
				<div class="stat"><span class="stat-n">{store.plan.sweepable.length}</span><span class="stat-l">{t('ws.run.wallets')}</span></div>
				<div class="stat"><span class="stat-n">{fmt(store.totalNative)}</span><span class="stat-l">{t('ws.preview.totalNative')} {store.network?.symbol}</span></div>
				{#if store.fee}
					<div class="stat"><span class="stat-n">{fmt(store.fee.amount)} {store.network?.symbol}</span><span class="stat-l">{t('ws.fee.label')}</span></div>
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
								<tr><td class="mono">{short(b.address)}</td><td>{fmt(b.native)}</td>{#each store.tokens as tk (tk.address)}<td>{fmt(b.tokens[(tk.address ?? '').toLowerCase()] ?? 0n, tk.decimals)}</td>{/each}</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		</section>

		<!-- Relay: download → verify → fund -->
		<section class="card">
			<h2 class="card-title">{t('ws.relay.title')}</h2>
			<p class="card-sub">{t('ws.relay.subtitle')}</p>

			<!-- Step 1: download -->
			<div class="relay-step" class:done={store.relayDownloaded}>
				<span class="rs-num">{store.relayDownloaded ? '✓' : 1}</span>
				<div class="rs-body">
					<strong>{t('ws.relay.step1')}</strong>
					<p class="note">{t('ws.relay.downloadHint')}</p>
					<div class="rs-actions">
						<button class="btn btn-primary with-icon" onclick={() => store.downloadRelay()}><Download size={15} />{t('ws.btn.download')}</button>
						<button class="btn btn-ghost" onclick={() => store.rotateRelay()}>{t('ws.relay.rotate')}</button>
					</div>
				</div>
			</div>

			<!-- Step 2: verify upload -->
			{#if store.relayDownloaded}
				<div class="relay-step" class:done={store.relayVerified}>
					<span class="rs-num">{store.relayVerified ? '✓' : 2}</span>
					<div class="rs-body">
						<strong>{t('ws.relay.step2')}</strong>
						<p class="note">{t('ws.relay.verifyHint')}</p>
						{#if !store.relayVerified}
							<label class="upload">
								<Upload size={15} /> {t('ws.btn.verifyUpload')}
								<input type="file" accept=".txt,text/plain" onchange={onRelayFile} hidden />
							</label>
							{#if store.verifyError}<p class="error">{store.verifyError}</p>{/if}
						{:else}
							<p class="ok-line"><Check size={15} /> {t('ws.relay.verified')}</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Step 3: fund (gated on verify) -->
			{#if store.relayVerified}
				<div class="relay-step" class:done={store.relayerFunded}>
					<span class="rs-num">{store.relayerFunded ? '✓' : 3}</span>
					<div class="rs-body">
						<strong>{t('ws.relay.step3')}</strong>
						<p class="note">{t('ws.relay.fundHint')}</p>
						<div class="fund">
							<QrCanvas value={store.relay.address} />
							<div class="fund-info">
								<button class="addr-copy" onclick={() => copy(store.relay!.address)}>
									<code>{short(store.relay.address)}</code>
									<span class="copy-hint">{copied === store.relay.address ? t('ws.copied') : t('ws.copy')}</span>
								</button>
								<div class="kv"><span>{t('ws.relay.needed')}</span><strong>{fmt(store.fundNeeded)} {store.network?.symbol}</strong></div>
								<div class="kv"><span>{t('ws.relay.balance')}</span><strong>{fmt(store.relayBal)} {store.network?.symbol}</strong></div>
								<button class="btn btn-ghost with-icon sm" onclick={() => store.refreshRelayerBalance()}><RefreshCw size={13} />{t('ws.btn.refresh')}</button>
								<div class="fund-state" class:ok={store.relayerFunded}>{store.relayerFunded ? t('ws.relay.funded') : t('ws.relay.notFunded')}</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</section>

		{#if store.running}
			<section class="card center">
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

		<div class="actions">
			<button class="btn btn-ghost" onclick={() => store.back()} disabled={store.running}>{t('ws.btn.back')}</button>
			<button class="btn btn-primary lg with-icon" onclick={() => store.proceed()} disabled={store.running || !store.relayerFunded}>
				<Fingerprint size={15} />{stageLabel}
			</button>
		</div>

	<!-- ─────────── DONE ─────────── -->
	{:else if store.phase === 'done'}
		<section class="card">
			<h2 class="card-title">{t('ws.done.title')}</h2>
			<p class="card-sub">{t('ws.done.subtitle')}</p>
			<div class="batches">
				{#each store.sweepRecords as r (r.index)}
					<div class="batch" class:failed={r.status === 'failed'}>
						<span>#{r.index + 1} · {r.count}</span>
						<span class="batch-status">{r.status}</span>
						{#if r.explorerUrl}<a href={r.explorerUrl} target="_blank" rel="noopener">{t('ws.done.viewTx')}</a>{/if}
					</div>
				{/each}
			</div>
			<div class="fund-actions">
				<button class="btn btn-primary" onclick={() => store.sweepAgain()} disabled={store.running}>{t('ws.done.sweepAgain')}</button>
				<button class="btn btn-ghost" onclick={() => store.recoverRelayGas()} disabled={store.recovering}>{store.recovering ? t('ws.btn.checking') : t('ws.btn.recoverGas')}</button>
				<button class="btn btn-ghost" onclick={() => store.reset()}>{t('ws.btn.reset')}</button>
			</div>
		</section>

		<section class="card">
			<h2 class="card-title">{t('ws.revoke.title')}</h2>
			<p class="card-sub">{t('ws.revoke.subtitle')}</p>
			<button class="btn btn-danger" disabled={store.revoking || store.sweptAddresses.length === 0} onclick={() => store.revoke(store.sweptAddresses)}>
				{store.revoking ? t('ws.revoke.revoking') : `${t('ws.revoke.all')} (${store.sweptAddresses.length})`}
			</button>
		</section>
	{/if}

	<!-- History -->
	{#if store.history.length > 0 && (store.phase === 'config' || store.phase === 'done')}
		<section class="card">
			<h2 class="card-title">{t('ws.history.title')}</h2>
			<div class="history">
				{#each store.history as h (h.id)}
					<div class="hist-row">
						<span class="hist-net">{h.networkName}</span>
						<span class="hist-meta">{h.eoaCount} · {fmt(BigInt(h.totalNative))} → {short(h.destination)}</span>
						<span class="badge {h.status === 'completed' ? 'badge-ok' : h.status === 'partial' ? 'badge-muted' : 'badge-bad'}">{h.status}</span>
						<button class="chip-x" onclick={() => store.removeHistory(h.id)} aria-label="delete">×</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if store.logs.length > 0}
		<section class="card logs">
			<button class="logs-head" onclick={() => (showLogs = !showLogs)}><span>{t('ws.logs.title')}</span><span>{showLogs ? '▾' : '▸'}</span></button>
			{#if showLogs}
				<div class="log-list">{#each store.logs.slice().reverse() as l (l.ts + l.msg)}<div class={logClass(l)}>{l.msg}</div>{/each}</div>
			{/if}
		</section>
	{/if}
</main>

<PageFooter />

<AddTokenModal open={showAddToken} onClose={() => (showAddToken = false)} {store} />
<AddNetworkModal
	open={showAddNetwork}
	onClose={() => (showAddNetwork = false)}
	existingChainIds={store.networks.map((n) => n.chainId)}
	onSubmit={submitCustomNetwork}
/>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4) var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.hero {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.title {
		margin: 0;
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--fg-base);
	}
	.subtitle {
		margin: var(--space-3) auto 0;
		max-width: 540px;
		font-size: var(--text-lg);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
	}
	.card.center {
		text-align: center;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.card-title {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.card-sub {
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.security {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		background: var(--accent-subtle);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.security strong {
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.banner {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}
	.banner-error {
		background: var(--error-muted);
		color: var(--error);
	}
	.testnet-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin-bottom: var(--space-3);
		cursor: pointer;
	}
	.net-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-3);
	}
	.net-card-wrap {
		position: relative;
	}
	.net-remove {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-base);
		background: var(--bg-elevated);
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		line-height: 1;
		cursor: pointer;
	}
	.net-remove:hover {
		color: var(--error);
		border-color: var(--error);
	}
	.net-card {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		cursor: pointer;
		text-align: left;
		transition: transform var(--motion-fast) var(--easing), border-color var(--motion-fast) var(--easing);
	}
	.net-card:hover {
		transform: translateY(-2px);
		border-color: var(--border-strong);
	}
	.net-card.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent) inset;
	}
	.net-name {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.net-badges {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	.badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: var(--radius-full);
		background: var(--bg-elevated);
		color: var(--fg-muted);
		border: 1px solid var(--border-subtle);
	}
	.badge-ok {
		background: var(--accent-muted);
		color: var(--accent);
		border-color: transparent;
	}
	.badge-bad {
		background: var(--error-muted);
		color: var(--error);
		border-color: transparent;
	}
	.badge-muted {
		color: var(--fg-subtle);
	}
	.input {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
		box-sizing: border-box;
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.key-stats {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}
	.chip {
		font-size: var(--text-xs);
		padding: 3px 8px;
		border-radius: var(--radius-full);
	}
	.chip-ok {
		background: var(--accent-muted);
		color: var(--accent);
	}
	.chip-bad {
		background: var(--error-muted);
		color: var(--error);
	}
	.chip-muted {
		background: var(--bg-elevated);
		color: var(--fg-subtle);
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
	}
	.chip-x {
		border: none;
		background: none;
		color: var(--fg-subtle);
		cursor: pointer;
		font-size: var(--text-md);
		line-height: 1;
		padding: 0;
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
	}
	.token-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
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
	.btn.lg {
		padding: var(--space-3) var(--space-8);
	}
	.btn.sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}
	.btn.with-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
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
		transform: translateY(-1px);
	}
	.btn-ghost {
		background: var(--bg-sunken);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}
	.btn-ghost:hover {
		border-color: var(--border-strong);
	}
	.btn-danger {
		background: var(--error-muted);
		color: var(--error);
	}
	.summary {
		display: flex;
		gap: var(--space-5);
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
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		display: grid;
		place-items: center;
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--fg-muted);
	}
	.relay-step.done .rs-num {
		background: var(--accent-muted);
		color: var(--accent);
		border-color: var(--accent);
	}
	.rs-body {
		flex: 1;
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
	}
	.error {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		color: var(--error);
	}
	.ok-line {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		color: var(--accent);
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
	}
	.copy-hint {
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
		background: var(--accent-muted);
		color: var(--accent);
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
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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
		background: var(--error-muted);
	}
	.batch-status {
		margin-left: auto;
		color: var(--fg-muted);
		font-size: var(--text-xs);
	}
	.batch a {
		color: var(--accent);
		text-decoration: none;
	}
	.fund-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.history {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hist-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}
	.hist-net {
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.hist-meta {
		color: var(--fg-muted);
		font-size: var(--text-xs);
		margin-right: auto;
	}
	.logs-head {
		display: flex;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: 0;
	}
	.log-list {
		margin-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 220px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.log {
		color: var(--fg-muted);
	}
	.log-ok {
		color: var(--accent);
	}
	.log-warn {
		color: var(--warning);
	}
	.log-error {
		color: var(--error);
	}
	@media (max-width: 640px) {
		.page {
			padding: var(--space-4) var(--space-3) var(--space-12);
		}
		.title {
			font-size: var(--text-3xl);
		}
		.actions {
			flex-direction: column-reverse;
		}
		.actions .btn {
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.net-card:hover,
		.btn-primary:not(:disabled):hover {
			transform: none;
		}
		.spinner {
			animation: none;
		}
	}
</style>
