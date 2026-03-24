<script lang="ts">
	import { page } from '$app/state';
	import { t, formatCurrency } from '$lib/i18n';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { market } from '$lib/updown-v2/store.svelte';
	import { mockStats, mockHourlyStats, mockDailyStats, mockRounds, todayStr } from '$lib/updown-v2/mock-detail';
	import { createFormatterCtx } from '$lib/updown-v2/formatter-bridge';
	import { profitClass, fmt, fmtPct, fmtDate } from '$lib/updown-v2/utils';
	import { routes } from '$lib/updown-v2/routes';
	import DatePicker from '$lib/ui/DatePicker.svelte';
	import StatsGrid from '$lib/updown-shared/components/StatsGrid.svelte';
	import HourlyChart from '$lib/updown-shared/components/HourlyChart.svelte';
	import WeekdayChart from '$lib/updown-shared/components/WeekdayChart.svelte';
	import RoundsHistory from '$lib/updown-shared/components/RoundsHistory.svelte';
	import type { RoundStatusFilter, ResultFilter } from '$lib/updown-shared/types';

	const spaceId = $derived(page.params.spaceId ?? '');
	const strategyId = $derived(page.params.strategyId ?? '');

	// Cast t for shared components (TranslateFn expects string keys, our t expects TranslationKey)
	const sharedT = t as unknown as import('$lib/updown-shared/types').TranslateFn;
	const ctx = $derived(createFormatterCtx());

	// Find the strategy from the market store
	const strat = $derived(market.list.find(s => s.id === strategyId));
	const startDate = $derived(strat ? new Date(strat.createdAt) : new Date());
	const daysRunning = $derived(Math.floor((Date.now() - startDate.getTime()) / 86400000));

	// Page-local state
	let selectedHour = $state<number | null>(null);
	let detailDateRange = $state<{ from: string; to: string }>({ from: todayStr(), to: todayStr() });
	const isMultiDay = $derived(detailDateRange.from !== detailDateRange.to);

	// Mock data derived from current strategy + date range
	const detailStats = $derived(strategyId ? mockStats(strategyId, detailDateRange) : null);
	const detailHourly = $derived(strategyId ? (
		isMultiDay
			? mockHourlyStats(strategyId, detailDateRange.from + ':' + detailDateRange.to)
			: mockHourlyStats(strategyId, detailDateRange.from)
	) : []);
	const detailDaily = $derived(strategyId && isMultiDay ? mockDailyStats(strategyId, detailDateRange.from, detailDateRange.to) : []);

	// Rounds state
	let roundsPage = $state(0);
	let roundsFilter = $state<RoundStatusFilter>('');
	let resultFilter = $state<ResultFilter>('');
	const detailRounds = $derived(strategyId ? mockRounds(strategyId, roundsPage, 20) : { rows: [], total: 0 });

	// Direction split derived
	const dirStats = $derived.by(() => {
		if (!detailStats) return null;
		const total = detailStats.signalBet + detailStats.signalReverse;
		const betUp = Math.ceil(total * 0.55);
		const betDown = total - betUp;
		const upWins = Math.ceil(betUp * (detailStats.winRate + 0.05));
		const downWins = Math.ceil(betDown * detailStats.winRate);
		return {
			betUp, betDown, upWins, downWins,
			upWr: betUp > 0 ? upWins / betUp : 0,
			downWr: betDown > 0 ? downWins / betDown : 0,
		};
	});

	// Hedge net cost
	const netHedgeCost = $derived(detailStats ? detailStats.totalHedgeCost - detailStats.hedgeSellRevenue : 0);
</script>

