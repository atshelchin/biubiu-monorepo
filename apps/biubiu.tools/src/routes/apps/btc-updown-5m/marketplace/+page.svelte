<script lang="ts">
	import { goto } from '$app/navigation';
	import { t, formatDate } from '$lib/i18n';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { market } from '$lib/updown-v2/store.svelte';
	import { mockPeriodStats } from '$lib/updown-v2/mock';
	import { profitClass, fmt, fmtPct, fmtDate, shortDate, shortDateHour } from '$lib/updown-v2/utils';
	import { routes } from '$lib/updown-v2/routes';
	import type { PeriodStats } from '$lib/updown-v2/types';

	// Page-local state
	let searchQuery = $state('');
	let viewMode = $state<'list' | 'card'>('list');
	let mktHourOffset = $state(0);
	let mktDayOffset = $state(0);
	let mktNinetyDayOffset = $state(0);
	let mktSortKey = $state<'name' | 'hour' | 'today' | 'ninetyDay' | 'created'>('today');
	let mktSortDir = $state<'asc' | 'desc'>('desc');

	const anyOffsetActive = $derived(mktHourOffset !== 0 || mktDayOffset !== 0 || mktNinetyDayOffset !== 0);

	function resetOffsets() {
		mktHourOffset = 0;
		mktDayOffset = 0;
		mktNinetyDayOffset = 0;
	}

	/** Get stats for a strategy at a specific period + offset */
	function getStats(strategyId: string, period: 'hour' | 'today' | 'ninetyDay', offset: number): PeriodStats {
		if (offset === 0) {
			const s = market.list.find(m => m.id === strategyId);
			if (s) return s.performance[period];
		}
		return mockPeriodStats(strategyId, period, offset);
	}

	/** Label for a period offset -- show absolute dates */
	function periodLabel(period: 'hour' | 'today' | 'ninetyDay', offset: number): string {
		const now = new Date();
		if (period === 'hour') {
			if (offset === 0) return t('updown5m.period.thisHour');
			const target = new Date(now.getTime() + offset * 3600_000);
			return shortDateHour(target);
		}
		if (period === 'today') {
			if (offset === 0) return t('updown5m.period.today');
			const target = new Date(now.getTime() + offset * 86400_000);
			return shortDate(target);
		}
		// ninetyDay: show date range
		if (offset === 0) return t('updown5m.period.current90d');
		const endDate = new Date(now.getTime() + offset * 90 * 86400_000);
		const startDate = new Date(endDate.getTime() - 90 * 86400_000);
		return `${shortDate(startDate)} \u2013 ${shortDate(endDate)}`;
	}

	function toggleMktSort(key: typeof mktSortKey) {
		if (mktSortKey === key) {
			mktSortDir = mktSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			mktSortKey = key;
			mktSortDir = 'desc';
		}
	}

	/** Filtered + sorted marketplace data */
	const sortedMarket = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const filtered = q
			? market.list.filter(s => s.name.toLowerCase().includes(q) || s.author.name.toLowerCase().includes(q))
			: market.list;
		return [...filtered].sort((a, b) => {
			if (mktSortKey === 'name') {
				const cmp = a.name.localeCompare(b.name);
				return mktSortDir === 'asc' ? cmp : -cmp;
			}
			let va: number, vb: number;
			if (mktSortKey === 'created') {
				va = new Date(a.createdAt).getTime();
				vb = new Date(b.createdAt).getTime();
			} else {
				const period = mktSortKey;
				const offset = period === 'hour' ? mktHourOffset : period === 'today' ? mktDayOffset : mktNinetyDayOffset;
				va = getStats(a.id, period, offset).profit;
				vb = getStats(b.id, period, offset).profit;
			}
			return mktSortDir === 'asc' ? va - vb : vb - va;
		});
	});
</script>

