<script lang="ts">
	import { onMount } from 'svelte';
	import { formatUnits, type Address } from 'viem';
	import { t, locale, formatNumber } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { authStore } from '$lib/auth/auth-store.svelte';
	import { WalletSweepStore, type LogEntry } from '$lib/pda-apps/wallet-sweep/store.svelte';
	import type { Phase } from '$lib/pda-apps/wallet-sweep/types';
	import AddTokenModal from './components/AddTokenModal.svelte';
	import { Fingerprint } from '@lucide/svelte';

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
		{ id: 'preview', label: () => t('ws.step.preview') },
		{ id: 'fund', label: () => t('ws.step.fund') },
		{ id: 'upgrade', label: () => t('ws.step.upgrade') },
		{ id: 'sweep', label: () => t('ws.step.sweep') },
		{ id: 'done', label: () => t('ws.step.done') },
	];
	const stepIndex = $derived(steps.findIndex((s) => s.id === store.phase));

	let keysText = $state('');
	let parseTimer: ReturnType<typeof setTimeout>;
	function onKeysInput() {
		clearTimeout(parseTimer);
		parseTimer = setTimeout(() => void store.setKeys(keysText), 250);
	}

	let showAddToken = $state(false);
	let showLogs = $state(false);

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
	function useSafeDest() {
		const u = store.user;
		if (u) store.destination = u.safeAddress;
	}
	function logClass(l: LogEntry): string {
		return `log log-${l.level}`;
	}
</script>

<SEO {...seoProps} />

