<script lang="ts">
	import type { Round, SSEEvent, ConnectionStatus } from '../types.js';
	import type { FormatterContext, TranslateFn } from '../types.js';
	import { fmtTime, fmtShortTime, fmtTimeWindow, fmtPrice, fmtProfit, formatCountdown } from '../formatters.js';
	import { getEventColorClass, getRoundStatusLabel, getRoundBadgeClass } from '../labels.js';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { fly } from 'svelte/transition';
	import { clock } from '../stores/clock.svelte.js';
	import { onMount } from 'svelte';

	interface Props {
		currentRound: Round | null;
		events: SSEEvent[];
		connectionStatus: ConnectionStatus;
		ctx: FormatterContext;
		t: TranslateFn;
		formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
		formatCurrency: (value: number) => string;
		getEventMessage: (event: SSEEvent) => string;
	}

	let {
		currentRound,
		events,
		connectionStatus,
		ctx,
		t,
		formatNumber,
		formatCurrency,
		getEventMessage
	}: Props = $props();

	// Subscribe to shared clock for countdown display
	onMount(() => clock.subscribe());

	const getEventTypeLabel = (type: string) => {
		const map: Record<string, string> = {
			round_start: 'btcUpdown.event.roundStart',
			entry: 'btcUpdown.event.entry',
			settlement: 'btcUpdown.event.settlement',
			exit_trigger: 'btcUpdown.event.exitTrigger',
			hedge_placed: 'btcUpdown.event.hedgePlaced',
			hedge_filled: 'btcUpdown.event.hedgeFilled',
			hedge_sold: 'btcUpdown.event.hedgeSold',
			hedge_expired: 'btcUpdown.event.hedgeExpired',
			round_skip: 'btcUpdown.event.roundSkip',
		};
		return map[type] ? t(map[type]) : type;
	};
</script>

