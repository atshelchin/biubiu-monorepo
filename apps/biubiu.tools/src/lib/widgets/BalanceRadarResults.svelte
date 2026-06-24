<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t, formatCurrency } from '$lib/i18n';
	import { resultsStore } from '$lib/pda-apps/balance-radar/modules/results-store.svelte.js';
	import { fetchUsdPrices, priceKey, type PriceItem } from '$lib/evm/token-prices';
	import { chainLogoUrl, tokenRowLogoUrl } from '$lib/evm/asset-icons';
	import AssetIcon from '$lib/ui/AssetIcon.svelte';
	import type { ResultEntry, SortField, SortDirection } from '$lib/pda-apps/balance-radar/modules/execution.js';

	interface Props {
		duration: number;
		sortField: SortField;
		sortDirection: SortDirection;
		filterNetwork: string;
		searchQuery: string;
		showFailures: boolean;
		/** Map of network key → human-readable name (e.g. ethereum → Ethereum). */
		networkNames: Record<string, string>;
		onSetSortField: (field: SortField) => void;
		onSetFilterNetwork: (network: string) => void;
		onSetSearchQuery: (query: string) => void;
		onToggleFailures: () => void;
		onExportCSV: () => void;
		onRunAgain: () => void;
	}

	let {
		duration,
		sortField,
		sortDirection,
		filterNetwork,
		searchQuery,
		showFailures,
		networkNames,
		onSetSortField,
		onSetFilterNetwork,
		onSetSearchQuery,
		onToggleFailures,
		onExportCSV,
		onRunAgain,
	}: Props = $props();

	// Heavy data comes from the $state.raw store (not deep-proxied via ctx), so
	// sort/filter over hundreds of thousands of rows stays cheap.
	const results = $derived(resultsStore.rows);
	const failures = $derived(resultsStore.failures);

	// USD prices: fetched once per result set for the distinct (network, token)
	// pairs. Missing prices just render "—" and never block the table.
	let prices = $state.raw<Map<string, number>>(new Map());
	$effect(() => {
		const rows = results;
		const seen: Record<string, true> = {};
		const items: PriceItem[] = [];
		for (const r of rows) {
			const kind = r.tokenAddress ? 'erc20' : 'native';
			const k = priceKey(r.network, kind, r.tokenAddress);
			if (seen[k]) continue;
			seen[k] = true;
			items.push({ network: r.network, kind, address: r.tokenAddress });
		}
		if (items.length === 0) {
			prices = new Map();
			return;
		}
		const ctrl = new AbortController();
		fetchUsdPrices(items, { signal: ctrl.signal })
			.then((m) => {
				if (!ctrl.signal.aborted) prices = m;
			})
			.catch(() => {});
		return () => ctrl.abort();
	});

	function rowUsd(row: ResultEntry): number | null {
		const p = prices.get(priceKey(row.network, row.tokenAddress ? 'erc20' : 'native', row.tokenAddress));
		if (p == null) return null;
		const bal = parseFloat(row.balance);
		return Number.isFinite(bal) ? bal * p : null;
	}

	// Portfolio total across ALL results (not just the current page/filter).
	const totalUsd = $derived.by(() => {
		if (prices.size === 0) return null;
		let sum = 0;
		let any = false;
		for (const r of results) {
			const u = rowUsd(r);
			if (u != null) {
				sum += u;
				any = true;
			}
		}
		return any ? sum : null;
	});

	/** Resolve a network key to its display name, falling back to the raw key. */
	function networkLabel(key: string): string {
		return networkNames[key] ?? key;
	}

	// Derived: unique networks in results (for filter dropdown)
	const resultNetworks = $derived(
		[...new Set(results.map((r) => r.network))].sort(),
	);

	// Derived: stats
	const stats = $derived.by(() => ({
		total: results.length + failures.length,
		success: results.length,
		failed: failures.length,
		duration,
	}));

	// Hide zero balances by default — a multi-token sweep returns mostly zeros,
	// and the rows that matter are the ones with a balance.
	let hideZero = $state(true);
	const nonZeroCount = $derived(results.reduce((n, r) => (parseFloat(r.balance) !== 0 ? n + 1 : n), 0));

	// Derived: filtered & sorted results
	const filteredResults = $derived.by(() => {
		let items = results;

		if (hideZero) {
			items = items.filter((r) => parseFloat(r.balance) !== 0);
		}

		if (filterNetwork) {
			items = items.filter((r) => r.network === filterNetwork);
		}

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			items = items.filter((r) => r.address.toLowerCase().includes(q));
		}

		const dir = sortDirection === 'asc' ? 1 : -1;
		items = [...items].sort((a, b) => {
			if (sortField === 'balance') {
				return (parseFloat(a.balance) - parseFloat(b.balance)) * dir;
			}
			return a[sortField].localeCompare(b[sortField]) * dir;
		});

		return items;
	});

	function truncateAddress(addr: string): string {
		if (addr.length <= 14) return addr;
		return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
	}

	// Debounced search: typing updates a local value immediately, but the
	// (potentially expensive) filter/sort only re-runs after the user pauses.
	let searchInput = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput(value: string) {
		searchInput = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => onSetSearchQuery(value), 250);
	}

	// Copy feedback: track which row was just copied, clear after a moment.
	let copiedKey = $state('');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	function rowKey(row: ResultEntry): string {
		return `${row.address}-${row.network}-${row.symbol}`;
	}

	async function copyAddress(row: ResultEntry) {
		try {
			await navigator.clipboard.writeText(row.address);
			copiedKey = rowKey(row);
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copiedKey = ''), 1500);
		} catch {
			// Clipboard may be unavailable (e.g. insecure context) — fail silently.
		}
	}

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
		if (searchTimer) clearTimeout(searchTimer);
	});

	/**
	 * Format a decimal balance string for display: group the integer part with
	 * thousands separators and trim the fraction to a few significant digits.
	 * The exact value stays available via the cell's title tooltip and CSV export.
	 */
	function formatBalance(raw: string): string {
		if (!raw) return '0';
		const negative = raw.startsWith('-');
		const body = negative ? raw.slice(1) : raw;
		const [intPartRaw, fracPartRaw = ''] = body.split('.');
		const intPart = intPartRaw || '0';
		const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

		// Whole-number balances need no fraction.
		let decimals = 4;
		if (intPart === '0') {
			// For sub-1 amounts, keep digits starting from the first significant one.
			const firstSignificant = fracPartRaw.search(/[1-9]/);
			if (firstSignificant >= 0) decimals = Math.min(firstSignificant + 4, fracPartRaw.length);
		}
		const frac = fracPartRaw.slice(0, decimals).replace(/0+$/, '');
		const out = frac ? `${grouped}.${frac}` : grouped;
		return negative ? `-${out}` : out;
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function handleSortKey(event: KeyboardEvent, field: SortField) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onSetSortField(field);
		}
	}

	function getSortIndicator(field: SortField): string {
		if (sortField !== field) return '';
		return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
	}

	function ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
		if (sortField !== field) return 'none';
		return sortDirection === 'asc' ? 'ascending' : 'descending';
	}

	// Pagination
	const PAGE_SIZE = 100;
	let currentPage = $state(0);
	const totalPages = $derived(Math.ceil(filteredResults.length / PAGE_SIZE));
	const paginatedResults = $derived(
		filteredResults.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
	);

	// Reset to the first page whenever the filter/sort inputs change.
	let lastFilterSig = '';
	$effect(() => {
		const sig = `${filterNetwork} ${searchQuery} ${sortField} ${sortDirection} ${hideZero}`;
		if (sig !== lastFilterSig) {
			lastFilterSig = sig;
			currentPage = 0;
		}
	});
