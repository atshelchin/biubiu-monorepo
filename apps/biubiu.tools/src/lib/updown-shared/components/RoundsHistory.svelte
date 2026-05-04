<script lang="ts">
	import type { Round, Stats, RoundStatusFilter, ResultFilter } from '../types.js';
	import type { FormatterContext, TranslateFn } from '../types.js';
	import {
		fmtShortTime, fmtLocalDate, fmtTimeWindow, fmtPrice, fmtProfit,
	} from '../formatters.js';
	import {
		getRoundStatusLabel, getRoundBadgeClass,
		getHedgeStatusLabel, getSkipReasonLabel, getSwingExitLabel,
	} from '../labels.js';
	import { fadeInUp } from '$lib/actions/fadeInUp';


	interface Props {
		rounds: Round[];
		roundsTotal: number;
		roundsPage: number;
		roundsPageSize: number;
		/** True only during user-initiated fetch (filter/page change). Background SSE refreshes stay false. */
		refreshing: boolean;
		roundsFilter: RoundStatusFilter;
		resultFilter: ResultFilter;
		stats: Stats | null;
		ctx: FormatterContext;
		t: TranslateFn;
		formatCurrency: (value: number) => string;
		onPageChange: (page: number) => void;
		onFilterChange: (filter: RoundStatusFilter) => void;
		onResultFilterChange: (filter: ResultFilter) => void;
		onRefresh: () => void;
	}

	let {
		rounds, roundsTotal, roundsPage, roundsPageSize, refreshing,
		roundsFilter, resultFilter,
		stats, ctx, t, formatCurrency,
		onPageChange, onFilterChange, onResultFilterChange, onRefresh
	}: Props = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(roundsTotal / roundsPageSize)));
</script>