<main class="page">
	<header class="hero">
		<h1 class="title">{t('ws.title')}</h1>
		<p class="subtitle">{t('ws.subtitle')}</p>
	</header>

	{#if !store.user}
		<section class="card connect">
			<p>{t('ws.connect.required')}</p>
			<button class="btn btn-primary" onclick={() => authStore.login()} disabled={authStore.loading}>
				{t('ws.connect.cta')}
			</button>
		</section>
	{:else}
		<!-- Stepper -->
		<nav class="stepper" aria-label="progress">
			{#each steps as s, i (s.id)}
				<div class="step" class:active={i === stepIndex} class:done={i < stepIndex}>
					<span class="dot">{i < stepIndex ? '✓' : i + 1}</span>
					<span class="step-label">{s.label()}</span>
				</div>
			{/each}
		</nav>

		<!-- Security note -->
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
				<h2 class="card-title">{t('ws.network.title')}</h2>
				<p class="card-sub">{t('ws.network.subtitle')}</p>
				<label class="testnet-toggle">
					<input type="checkbox" bind:checked={store.includeTestnets} />
					<span>{t('ws.network.testnets')}</span>
				</label>
				<div class="net-grid">
					{#each store.networks as net (net.slug)}
						{@const r = store.readiness[net.slug]}
						<button
							class="net-card"
							class:selected={store.networkSlug === net.slug}
							class:disabled={r && !r.ready}
							onclick={() => store.selectNetwork(net.slug)}
						>
							<span class="net-name">{net.name}</span>
							<span class="net-badges">
								<span class="badge">{t('ws.network.badge7702')}</span>
								{#if !r}
									<span class="badge badge-muted">{t('ws.network.checking')}</span>
								{:else if r.ready}
									<span class="badge badge-ok">{t('ws.network.badgePasskey')}</span>
								{:else}
									<span class="badge badge-bad" title={r.error}>{t('ws.network.unavailable')}</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="card">
				<h2 class="card-title">{t('ws.keys.title')}</h2>
				<p class="card-sub">{t('ws.keys.subtitle')}</p>
				<textarea
					class="keys-input"
					placeholder={t('ws.keys.placeholder')}
					bind:value={keysText}
					oninput={onKeysInput}
					rows="6"
					spellcheck="false"
					autocomplete="off"
				></textarea>
				{#if store.parseStats.total > 0}
					<div class="key-stats">
						<span class="chip chip-ok">{t('ws.keys.summary', { valid: store.parseStats.valid })}</span>
						{#if store.parseStats.invalid > 0}
							<span class="chip chip-bad">{t('ws.keys.invalid', { count: store.parseStats.invalid })}</span>
						{/if}
						{#if store.parseStats.duplicates > 0}
							<span class="chip chip-muted">{t('ws.keys.duplicates', { count: store.parseStats.duplicates })}</span>
						{/if}
					</div>
				{/if}
			</section>

			<section class="card">
				<h2 class="card-title">{t('ws.tokens.title')}</h2>
				<p class="card-sub">{t('ws.tokens.subtitle')}</p>
				<div class="token-row">
					<span class="token-chip token-native">{store.network?.symbol ?? 'Native'} · {t('ws.tokens.native')}</span>
					{#each store.tokens as tk (tk.address)}
						<span class="token-chip">
							{tk.symbol}
							<button class="chip-x" onclick={() => store.removeToken(tk.address)} aria-label="remove">×</button>
						</span>
					{/each}
					<button class="token-add" onclick={() => (showAddToken = true)} disabled={!store.network}>
						+ {t('ws.tokens.add')}
					</button>
				</div>
			</section>

			<section class="card">
				<h2 class="card-title">{t('ws.dest.title')}</h2>
				<p class="card-sub">{t('ws.dest.subtitle')}</p>
				<div class="dest-row">
					<input
						class="input mono"
						placeholder={t('ws.dest.placeholder')}
						bind:value={store.destination}
						spellcheck="false"
					/>
					<button class="btn btn-ghost" onclick={useSafeDest}>{t('ws.dest.useSafe')}</button>
				</div>
			</section>

			<div class="actions">
				<button class="btn btn-primary lg" disabled={!canContinue || store.balancesLoading} onclick={() => store.preflight()}>
					{store.balancesLoading ? t('ws.btn.checking') : t('ws.btn.preflight')}
				</button>
			</div>

		<!-- ─────────── PREVIEW ─────────── -->
		{:else if store.phase === 'preview' && store.plan}
			<section class="card">
				<h2 class="card-title">{t('ws.preview.title')}</h2>
				<div class="summary">
					<div class="stat"><span class="stat-n">{store.plan.toUpgrade.length}</span><span class="stat-l">{t('ws.preview.toUpgrade')}</span></div>
					<div class="stat"><span class="stat-n">{store.plan.alreadyOurs.length}</span><span class="stat-l">{t('ws.preview.alreadyUpgraded')}</span></div>
					<div class="stat"><span class="stat-n">{fmt(store.totalNative)}</span><span class="stat-l">{t('ws.preview.totalNative')} {store.network?.symbol}</span></div>
					{#if store.fee}
						<div class="stat">
							<span class="stat-n">{store.fee.amount === 0n ? t('ws.fee.free') : `${fmt(store.fee.amount)} ${store.network?.symbol}`}</span>
							<span class="stat-l">{t('ws.fee.label')}</span>
						</div>
					{/if}
					{#if store.plan.contracts.length}
						<div class="stat"><span class="stat-n">{store.plan.contracts.length}</span><span class="stat-l">{t('ws.preview.contractsSkipped')}</span></div>
					{/if}
				</div>
				<div class="table-wrap">
					<table class="preview-table">
						<thead>
							<tr><th>{t('ws.preview.address')}</th><th>{store.network?.symbol}</th>{#each store.tokens as tk (tk.address)}<th>{tk.symbol}</th>{/each}</tr>
						</thead>
						<tbody>
							{#each store.balances as b (b.address)}
								<tr>
									<td class="mono">{short(b.address)}</td>
									<td>{fmt(b.native)}</td>
									{#each store.tokens as tk (tk.address)}
										<td>{fmt(b.tokens[(tk.address ?? '').toLowerCase()] ?? 0n, tk.decimals)}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
			<div class="actions">
				<button class="btn btn-ghost" onclick={() => store.back()}>{t('ws.btn.back')}</button>
				<button class="btn btn-primary lg" onclick={() => store.goToFund()}>{t('ws.step.fund')}</button>
			</div>

		<!-- ─────────── FUND ─────────── -->
		{:else if store.phase === 'fund' && store.relayer}
			<section class="card">
				<h2 class="card-title">{t('ws.fund.title')}</h2>
				<p class="card-sub">{t('ws.fund.subtitle')}</p>
				<div class="kv"><span>{t('ws.fund.relayerAddress')}</span><code class="mono">{short(store.relayer.address)}</code></div>
				<div class="kv"><span>{t('ws.fund.needed')}</span><strong>{fmt(store.fundNeeded)} {store.network?.symbol}</strong></div>
				<div class="kv"><span>{t('ws.fund.balance')}</span><strong>{fmt(store.relayerBal)} {store.network?.symbol}</strong></div>
				{#if store.needSweeperDeploy}
					<p class="note">{t('ws.fund.deployNote')}</p>
				{/if}
				<div class="fund-state" class:ok={store.relayerFunded}>
					{store.relayerFunded ? t('ws.fund.funded') : t('ws.fund.notFunded')}
				</div>
				<div class="fund-actions">
					<button class="btn btn-primary" onclick={() => store.fundFromSafe()} disabled={store.funding}>
						{store.funding ? t('ws.btn.funding') : t('ws.btn.fundFromSafe')}
					</button>
					<button class="btn btn-ghost" onclick={() => store.refreshRelayerBalance()}>{t('ws.btn.refresh')}</button>
					<button class="btn btn-ghost" onclick={() => store.downloadRelayer()}>{t('ws.btn.download')}</button>
				</div>
				<p class="note">{t('ws.fund.manualHint')}</p>
			</section>
			<div class="actions">
				<button class="btn btn-ghost" onclick={() => store.back()}>{t('ws.btn.back')}</button>
				<button class="btn btn-primary lg" disabled={!store.relayerFunded || store.upgrading} onclick={() => store.runUpgradePhase()}>
					{t('ws.btn.startUpgrade')}
				</button>
			</div>

		<!-- ─────────── UPGRADE ─────────── -->
		{:else if store.phase === 'upgrade'}
			<section class="card center">
				<h2 class="card-title">{t('ws.upgrade.title')}</h2>
				<p class="card-sub">{t('ws.upgrade.subtitle')}</p>
				{#if store.upgradeProgress}
					{@const p = store.upgradeProgress}
					<div class="progress">
						<div class="progress-bar" style="width:{store.plan ? Math.round((p.done / Math.max(1, store.plan.toUpgrade.length)) * 100) : 0}%"></div>
					</div>
					<p class="progress-text">{t('ws.upgrade.progress', { done: p.done, total: store.plan?.toUpgrade.length ?? 0 })}</p>
				{:else}
					<div class="spinner"></div>
				{/if}
			</section>

		<!-- ─────────── SWEEP ─────────── -->
		{:else if store.phase === 'sweep'}
			<section class="card center">
				<h2 class="card-title">{t('ws.sweep.title')}</h2>
				<p class="card-sub">{t('ws.sweep.subtitle')}</p>
				{#if store.fee}
					<div class="fee-pill" class:free={store.fee.amount === 0n}>
						<span>{t('ws.fee.label')}</span>
						<strong>{store.fee.amount === 0n ? t('ws.fee.free') : `${fmt(store.fee.amount)} ${store.network?.symbol}`}</strong>
					</div>
					{#if store.fee.amount > 0n}<p class="note">{t('ws.fee.note')}</p>{/if}
				{/if}
				<p class="fingerprint"><Fingerprint size={15} />{t('ws.sweep.fingerprint')}</p>
				<button class="btn btn-primary lg" onclick={() => store.runSweepPhase()} disabled={store.sweeping}>
					{store.sweeping ? t('ws.btn.checking') : t('ws.btn.startSweep')}
				</button>
			</section>

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
							{#if r.explorerUrl}
								<a href={r.explorerUrl} target="_blank" rel="noopener">{t('ws.done.viewTx')}</a>
							{/if}
						</div>
					{/each}
				</div>
				<div class="fund-actions">
					<button class="btn btn-primary" onclick={() => store.runSweepPhase()} disabled={store.sweeping}>{t('ws.done.sweepAgain')}</button>
					<button class="btn btn-ghost" onclick={() => store.reset()}>{t('ws.btn.reset')}</button>
				</div>
			</section>

			<!-- Revoke -->
			<section class="card">
				<h2 class="card-title">{t('ws.revoke.title')}</h2>
				<p class="card-sub">{t('ws.revoke.subtitle')}</p>
				<button
					class="btn btn-danger"
					disabled={store.revoking || store.upgradedAddresses.length === 0}
					onclick={() => store.revoke(store.upgradedAddresses)}
				>
					{store.revoking ? t('ws.revoke.revoking') : `${t('ws.revoke.all')} (${store.upgradedAddresses.length})`}
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

		<!-- Activity log -->
		{#if store.logs.length > 0}
			<section class="card logs">
				<button class="logs-head" onclick={() => (showLogs = !showLogs)}>
					<span>{t('ws.logs.title')}</span><span>{showLogs ? '▾' : '▸'}</span>
				</button>
				{#if showLogs}
					<div class="log-list">
						{#each store.logs.slice().reverse() as l (l.ts + l.msg)}
							<div class={logClass(l)}>{l.msg}</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<AddTokenModal open={showAddToken} onClose={() => (showAddToken = false)} {store} />

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

	.connect {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: center;
	}

	/* Stepper */
	.stepper {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		overflow-x: auto;
		padding-bottom: var(--space-1);
	}
	.step {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
	}
	.step .dot {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		display: grid;
		place-items: center;
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
	.step.active {
		color: var(--fg-base);
	}
	.step.active .dot {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
	}
	.step.done .dot {
		background: var(--accent-muted);
		color: var(--accent);
		border-color: var(--accent);
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

	/* Network grid */
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
	.net-card {
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
	.net-card.disabled {
		opacity: 0.55;
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

	/* Keys */
	.keys-input,
	.input,
	.dest-row .input {
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
	.keys-input {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		resize: vertical;
	}
	.keys-input:focus,
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

	/* Tokens */
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

	.dest-row {
		display: flex;
		gap: var(--space-2);
	}

	/* Buttons */
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

	/* Preview */
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
	.table-wrap {
		overflow-x: auto;
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

	/* Fund */
	.kv {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.kv strong,
	.kv code {
		color: var(--fg-base);
	}
	.note {
		margin: var(--space-3) 0 0;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.fund-state {
		margin-top: var(--space-4);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		background: var(--warning-muted);
		color: var(--warning);
		text-align: center;
	}
	.fund-state.ok {
		background: var(--accent-muted);
		color: var(--accent);
	}
	.fund-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: var(--space-4);
	}

	/* Progress */
	.progress {
		height: 8px;
		background: var(--bg-sunken);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin: var(--space-4) 0 var(--space-2);
	}
	.progress-bar {
		height: 100%;
		background: var(--accent);
		transition: width var(--motion-normal) var(--easing);
	}
	.progress-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.spinner {
		width: 28px;
		height: 28px;
		margin: var(--space-4) auto 0;
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
	.fingerprint {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: var(--space-3) 0 var(--space-5);
	}
	.fee-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-3) auto 0;
		padding: var(--space-2) var(--space-4);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.fee-pill strong {
		color: var(--fg-base);
	}
	.fee-pill.free strong {
		color: var(--accent);
	}

	/* Batches / history */
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

	/* Logs */
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
		.step-label {
			display: none;
		}
		.dest-row {
			flex-direction: column;
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
