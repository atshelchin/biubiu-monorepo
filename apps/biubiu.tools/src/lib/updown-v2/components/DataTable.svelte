<script lang="ts" generics="T">
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import type { Column, FilterOption } from './data-table';
	import type { Snippet } from 'svelte';

	interface Props {
		data: T[];
		columns: Column<T>[];
		/** Field name to filter on (e.g. 'status'). If not set, no filter UI. */
		filterKey?: string;
		filterOptions?: FilterOption[];
		filterValue?: string;
		onFilterChange?: (value: string) => void;
		pageSize?: number;
		/** Render a single cell. Receives (row, columnKey) */
		cell: Snippet<[T, string]>;
		onRowClick?: (row: T) => void;
		/** i18n translate function */
		t: (key: any, params?: any) => string;
		/** Initial sort column key */
		defaultSortKey?: string;
		/** Initial sort direction */
		defaultSortDir?: 'asc' | 'desc';
		/** Empty state message key */
		emptyMessage?: string;
	}

	let {
		data,
		columns,
		filterKey,
		filterOptions,
		filterValue = '',
		onFilterChange,
		pageSize = 10,
		cell,
		onRowClick,
		t,
		defaultSortKey = '',
		defaultSortDir = 'desc',
		emptyMessage
	}: Props = $props();

	// Sort state (initialized once from defaults)
	let sortKey = $state('');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let initialized = false;
	$effect(() => {
		if (!initialized) {
			sortKey = defaultSortKey;
			sortDir = defaultSortDir;
			initialized = true;
		}
	});

	// Pagination state
	let currentPage = $state(0);

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
		currentPage = 0;
	}

	// Filter
	function handleFilter(value: string) {
		onFilterChange?.(value);
		currentPage = 0;
	}

	// Filtered data
	const filtered = $derived.by(() => {
		if (!filterKey || !filterValue) return data;
		return data.filter((row) => {
			const val = (row as Record<string, unknown>)[filterKey!];
			return val === filterValue;
		});
	});

	// Sorted data
	const sorted = $derived.by(() => {
		if (!sortKey) return filtered;
		const col = columns.find((c) => c.key === sortKey);
		if (!col) return filtered;
		const accessor = col.getValue ?? ((row: T) => (row as Record<string, unknown>)[sortKey] as string | number);
		return [...filtered].sort((a, b) => {
			const va = accessor(a);
			const vb = accessor(b);
			if (typeof va === 'number' && typeof vb === 'number') {
				return sortDir === 'asc' ? va - vb : vb - va;
			}
			const sa = String(va);
			const sb = String(vb);
			return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
		});
	});

	// Pagination
	const totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
	const pageData = $derived(sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize));

	// Reset page when data changes
	$effect(() => {
		// Access data.length to track changes
		data.length;
		currentPage = 0;
	});
</script>

{#if filterOptions && filterOptions.length > 0}
	<div class="dt-filter">
		{#each filterOptions as opt (opt.value)}
			<button
				class="dt-pill"
				class:active={filterValue === opt.value}
				onclick={() => handleFilter(opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>
{/if}

{#if sorted.length === 0}
	<div class="dt-empty" use:fadeInUp={{ delay: 50 }}>
		<span>{emptyMessage ? t(emptyMessage) : t('updown5m.table.empty')}</span>
	</div>
{:else}
	<div class="dt-wrap" use:fadeInUp={{ delay: 50 }}>
		<table class="dt-table">
			<thead>
				<tr>
					{#each columns as col (col.key)}
						<th
							class:dt-hide-mobile={col.hideOnMobile}
							class:dt-sortable={col.sortable !== false}
							style:text-align={col.align ?? 'left'}
							onclick={() => col.sortable !== false && toggleSort(col.key)}
						>
							<span class="dt-th-inner">
								{col.label}
								{#if col.sortable !== false && sortKey === col.key}
									<span class="dt-sort-arrow">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
								{/if}
							</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each pageData as row, i (i)}
					<tr
						class:dt-clickable={!!onRowClick}
						onclick={() => onRowClick?.(row)}
					>
						{#each columns as col (col.key)}
							<td
								class:dt-hide-mobile={col.hideOnMobile}
								style:text-align={col.align ?? 'left'}
							>
								{@render cell(row, col.key)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div class="dt-pagination">
			<span class="dt-page-info">
				{t('updown5m.table.showing', {
					from: currentPage * pageSize + 1,
					to: Math.min((currentPage + 1) * pageSize, sorted.length),
					total: sorted.length
				})}
			</span>
			<div class="dt-page-btns">
				<button
					class="dt-page-btn"
					disabled={currentPage === 0}
					onclick={() => (currentPage = Math.max(0, currentPage - 1))}
					aria-label="Previous page"
				>
					&lsaquo;
				</button>
				{#each Array.from({ length: totalPages }, (_, i) => i) as p (p)}
					<button
						class="dt-page-btn"
						class:dt-page-active={p === currentPage}
						onclick={() => (currentPage = p)}
					>
						{p + 1}
					</button>
				{/each}
				<button
					class="dt-page-btn"
					disabled={currentPage >= totalPages - 1}
					onclick={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
					aria-label="Next page"
				>
					&rsaquo;
				</button>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* Filter pills */
	.dt-filter {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--bg-sunken, var(--bg-raised));
		border-radius: var(--radius-md);
		align-self: flex-start;
		margin-bottom: var(--space-4);
		width: fit-content;
	}
	.dt-pill {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 500;
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.dt-pill:active {
		transform: scale(0.95);
	}
	.dt-pill.active {
		background: var(--bg-raised, rgba(255, 255, 255, 0.1));
		color: var(--fg-base);
		box-shadow: var(--shadow-sm);
	}

	/* Table */
	.dt-wrap {
		overflow-x: auto;
	}
	.dt-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.dt-table th {
		text-align: left;
		padding: var(--space-3);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 500;
		border-bottom: 1px solid var(--border-base);
		user-select: none;
	}
	.dt-sortable {
		cursor: pointer;
	}
	.dt-sortable:hover {
		color: var(--fg-base);
	}
	.dt-th-inner {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.dt-sort-arrow {
		font-size: 10px;
		opacity: 0.7;
	}
	.dt-table td {
		padding: var(--space-3);
		border-bottom: 1px solid var(--border-subtle, var(--border-base));
	}
	.dt-clickable {
		cursor: pointer;
		transition: background var(--motion-fast), transform var(--motion-fast);
	}
	.dt-clickable:hover {
		background: var(--bg-raised);
	}
	.dt-clickable:active {
		transform: scale(0.99);
	}

	/* Empty */
	.dt-empty {
		padding: var(--space-10);
		text-align: center;
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
	}

	/* Pagination */
	.dt-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) 0;
		margin-top: var(--space-2);
	}
	.dt-page-info {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.dt-page-btns {
		display: flex;
		gap: var(--space-1);
	}
	.dt-page-btn {
		min-width: 28px;
		height: 28px;
		padding: 0 var(--space-1);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--motion-fast) var(--easing);
	}
	.dt-page-btn:hover:not(:disabled) {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.dt-page-btn:active:not(:disabled) {
		transform: scale(0.95);
	}
	.dt-page-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.dt-page-active {
		background: var(--accent);
		color: var(--accent-fg, #fff);
		border-color: var(--accent);
	}
	.dt-page-active:hover {
		color: var(--accent-fg, #fff);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.dt-hide-mobile {
			display: none;
		}
		.dt-pagination {
			flex-direction: column;
			gap: var(--space-2);
			align-items: center;
		}
	}
</style>