<section class="page-header">
	<a class="back-link" href={routes.hub()}>&larr; Back</a>
	<div class="title-row">
		<h1 class="page-title">{t('updown5m.marketplace')}</h1>
		{#if anyOffsetActive}
			<button class="btn-reset" onclick={resetOffsets}>{t('updown5m.period.now')}</button>
		{/if}
	</div>
	<p class="page-desc">{t('updown5m.marketplace.desc')}</p>
</section>

<div class="toolbar" use:fadeInUp={{ delay: 30 }}>
	<div class="search-wrap">
		<svg class="search-icon" viewBox="0 0 20 20" fill="none" width="16" height="16"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" stroke-width="1.5"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
		<input
			class="search-input"
			type="text"
			placeholder="Search strategies..."
			bind:value={searchQuery}
		/>
		{#if searchQuery}
			<button class="search-clear" onclick={() => searchQuery = ''} aria-label="Clear search">&times;</button>
		{/if}
	</div>
	<div class="view-toggle">
		<button
			class="toggle-btn"
			class:active={viewMode === 'list'}
			onclick={() => viewMode = 'list'}
			aria-label="List view"
		>
			<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="1" y="2" width="14" height="1.5" rx=".75"/><rect x="1" y="7" width="14" height="1.5" rx=".75"/><rect x="1" y="12" width="14" height="1.5" rx=".75"/></svg>
		</button>
		<button
			class="toggle-btn"
			class:active={viewMode === 'card'}
			onclick={() => viewMode = 'card'}
			aria-label="Card view"
		>
			<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
		</button>
	</div>
</div>

{#if viewMode === 'list'}
<div class="mkt-wrap" use:fadeInUp={{ delay: 50 }}>
	<table class="mkt-table">
		<thead>
			<tr>
				<th class="mkt-th-rank">#</th>
				<th class="mkt-th-strategy" onclick={() => toggleMktSort('name')}>{t('updown5m.table.strategy')}{#if mktSortKey === 'name'}<span class="mkt-sort-arrow">{mktSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</th>
				<th class="mkt-th-period">
					<div class="period-nav">
						<button class="period-arrow" onclick={() => mktHourOffset--} aria-label="Previous hour">&lsaquo;</button>
						<button class="period-label" class:period-active={mktSortKey === 'hour'} onclick={() => toggleMktSort('hour')}>{periodLabel('hour', mktHourOffset)}{#if mktSortKey === 'hour'}<span class="mkt-sort-arrow">{mktSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
						<button class="period-arrow" onclick={() => { if (mktHourOffset < 0) mktHourOffset++; }} disabled={mktHourOffset >= 0} aria-label="Next hour">&rsaquo;</button>
					</div>
				</th>
				<th class="mkt-th-period">
					<div class="period-nav">
						<button class="period-arrow" onclick={() => mktDayOffset--} aria-label="Previous day">&lsaquo;</button>
						<button class="period-label" class:period-active={mktSortKey === 'today'} onclick={() => toggleMktSort('today')}>{periodLabel('today', mktDayOffset)}{#if mktSortKey === 'today'}<span class="mkt-sort-arrow">{mktSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
						<button class="period-arrow" onclick={() => { if (mktDayOffset < 0) mktDayOffset++; }} disabled={mktDayOffset >= 0} aria-label="Next day">&rsaquo;</button>
					</div>
				</th>
				<th class="mkt-th-period">
					<div class="period-nav">
						<button class="period-arrow" onclick={() => mktNinetyDayOffset--} aria-label="Previous 90d">&lsaquo;</button>
						<button class="period-label" class:period-active={mktSortKey === 'ninetyDay'} onclick={() => toggleMktSort('ninetyDay')}>{periodLabel('ninetyDay', mktNinetyDayOffset)}{#if mktSortKey === 'ninetyDay'}<span class="mkt-sort-arrow">{mktSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
						<button class="period-arrow" onclick={() => { if (mktNinetyDayOffset < 0) mktNinetyDayOffset++; }} disabled={mktNinetyDayOffset >= 0} aria-label="Next 90d">&rsaquo;</button>
					</div>
				</th>
				<th class="mkt-th-created" onclick={() => toggleMktSort('created')}>
					{t('updown5m.table.created')}{#if mktSortKey === 'created'}<span class="mkt-sort-arrow">{mktSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}
				</th>
			</tr>
		</thead>
		<tbody>
			{#each sortedMarket as s, i (s.id)}
				{@const hStats = getStats(s.id, 'hour', mktHourOffset)}
				{@const dStats = getStats(s.id, 'today', mktDayOffset)}
				{@const ndStats = getStats(s.id, 'ninetyDay', mktNinetyDayOffset)}
				<tr class="mkt-row" onclick={() => goto(routes.strategy('official', s.id))}>
					<td class="mkt-rank">{i + 1}</td>
					<td class="mkt-name">
						<strong>{s.name}</strong>
						<span class="mkt-author">{s.author.name}</span>
					</td>
					<td class="mkt-period-cell">
						<span class="mkt-profit {profitClass(hStats.profit)}">{fmt(hStats.profit)}</span>
						<span class="mkt-meta">{hStats.rounds}r &middot; {fmtPct(hStats.winRate)}</span>
					</td>
					<td class="mkt-period-cell">
						<span class="mkt-profit {profitClass(dStats.profit)}">{fmt(dStats.profit)}</span>
						<span class="mkt-meta">{dStats.rounds}r &middot; {fmtPct(dStats.winRate)}</span>
					</td>
					<td class="mkt-period-cell">
						<span class="mkt-profit {profitClass(ndStats.profit)}">{fmt(ndStats.profit)}</span>
						<span class="mkt-meta">{ndStats.rounds}r &middot; {fmtPct(ndStats.winRate)}</span>
					</td>
					<td class="mkt-created">{fmtDate(s.createdAt)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{:else}
<div class="mkt-card-grid card-grid-3" use:fadeInUp={{ delay: 50 }}>
	{#each sortedMarket as s, i (s.id)}
		{@const hStats = getStats(s.id, 'hour', mktHourOffset)}
		{@const dStats = getStats(s.id, 'today', mktDayOffset)}
		{@const ndStats = getStats(s.id, 'ninetyDay', mktNinetyDayOffset)}
		<a class="card interactive mkt-card-item" href={routes.strategy('official', s.id)}>
			<div class="card-top">
				<div>
					<div class="card-name">{s.name}</div>
					<div class="card-meta">{s.author.name}</div>
				</div>
				<span class="vis-badge {s.visibility === 'public' ? 'vis-public' : 'vis-private'}">{s.visibility}</span>
			</div>
			<div class="mkt-card-stats">
				<div class="mkt-card-stat">
					<span class="metric-label">{periodLabel('hour', mktHourOffset)}</span>
					<span class="mkt-profit {profitClass(hStats.profit)}">{fmt(hStats.profit)}</span>
					<span class="mkt-meta">{hStats.rounds}r &middot; {fmtPct(hStats.winRate)}</span>
				</div>
				<div class="mkt-card-stat">
					<span class="metric-label">{periodLabel('today', mktDayOffset)}</span>
					<span class="mkt-profit {profitClass(dStats.profit)}">{fmt(dStats.profit)}</span>
					<span class="mkt-meta">{dStats.rounds}r &middot; {fmtPct(dStats.winRate)}</span>
				</div>
				<div class="mkt-card-stat">
					<span class="metric-label">{periodLabel('ninetyDay', mktNinetyDayOffset)}</span>
					<span class="mkt-profit {profitClass(ndStats.profit)}">{fmt(ndStats.profit)}</span>
					<span class="mkt-meta">{ndStats.rounds}r &middot; {fmtPct(ndStats.winRate)}</span>
				</div>
			</div>
			<div class="mkt-card-footer">
				<span class="mkt-meta">{fmtDate(s.createdAt)}</span>
			</div>
		</a>
	{/each}
</div>
{/if}

<style>
	/* ═══ Toolbar: search + view toggle ═══ */
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.search-wrap {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: var(--space-3);
		color: var(--fg-subtle);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: var(--space-2) var(--space-4) var(--space-2) var(--space-8);
		font-size: var(--text-sm);
		color: var(--fg-base);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.search-input::placeholder {
		color: var(--fg-faint);
	}

	.search-input:focus {
		border-color: var(--accent);
	}

	.search-clear {
		position: absolute;
		right: var(--space-2);
		background: none;
		border: none;
		color: var(--fg-subtle);
		font-size: var(--text-lg);
		cursor: pointer;
		padding: 0 var(--space-1);
		line-height: 1;
		transition: color var(--motion-fast);
	}

	.search-clear:hover {
		color: var(--fg-base);
	}

	/* ═══ View toggle ═══ */
	.view-toggle {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--bg-sunken, var(--bg-raised));
		border-radius: var(--radius-md);
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.toggle-btn:hover {
		color: var(--fg-base);
	}

	.toggle-btn.active {
		background: var(--bg-raised, rgba(255, 255, 255, 0.1));
		color: var(--accent);
		box-shadow: var(--shadow-sm);
	}

	/* ═══ Card view ═══ */
	.mkt-card-item {
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
	}

	.mkt-card-stats {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle, var(--border-base));
	}

	.mkt-card-stat {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
	}

	.mkt-card-stat .metric-label {
		flex: 0 0 auto;
		min-width: 60px;
	}

	.mkt-card-stat .mkt-profit {
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.mkt-card-stat .mkt-meta {
		color: var(--fg-muted);
		margin-left: auto;
	}

	.mkt-card-footer {
		margin-top: auto;
		padding-top: var(--space-3);
	}

	.mkt-card-grid {
		margin-bottom: var(--space-6);
	}

	@media (max-width: 768px) {
		.mkt-card-grid {
			grid-template-columns: 1fr;
		}

		.toolbar {
			flex-wrap: wrap;
		}

		.search-wrap {
			min-width: 0;
		}
	}

	@media (max-width: 1024px) and (min-width: 769px) {
		.mkt-card-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