</script>

<section class="card">
	<h2 class="section-title">{t('br.results.title')}</h2>

	<!-- Stats Row -->
	<div class="stats-row">
		<div class="stat-pill">
			<span class="stat-label">{t('br.results.stats.total')}</span>
			<span class="stat-value">{stats.total}</span>
		</div>
		<div class="stat-pill stat-success">
			<span class="stat-label">{t('br.results.stats.success')}</span>
			<span class="stat-value">{stats.success}</span>
		</div>
		{#if stats.failed > 0}
			<div class="stat-pill stat-error">
				<span class="stat-label">{t('br.results.stats.failed')}</span>
				<span class="stat-value">{stats.failed}</span>
			</div>
		{/if}
		<div class="stat-pill">
			<span class="stat-label">{t('br.results.stats.duration')}</span>
			<span class="stat-value">{formatDuration(stats.duration)}</span>
		</div>
		{#if totalUsd != null}
			<div class="stat-pill stat-total-value">
				<span class="stat-label">{t('br.results.stats.totalValue')}</span>
				<span class="stat-value">{formatCurrency(totalUsd)}</span>
			</div>
		{/if}
	</div>

	<!-- Table Filters -->
	{#if results.length > 0}
		<div class="table-filters">
			<select
				class="filter-select"
				value={filterNetwork}
				onchange={(e) => onSetFilterNetwork((e.target as HTMLSelectElement).value)}
			>
				<option value="">{t('br.results.table.allNetworks')}</option>
				{#each resultNetworks as network (network)}
					<option value={network}>{networkLabel(network)}</option>
				{/each}
			</select>

			<input
				class="filter-input"
				type="text"
				placeholder={t('br.results.table.searchPlaceholder')}
				value={searchInput}
				oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
			/>

			<label class="hide-zero">
				<input type="checkbox" bind:checked={hideZero} />
				<span>{t('br.results.table.hideZero', { count: nonZeroCount })}</span>
			</label>
		</div>
	{/if}

	<!-- Results Table -->
	<div class="table-container">
		<table class="results-table">
			<thead>
				<tr>
					<th aria-sort={ariaSort('address')}>
						<button class="th-sortable" onclick={() => onSetSortField('address')} onkeydown={(e) => handleSortKey(e, 'address')}>
							{t('br.results.table.address')}{getSortIndicator('address')}
						</button>
					</th>
					<th aria-sort={ariaSort('network')}>
						<button class="th-sortable" onclick={() => onSetSortField('network')} onkeydown={(e) => handleSortKey(e, 'network')}>
							{t('br.results.table.network')}{getSortIndicator('network')}
						</button>
					</th>
					<th aria-sort={ariaSort('symbol')}>
						<button class="th-sortable" onclick={() => onSetSortField('symbol')} onkeydown={(e) => handleSortKey(e, 'symbol')}>
							{t('br.results.table.token')}{getSortIndicator('symbol')}
						</button>
					</th>
					<th class="th-balance" aria-sort={ariaSort('balance')}>
						<button class="th-sortable" onclick={() => onSetSortField('balance')} onkeydown={(e) => handleSortKey(e, 'balance')}>
							{t('br.results.table.balance')}{getSortIndicator('balance')}
						</button>
					</th>
					<th class="th-balance th-value">
						<span class="th-static">{t('br.results.table.value')}</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each paginatedResults as row (rowKey(row))}
					{@const usd = rowUsd(row)}
					<tr>
						<td class="cell-address">
							<button
								class="address-copy"
								class:is-copied={copiedKey === rowKey(row)}
								onclick={() => copyAddress(row)}
								title={copiedKey === rowKey(row) ? t('br.results.table.copied') : row.address}
							>
								{copiedKey === rowKey(row) ? t('br.results.table.copied') : truncateAddress(row.address)}
							</button>
						</td>
						<td>
							<span class="cell-asset">
								<AssetIcon src={chainLogoUrl(row.network)} label={networkLabel(row.network)} size={18} />
								{networkLabel(row.network)}
							</span>
						</td>
						<td class="cell-token" title={row.tokenAddress ?? ''}>
							<span class="cell-asset">
								<AssetIcon src={tokenRowLogoUrl(row.network, row.tokenAddress)} label={row.symbol} size={18} />
								{row.symbol}
							</span>
						</td>
						<td class="cell-balance" class:cell-zero={parseFloat(row.balance) === 0} title={row.balance}>
							{formatBalance(row.balance)}
						</td>
						<td class="cell-balance cell-usd" class:cell-zero={usd == null || usd === 0}>
							{usd != null ? formatCurrency(usd) : '—'}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="cell-empty">
							{t('br.results.table.noResults')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<button
				class="page-btn"
				disabled={currentPage === 0}
				onclick={() => (currentPage = 0)}
			>
				&laquo;
			</button>
			<button
				class="page-btn"
				disabled={currentPage === 0}
				onclick={() => (currentPage = Math.max(0, currentPage - 1))}
			>
				&lsaquo;
			</button>
			<span class="page-info">
				{currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filteredResults.length)}
				/ {filteredResults.length.toLocaleString()}
			</span>
			<button
				class="page-btn"
				disabled={currentPage >= totalPages - 1}
				onclick={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
			>
				&rsaquo;
			</button>
			<button
				class="page-btn"
				disabled={currentPage >= totalPages - 1}
				onclick={() => (currentPage = totalPages - 1)}
			>
				&raquo;
			</button>
		</div>
	{/if}

	<!-- Failures Panel -->
	{#if failures.length > 0}
		<div class="failures-panel">
			<button class="failures-toggle" onclick={onToggleFailures}>
				{t('br.results.failures.title', { count: failures.length })}
				<span class="toggle-icon">
					{showFailures ? t('br.results.failures.hide') : t('br.results.failures.show')}
				</span>
			</button>

			{#if showFailures}
				<div class="failures-list">
					{#each failures as failure (failure.address + '-' + failure.network + '-' + (failure.symbol ?? ''))}
						<div class="failure-item">
							<span class="failure-address">{truncateAddress(failure.address)}</span>
							<span class="failure-network">{networkLabel(failure.network)}</span>
							<span class="failure-error">{failure.error}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Action Row -->
	<div class="action-row">
		<button class="btn btn-secondary" onclick={onExportCSV}>
			{t('br.results.export.csv')}
		</button>
		<button class="btn btn-primary" onclick={onRunAgain}>
			{t('br.results.export.runAgain')}
		</button>
	</div>
</section>

<style>
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
	}

	.section-title {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	/* Stats Row */
	.stats-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.stat-pill {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
	}

	.stat-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.stat-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.stat-success .stat-value {
		color: var(--success);
	}

	.stat-error .stat-value {
		color: var(--error);
	}

	.stat-total-value .stat-value {
		color: var(--accent);
		font-weight: var(--weight-bold);
	}

	/* Table Filters */
	.table-filters {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.filter-select,
	.filter-input {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}

	.filter-select:focus,
	.filter-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}

	.filter-input {
		flex: 1;
	}

	.hide-zero {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		cursor: pointer;
		user-select: none;
	}

	.hide-zero input {
		accent-color: var(--accent);
		cursor: pointer;
	}

	/* Results Table */
	.table-container {
		overflow-x: auto;
		margin-bottom: var(--space-4);
	}

	.results-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.results-table th {
		padding: 0;
		text-align: left;
		border-bottom: 1px solid var(--border-base);
		white-space: nowrap;
	}

	.th-sortable {
		display: inline-flex;
		align-items: center;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: none;
		border: none;
		font-family: inherit;
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		user-select: none;
		border-radius: var(--radius-sm);
		transition: color var(--motion-fast) var(--easing);
	}

	.th-sortable:hover {
		color: var(--fg-base);
	}

	.th-sortable:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		color: var(--fg-base);
	}

	.th-balance .th-sortable {
		justify-content: flex-end;
	}

	.th-static {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cell-usd {
		color: var(--fg-base);
	}

	.results-table td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border-subtle);
		color: var(--fg-base);
	}

	.results-table tr:hover td {
		background: var(--bg-sunken);
	}

	.cell-address {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.address-copy {
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: inherit;
		color: var(--accent);
		cursor: pointer;
		transition: opacity var(--motion-fast) var(--easing);
	}

	.address-copy:hover {
		opacity: 0.7;
	}

	.address-copy:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.address-copy.is-copied {
		color: var(--success);
		opacity: 1;
	}

	.cell-token {
		font-weight: var(--weight-medium);
	}

	.cell-asset {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.cell-balance {
		font-family: var(--font-mono);
		text-align: right;
		font-weight: var(--weight-medium);
	}

	.cell-zero {
		color: var(--fg-subtle);
	}

	.cell-empty {
		text-align: center;
		color: var(--fg-subtle);
		padding: var(--space-6) !important;
	}

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.page-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.page-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.page-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.page-info {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		padding: 0 var(--space-2);
		min-width: 100px;
		text-align: center;
	}

	/* Failures Panel */
	.failures-panel {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.failures-toggle {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		background: none;
		border: none;
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
		color: var(--error);
		cursor: pointer;
	}

	.toggle-icon {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.failures-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.failure-item {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-2);
		background: var(--error-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.failure-address {
		font-family: var(--font-mono);
		color: var(--fg-muted);
	}

	.failure-network {
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
	}

	.failure-error {
		color: var(--error);
		flex: 1;
		word-break: break-word;
	}

	/* Action Row */
	.action-row {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		border: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.btn:not(:disabled):hover {
		transform: translateY(-1px);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-primary:not(:disabled):hover {
		background: var(--accent-hover);
	}

	.btn-secondary {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.btn-secondary:hover {
		border-color: var(--border-strong);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.card {
			padding: var(--space-4);
		}

		.table-filters {
			flex-direction: column;
		}

		.stats-row {
			gap: var(--space-1);
		}

		.action-row {
			flex-direction: column;
		}

		.btn {
			width: 100%;
		}
	}
</style>
