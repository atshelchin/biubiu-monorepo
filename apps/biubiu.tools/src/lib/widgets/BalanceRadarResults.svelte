<script lang="ts">
	import { t } from '$lib/i18n';
	import type {
		ResultEntry,
		SortField,
		SortDirection,
	} from '$lib/pda-apps/balance-radar/modules/execution.js';
	import type { BalanceFailure } from '$lib/pda-apps/balance-radar/types.js';

	interface Props {
		results: ResultEntry[];
		failures: BalanceFailure[];
		duration: number;
		sortField: SortField;
		sortDirection: SortDirection;
		filterNetwork: string;
		searchQuery: string;
		showFailures: boolean;
		onSetSortField: (field: SortField) => void;
		onSetFilterNetwork: (network: string) => void;
		onSetSearchQuery: (query: string) => void;
		onToggleFailures: () => void;
		onExportCSV: () => void;
		onRunAgain: () => void;
	}

	let {
		results,
		failures,
		duration,
		sortField,
		sortDirection,
		filterNetwork,
		searchQuery,
		showFailures,
		onSetSortField,
		onSetFilterNetwork,
		onSetSearchQuery,
		onToggleFailures,
		onExportCSV,
		onRunAgain,
	}: Props = $props();

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

	// Derived: filtered & sorted results
	const filteredResults = $derived.by(() => {
		let items = results;

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

	async function copyAddress(addr: string) {
		await navigator.clipboard.writeText(addr);
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function getSortIndicator(field: SortField): string {
		if (sortField !== field) return '';
		return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
	}

	// Pagination
	const PAGE_SIZE = 100;
	let currentPage = $state(0);
	const totalPages = $derived(Math.ceil(filteredResults.length / PAGE_SIZE));
	const paginatedResults = $derived(
		filteredResults.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
	);

	// Reset page when filters change
	$effect(() => {
		// Track filter dependencies
		filterNetwork;
		searchQuery;
		sortField;
		sortDirection;
		currentPage = 0;
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
				{#each resultNetworks as network}
					<option value={network}>{network}</option>
				{/each}
			</select>

			<input
				class="filter-input"
				type="text"
				placeholder={t('br.results.table.searchPlaceholder')}
				value={searchQuery}
				oninput={(e) => onSetSearchQuery((e.target as HTMLInputElement).value)}
			/>
		</div>
	{/if}

	<!-- Results Table -->
	<div class="table-container">
		<table class="results-table">
			<thead>
				<tr>
					<th class="th-sortable" onclick={() => onSetSortField('address')}>
						{t('br.results.table.address')}{getSortIndicator('address')}
					</th>
					<th class="th-sortable" onclick={() => onSetSortField('network')}>
						{t('br.results.table.network')}{getSortIndicator('network')}
					</th>
					<th>{t('br.results.table.symbol')}</th>
					<th class="th-sortable th-balance" onclick={() => onSetSortField('balance')}>
						{t('br.results.table.balance')}{getSortIndicator('balance')}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each paginatedResults as row}
					<tr>
						<td class="cell-address">
							<button
								class="address-copy"
								onclick={() => copyAddress(row.address)}
								title={row.address}
							>
								{truncateAddress(row.address)}
							</button>
						</td>
						<td>{row.network}</td>
						<td>{row.symbol}</td>
						<td class="cell-balance" class:cell-zero={parseFloat(row.balance) === 0}>
							{row.balance}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="cell-empty">
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
					{#each failures as failure}
						<div class="failure-item">
							<span class="failure-address">{truncateAddress(failure.address)}</span>
							<span class="failure-network">{failure.network}</span>
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
		background: var(--bg-raised);
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
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		border-bottom: 1px solid var(--border-base);
		white-space: nowrap;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.th-sortable {
		cursor: pointer;
		user-select: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.th-sortable:hover {
		color: var(--fg-base);
	}

	.th-balance {
		text-align: right;
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