<!-- Current Round -->
<section class="current-round glass-card" use:fadeInUp={{ delay: 100 }}>
	<h3 class="section-label">{t('btcUpdown.live.currentRound')}</h3>
	{#if currentRound}
		<div class="current-round-header">
			<a
				class="round-id-link"
				href="https://polymarket.com/event/{currentRound.market_slug}"
				target="_blank"
				rel="noopener noreferrer">#{currentRound.id}</a
			>
			<span class="round-time-window"
				>{fmtTimeWindow(ctx, currentRound.event_start_time, currentRound.end_time)}</span
			>
			<span class="round-badge {getRoundBadgeClass(currentRound)}"
				>{getRoundStatusLabel(t, currentRound)}</span
			>
		</div>
		{#if currentRound.entry_direction}
			<div class="current-round-body">
				<div class="round-row">
					<span class="round-label">{t('btcUpdown.round.direction')}</span>
					<span
						class="round-value direction-tag direction-{currentRound.entry_direction.toLowerCase()}"
						>{currentRound.entry_direction}</span
					>
				</div>
				{#if currentRound.entry_price_avg !== null}
					<div class="round-row">
						<span class="round-label">{t('btcUpdown.round.entryPrice')}</span>
						<span class="round-value mono">{fmtPrice(ctx, currentRound.entry_price_avg)}</span>
					</div>
				{/if}
				{#if currentRound.entry_shares !== null}
					<div class="round-row">
						<span class="round-label">{t('btcUpdown.round.shares')}</span>
						<span class="round-value mono"
							>{formatNumber(currentRound.entry_shares, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2
							})}</span
						>
					</div>
				{/if}
				{#if currentRound.entry_cost !== null}
					<div class="round-row">
						<span class="round-label">{t('btcUpdown.round.cost')}</span>
						<span class="round-value mono">{formatCurrency(currentRound.entry_cost)}</span>
					</div>
				{/if}
				{#if currentRound.entry_time}
					<div class="round-row">
						<span class="round-label">{t('btcUpdown.round.entryTime')}</span>
						<span class="round-value mono">{fmtShortTime(ctx, currentRound.entry_time)}</span>
					</div>
				{/if}
			</div>
		{:else}
			<p class="current-round-waiting">{t('btcUpdown.live.noActiveRoundDesc')}</p>
		{/if}
		<div class="round-row" style="margin-top: var(--space-2);">
			<span class="round-label">{t('btcUpdown.round.countdown')}</span>
			<span class="round-value mono countdown-value"
				>{formatCountdown(currentRound.end_time, clock.now)}</span
			>
		</div>
	{:else}
		<p class="current-round-waiting">{t('btcUpdown.live.noActiveRound')}</p>
	{/if}
</section>

{#if connectionStatus === 'connected'}
	<div class="scan-status">
		<span class="scan-dot"></span>
		<span class="scan-text">{t('btcUpdown.listening')}</span>
	</div>
{/if}

<section class="events-feed">
	{#if events.length === 0}
		<div class="empty-state" use:fadeInUp={{ delay: 150 }}>
			<div class="empty-icon scanning">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
				</svg>
			</div>
			<h3 class="empty-title">{t('btcUpdown.noEvents')}</h3>
			<p class="empty-desc">{t('btcUpdown.noEventsDesc')}</p>
		</div>
	{:else}
		<div class="events-grid">
			{#each events as event (event.id)}
				<div in:fly={{ y: -24, duration: 350 }}>
					<div class="event-card glass-card">
						<div class="card-header">
							<span class="card-time">{fmtTime(ctx, event.timestamp)}</span>
							<span class="card-type-badge {getEventColorClass(event.type)}-badge">
								{getEventTypeLabel(event.type)}
							</span>
						</div>
						<p class="event-message">{getEventMessage(event)}</p>

						{#if event.type === 'settlement'}
							{@const won = event.data.won}
							{@const profit = event.data.totalProfit as number}
							<div class="settlement-result" class:win={won} class:loss={!won}>
								<span class="settlement-label"
									>{won ? t('btcUpdown.round.win') : t('btcUpdown.round.loss')}</span
								>
								<span class="settlement-profit">{fmtProfit(ctx, profit)}</span>
							</div>
						{/if}

						{#if event.type === 'entry'}
							<div class="entry-details">
								<span
									class="direction-tag direction-{(
										(event.data.direction as string) ?? ''
									).toLowerCase()}">{event.data.direction}</span
								>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.current-round {
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		margin-bottom: var(--space-5);
	}
	.section-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-3);
	}
	.current-round-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.current-round-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.current-round-waiting {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: 0;
		font-style: italic;
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
	.countdown-value {
		color: #60a5fa;
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
	.round-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		text-transform: uppercase;
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
	/* Scan status */
	.scan-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.scan-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #34d399;
		animation: breathe 2.5s ease-in-out infinite;
	}
	.scan-text {
		opacity: 0.6;
	}
	/* Events */
	.events-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}
	.event-card {
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}
	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.card-time {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.card-type-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.event-green-badge {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}
	.event-blue-badge {
		background: rgba(96, 165, 250, 0.12);
		color: #60a5fa;
	}
	.event-amber-badge {
		background: rgba(251, 191, 36, 0.12);
		color: #fbbf24;
	}
	.event-gray-badge {
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-subtle);
	}
	.event-settlement-badge {
		background: rgba(168, 85, 247, 0.12);
		color: #a855f7;
	}
	.event-message {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
		word-break: break-word;
	}
	.settlement-result {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.settlement-result.win {
		background: rgba(52, 211, 153, 0.1);
	}
	.settlement-result.loss {
		background: rgba(248, 113, 113, 0.1);
	}
	.settlement-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		text-transform: uppercase;
	}
	.settlement-result.win .settlement-label,
	.settlement-result.win .settlement-profit {
		color: #34d399;
	}
	.settlement-result.loss .settlement-label,
	.settlement-result.loss .settlement-profit {
		color: #f87171;
	}
	.settlement-profit {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
	}
	.entry-details {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-12) var(--space-6);
		text-align: center;
	}
	.empty-icon {
		color: var(--fg-faint);
		margin-bottom: var(--space-4);
	}
	.empty-icon.scanning {
		animation: breathe 2.5s ease-in-out infinite;
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
	/* Badges */
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
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	@keyframes breathe {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.7;
		}
	}
	/* Light mode */
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .direction-up,
	:global([data-theme='light']) .direction-down {
		color: var(--fg-muted);
		background: rgba(0, 0, 0, 0.05);
	}
	:global([data-theme='light']) .scan-dot {
		background: #059669;
	}
	:global([data-theme='light']) .event-green-badge {
		background: rgba(16, 185, 129, 0.1);
		color: #059669;
	}
	:global([data-theme='light']) .event-amber-badge {
		background: rgba(217, 119, 6, 0.1);
		color: #d97706;
	}
	:global([data-theme='light']) .event-settlement-badge {
		background: rgba(147, 51, 234, 0.1);
		color: #9333ea;
	}
	:global([data-theme='light']) .event-gray-badge {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .settlement-result.win {
		background: rgba(16, 185, 129, 0.08);
	}
	:global([data-theme='light']) .settlement-result.win .settlement-label,
	:global([data-theme='light']) .settlement-result.win .settlement-profit {
		color: #059669;
	}
	:global([data-theme='light']) .settlement-result.loss {
		background: rgba(220, 38, 38, 0.08);
	}
	:global([data-theme='light']) .settlement-result.loss .settlement-label,
	:global([data-theme='light']) .settlement-result.loss .settlement-profit {
		color: #dc2626;
	}
	:global([data-theme='light'] .badge-win) {
		background: rgba(16, 185, 129, 0.1);
		color: #059669;
	}
	:global([data-theme='light'] .badge-loss) {
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
	}
	:global([data-theme='light'] .badge-skip) {
		background: rgba(0, 0, 0, 0.04);
	}
</style>
