<script lang="ts">
	import type { HourlyStats } from '../types.js';
	import type { FormatterContext, TranslateFn } from '../types.js';
	import { fmtProfit, fmtPct, todayLocal } from '../formatters.js';
	import { HOURS_24 } from '../constants.js';
	import { fadeInUp } from '$lib/actions/fadeInUp';

	interface Props {
		hourlyData: HourlyStats[];
		filterDateFrom: string;
		selectedHour: number | null;
		ctx: FormatterContext;
		t: TranslateFn;
		titleKey?: string;
		onSelectHour?: (hour: number | null) => void;
	}

	let { hourlyData, filterDateFrom, selectedHour, ctx, t, titleKey, onSelectHour }: Props = $props();

	const maxAbs = $derived(Math.max(...hourlyData.map((h) => Math.abs(h.profit)), 1));
	const hourlyMap = $derived(new Map(hourlyData.map((h) => [h.hour, h])));
	const currentLocalHour = $derived(new Date().getHours());
	const isToday = $derived(filterDateFrom === todayLocal());
	const isPastDate = $derived(filterDateFrom < todayLocal());
</script>

<section class="hourly-chart glass-card" use:fadeInUp={{ delay: 50 }}>
	<h3 class="section-label">{t(titleKey ?? 'btcUpdown.chart.hourlyProfit')}</h3>
	{#each [[0, 12, 'AM'], [12, 24, 'PM']] as [start, end, label] (label)}
		<div class="chart-row">
			<span class="chart-row-label">{label}</span>
			<div class="chart-container">
				{#each HOURS_24.slice(start as number, end as number) as hour (hour)}
					{@const h = hourlyMap.get(hour)}
					{@const isFuture = isToday ? hour > currentLocalHour : !isPastDate}
					<div
						class="chart-col"
						class:chart-col-future={isFuture}
						class:chart-col-selected={selectedHour === hour}
						onclick={() => onSelectHour?.(selectedHour === hour ? null : hour)}
					>
						{#if h}
							<span
								class="chart-value"
								class:positive={h.profit >= 0}
								class:negative={h.profit < 0}
							>
								{fmtProfit(ctx, h.profit)}
							</span>
						{:else}
							<span class="chart-value chart-value-empty"></span>
						{/if}
						<div class="chart-bar-track">
							{#if h}
								<div
									class="chart-bar"
									class:bar-positive={h.profit >= 0}
									class:bar-negative={h.profit < 0}
									style="height: {Math.max((Math.abs(h.profit) / maxAbs) * 100, 4)}%"
								></div>
							{:else}
								<div class="chart-bar bar-empty"></div>
							{/if}
						</div>
						<span class="chart-hour">{String(hour).padStart(2, '0')}</span>
						{#if h}
							<span class="chart-meta-tip">{h.rounds}r · {fmtPct(ctx, h.winRate)}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
</section>

<style>
	.hourly-chart {
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
	.chart-row {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.chart-row-label {
		font-size: 9px;
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		opacity: 0.5;
		width: 20px;
		text-align: right;
		flex-shrink: 0;
		padding-bottom: 14px;
	}
	.chart-container {
		display: flex;
		align-items: flex-end;
		gap: var(--space-1);
		flex: 1;
		min-width: 0;
	}
	.chart-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		gap: 2px;
		padding-top: 32px;
		position: relative;
	}
	.chart-col-future {
		opacity: 0.25;
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
		height: 80px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.chart-bar {
		width: 70%;
		border-radius: 2px 2px 0 0;
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
	.chart-hour {
		font-size: 10px;
		color: var(--fg-secondary);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: 600;
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
		border-radius: var(--radius-sm, 4px);
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
	.chart-col-selected {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 6px;
	}
	.chart-col:has(.chart-bar) {
		cursor: pointer;
	}
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
	:global([data-theme='light']) .bar-positive {
		background: rgba(16, 185, 129, 0.85);
	}
	:global([data-theme='light']) .bar-negative {
		background: rgba(220, 38, 38, 0.85);
	}
	:global([data-theme='light']) .bar-empty {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .chart-col-selected {
		background: rgba(0, 0, 0, 0.05);
	}
</style>