{#if strat}
	<a class="back-link" href={routes.space(spaceId)}>&larr; Back</a>

	<!-- Hero -->
	<div class="detail-hero" use:fadeInUp={{ delay: 0 }}>
		<div class="detail-hero-top">
			<div>
				<h1 class="detail-name">{strat.name}</h1>
				<p class="detail-desc">{strat.description}</p>
			</div>
			<div class="detail-hero-actions">
				{#if strat.visibility === 'private' && !strat.config}
					<button class="btn-warning btn-sm" onclick={() => alert('TODO: Unlock')}>Unlock ${strat.price}</button>
				{:else}
					<button class="btn-accent btn-sm" onclick={() => alert('TODO: Follow')}>Follow</button>
					<button class="btn-secondary btn-sm" onclick={() => alert('TODO: Copy')}>Copy</button>
					<button class="btn-secondary btn-sm" onclick={() => alert('TODO: Export')}>Export</button>
				{/if}
			</div>
		</div>

		<!-- Author + meta row -->
		<div class="detail-info-row">
			<a class="author-link" href={routes.member(spaceId, strat.author.id)}>
				<span class="author-avatar">{strat.author.name[0].toUpperCase()}</span>
				<span class="author-name">{strat.author.name}</span>
			</a>
			<span class="info-sep">&middot;</span>
			<span class="info-chip">{strat.followCount} followers</span>
			<span class="info-sep">&middot;</span>
			<span class="info-chip">{strat.copyCount} copies</span>
			<span class="info-sep">&middot;</span>
			<span class="info-chip">{daysRunning}d since {fmtDate(strat.createdAt)}</span>
		</div>

		<!-- Tags + badges -->
		<div class="detail-tags">
			<span class="vis-badge" class:vis-public={strat.visibility === 'public'} class:vis-private={strat.visibility === 'private'}>{strat.visibility}</span>
			<span class="risk-badge risk-{strat.riskLevel}">{strat.riskLevel}</span>
			{#each strat.tags as tag (tag)}
				<span class="tag-chip">{tag}</span>
			{/each}
		</div>
	</div>

	<!-- Date range: presets + picker -->
	<div use:fadeInUp={{ delay: 30 }}>
		<DatePicker
			mode="range"
			bind:value={detailDateRange}
			presets={['today', '7d', '30d', '90d']}
			navigation
			onchange={() => { selectedHour = null; }}
		/>
	</div>

	<!-- StatsGrid -->
	{#if detailStats}
		<StatsGrid stats={detailStats} {selectedHour} {ctx} t={sharedT} onClearHour={() => (selectedHour = null)} />
	{/if}

	<!-- Charts stacked -->
	<div use:fadeInUp={{ delay: 80 }}>
		<HourlyChart
			hourlyData={detailHourly}
			filterDateFrom={detailDateRange.from}
			{selectedHour}
			{ctx}
			t={sharedT}
			titleKey={isMultiDay ? 'btcUpdown.chart.hourlyProfitAgg' : undefined}
			onSelectHour={(h) => (selectedHour = h)}
		/>
	</div>
	{#if isMultiDay && detailDaily.length > 0}
		<div use:fadeInUp={{ delay: 100 }}>
			<WeekdayChart dailyData={detailDaily} {ctx} t={sharedT} />
		</div>
	{/if}

	<!-- Analytics cards: Direction Split / Streaks / Hedge -->
	{#if detailStats}
		<div class="analytics-row" use:fadeInUp={{ delay: 110 }}>
			<!-- Direction Split -->
			<div class="analytics-card glass-card">
				<h3 class="analytics-label">Direction Split</h3>
				{#if dirStats}
					<div class="dir-split">
						<div class="dir-col">
							<span class="dir-heading">UP</span>
							<span class="dir-wr {dirStats.upWr >= 0.5 ? 'positive' : 'negative'}">{fmtPct(dirStats.upWr)}</span>
							<span class="dir-detail">{dirStats.upWins}W / {dirStats.betUp - dirStats.upWins}L</span>
						</div>
						<div class="dir-divider"></div>
						<div class="dir-col">
							<span class="dir-heading">DOWN</span>
							<span class="dir-wr {dirStats.downWr >= 0.5 ? 'positive' : 'negative'}">{fmtPct(dirStats.downWr)}</span>
							<span class="dir-detail">{dirStats.downWins}W / {dirStats.betDown - dirStats.downWins}L</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Streaks -->
			<div class="analytics-card glass-card">
				<h3 class="analytics-label">Streaks</h3>
				<div class="streaks-list">
					<div class="streak-row">
						<span class="streak-label">Max Win</span>
						<div class="streak-bar-wrap">
							<div class="streak-bar streak-bar-win" style="width: {Math.min((detailStats.maxWinStreak / Math.max(detailStats.maxWinStreak, detailStats.maxLoseStreak)) * 100, 100)}%"></div>
						</div>
						<span class="streak-val positive">{detailStats.maxWinStreak}</span>
					</div>
					<div class="streak-row">
						<span class="streak-label">Max Loss</span>
						<div class="streak-bar-wrap">
							<div class="streak-bar streak-bar-loss" style="width: {Math.min((detailStats.maxLoseStreak / Math.max(detailStats.maxWinStreak, detailStats.maxLoseStreak)) * 100, 100)}%"></div>
						</div>
						<span class="streak-val negative">{detailStats.maxLoseStreak}</span>
					</div>
					<div class="streak-row">
						<span class="streak-label">Avg Win</span>
						<div class="streak-bar-wrap">
							<div class="streak-bar streak-bar-neutral" style="width: 50%"></div>
						</div>
						<span class="streak-val">{(detailStats.maxWinStreak * 0.4).toFixed(1)}</span>
					</div>
					<div class="streak-row">
						<span class="streak-label">Current</span>
						<div class="streak-bar-wrap">
							<div class="streak-bar {detailStats.currentStreak >= 0 ? 'streak-bar-win' : 'streak-bar-loss'}" style="width: {Math.min((Math.abs(detailStats.currentStreak) / Math.max(detailStats.maxWinStreak, detailStats.maxLoseStreak)) * 100, 100)}%"></div>
						</div>
						<span class="streak-val {detailStats.currentStreak >= 0 ? 'positive' : 'negative'}">{detailStats.currentStreak >= 0 ? 'W' : 'L'}{Math.abs(detailStats.currentStreak)}</span>
					</div>
				</div>
			</div>

			<!-- Hedge -->
			<div class="analytics-card glass-card">
				<h3 class="analytics-label">Hedge</h3>
				<div class="hedge-grid">
					<div class="hedge-item">
						<span class="hedge-item-label">COST</span>
						<span class="hedge-item-value negative">{fmt(detailStats.totalHedgeCost)}</span>
						<span class="hedge-item-sub">{fmt(detailStats.entered > 0 ? detailStats.totalHedgeCost / detailStats.entered : 0)}/round avg</span>
					</div>
					<div class="hedge-item">
						<span class="hedge-item-label">RECOVERY</span>
						<span class="hedge-item-value positive">{fmt(detailStats.hedgeSellRevenue)}</span>
						<span class="hedge-item-sub">{detailStats.entered > 0 ? fmtPct(detailStats.hedgeSellRevenue / detailStats.totalHedgeCost) : '0%'}</span>
					</div>
				</div>
				<p class="hedge-summary">Net cost: <span class="negative">{fmt(-netHedgeCost)}</span> &middot; Saved {fmt(detailStats.losses > 0 ? detailStats.losses * 3.5 : 0)} on losses</p>
			</div>
		</div>
	{/if}

	<!-- Rounds History -->
	<div use:fadeInUp={{ delay: 120 }}>
		<RoundsHistory
			rounds={detailRounds.rows}
			roundsTotal={detailRounds.total}
			{roundsPage}
			roundsPageSize={20}
			refreshing={false}
			{roundsFilter}
			{resultFilter}
			stats={detailStats}
			{ctx}
			t={sharedT}
			formatCurrency={formatCurrency}
			onPageChange={(p) => (roundsPage = p)}
			onFilterChange={(f) => { roundsFilter = f; roundsPage = 0; }}
			onResultFilterChange={(f) => { resultFilter = f; roundsPage = 0; }}
			onRefresh={() => {}}
		/>
	</div>

	<!-- Config viewer (for public or purchased strategies) -->
	{#if strat.config}
		<div class="config-section" use:fadeInUp={{ delay: 140 }}>
			<div class="section-row">
				<h2 class="section-title">Strategy Config</h2>
				<span class="config-schema">{strat.config.$schema}</span>
			</div>
			<div class="config-grid">
				<!-- Signal -->
				<div class="config-card glass-card">
					<h4 class="config-card-label">Signal</h4>
					<div class="config-kv">
						<span class="config-key">method</span>
						<span class="config-val">{strat.config.signal.method}</span>
					</div>
					{#if strat.config.signal.params}
						{#each Object.entries(strat.config.signal.params) as [k, v] (k)}
							<div class="config-kv">
								<span class="config-key">{k}</span>
								<span class="config-val">{JSON.stringify(v)}</span>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Entry -->
				<div class="config-card glass-card">
					<h4 class="config-card-label">Entry</h4>
					<div class="config-kv"><span class="config-key">amount</span><span class="config-val">${strat.config.entry.amount}</span></div>
					<div class="config-kv"><span class="config-key">method</span><span class="config-val">{strat.config.entry.method}</span></div>
					{#if strat.config.entry.maxPrice}<div class="config-kv"><span class="config-key">maxPrice</span><span class="config-val">{strat.config.entry.maxPrice}</span></div>{/if}
					{#if strat.config.entry.minPrice}<div class="config-kv"><span class="config-key">minPrice</span><span class="config-val">{strat.config.entry.minPrice}</span></div>{/if}
					{#if strat.config.entry.maxPerHour}<div class="config-kv"><span class="config-key">maxPerHour</span><span class="config-val">{strat.config.entry.maxPerHour}</span></div>{/if}
				</div>

				<!-- Risk -->
				{#if strat.config.risk}
					<div class="config-card glass-card">
						<h4 class="config-card-label">Risk</h4>
						{#each Object.entries(strat.config.risk) as [k, v] (k)}
							<div class="config-kv">
								<span class="config-key">{k}</span>
								<span class="config-val">{typeof v === 'object' ? JSON.stringify(v) : v}</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Filter -->
				{#if strat.config.filter}
					<div class="config-card glass-card">
						<h4 class="config-card-label">Filter</h4>
						{#each Object.entries(strat.config.filter) as [k, v] (k)}
							<div class="config-kv">
								<span class="config-key">{k}</span>
								<span class="config-val">{typeof v === 'object' ? JSON.stringify(v) : v}</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Exit rules -->
				{#if strat.config.exit}
					<div class="config-card glass-card">
						<h4 class="config-card-label">Exit Rules</h4>
						{#each strat.config.exit as rule, i (i)}
							<div class="config-kv">
								<span class="config-key">{rule.type}</span>
								<span class="config-val">{Object.entries(rule).filter(([k]) => k !== 'type').map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else if strat.visibility === 'private'}
		<!-- Purchase banner for locked private -->
		<div class="purchase-bar" use:fadeInUp={{ delay: 140 }}>
			<div class="purchase-info">
				<div class="lock-icon">&#128274;</div>
				<div>
					<p class="purchase-title">Strategy config locked</p>
					<p class="purchase-note">${strat.price} one-time &middot; Arbitrum &middot; 50% to creator</p>
				</div>
			</div>
			<button class="btn-accent" onclick={() => alert('TODO: Connect wallet & pay')}>Unlock Strategy</button>
		</div>
	{/if}
{/if}

<style>
	/* Author + info row */
	.detail-info-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: var(--space-3);
	}
	.author-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		text-decoration: none;
		color: var(--fg-base);
		transition: opacity var(--motion-fast);
	}
	.author-link:hover { opacity: 0.8; }
	.author-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent-muted, rgba(96,165,250,.15));
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.author-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
	}
	.info-sep {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
	}
	.info-chip {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	/* Tags + badges */
	.detail-tags {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: var(--space-3);
	}
	.risk-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}
	.risk-conservative { background: rgba(52,211,153,.12); color: #34d399; }
	.risk-balanced { background: rgba(96,165,250,.12); color: #60a5fa; }
	.risk-aggressive { background: rgba(248,113,113,.12); color: #f87171; }
	.tag-chip {
		font-size: 10px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		background: rgba(255,255,255,.06);
		color: var(--fg-subtle);
		border: 1px solid rgba(255,255,255,.08);
	}
	:global([data-theme='light']) .tag-chip {
		background: rgba(0,0,0,.03);
		border-color: rgba(0,0,0,.08);
	}
	/* Config viewer */
	.config-section {
		margin-top: var(--space-4);
	}
	.config-schema {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--fg-subtle);
		background: rgba(255,255,255,.04);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
	}
	:global([data-theme='light']) .config-schema {
		background: rgba(0,0,0,.03);
	}
	.config-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.config-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
	}
	.config-card-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 var(--space-3);
	}
	.config-kv {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-1) 0;
		border-bottom: 1px solid rgba(255,255,255,.04);
	}
	.config-kv:last-child { border-bottom: none; }
	:global([data-theme='light']) .config-kv { border-color: rgba(0,0,0,.04); }
	.config-key {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
		flex-shrink: 0;
	}
	.config-val {
		font-size: var(--text-xs);
		color: var(--fg-base);
		font-family: var(--font-mono);
		font-weight: var(--weight-medium);
		text-align: right;
		word-break: break-all;
	}
</style>
