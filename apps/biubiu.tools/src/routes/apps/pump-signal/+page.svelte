<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser, dev } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';

	const SSE_BASE_URL = dev
		? 'http://localhost:8787/sse'
		: 'https://cf-worker-binance-scanner.atshelchin.workers.dev/sse';
	const MAX_EVENTS = 100;

	// Types
	interface PumpSignal {
		symbol: string;
		lastPrice: string;
		change1m: number;
		change5m: number;
		volume1m: number;
		avgVolumePerMin5m: number;
		volumeMultiplier: number;
		score: number;
	}

	interface SignalEvent {
		id: string;
		type: 'signal';
		timestamp: number;
		signals: PumpSignal[];
		_formatted: string;
	}

	interface AdEvent {
		id: string;
		type: 'ad';
		timestamp: number;
		ad: {
			zh: { title: string; body: string; url: string };
			en: { title: string; body: string; url: string };
		};
		_formatted: string;
	}

	type SSEEvent = SignalEvent | AdEvent;

	// State
	let events = $state<SSEEvent[]>([]);
	let connectionStatus = $state<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
	let eventSource: EventSource | null = null;
	let eventCounter = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const seoProps = $derived(
		getBaseSEO({
			title: t('pumpSignal.title'),
			description: t('pumpSignal.description'),
			currentLocale: locale.value,
		})
	);

	function getSseLang(): string {
		return locale.value === 'zh' ? 'zh' : 'en';
	}

	function addEvent(event: SSEEvent) {
		events = [event, ...events].slice(0, MAX_EVENTS);
	}

	function connect() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		connectionStatus = connectionStatus === 'disconnected' ? 'connecting' : 'reconnecting';

		const url = `${SSE_BASE_URL}?lang=${getSseLang()}`;
		eventSource = new EventSource(url);

		eventSource.onopen = () => {
			connectionStatus = 'connected';
		};

		eventSource.addEventListener('signal', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				addEvent({
					id: `signal-${++eventCounter}`,
					type: 'signal',
					timestamp: data.timestamp,
					signals: data.signals,
					_formatted: data._formatted,
				});
			} catch {
				// ignore parse errors
			}
		});

		eventSource.addEventListener('ad', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				addEvent({
					id: `ad-${++eventCounter}`,
					type: 'ad',
					timestamp: data.timestamp,
					ad: data.ad,
					_formatted: data._formatted,
				});
			} catch {
				// ignore parse errors
			}
		});

		eventSource.onerror = () => {
			connectionStatus = 'disconnected';
			eventSource?.close();
			eventSource = null;
			// Auto-reconnect after 3s
			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				connect();
			}, 3000);
		};
	}

	function disconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		connectionStatus = 'disconnected';
	}

	// Connect on mount, reconnect on locale change
	$effect(() => {
		if (browser) {
			const _lang = getSseLang(); // track locale reactively
			untrack(() => connect());
		}
	});

	onDestroy(() => {
		disconnect();
	});

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString();
	}

	function formatChange(value: number): string {
		const sign = value >= 0 ? '+' : '';
		return `${sign}${value.toFixed(2)}%`;
	}

	function formatVolume(value: number): string {
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return value.toFixed(0);
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header -->
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<div class="title-row">
			<h1 class="page-title">{t('pumpSignal.title')}</h1>
			<div class="status-badge status-{connectionStatus}">
				<span class="status-dot"></span>
				{#if connectionStatus === 'connected'}
					{t('pumpSignal.connected')}
				{:else if connectionStatus === 'connecting'}
					{t('pumpSignal.connecting')}
				{:else if connectionStatus === 'reconnecting'}
					{t('pumpSignal.reconnecting')}
				{:else}
					{t('pumpSignal.disconnected')}
				{/if}
			</div>
		</div>
		<p class="page-description">{t('pumpSignal.description')}</p>
	</section>

	<!-- Telegram Bot Banner -->
	<a
		href="https://t.me/BinancePumpSignalScannerBot"
		target="_blank"
		rel="noopener noreferrer"
		class="telegram-banner glass-card"
		use:fadeInUp={{ delay: 50 }}
	>
		<div class="telegram-icon">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
				<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
			</svg>
		</div>
		<div class="telegram-text">
			<span class="telegram-title">{t('pumpSignal.telegramBot')}</span>
			<span class="telegram-desc">{t('pumpSignal.telegramBotDesc')}</span>
		</div>
		<svg class="telegram-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="7" y1="17" x2="17" y2="7" />
			<polyline points="7 7 17 7 17 17" />
		</svg>
	</a>

	<!-- Event Counter -->
	{#if events.length > 0}
		<div class="event-counter" use:fadeInUp={{ delay: 100 }}>
			<span>{events.length} {t('pumpSignal.events')}</span>
		</div>
	{/if}

	<!-- Events Feed -->
	<section class="events-feed">
		{#if events.length === 0}
			<div class="empty-state" use:fadeInUp={{ delay: 100 }}>
				<div class="empty-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
					</svg>
				</div>
				<h3 class="empty-title">{t('pumpSignal.noEvents')}</h3>
				<p class="empty-desc">{t('pumpSignal.noEventsDesc')}</p>
			</div>
		{:else}
			<div class="events-grid">
				{#each events as event (event.id)}
					{#if event.type === 'signal'}
						<div class="event-card glass-card signal-card">
							<div class="card-header">
								<span class="card-time">{formatTime(event.timestamp)}</span>
								<span class="card-type-badge signal-badge">{t('pumpSignal.score')}</span>
							</div>
							<div class="signals-list">
								{#each event.signals as signal}
									<div class="signal-item">
										<div class="signal-top">
											<span class="signal-symbol">{signal.symbol}</span>
											<span class="signal-score">{signal.score.toFixed(1)}</span>
										</div>
										<div class="signal-details">
											<span class="signal-price">${signal.lastPrice}</span>
											<span class="signal-change" class:positive={signal.change1m >= 0} class:negative={signal.change1m < 0}>
												{t('pumpSignal.change1m')} {formatChange(signal.change1m)}
											</span>
											<span class="signal-change" class:positive={signal.change5m >= 0} class:negative={signal.change5m < 0}>
												{t('pumpSignal.change5m')} {formatChange(signal.change5m)}
											</span>
										</div>
										<div class="signal-volume">
											<span class="volume-label">{t('pumpSignal.volume')} {formatVolume(signal.volume1m)}</span>
											<span class="volume-spike">{t('pumpSignal.volumeSpike')} {signal.volumeMultiplier.toFixed(1)}x</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						{@const ad = event.ad[getSseLang() as 'zh' | 'en']}
						<div class="event-card glass-card ad-card">
							<div class="card-header">
								<span class="card-time">{formatTime(event.timestamp)}</span>
								<span class="card-type-badge ad-badge">{t('pumpSignal.ad')}</span>
							</div>
							<div class="ad-content">
								<h4 class="ad-title">{ad.title}</h4>
								<p class="ad-body">{ad.body}</p>
								{#if ad.url}
									<a href={ad.url} target="_blank" rel="noopener noreferrer" class="ad-link">
										{ad.url}
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<line x1="7" y1="17" x2="17" y2="7" />
											<polyline points="7 7 17 7 17 17" />
										</svg>
									</a>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
</main>

<PageFooter />

<style>
	main.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

	/* Header */
	.page-header {
		margin-bottom: var(--space-6);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}

	.page-title {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		line-height: 1.2;
	}

	.page-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: 0;
	}

	/* Status Badge */
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		border: 1px solid;
		flex-shrink: 0;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.status-connected {
		border-color: rgba(52, 211, 153, 0.3);
		color: #34d399;
		background: rgba(52, 211, 153, 0.08);
	}

	.status-connected .status-dot {
		background: #34d399;
	}

	.status-connecting,
	.status-reconnecting {
		border-color: rgba(251, 191, 36, 0.3);
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.08);
	}

	.status-connecting .status-dot,
	.status-reconnecting .status-dot {
		background: #fbbf24;
		animation: blink 1s ease-in-out infinite;
	}

	.status-disconnected {
		border-color: rgba(248, 113, 113, 0.3);
		color: #f87171;
		background: rgba(248, 113, 113, 0.08);
	}

	.status-disconnected .status-dot {
		background: #f87171;
	}

	@keyframes blink {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}

	/* Telegram Banner */
	.telegram-banner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		text-decoration: none;
		margin-bottom: var(--space-6);
		transition: all var(--motion-fast) var(--easing);
	}

	.telegram-banner:hover {
		transform: translateY(-1px);
		background: rgba(255, 255, 255, 0.08);
	}

	.telegram-icon {
		color: #29b6f6;
		flex-shrink: 0;
	}

	.telegram-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.telegram-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.telegram-desc {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.telegram-arrow {
		color: var(--fg-subtle);
		flex-shrink: 0;
	}

	/* Event Counter */
	.event-counter {
		display: flex;
		align-items: center;
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	/* Empty State */
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

	/* Events Grid */
	.events-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--space-4);
	}

	/* Event Card */
	.event-card {
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		animation: cardFadeIn 0.3s var(--easing);
	}

	@keyframes cardFadeIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
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

	.signal-badge {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}

	.ad-badge {
		background: rgba(96, 165, 250, 0.12);
		color: #60a5fa;
	}

	/* Signal Items */
	.signals-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.signal-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.signal-item + .signal-item {
		padding-top: var(--space-3);
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.signal-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.signal-symbol {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.signal-score {
		font-size: var(--text-lg);
		font-weight: var(--weight-bold);
		color: #34d399;
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.signal-details {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.signal-price {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.signal-change {
		font-size: var(--text-xs);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.signal-change.positive {
		color: #34d399;
	}

	.signal-change.negative {
		color: #f87171;
	}

	.signal-volume {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.volume-label,
	.volume-spike {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.volume-spike {
		color: #fbbf24;
	}

	/* Ad Card */
	.ad-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.ad-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.ad-body {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
	}

	.ad-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ad-link:hover {
		text-decoration: underline;
	}

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}

		.page-title {
			font-size: var(--text-2xl);
		}

		.events-grid {
			grid-template-columns: 1fr;
		}

		.telegram-banner {
			padding: var(--space-3) var(--space-4);
		}
	}
</style>
