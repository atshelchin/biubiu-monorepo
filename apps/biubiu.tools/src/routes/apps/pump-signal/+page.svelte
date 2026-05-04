<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser, dev } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';
	import { fly } from 'svelte/transition';

	const SSE_STRONG_URL = dev
		? 'http://localhost:8787/sse'
		: 'https://cf-worker-binance-scanner.atshelchin.workers.dev/sse';
	// TODO: replace with real endpoint
	const SSE_REALTIME_URL = dev
		? 'http://localhost:8787/sse/early'
		: 'https://cf-worker-binance-scanner.atshelchin.workers.dev/sse/early';
	const MAX_EVENTS = 100;

	type TabType = 'realtime' | 'strong';

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

	type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

	// Reactive state (drives UI)
	let activeTab = $state<TabType>('realtime');
	let channelEvents = $state<Record<TabType, SSEEvent[]>>({ realtime: [], strong: [] });
	let channelStatus = $state<Record<TabType, ConnectionStatus>>({ realtime: 'disconnected', strong: 'disconnected' });

	// Non-reactive refs (connection internals, should NOT be in $state)
	const connRefs: Record<TabType, { es: EventSource | null; timer: ReturnType<typeof setTimeout> | null; counter: number }> = {
		realtime: { es: null, timer: null, counter: 0 },
		strong: { es: null, timer: null, counter: 0 },
	};

	const currentEvents = $derived(channelEvents[activeTab]);
	const connectionStatus = $derived(channelStatus[activeTab]);

	const seoProps = $derived(
		getBaseSEO({
			title: t('pumpSignal.title'),
			description: t('pumpSignal.description'),
			currentLocale: locale.value,
		})
	);

	function getSseLang(): string {
		return 'en';
	}

	function getBaseUrl(tab: TabType): string {
		return tab === 'realtime' ? SSE_REALTIME_URL : SSE_STRONG_URL;
	}

	function addEvent(tab: TabType, event: SSEEvent) {
		channelEvents[tab] = [event, ...channelEvents[tab]].slice(0, MAX_EVENTS);
	}

	function connectChannel(tab: TabType) {
		const ref = connRefs[tab];
		if (ref.es) {
			ref.es.close();
			ref.es = null;
		}
		if (ref.timer) {
			clearTimeout(ref.timer);
			ref.timer = null;
		}

		channelStatus[tab] = channelStatus[tab] === 'disconnected' ? 'connecting' : 'reconnecting';

		const url = `${getBaseUrl(tab)}?lang=${getSseLang()}`;
		const es = new EventSource(url);
		ref.es = es;

		es.onopen = () => {
			channelStatus[tab] = 'connected';
		};

		const signalEventType = tab === 'realtime' ? 'early_signal' : 'signal';

		es.addEventListener(signalEventType, (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				addEvent(tab, {
					id: `${tab}-signal-${++ref.counter}`,
					type: 'signal',
					timestamp: data.timestamp,
					signals: data.earlySignals ?? data.signals,
					_formatted: data._formatted,
				});
			} catch {
				// ignore parse errors
			}
		});

		es.addEventListener('ad', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				addEvent(tab, {
					id: `${tab}-ad-${++ref.counter}`,
					type: 'ad',
					timestamp: data.timestamp,
					ad: data.ad,
					_formatted: data._formatted,
				});
			} catch {
				// ignore parse errors
			}
		});

		es.onerror = () => {
			channelStatus[tab] = 'disconnected';
			ref.es?.close();
			ref.es = null;
			ref.timer = setTimeout(() => {
				ref.timer = null;
				connectChannel(tab);
			}, 3000);
		};
	}

	function disconnectChannel(tab: TabType) {
		const ref = connRefs[tab];
		if (ref.timer) {
			clearTimeout(ref.timer);
			ref.timer = null;
		}
		if (ref.es) {
			ref.es.close();
			ref.es = null;
		}
		channelStatus[tab] = 'disconnected';
	}

	// Connect both channels on mount, reconnect on locale change
	$effect(() => {
		if (browser) {
			const _lang = getSseLang();
			untrack(() => {
				connectChannel('realtime');
				connectChannel('strong');
			});
		}
	});

	onDestroy(() => {
		disconnectChannel('realtime');
		disconnectChannel('strong');
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

	function getBinanceTradeUrl(symbol: string): string {
		return `https://www.binance.com/en/trade/${symbol.replace('USDT', '_USDT')}`;
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

	<!-- Tab Switcher -->
	<div class="tab-switcher" use:fadeInUp={{ delay: 25 }}>
		<button
			class="tab-btn"
			class:active={activeTab === 'realtime'}
			onclick={() => (activeTab = 'realtime')}
		>
			{t('pumpSignal.tabRealtime')}
			{#if channelEvents.realtime.length > 0}
				<span class="tab-count">{channelEvents.realtime.length}</span>
			{/if}
		</button>
		<button
			class="tab-btn"
			class:active={activeTab === 'strong'}
			onclick={() => (activeTab = 'strong')}
		>
			{t('pumpSignal.tabStrong')}
			{#if channelEvents.strong.length > 0}
				<span class="tab-count">{channelEvents.strong.length}</span>
			{/if}
		</button>
	</div>

	<!-- Scan Status -->
	{#if connectionStatus === 'connected'}
		<div class="scan-status">
			<span class="scan-dot"></span>
			<span class="scan-text">{t('pumpSignal.scanning')}</span>
		</div>
	{/if}

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

	<!-- Events Feed -->
	<section class="events-feed">
		{#if currentEvents.length === 0}
			<div class="empty-state" use:fadeInUp={{ delay: 100 }}>
				<div class="empty-icon scanning">
					<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
					</svg>
				</div>
				<h3 class="empty-title">{t('pumpSignal.noEvents')}</h3>
				<p class="empty-desc">{t('pumpSignal.noEventsDesc')}</p>
			</div>
		{:else}
			<div class="events-grid">
				{#each currentEvents as event (event.id)}
					<div in:fly={{ y: -24, duration: 350 }}>
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
												<a href={getBinanceTradeUrl(signal.symbol)} target="_blank" rel="noopener noreferrer" class="signal-symbol">{signal.symbol}</a>
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
							{@const ad = event.ad['en']}
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
					</div>
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

	/* Tab Switcher */
	.tab-switcher {
		display: flex;
		gap: var(--space-1);
		padding: 3px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-5);
	}

	.tab-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.tab-btn:hover {
		color: var(--fg-muted);
	}

	.tab-btn.active {
		background: rgba(255, 255, 255, 0.08);
		color: var(--fg-base);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
	}

	.tab-count {
		font-size: var(--text-xs);
		padding: 0 6px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.08);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		line-height: 1.6;
	}

	.tab-btn.active .tab-count {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
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
		animation: breathe 2.5s ease-in-out infinite;
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

	/* Scan Status */
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

	.empty-icon.scanning {
		animation: breathe 2.5s ease-in-out infinite;
	}

	@keyframes breathe {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 0.7; }
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
		grid-template-columns: 1fr;
		gap: var(--space-6);
	}

	/* Event Card */
	.event-card {
		border-radius: var(--radius-lg);
		padding: var(--space-4);
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
		text-decoration: none;
	}

	.signal-symbol:hover {
		text-decoration: underline;
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

	/* Light mode overrides */
	:global([data-theme="light"]) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	:global([data-theme="light"]) .tab-switcher {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.08);
	}

	:global([data-theme="light"]) .tab-btn.active {
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
	}

	:global([data-theme="light"]) .tab-count {
		background: rgba(0, 0, 0, 0.06);
	}

	:global([data-theme="light"]) .tab-btn.active .tab-count {
		background: rgba(16, 185, 129, 0.12);
		color: #059669;
	}

	:global([data-theme="light"]) .signal-score {
		color: #059669;
	}

	:global([data-theme="light"]) .signal-badge {
		background: rgba(16, 185, 129, 0.1);
		color: #059669;
	}

	:global([data-theme="light"]) .signal-change.positive {
		color: #059669;
	}

	:global([data-theme="light"]) .signal-change.negative {
		color: #dc2626;
	}

	:global([data-theme="light"]) .volume-spike {
		color: #d97706;
	}

	:global([data-theme="light"]) .status-connected {
		border-color: rgba(16, 185, 129, 0.3);
		color: #059669;
		background: rgba(16, 185, 129, 0.06);
	}

	:global([data-theme="light"]) .status-connected .status-dot,
	:global([data-theme="light"]) .scan-dot {
		background: #059669;
	}

	:global([data-theme="light"]) .signal-item + .signal-item {
		border-top-color: rgba(0, 0, 0, 0.06);
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
