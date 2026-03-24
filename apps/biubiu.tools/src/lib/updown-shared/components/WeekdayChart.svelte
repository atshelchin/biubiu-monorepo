<script lang="ts">
	import type { DailyStat } from '../types.js';
	import type { FormatterContext, TranslateFn } from '../types.js';
	import { fmtProfit, fmtPct } from '../formatters.js';
	import { fadeInUp } from '$lib/actions/fadeInUp';

	interface Props {
		dailyData: DailyStat[];
		ctx: FormatterContext;
		t: TranslateFn;
	}

	let { dailyData, ctx, t }: Props = $props();

	/** Map day-of-week index to short label key: 0=Mon ... 6=Sun */
	const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

	interface WeekdayAgg {
		day: number;
		rounds: number;
		wins: number;
		losses: number;
		profit: number;
	}

	/** Aggregate daily data by day-of-week (ISO: Mon=0 ... Sun=6) */
	const weekdayStats = $derived.by(() => {
		const agg = Array.from({ length: 7 }, (_, i) => ({
			day: i,
			dayCount: 0,
			rounds: 0,
			wins: 0,
			losses: 0,
			profit: 0
		}));

		for (const d of dailyData) {
			// d.date is "YYYY-MM-DD", parse as local date
			const date = new Date(d.date + 'T12:00:00');
			// JS getDay: 0=Sun,1=Mon...6=Sat → convert to ISO: Mon=0...Sun=6
			const jsDay = date.getDay();
			const isoDay = jsDay === 0 ? 6 : jsDay - 1;
			agg[isoDay].dayCount += 1;
			agg[isoDay].rounds += d.rounds;
			agg[isoDay].wins += d.wins;
			agg[isoDay].losses += d.losses;
			agg[isoDay].profit += d.profit;
		}

		return agg;
	});

	const maxAbs = $derived(Math.max(...weekdayStats.map((w) => Math.abs(w.profit)), 1));

	const hasData = $derived(weekdayStats.some((w) => w.rounds > 0));
</script>

<section class="weekday-chart glass-card" use:fadeInUp={{ delay: 30 }}>
	<h3 class="section-label">{t('btcUpdown.chart.weekdayProfit')}</h3>
	{#if hasData}
		<div class="chart-container">
			{#each weekdayStats as w, i (i)}
				{@const winRate = w.wins + w.losses > 0 ? w.wins / (w.wins + w.losses) : 0}
				{@const isWeekend = i >= 5}
				<div class="chart-col" class:chart-col-weekend={isWeekend}>
					{#if w.rounds > 0}
						<span
							class="chart-value"
							class:positive={w.profit >= 0}
							class:negative={w.profit < 0}
						>
							{fmtProfit(ctx, w.profit)}
						</span>
					{:else}
						<span class="chart-value chart-value-empty"></span>
					{/if}
					<div class="chart-bar-track">
						{#if w.rounds > 0}
							<div
								class="chart-bar"
								class:bar-positive={w.profit >= 0}
								class:bar-negative={w.profit < 0}
								style="height: {Math.max((Math.abs(w.profit) / maxAbs) * 100, 4)}%"
							></div>
						{:else}
							<div class="chart-bar bar-empty"></div>
						{/if}
					</div>
					<span class="chart-day">{t(`btcUpdown.chart.weekday.${WEEKDAY_KEYS[i]}`)}</span>
					{#if w.rounds > 0}
						<span class="chart-meta-tip">
							{w.dayCount}d · {w.rounds}r · {fmtPct(ctx, winRate)}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="chart-empty">
			<span class="chart-empty-text">{t('btcUpdown.noRounds')}</span>
		</div>
	{/if}
</section>

<style>
	.weekday-chart {
		padding: var(--space-5);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-4);
	}
	.section-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-3);
	}
	.chart-container {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.chart-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		gap: 2px;
		padding-top: 28px;
		position: relative;
		cursor: pointer;
	}
	.chart-col-weekend {
		border-left: 1px solid rgba(255, 255, 255, 0.06);
		padding-left: var(--space-1);
	}
	:global([data-theme='light']) .chart-col-weekend {
		border-left-color: rgba(0, 0, 0, 0.06);
	}
	.chart-value {
		position: absolute;
		top: 2px;
		left: 50%;
		font-size: 10px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: 700;
		white-space: nowrap;
		transform: translateX(-50%) rotate(-40deg);
		transform-origin: center center;
	}
	.chart-value.positive {
		color: #22c55e;
	}
	.chart-value.negative {
		color: #ef4444;
	}
	.chart-value-empty {
		display: none;
	}
	.chart-bar-track {
		width: 100%;
		height: 100px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.chart-bar {
		width: 60%;
		border-radius: 3px 3px 0 0;
		min-height: 4px;
		transition: height 0.3s ease;
	}
	.bar-positive {
		background: rgba(34, 197, 94, 0.9);
	}
	.bar-negative {
		background: rgba(239, 68, 68, 0.9);
	}
	.bar-empty {
		height: 2px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 1px;
	}
	.chart-day {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.chart-meta-tip {
		position: absolute;
		bottom: -24px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		font-family: var(--font-mono, ui-monospace, monospace);
		color: var(--fg-base);
		background: var(--bg-elevated, var(--bg-raised));
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--motion-fast, 150ms) ease;
		z-index: 10;
		box-shadow: var(--shadow-sm);
	}
	.chart-col:hover .chart-meta-tip {
		opacity: 1;
	}
	.chart-empty {
		padding: var(--space-8) 0;
		text-align: center;
	}
	.chart-empty-text {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	/* Light theme overrides */
	:global([data-theme='light']) .bar-positive {
		background: rgba(16, 185, 129, 0.85);
	}
	:global([data-theme='light']) .bar-negative {
		background: rgba(220, 38, 38, 0.85);
	}
	:global([data-theme='light']) .bar-empty {
		background: rgba(0, 0, 0, 0.04);
	}

	/* Glass card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
</style>
