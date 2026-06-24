<script lang="ts">
	import { onMount } from 'svelte';
	import type { Address } from 'viem';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import WalletGate from '$lib/auth/WalletGate.svelte';
	import NetworkGrid from '$lib/widgets/NetworkGrid.svelte';
	import { walletStore } from '$lib/wallet';
	import type { SendStatus } from '$lib/wallet';
	import { SvelteSet } from 'svelte/reactivity';
	import { revoke as s } from '$lib/pda-apps/revoke/store.svelte.js';
	import type { TokenStandard } from '$lib/pda-apps/revoke/types.js';
	import ApprovalTable from '$lib/pda-apps/revoke/components/ApprovalTable.svelte';
	import { searchChains } from '$lib/contract-caller/networks.js';
	import type { ChainSearchResult } from '$lib/contract-caller/types.js';
	import { getChainLogoUrl, DEFAULT_CHAIN_LOGO } from '$lib/chains';
	import {
		ShieldOff,
		ShieldCheck,
		RefreshCw,
		Plus,
		LoaderCircle,
		ExternalLink,
		TriangleAlert,
		Info,
		Search,
		X,
	} from '@lucide/svelte';

	const seoProps = $derived(
		getBaseSEO({
			title: t('revoke.meta.title'),
			description: t('revoke.meta.description'),
			currentLocale: locale.value,
		}),
	);

	// Auto-scan whenever the connected owner or selected chain changes.
	$effect(() => {
		const owner = walletStore.activeWallet?.address;
		void s.networkSlug; // track chain switches
		if (owner) s.autoScan(owner as Address);
	});

	onMount(() => {
		void s.hydrate();
	});

	const phaseLabel: Record<SendStatus, string> = {
		checking: t('revoke.phase.checking'),
		building: t('revoke.phase.building'),
		estimating: t('revoke.phase.estimating'),
		signing: t('revoke.phase.signing'),
		submitting: t('revoke.phase.submitting'),
		waiting: t('revoke.phase.waiting'),
		confirmed: t('revoke.phase.confirmed'),
		failed: t('revoke.phase.failed'),
	};

	// Placeholder rows for the loading skeleton (avoid an unused `_` in #each).
	const skeletonRows = [...Array(5).keys()];

	let safetyOpen = $state(false);

	// ── Add custom token ──
	let showAddToken = $state(false);
	let atStandard = $state<TokenStandard>('erc20');
	let atAddress = $state('');
	let atSymbol = $state('');
	let atName = $state('');
	let atDecimals = $state<number | null>(null);
	let atLoading = $state(false);
	let atError = $state<string | null>(null);
	let atFetched = $state(false);

	function resetAddToken() {
		atStandard = 'erc20';
		atAddress = '';
		atSymbol = '';
		atName = '';
		atDecimals = null;
		atError = null;
		atFetched = false;
		atLoading = false;
	}
	async function fetchTokenMeta() {
		atError = null;
		atFetched = false;
		if (!s.isValidAddress(atAddress)) {
			atError = t('revoke.addToken.invalidAddress');
			return;
		}
		atLoading = true;
		try {
			const m = await s.fetchTokenMeta(atStandard, atAddress);
			atSymbol = m.symbol;
			atName = m.name ?? '';
			atDecimals = m.decimals ?? null;
			atFetched = true;
		} catch {
			atError = t('revoke.addToken.fetchFailed');
		} finally {
			atLoading = false;
		}
	}
	async function submitAddToken() {
		atError = null;
		if (!s.isValidAddress(atAddress)) {
			atError = t('revoke.addToken.invalidAddress');
			return;
		}
		if (!atSymbol.trim()) {
			atError = t('revoke.addToken.needMeta');
			return;
		}
		await s.addCustomToken(atStandard, atAddress, {
			symbol: atSymbol.trim(),
			name: atName.trim() || undefined,
			decimals: atStandard === 'erc20' ? (atDecimals ?? 18) : undefined,
		});
		showAddToken = false;
		resetAddToken();
	}

	// ── Add custom spender ──
	let showAddSpender = $state(false);
	let asAddress = $state('');
	let asLabel = $state('');
	let asError = $state<string | null>(null);
	async function submitAddSpender() {
		asError = null;
		if (!s.isValidAddress(asAddress)) {
			asError = t('revoke.addSpender.invalidAddress');
			return;
		}
		await s.addCustomSpender(asAddress, asLabel);
		showAddSpender = false;
		asAddress = '';
		asLabel = '';
	}

	// ── Add network (search ethereum-data → pick → done) ──
	let showAddNetwork = $state(false);
	let anQuery = $state('');
	let anResults = $state<ChainSearchResult[]>([]);
	let anSearching = $state(false);
	let anRpc = $state('');
	let anError = $state<string | null>(null);
	let anAdding = $state<number | null>(null);
	const anLogoFailed = new SvelteSet<number>();

	// Search the ethereum-data chain index as the user types (index is cached).
	$effect(() => {
		const q = anQuery.trim();
		if (!showAddNetwork || !q) {
			anResults = [];
			return;
		}
		anSearching = true;
		let cancelled = false;
		searchChains(q)
			.then((r) => {
				if (!cancelled) anResults = r;
			})
			.finally(() => {
				if (!cancelled) anSearching = false;
			});
		return () => {
			cancelled = true;
		};
	});

	function resetAddNetwork() {
		anQuery = '';
		anResults = [];
		anRpc = '';
		anError = null;
		anSearching = false;
		anAdding = null;
	}
	async function pickChain(chainId: number) {
		anError = null;
		anAdding = chainId;
		const res = await s.addNetworkByChainId(chainId, anRpc);
		anAdding = null;
		if (res.ok) {
			showAddNetwork = false;
			resetAddNetwork();
		} else {
			anError = res.error === 'need-rpc' ? t('revoke.addNetwork.needRpc') : t('revoke.addNetwork.addFailed');
		}
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="hero" use:fadeInUp={{ delay: 0 }}>
		<h1 class="title">{t('revoke.title')}</h1>
		<p class="subtitle">{t('revoke.subtitle')}</p>
	</header>

	<!-- What this does / safety -->
	<section class="card safety" use:fadeInUp={{ delay: 40 }}>
		<div class="safety-row">
			<span class="safety-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
			<div class="safety-head">
				<h2>{t('revoke.safety.heading')}</h2>
				<div class="safety-chips">
					<span class="chip">{t('revoke.safety.chipPublicRpc')}</span>
					<span class="chip">{t('revoke.safety.chipNoCustody')}</span>
					<span class="chip">{t('revoke.safety.chipBatch')}</span>
				</div>
			</div>
			<button class="link-btn" onclick={() => (safetyOpen = !safetyOpen)}>
				{safetyOpen ? t('revoke.safety.hide') : t('revoke.safety.learnMore')}
			</button>
		</div>
		{#if safetyOpen}
			<p class="safety-detail">{t('revoke.safety.detail')}</p>
		{/if}
	</section>

	<WalletGate>
		<!-- Network picker -->
		<section class="card panel" use:fadeInUp={{ delay: 80 }}>
			<div class="field-label">{t('revoke.network.label')}</div>
			<NetworkGrid
				networks={s.networks}
				selectedSlug={s.networkSlug}
				onSelect={(slug) => s.setNetwork(slug)}
				onAddCustom={() => (showAddNetwork = true)}
				addLabel={t('revoke.network.addCustom')}
				addHint={t('revoke.network.addCustomHint')}
				customSuffix={t('revoke.network.customSuffix')}
				onRemoveCustom={(slug) => s.removeCustomNetwork(slug)}
			/>

			<!-- Custom token / spender chips -->
			{#if s.chainTokens.length > 0 || s.chainSpenders.length > 0}
				<div class="custom-chips">
					{#each s.chainTokens as tok (tok.address)}
						<span class="custom-chip">
							{tok.symbol}
							<button onclick={() => s.removeCustomToken(tok.address)} aria-label={t('revoke.custom.remove')}><X size={11} /></button>
						</span>
					{/each}
					{#each s.chainSpenders as sp (sp.address)}
						<span class="custom-chip spender">
							{sp.label}
							<button onclick={() => s.removeCustomSpender(sp.address)} aria-label={t('revoke.custom.remove')}><X size={11} /></button>
						</span>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Results panel -->
		<section class="card panel" use:fadeInUp={{ delay: 120 }}>
			<div class="toolbar">
				<div class="toolbar-left">
					{#if s.rows.length > 0}
						<div class="filter">
							<button aria-pressed={s.filter === 'all'} class:selected={s.filter === 'all'} onclick={() => (s.filter = 'all')}>
								{t('revoke.filter.all', { count: s.rows.length })}
							</button>
							<button aria-pressed={s.filter === 'unlimited'} class:selected={s.filter === 'unlimited'} onclick={() => (s.filter = 'unlimited')}>
								{t('revoke.filter.unlimited', { count: s.unlimitedCount })}
							</button>
						</div>
					{/if}
				</div>
				<div class="toolbar-right">
					<button class="btn ghost sm" onclick={() => (showAddToken = true)} disabled={s.revoking}><Plus size={14} /> {t('revoke.toolbar.addToken')}</button>
					<button class="btn ghost sm" onclick={() => (showAddSpender = true)} disabled={s.revoking}><Plus size={14} /> {t('revoke.toolbar.addSpender')}</button>
					<button class="btn ghost sm" onclick={() => s.scan()} disabled={s.scanning || s.revoking}>
						{#if s.scanning}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if}
						{t('revoke.toolbar.rescan')}
					</button>
				</div>
			</div>

			<!-- Coverage disclosure: this is a curated fast scan, not a full-history crawl. -->
			<div class="info-callout">
				<span class="info-ic" aria-hidden="true"><Info size={15} /></span>
				<p>{t('revoke.scan.coverage')}</p>
			</div>

			{#if !s.sendSupported}
				<p class="note"><TriangleAlert size={14} /> {t('revoke.note.customBiubiu')}</p>
			{/if}

			<!-- Revoke status / result -->
			{#if s.revoking}
				<div class="status info">
					<LoaderCircle size={16} class="spin" />
					<span>{s.revokePhase ? phaseLabel[s.revokePhase] : t('revoke.phase.checking')}</span>
				</div>
			{:else if s.lastResult?.success}
				<div class="status ok" role="status">
					<ShieldOff size={16} />
					<span>{t('revoke.result.success')}</span>
					{#if s.lastResult.explorerUrl}
						<a href={s.lastResult.explorerUrl} target="_blank" rel="noopener">{t('revoke.result.viewTx')} <ExternalLink size={12} /></a>
					{/if}
					<button class="status-x" onclick={() => s.dismissStatus()} aria-label={t('revoke.alert.dismiss')}><X size={14} /></button>
				</div>
			{:else if s.revokeError}
				<div class="status err" role="alert">
					<TriangleAlert size={16} />
					<span>{t('revoke.result.failed', { error: s.revokeError })}</span>
					<button class="status-x" onclick={() => s.dismissStatus()} aria-label={t('revoke.alert.dismiss')}><X size={14} /></button>
				</div>
			{/if}

			<!-- Body states -->
			{#if s.scanning && s.rows.length === 0}
				<p class="scanning-label"><LoaderCircle size={14} class="spin" /> {t('revoke.scan.scanning', { network: s.network.name })}</p>
				<div class="skel-table" aria-hidden="true">
					{#each skeletonRows as i (i)}
						<div class="skel-row">
							<div class="skel-stack">
								<span class="skeleton skel-line lg"></span>
								<span class="skeleton skel-line sm"></span>
							</div>
							<span class="skeleton skel-line md"></span>
							<span class="skeleton skel-btn"></span>
						</div>
					{/each}
				</div>
			{:else if s.scanError}
				<div class="placeholder">
					<TriangleAlert size={28} />
					<p>{t('revoke.scan.error')}</p>
					<button class="btn ghost sm" onclick={() => s.scan()}>{t('revoke.toolbar.rescan')}</button>
				</div>
			{:else if s.scanned && s.rows.length === 0}
				<div class="placeholder">
					<ShieldCheck size={28} />
					<p>{t('revoke.scan.empty', { network: s.network.name })}</p>
					<p class="hint">{t('revoke.scan.emptyHint')}</p>
				</div>
			{:else if s.visibleRows.length > 0}
				<!-- Batch action bar -->
				{#if s.selectedRows.length > 0}
					<div class="batch-bar">
						<span class="batch-count">{t('revoke.batch.selected', { count: s.selectedRows.length })}</span>
						<button class="btn ghost sm" onclick={() => s.clearSelection()} disabled={s.revoking}>{t('revoke.batch.clear')}</button>
						<button class="btn danger" onclick={() => s.revokeSelected()} disabled={s.revoking || !s.sendSupported}>
							{t('revoke.batch.revokeSelected', { count: s.selectedRows.length })}
						</button>
					</div>
				{/if}

				<ApprovalTable />
			{:else if s.rows.length > 0 && s.filter === 'unlimited'}
				<div class="placeholder">
					<ShieldCheck size={28} />
					<p>{t('revoke.scan.noUnlimited')}</p>
					<button class="btn ghost sm" onclick={() => (s.filter = 'all')}>{t('revoke.filter.showAll')}</button>
				</div>
			{/if}
		</section>
	</WalletGate>
</main>

<PageFooter />

<!-- Add custom token -->
<ResponsiveModal open={showAddToken} onClose={() => { showAddToken = false; resetAddToken(); }} title={t('revoke.addToken.title')}>
	<div class="modal-body">
		<div class="field-label">{t('revoke.addToken.standard')}</div>
		<div class="seg">
			<button aria-pressed={atStandard === 'erc20'} class:selected={atStandard === 'erc20'} onclick={() => (atStandard = 'erc20')}>ERC-20</button>
			<button aria-pressed={atStandard === 'erc721'} class:selected={atStandard === 'erc721'} onclick={() => (atStandard = 'erc721')}>ERC-721</button>
			<button aria-pressed={atStandard === 'erc1155'} class:selected={atStandard === 'erc1155'} onclick={() => (atStandard = 'erc1155')}>ERC-1155</button>
		</div>

		<label class="field-label" for="at-addr">{t('revoke.addToken.address')}</label>
		<div class="erc20-row">
			<input id="at-addr" class="input" bind:value={atAddress} placeholder="0x…" />
			<button class="btn" onclick={fetchTokenMeta} disabled={atLoading}>
				{atLoading ? t('revoke.addToken.loading') : t('revoke.addToken.fetch')}
			</button>
		</div>

		{#if atFetched}
			<p class="ok">{t('revoke.addToken.fetched', { symbol: atSymbol, decimals: atDecimals ?? 0 })}</p>
		{/if}
		{#if atError}<p class="err">{atError}</p>{/if}

		<div class="modal-actions">
			<button class="btn primary" onclick={submitAddToken}>{t('revoke.addToken.add')}</button>
		</div>
		<p class="muted">{t('revoke.addToken.footnote')}</p>
	</div>
</ResponsiveModal>

<!-- Add custom spender -->
<ResponsiveModal open={showAddSpender} onClose={() => (showAddSpender = false)} title={t('revoke.addSpender.title')}>
	<div class="modal-body">
		<label class="field-label" for="as-addr">{t('revoke.addSpender.address')}</label>
		<input id="as-addr" class="input" bind:value={asAddress} placeholder="0x…" />
		<label class="field-label" for="as-label">{t('revoke.addSpender.labelField')}</label>
		<input id="as-label" class="input" bind:value={asLabel} placeholder={t('revoke.addSpender.labelPlaceholder')} />
		{#if asError}<p class="err">{asError}</p>{/if}
		<div class="modal-actions">
			<button class="btn primary" onclick={submitAddSpender}>{t('revoke.addSpender.add')}</button>
		</div>
		<p class="muted">{t('revoke.addSpender.footnote')}</p>
	</div>
</ResponsiveModal>

<!-- Add network: search any EVM chain via ethereum-data, pick to add -->
<ResponsiveModal open={showAddNetwork} onClose={() => { showAddNetwork = false; resetAddNetwork(); }} title={t('revoke.addNetwork.title')}>
	<div class="modal-body">
		<p class="muted top-hint">{t('revoke.addNetwork.searchHint')}</p>
		<div class="search-wrap">
			<span class="search-ic" aria-hidden="true"><Search size={16} /></span>
			<input
				class="input search-input"
				bind:value={anQuery}
				placeholder={t('revoke.addNetwork.searchPlaceholder')}
				autocomplete="off"
				spellcheck="false"
				aria-label={t('revoke.addNetwork.searchPlaceholder')}
			/>
		</div>

		{#if anQuery.trim()}
			<div class="chain-results" role="listbox" aria-label={t('revoke.addNetwork.searchPlaceholder')}>
				{#if anSearching && anResults.length === 0}
					<p class="results-msg">{t('revoke.addNetwork.searching')}</p>
				{:else if anResults.length === 0}
					<p class="results-msg">{t('revoke.addNetwork.noResults')}</p>
				{:else}
					{#each anResults as c (c.chainId)}
						<button
							class="chain-row"
							role="option"
							aria-selected="false"
							onclick={() => pickChain(c.chainId)}
							disabled={anAdding !== null}
						>
							<img
								class="chain-row-logo"
								src={anLogoFailed.has(c.chainId) ? DEFAULT_CHAIN_LOGO : getChainLogoUrl(c.chainId)}
								alt=""
								loading="lazy"
								onerror={() => anLogoFailed.add(c.chainId)}
							/>
							<span class="chain-row-info">
								<span class="chain-row-name">{c.name}</span>
								<span class="chain-row-meta">{c.shortName} · {c.nativeCurrencySymbol}</span>
							</span>
							{#if anAdding === c.chainId}
								<LoaderCircle size={15} class="spin" />
							{:else}
								<span class="chain-row-id">#{c.chainId}</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		{/if}

		<label class="field-label rpc-label" for="an-rpc">{t('revoke.addNetwork.rpcOptional')}</label>
		<input id="an-rpc" class="input" bind:value={anRpc} placeholder="https://…" />

		{#if anError}<p class="err">{anError}</p>{/if}
		<p class="muted">{t('revoke.addNetwork.footnote')}</p>
	</div>
</ResponsiveModal>

<style>
	.page {
		max-width: 920px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.hero {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.title {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0;
	}
	.subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-3) auto 0;
		max-width: 560px;
	}

	/* Token-driven card (theme-correct in both light & dark — no hardcoded rgba). */
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5) var(--space-6);
	}

	/* Safety */
	.safety-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.safety-icon {
		display: inline-flex;
		color: var(--accent);
	}
	.safety-head {
		flex: 1;
		min-width: 0;
	}
	.safety-head h2 {
		font-size: var(--text-md);
		margin: 0 0 var(--space-2);
		color: var(--fg-base);
	}
	.safety-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}
	.safety-detail {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		white-space: nowrap;
	}

	.field-label {
		display: block;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-muted);
		margin: 0 0 var(--space-2);
	}

	.custom-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.custom-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		padding: 2px var(--space-1) 2px var(--space-2);
		border-radius: var(--radius-full);
	}
	.custom-chip.spender {
		color: var(--accent);
	}
	.custom-chip button {
		display: inline-grid;
		place-items: center;
		border: none;
		background: transparent;
		color: var(--fg-faint);
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-full);
	}
	.custom-chip button:hover {
		color: var(--error);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
	}
	.toolbar-right {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.filter {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
	}
	.filter button {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.filter button.selected {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}

	.note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--warning);
		background: var(--warning-muted);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		padding: var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
	}
	.status > span {
		flex: 1;
		min-width: 0;
	}
	.status a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		font-weight: 600;
		white-space: nowrap;
	}
	.status-x {
		display: inline-grid;
		place-items: center;
		border: none;
		background: transparent;
		color: currentColor;
		opacity: 0.65;
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}
	.status-x:hover {
		opacity: 1;
	}
	.status-x:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 1px;
		opacity: 1;
	}
	.status.info {
		background: var(--bg-sunken);
		color: var(--fg-muted);
	}
	.status.ok {
		background: var(--success-subtle);
		border-color: var(--success-muted);
		color: var(--success);
	}
	.status.err {
		background: var(--error-subtle);
		border-color: var(--error-muted);
		color: var(--error);
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		padding: var(--space-12) var(--space-4);
		color: var(--fg-subtle);
	}
	.placeholder p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.placeholder .hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		max-width: 360px;
	}

	/* Loading skeleton (shimmer, theme-correct) — replaces a bare spinner. */
	.scanning-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.skel-table {
		display: flex;
		flex-direction: column;
	}
	.skel-row {
		display: grid;
		grid-template-columns: 1fr 80px 84px;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-1);
		border-bottom: 1px solid var(--border-subtle);
	}
	.skel-row:last-child {
		border-bottom: none;
	}
	.skel-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.skeleton {
		background: var(--bg-sunken);
		border-radius: var(--radius-sm);
		position: relative;
		overflow: hidden;
	}
	.skeleton::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--fg-faint) 18%, transparent),
			transparent
		);
		animation: shimmer 1.4s ease-in-out infinite;
	}
	.skel-line {
		height: 12px;
	}
	.skel-line.lg {
		width: 45%;
		height: 13px;
	}
	.skel-line.sm {
		width: 28%;
		height: 11px;
	}
	.skel-line.md {
		width: 64px;
		height: 12px;
		justify-self: end;
	}
	.skel-btn {
		width: 72px;
		height: 30px;
		border-radius: var(--radius-md);
		justify-self: end;
	}
	@keyframes shimmer {
		to {
			transform: translateX(100%);
		}
	}

	.batch-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--accent-subtle);
		border: 1px solid var(--accent-muted, var(--border-base));
	}
	.batch-count {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-base);
		margin-right: auto;
	}

	.info-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		margin-bottom: var(--space-4);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
	}
	.info-callout .info-ic {
		display: inline-flex;
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--fg-subtle);
	}
	.info-callout p {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-relaxed);
		color: var(--fg-muted);
	}

	/* Modals */
	.modal-body {
		display: flex;
		flex-direction: column;
	}
	.seg {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		margin-bottom: var(--space-3);
		width: fit-content;
	}
	.seg button {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.seg button.selected {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}
	/* Add-network chain search */
	.top-hint {
		margin: 0 0 var(--space-3);
	}
	.search-wrap {
		position: relative;
	}
	.search-wrap .search-ic {
		position: absolute;
		left: var(--space-3);
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		color: var(--fg-subtle);
		pointer-events: none;
	}
	.search-input {
		padding-left: var(--space-8);
		margin-bottom: var(--space-3);
	}
	.chain-results {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 300px;
		overflow-y: auto;
		margin-bottom: var(--space-3);
	}
	.results-msg {
		margin: 0;
		padding: var(--space-5);
		text-align: center;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.chain-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		color: var(--fg-base);
		text-align: left;
		cursor: pointer;
		transition:
			background var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing);
	}
	.chain-row:hover:not(:disabled) {
		background: var(--bg-sunken);
		border-color: var(--border-base);
	}
	.chain-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.chain-row:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.chain-row-logo {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		object-fit: contain;
		flex-shrink: 0;
	}
	.chain-row-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}
	.chain-row-name {
		font-weight: 600;
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chain-row-meta {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.chain-row-id {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
		flex-shrink: 0;
	}
	.rpc-label {
		margin-top: var(--space-1);
	}
	.erc20-row {
		display: flex;
		gap: var(--space-2);
	}
	.input {
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-elevated);
		color: var(--fg-base);
		font-size: var(--text-sm);
		margin-bottom: var(--space-3);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}
	.erc20-row .input {
		margin-bottom: 0;
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.filter button:focus-visible,
	.seg button:focus-visible,
	.link-btn:focus-visible,
	.custom-chip button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
	.modal-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		margin-top: var(--space-4);
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-sm);
	}
	.btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
	}
	.btn.ghost {
		background: transparent;
	}
	/* Destructive: text uses --bg-elevated so it stays readable on --error in BOTH
	   themes (white on light-red would be low-contrast in dark mode). */
	.btn.danger {
		background: var(--error);
		color: var(--bg-elevated);
		border-color: var(--error);
	}
	.btn.danger:hover:not(:disabled) {
		border-color: var(--error);
		box-shadow: var(--shadow-md);
	}
	.btn.sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}

	.err {
		color: var(--error);
		font-size: var(--text-sm);
		margin: 0 0 var(--space-2);
	}
	.ok {
		color: var(--success);
		font-size: var(--text-sm);
		margin: 0 0 var(--space-2);
	}
	.muted {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		margin: var(--space-2) 0 0;
	}

	:global(.spin) {
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.title {
			font-size: var(--text-3xl);
		}
		.toolbar {
			align-items: flex-start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.btn {
			transition: none;
		}
		:global(.spin) {
			animation: none;
		}
		.skeleton::after {
			animation: none;
		}
	}
</style>