<div class="filter-bar">
	<div class="filter-row">
		<!-- Status -->
		<div class="filter-group">
			{#each [
				{ value: '', label: t('btcUpdown.filter.all'), count: stats?.totalRounds },
				{ value: 'settled', label: t('btcUpdown.filter.settled'), count: stats ? stats.wins + stats.losses : null },
				{ value: 'skipped', label: t('btcUpdown.filter.skipped'), count: stats?.skipped },
				{ value: 'entered', label: t('btcUpdown.filter.entered'), count: stats ? stats.entered - stats.wins - stats.losses : null }
			] as filter (filter.value)}
				<button
					class="filter-btn"
					class:active={roundsFilter === filter.value && !resultFilter}
					onclick={() => onFilterChange(filter.value as RoundStatusFilter)}
				>
					{filter.label}{#if filter.count}<span class="filter-count">{filter.count}</span>{/if}
				</button>
			{/each}
		</div>
	</div>
	<div class="filter-row">
		<!-- Result -->
		<div class="filter-group">
			{#each [
				{ value: 'win', label: t('btcUpdown.filter.win'), count: stats?.wins },
				{ value: 'loss', label: t('btcUpdown.filter.loss'), count: stats?.losses },
				{ value: 'take_profit', label: t('btcUpdown.filter.takeProfit'), count: stats?.takeProfitCount },
				{ value: 'stop_loss', label: t('btcUpdown.filter.stopLoss'), count: stats?.stopLossCount }
			] as filter (filter.value)}
				<button
					class="filter-btn"
					class:active={resultFilter === filter.value}
					onclick={() => onResultFilterChange(resultFilter === filter.value ? '' : filter.value as ResultFilter)}
				>
					{filter.label}{#if filter.count}<span class="filter-count">{filter.count}</span>{/if}
				</button>
			{/each}
		</div>
	</div>
	<button class="refresh-btn" onclick={onRefresh} disabled={refreshing}>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="23 4 23 10 17 10" />
			<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
		</svg>
		{t('btcUpdown.history.refresh')}
	</button>
</div>

{#if rounds.length === 0 && !refreshing}
	<div class="empty-state" use:fadeInUp={{ delay: 100 }}>
		<h3 class="empty-title">{t('btcUpdown.noRounds')}</h3>
		<p class="empty-desc">{t('btcUpdown.noRoundsDesc')}</p>
	</div>
{:else if rounds.length === 0 && refreshing}
	<div class="loading-state">
		<span class="loading-dot"></span>
	</div>
{:else}
	<div class="rounds-list" class:refreshing>
		{#each rounds as round (round.id)}
			<div class="round-card glass-card" use:fadeInUp={{ delay: 0 }}>
				<div class="round-header">
					<a class="round-id-link" href="https://polymarket.com/event/{round.market_slug}" target="_blank" rel="noopener noreferrer">#{round.id}</a>
					<span class="round-time-window">
						<span class="round-local-date">{fmtLocalDate(ctx, round.event_start_time)}</span>
						{fmtTimeWindow(ctx, round.event_start_time, round.end_time)}
					</span>
					<span class="round-badge {getRoundBadgeClass(round)}">{getRoundStatusLabel(t, round)}</span>
				</div>

				{#if round.entry_direction}
					<div class="round-body">
						<div class="round-row">
							<span class="round-label">{t('btcUpdown.round.direction')}</span>
							<span class="round-value direction-tag direction-{round.entry_direction.toLowerCase()}">{round.entry_direction}</span>
						</div>
						{#if round.entry_price_avg !== null}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.entryPrice')}</span>
								<span class="round-value mono">{fmtPrice(ctx, round.entry_price_avg)}</span>
							</div>
						{/if}
						{#if round.outcome}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.outcome')}</span>
								<span class="round-value direction-tag direction-{round.outcome.toLowerCase()}">{round.outcome}</span>
							</div>
						{/if}
						{#if round.entry_time}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.entryTime')}</span>
								<span class="round-value mono">{fmtShortTime(ctx, round.entry_time)} <span class="entry-remaining">({round.entry_remaining}s left)</span></span>
							</div>
						{/if}
						{#if round.hedge?.filled_at}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.hedgeFilledAt')}</span>
								<span class="round-value mono">{fmtShortTime(ctx, round.hedge.filled_at)}</span>
							</div>
						{/if}
						{#if round.hedge?.sold_at}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.hedgeSoldAt')}</span>
								<span class="round-value mono">{fmtShortTime(ctx, round.hedge.sold_at)}</span>
							</div>
						{/if}
						{#if round.swing_exit_reason}
							<div class="round-row">
								<span class="round-label">Exit Reason</span>
								<span class="round-value swing-exit-badge swing-exit-{round.swing_exit_reason}">
									{getSwingExitLabel('en', round.swing_exit_reason)}
								</span>
							</div>
							{#if round.swing_exit_price !== null}
								<div class="round-row">
									<span class="round-label">Exit Price</span>
									<span class="round-value mono">{fmtPrice(ctx, round.swing_exit_price)}</span>
								</div>
							{/if}
							{@const exitTime = round.stop_loss_checked_at ?? round.settled_at}
							{#if exitTime}
								<div class="round-row">
									<span class="round-label">Exit Time</span>
									<span class="round-value mono">{fmtShortTime(ctx, exitTime)}</span>
								</div>
							{/if}
							{#if round.real_outcome}
								<div class="round-row">
									<span class="round-label">Real Outcome</span>
									<span class="round-value exit-quality-row">
										<span class="direction-tag direction-{round.real_outcome.toLowerCase()}">{round.real_outcome}</span>
										{#if round.entry_direction}
											{@const isCorrectExit = round.real_outcome !== round.entry_direction}
											<span class="exit-quality-badge" class:exit-correct={isCorrectExit} class:exit-wrong={!isCorrectExit}>
												{isCorrectExit
													? 'Good Exit'
													: 'Bad Exit'}
											</span>
										{/if}
									</span>
								</div>
							{/if}
						{/if}

						<!-- V80 dual-sweep details -->
						{#if round.signal_action === 'v80_dual_sweep' && round.signal_rules}
							{@const v80 = (() => { try { return JSON.parse(round.signal_rules); } catch { return null; } })()}
							{#if v80}
								{@const totalCost = (v80.mainSpent ?? 0) + (v80.hedgeSpent ?? 0)}
								{@const mainProfit = (v80.mainShares ?? 0) - totalCost}
								{@const hedgeProfit = (v80.hedgeShares ?? 0) - totalCost}
								<div class="pnl-divider"></div>
								<div class="v80-details">
									<div class="round-row">
										<span class="round-label">Main</span>
										<span class="round-value mono">
											<span class="direction-tag direction-{v80.mainDirection?.toLowerCase()}">{v80.mainDirection}</span>
											{v80.mainShares?.toFixed(1)} sh @ ${v80.mainAvgPrice?.toFixed(3)} = ${v80.mainSpent?.toFixed(2)}
										</span>
									</div>
									<div class="round-row">
										<span class="round-label">Hedge</span>
										<span class="round-value mono">
											<span class="direction-tag direction-{v80.hedgeDirection?.toLowerCase()}">{v80.hedgeDirection}</span>
											{v80.hedgeShares?.toFixed(1)} sh @ ${v80.hedgeAvgPrice?.toFixed(3)} = ${v80.hedgeSpent?.toFixed(2)}
										</span>
									</div>
									<div class="round-row">
										<span class="round-label">P&L Estimate</span>
										<span class="round-value">
											{#if mainProfit > 0 && hedgeProfit > 0}
												<span class="arb-badge arb-yes">Win either way</span>
											{:else if mainProfit > 0}
												<span class="arb-badge arb-main">Profit if main wins</span>
											{:else if hedgeProfit > 0}
												<span class="arb-badge arb-hedge">Profit if hedge wins</span>
											{:else}
												<span class="arb-badge arb-no">Loss either way</span>
											{/if}
											<span class="mono" style="margin-left:4px">{v80.buyCount} buys</span>
										</span>
									</div>
									<div class="round-row">
										<span class="round-label">{v80.mainDirection} wins</span>
										<span class="round-value mono" class:positive={mainProfit >= 0} class:negative={mainProfit < 0}>
											{mainProfit >= 0 ? '+' : ''}{mainProfit.toFixed(2)}
										</span>
									</div>
									<div class="round-row">
										<span class="round-label">{v80.hedgeDirection} wins</span>
										<span class="round-value mono" class:positive={hedgeProfit >= 0} class:negative={hedgeProfit < 0}>
											{hedgeProfit >= 0 ? '+' : ''}{hedgeProfit.toFixed(2)}
										</span>
									</div>
									<!-- Decision log (每个动作) -->
									{#if v80.decisionLog?.length > 0}
										<details class="pnl-details v80-log-details">
											<summary class="pnl-summary">
												<span class="pnl-total-label">Action Log ({v80.decisionLog.length})</span>
												<svg class="pnl-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
											</summary>
											<div class="v80-log-list">
												{#each v80.decisionLog as log}
													<div class="v80-log-item v80-log-{log.action?.startsWith('buy_filled') ? 'fill' : log.action?.startsWith('skip') || log.action?.startsWith('buy_no') ? 'skip' : 'info'}">
														<span class="v80-log-phase">[{log.phase}]</span>
														{#if log.remaining !== undefined}<span class="v80-log-remaining">{log.remaining}s</span>{/if}
														{#if log.action === 'buy_filled'}
															<span class="direction-tag direction-{log.direction?.toLowerCase()}">{log.direction}</span>
															<span class="mono">{log.shares?.toFixed(1)}sh @${log.price?.toFixed(3)} ${log.cost?.toFixed(2)}</span>
														{:else if log.action === 'buy_no_fill'}
															<span class="v80-log-skip">No fill {log.direction} (max ${log.maxPrice})</span>
														{:else if log.action === 'skip_price_too_high'}
															<span class="v80-log-skip">Price too high ${log.mainAsk?.toFixed(2)} > ${log.maxPrice}</span>
														{:else if log.action === 'direction_chosen'}
															<span class="v80-log-info">Direction: <span class="direction-tag direction-{log.direction?.toLowerCase()}">{log.direction}</span></span>
														{:else if log.action === 'direction_changed'}
															<span class="v80-log-warn">Direction changed: {log.from} → {log.to}</span>
														{:else if log.action === 'hedge_done'}
															<span class="v80-log-info">Hedge done: {log.hedgeShares?.toFixed(1)}sh ${log.hedgeSpent?.toFixed(2)}</span>
														{:else}
															<span class="v80-log-info">{log.action} {log.reason ?? ''}</span>
														{/if}
													</div>
												{/each}
											</div>
										</details>
									{/if}
								</div>
							{/if}
						{/if}

						<!-- P&L Breakdown for settled rounds -->
						{#if round.status === 'settled'}
							<div class="pnl-divider"></div>
							<details class="pnl-details">
								<summary class="pnl-summary">
									<span class="pnl-total-label">{t('btcUpdown.pnl.netProfit')}</span>
									<span class="pnl-summary-right">
										<span class="pnl-total-value" class:positive={(round.total_profit ?? 0) >= 0} class:negative={(round.total_profit ?? 0) < 0}>
											{fmtProfit(ctx, round.total_profit ?? 0)}
										</span>
										<svg class="pnl-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
									</span>
								</summary>
								<div class="pnl-section">
									<span class="pnl-title">{t('btcUpdown.pnl.title')}</span>
									<div class="pnl-row cost">
										<span class="pnl-label">{t('btcUpdown.pnl.entryCost')}</span>
										<span class="pnl-value">{fmtProfit(ctx, -(round.entry_cost ?? 0))}</span>
									</div>
									{#if (round.hedge_cost ?? 0) > 0}
										<div class="pnl-row cost">
											<span class="pnl-label">{t('btcUpdown.pnl.hedgeCost')}</span>
											<span class="pnl-value">{fmtProfit(ctx, -(round.hedge_cost ?? 0))}</span>
										</div>
									{/if}
									{#if (round.main_payout ?? 0) > 0}
										<div class="pnl-row income">
											<span class="pnl-label">{t('btcUpdown.pnl.mainPayout')}</span>
											<span class="pnl-value">{fmtProfit(ctx, round.main_payout ?? 0)}</span>
										</div>
									{/if}
									{#if (round.hedge_payout ?? 0) > 0}
										<div class="pnl-row income">
											<span class="pnl-label">{t('btcUpdown.pnl.hedgePayout')}</span>
											<span class="pnl-value">{fmtProfit(ctx, round.hedge_payout ?? 0)}</span>
										</div>
									{/if}
									{#if (round.hedge_sell_revenue ?? 0) > 0}
										<div class="pnl-row income">
											<span class="pnl-label">{t('btcUpdown.pnl.hedgeSellRevenue')}</span>
											<span class="pnl-value">{fmtProfit(ctx, round.hedge_sell_revenue ?? 0)}</span>
										</div>
									{/if}
									{#if (round.platform_fee ?? 0) > 0}
										<div class="pnl-row cost">
											<span class="pnl-label">{t('btcUpdown.pnl.platformFee')}</span>
											<span class="pnl-value">{fmtProfit(ctx, -(round.platform_fee ?? 0))}</span>
										</div>
									{/if}
									{#if round.hedge}
										<div class="pnl-row hedge-info">
											<span class="pnl-label">{t('btcUpdown.pnl.hedgeStatus')}</span>
											<span class="pnl-value">{round.hedge.direction} @ {formatCurrency(round.hedge.limit_price)} &middot; {getHedgeStatusLabel(t, round.hedge.status)}</span>
										</div>
									{/if}
								</div>
							</details>
						{:else if round.entry_cost !== null}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.cost')}</span>
								<span class="round-value mono">{formatCurrency(round.entry_cost)}</span>
							</div>
						{/if}
					</div>
				{:else if round.skip_reason}
					<div class="round-body">
						<p class="skip-reason">{getSkipReasonLabel(t, round.skip_reason)}</p>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if totalPages > 1}
		<div class="pagination">
			<button class="pagination-btn" disabled={roundsPage <= 1} onclick={() => onPageChange(Math.max(1, roundsPage - 1))}>
				{t('btcUpdown.pagination.prev')}
			</button>
			<span class="pagination-info">
				{t('btcUpdown.pagination.page', { page: String(roundsPage), total: String(totalPages) })}
			</span>
			<button class="pagination-btn" disabled={roundsPage >= totalPages} onclick={() => onPageChange(Math.min(totalPages, roundsPage + 1))}>
				{t('btcUpdown.pagination.next')}
			</button>
		</div>
	{/if}
{/if}

<style>
	/* Filter Bar */
	.filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}
	.filter-row {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	.filter-group {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.filter-sep {
		color: var(--fg-subtle);
		opacity: 0.3;
		font-size: var(--text-xs);
		user-select: none;
	}
	.filter-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.filter-btn:hover {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-muted);
	}
	.filter-btn.active {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-base);
	}
	.filter-count {
		margin-left: 4px;
		font-size: 10px;
		opacity: 0.6;
	}
	.refresh-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}
	.refresh-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-muted);
	}
	.refresh-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	/* Rounds List */
	.rounds-list {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
		transition: opacity var(--motion-fast) var(--easing);
	}
	.rounds-list.refreshing {
		opacity: 0.6;
		pointer-events: none;
	}
	.round-card {
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}
	.round-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.round-id-link {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--accent);
		font-family: var(--font-mono, ui-monospace, monospace);
		text-decoration: none;
	}
	.round-id-link:hover {
		text-decoration: underline;
	}
	.round-time-window {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		flex: 1;
	}
	.round-local-date {
		color: var(--fg-subtle);
		margin-right: var(--space-1);
	}
	.round-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		text-transform: uppercase;
	}
	.round-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.round-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.round-label {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}
	.round-value {
		font-size: var(--text-sm);
		color: var(--fg-base);
		font-weight: var(--weight-medium);
	}
	.round-value.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.entry-remaining {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
	}
	.skip-reason {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: 0;
		font-style: italic;
	}
	.direction-tag {
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.direction-up,
	.direction-down {
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.06);
	}
	/* Swing exit badges */
	.swing-exit-badge {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.swing-exit-stop_loss,
	.swing-exit-binance_stop_loss {
		background: rgba(248, 113, 113, 0.12);
		color: #f87171;
	}
	.swing-exit-take_profit {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}
	.swing-exit-checkpoint_mismatch {
		background: rgba(251, 191, 36, 0.12);
		color: #fbbf24;
	}
	/* Exit quality */
	.exit-quality-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.exit-quality-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.exit-correct {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}
	.exit-wrong {
		background: rgba(248, 113, 113, 0.12);
		color: #f87171;
	}
	/* P&L */
	.pnl-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin: var(--space-2) 0;
	}
	.pnl-details {
		border: none;
	}
	.pnl-details summary {
		list-style: none;
	}
	.pnl-details summary::-webkit-details-marker {
		display: none;
	}
	.pnl-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		padding: var(--space-1) 0;
	}
	.pnl-summary:hover {
		opacity: 0.85;
	}
	.pnl-summary-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.pnl-chevron {
		color: var(--fg-subtle);
		transition: transform var(--motion-fast) var(--easing);
	}
	.pnl-details[open] .pnl-chevron {
		transform: rotate(180deg);
	}
	.pnl-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-top: var(--space-2);
	}
	.pnl-title {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--space-1);
	}
	.pnl-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1px 0;
	}
	.pnl-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.pnl-value {
		font-size: var(--text-xs);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: var(--weight-medium);
	}
	.pnl-row.cost .pnl-value {
		color: #f87171;
	}
	.pnl-row.income .pnl-value {
		color: #34d399;
	}
	.pnl-row.hedge-info .pnl-value {
		color: #fbbf24;
		font-size: var(--text-xs);
	}
	.pnl-total-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
	}
	.pnl-total-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.positive {
		color: #34d399;
	}
	.negative {
		color: #f87171;
	}
	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		margin-top: var(--space-6);
	}
	.pagination-btn {
		padding: var(--space-2) var(--space-4);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.pagination-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-base);
	}
	.pagination-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.pagination-info {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	/* States */
	.loading-state {
		display: flex;
		justify-content: center;
		padding: var(--space-12);
	}
	.loading-dot {
		width: 8px;
		height: 8px;
		background: var(--fg-subtle);
		border-radius: 50%;
		animation: blink 1s ease-in-out infinite;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-12) var(--space-6);
		text-align: center;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		margin: 0 0 var(--space-2);
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: 0;
	}
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	/* Round badge classes (applied dynamically) */
	:global(.badge-win) {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}
	:global(.badge-loss) {
		background: rgba(248, 113, 113, 0.12);
		color: #f87171;
	}
	:global(.badge-skip) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-subtle);
	}
	:global(.badge-watching),
	:global(.badge-entered) {
		background: rgba(96, 165, 250, 0.12);
		color: #60a5fa;
	}
	@keyframes blink {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
	/* Light mode */
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .positive { color: #059669; }
	:global([data-theme='light']) .negative { color: #dc2626; }
	:global([data-theme='light']) .direction-up,
	:global([data-theme='light']) .direction-down {
		color: var(--fg-muted);
		background: rgba(0, 0, 0, 0.05);
	}
	:global([data-theme='light']) .filter-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme='light']) .filter-btn:hover { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme='light']) .filter-btn.active {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .pagination-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme='light']) .pagination-btn:hover:not(:disabled) { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme='light']) .pnl-divider { background: rgba(0, 0, 0, 0.06); }
	:global([data-theme='light']) .refresh-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme='light']) .refresh-btn:hover:not(:disabled) { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme='light']) .pnl-row.cost .pnl-value { color: #dc2626; }
	:global([data-theme='light']) .pnl-row.income .pnl-value { color: #059669; }
	:global([data-theme='light']) .pnl-row.hedge-info .pnl-value { color: #d97706; }
	:global([data-theme='light'] .badge-win) { background: rgba(16, 185, 129, 0.1); color: #059669; }
	:global([data-theme='light'] .badge-loss) { background: rgba(220, 38, 38, 0.1); color: #dc2626; }
	:global([data-theme='light'] .badge-skip) { background: rgba(0, 0, 0, 0.04); }
	:global([data-theme='light']) .exit-correct { background: rgba(16, 185, 129, 0.1); color: #059669; }
	:global([data-theme='light']) .exit-wrong { background: rgba(220, 38, 38, 0.1); color: #dc2626; }

	/* V80 dual-sweep */
	.v80-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 4px;
	}
	.arb-badge {
		font-size: var(--text-xs);
		padding: 1px 6px;
		border-radius: 4px;
		font-weight: var(--weight-medium);
	}
	.arb-yes { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.arb-main { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
	.arb-hedge { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
	.arb-no { background: rgba(248, 113, 113, 0.15); color: #f87171; }
	.v80-log-details { margin-top: 4px; }
	.v80-log-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 0;
		max-height: 300px;
		overflow-y: auto;
	}
	.v80-log-item {
		font-size: 11px;
		font-family: var(--font-mono, ui-monospace, monospace);
		padding: 2px 4px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}
	.v80-log-fill { background: rgba(52, 211, 153, 0.08); }
	.v80-log-skip { color: var(--fg-subtle); }
	.v80-log-info { color: var(--fg-muted); }
	.v80-log-phase {
		color: var(--fg-subtle);
		min-width: 56px;
	}
	.v80-log-warn { color: #fbbf24; }
	.v80-log-remaining { color: var(--fg-subtle); font-size: 10px; min-width: 28px; opacity: 0.6; }
</style>
