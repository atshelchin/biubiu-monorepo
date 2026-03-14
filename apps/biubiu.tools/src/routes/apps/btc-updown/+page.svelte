<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';
	import { fly } from 'svelte/transition';

	const API_BASE = 'https://bitcoin-up-or-down-5mins-001.awesometools.dev';
	const SSE_URL = `${API_BASE}/api/sse/live`;
	const MAX_EVENTS = 50;
	const ET_TZ = 'America/New_York';

	// --- Types ---

	type TabType = 'live' | 'history';
	type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
	type RoundStatusFilter = '' | 'entered' | 'settled' | 'skipped';

	interface SSEEvent {
		id: string;
		type: string;
		timestamp: string;
		data: Record<string, unknown>;
	}

	interface Stats {
		totalRounds: number;
		entered: number;
		skipped: number;
		wins: number;
		losses: number;
		winRate: number;
		totalInvested: number;
		totalHedgeCost: number;
		totalPayout: number;
		totalFees: number;
		totalProfit: number;
		avgProfit: number;
		bestRound: number;
		worstRound: number;
		currentStreak: number;
		maxWinStreak: number;
		maxLoseStreak: number;
		hedgeFills: number;
		hedgeSellRevenue: number;
	}

	interface RoundHedge {
		direction: string;
		status: string;
		limit_price: number;
		target_shares: number;
		filled_at: string | null;
		sell_price_avg: number | null;
		sell_revenue: number | null;
		sold_at: string | null;
	}

	interface Round {
		id: number;
		market_slug: string;
		status: string;
		entry_direction: string | null;
		entry_price_avg: number | null;
		entry_shares: number | null;
		entry_cost: number | null;
		entry_time: string | null;
		entry_remaining: number | null;
		outcome: string | null;
		main_payout: number | null;
		hedge_cost: number | null;
		hedge_payout: number | null;
		hedge_sell_revenue: number | null;
		platform_fee: number | null;
		total_profit: number | null;
		skip_reason: string | null;
		event_start_time: string;
		end_time: string;
		created_at: string;
		settled_at: string | null;
		hedge: RoundHedge | null;
	}

	interface CurrentRoundResponse {
		round: Round | null;
		fills?: unknown[];
		snapshots?: unknown[];
		hedge?: unknown;
	}

	interface RoundsResponse {
		rows: Round[];
		total: number;
		page: number;
		pageSize: number;
	}

	// --- Reactive State ---

	let activeTab = $state<TabType>('live');
	let connectionStatus = $state<ConnectionStatus>('disconnected');
	let events = $state<SSEEvent[]>([]);
	let stats = $state<Stats | null>(null);
	let currentRound = $state<Round | null>(null);
	let strategyStartTime = $state<string | null>(null);
	let now = $state(Date.now());

	// History tab state
	let rounds = $state<Round[]>([]);
	let roundsTotal = $state(0);
	let roundsPage = $state(1);
	let roundsPageSize = 10;
	let roundsFilter = $state<RoundStatusFilter>('');
	let roundsLoading = $state(false);

	// Time range filter
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterMin = $state(''); // earliest round time (for min attr)

	// Non-reactive connection refs
	const connRef: { es: EventSource | null; timer: ReturnType<typeof setTimeout> | null; counter: number } = {
		es: null,
		timer: null,
		counter: 0,
	};

	const totalPages = $derived(Math.max(1, Math.ceil(roundsTotal / roundsPageSize)));

	const seoProps = $derived(
		getBaseSEO({
			title: t('btcUpdown.title'),
			description: t('btcUpdown.description'),
			currentLocale: locale.value,
		})
	);

	// --- SSE Connection ---

	function connectSSE() {
		if (connRef.es) {
			connRef.es.close();
			connRef.es = null;
		}
		if (connRef.timer) {
			clearTimeout(connRef.timer);
			connRef.timer = null;
		}

		connectionStatus = connectionStatus === 'disconnected' ? 'connecting' : 'reconnecting';

		const es = new EventSource(SSE_URL);
		connRef.es = es;

		es.onopen = () => {
			connectionStatus = 'connected';
		};

		const eventTypes = [
			'round_start', 'waiting_for_window', 'window_check', 'window_miss',
			'entry', 'hedge_placed', 'hedge_filled', 'hedge_sold', 'hedge_expired',
			'price_update', 'settlement', 'round_skip', 'heartbeat',
		];

		// Events to show in the feed (skip noisy ones)
		const FEED_EVENTS = new Set([
			'round_start', 'entry', 'settlement', 'round_skip',
			'hedge_placed', 'hedge_filled', 'hedge_sold', 'hedge_expired',
		]);

		for (const eventType of eventTypes) {
			es.addEventListener(eventType, (e: MessageEvent) => {
				try {
					const parsed = JSON.parse(e.data);
					const eventData = parsed.data ?? parsed;

					// Only add feed-worthy events
					if (FEED_EVENTS.has(eventType)) {
						const sseEvent: SSEEvent = {
							id: `evt-${++connRef.counter}`,
							type: eventType,
							timestamp: parsed.timestamp ?? new Date().toISOString(),
							data: eventData,
						};
						events = [sseEvent, ...events].slice(0, MAX_EVENTS);
					}

					// Refresh data on state-changing events
					if (eventType === 'settlement' || eventType === 'round_skip') {
						fetchStats();
						fetchCurrentRound();
						if (activeTab === 'history') fetchRounds();
					} else if (eventType === 'round_start') {
						fetchCurrentRound();
					} else if (eventType === 'entry') {
						fetchCurrentRound();
					}
				} catch {
					// ignore parse errors
				}
			});
		}

		es.onerror = () => {
			connectionStatus = 'disconnected';
			connRef.es?.close();
			connRef.es = null;
			connRef.timer = setTimeout(() => {
				connRef.timer = null;
				connectSSE();
			}, 3000);
		};
	}

	function disconnectSSE() {
		if (connRef.timer) {
			clearTimeout(connRef.timer);
			connRef.timer = null;
		}
		if (connRef.es) {
			connRef.es.close();
			connRef.es = null;
		}
		connectionStatus = 'disconnected';
	}

	// --- REST API ---

	async function fetchStats() {
		try {
			const parts: string[] = [];
			if (filterFrom) parts.push(`from=${encodeURIComponent(filterFrom)}`);
			if (filterTo) parts.push(`to=${encodeURIComponent(filterTo)}`);
			const qs = parts.length ? '?' + parts.join('&') : '';
			const res = await fetch(`${API_BASE}/api/stats${qs}`);
			if (res.ok) stats = await res.json();
		} catch {
			// non-critical
		}
	}

	async function fetchCurrentRound() {
		try {
			const res = await fetch(`${API_BASE}/api/rounds/current`);
			if (res.ok) {
				const data: CurrentRoundResponse = await res.json();
				currentRound = data.round;
			}
		} catch {
			// non-critical
		}
	}

	async function fetchRounds() {
		roundsLoading = true;
		try {
			const params = new URLSearchParams({
				page: String(roundsPage),
				pageSize: String(roundsPageSize),
			});
			if (roundsFilter) params.set('status', roundsFilter);
			if (filterFrom) params.set('from', filterFrom);
			if (filterTo) params.set('to', filterTo);

			const res = await fetch(`${API_BASE}/api/rounds?${params}`);
			if (res.ok) {
				const data: RoundsResponse = await res.json();
				rounds = data.rows;
				roundsTotal = data.total;
			}
		} catch {
			// non-critical
		} finally {
			roundsLoading = false;
		}
	}

	function toDatetimeLocal(iso: string): string {
		return iso.replace('Z', '').replace(/\.\d+$/, '').slice(0, 16);
	}

	async function fetchStrategyStart() {
		try {
			const res1 = await fetch(`${API_BASE}/api/rounds?page=1&pageSize=1`);
			if (!res1.ok) return;
			const data1: RoundsResponse = await res1.json();
			if (data1.total === 0) return;

			const lastPage = Math.ceil(data1.total / 1);
			const res2 = await fetch(`${API_BASE}/api/rounds?page=${lastPage}&pageSize=1`);
			if (!res2.ok) return;
			const data2: RoundsResponse = await res2.json();
			if (data2.rows.length > 0) {
				strategyStartTime = data2.rows[0].event_start_time;
				const startLocal = toDatetimeLocal(data2.rows[0].event_start_time);
				filterMin = startLocal;
				if (!filterFrom) filterFrom = startLocal;
				if (!filterTo) filterTo = toDatetimeLocal(new Date().toISOString());
			}
		} catch {
			// non-critical
		}
	}

	// --- Effects ---

	$effect(() => {
		if (browser) {
			untrack(() => {
				connectSSE();
				fetchStats();
				fetchCurrentRound();
				fetchStrategyStart();
			});
		}
	});

	$effect(() => {
		if (browser && activeTab === 'history') {
			const _page = roundsPage;
			const _filter = roundsFilter;
			untrack(() => fetchRounds());
		}
	});

	$effect(() => {
		if (browser) {
			const interval = setInterval(() => { now = Date.now(); }, 1000);
			return () => clearInterval(interval);
		}
	});

	onDestroy(() => {
		disconnectSSE();
	});

	// --- Helpers (ET timezone) ---

	function formatTimeET(ts: string): string {
		return new Date(ts).toLocaleTimeString('en-US', { timeZone: ET_TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
	}

	function formatDateTimeET(ts: string): string {
		const d = new Date(ts);
		return d.toLocaleString('en-US', { timeZone: ET_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function formatShortTimeET(ts: string): string {
		return new Date(ts).toLocaleTimeString('en-US', { timeZone: ET_TZ, hour: 'numeric', minute: '2-digit' });
	}

	function formatTimeWindow(start: string, end: string): string {
		return `${formatShortTimeET(start)} - ${formatShortTimeET(end)} ET`;
	}

	function formatProfit(value: number): string {
		const sign = value >= 0 ? '+' : '-';
		return `${sign}$${Math.abs(value).toFixed(2)}`;
	}

	function formatPercent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	function formatDuration(startTime: string, _now: number): string {
		const diff = _now - new Date(startTime).getTime();
		const days = Math.floor(diff / 86400000);
		const hours = Math.floor((diff % 86400000) / 3600000);
		const minutes = Math.floor((diff % 3600000) / 60000);
		const seconds = Math.floor((diff % 60000) / 1000);
		if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		return `${minutes}m ${seconds}s`;
	}

	function formatCountdown(endTime: string, _now: number): string {
		const diff = new Date(endTime).getTime() - _now;
		if (diff <= 0) return '0m 0s';
		const minutes = Math.floor(diff / 60000);
		const seconds = Math.floor((diff % 60000) / 1000);
		return `${minutes}m ${seconds}s`;
	}

	function getEventTypeLabel(type: string): string {
		switch (type) {
			case 'round_start': return t('btcUpdown.event.roundStart');
			case 'entry': return t('btcUpdown.event.entry');
			case 'settlement': return t('btcUpdown.event.settlement');
			case 'hedge_placed': return t('btcUpdown.event.hedgePlaced');
			case 'hedge_filled': return t('btcUpdown.event.hedgeFilled');
			case 'hedge_sold': return t('btcUpdown.event.hedgeSold');
			case 'hedge_expired': return t('btcUpdown.event.hedgeExpired');
			case 'round_skip': return t('btcUpdown.event.roundSkip');
			default: return type;
		}
	}

	function getEventMessage(event: SSEEvent): string {
		const d = event.data;
		switch (event.type) {
			case 'round_start':
				return t('btcUpdown.live.roundStart', {
					id: String(d.roundId ?? ''),
					remaining: String(d.totalRemaining ?? ''),
					range: String(d.priceRange ?? ''),
				});
			case 'entry':
				return t('btcUpdown.live.entry', {
					direction: String(d.direction ?? ''),
					shares: String(typeof d.shares === 'number' ? d.shares.toFixed(2) : d.shares ?? ''),
					price: String(typeof d.avgPrice === 'number' ? d.avgPrice.toFixed(4) : d.avgPrice ?? ''),
					cost: String(d.cost ?? '50'),
				});
			case 'settlement': {
				const won = d.won as boolean;
				const key = won ? 'btcUpdown.live.settlementWin' : 'btcUpdown.live.settlementLoss';
				return t(key, {
					direction: String(d.direction ?? ''),
					outcome: String(d.outcome ?? ''),
					profit: formatProfit(d.totalProfit as number ?? 0),
				});
			}
			case 'hedge_placed':
				return t('btcUpdown.live.hedgePlaced', {
					shares: String(d.shares ?? '100'),
					direction: String(d.direction ?? ''),
					price: String(typeof d.limitPrice === 'number' ? d.limitPrice.toFixed(2) : d.limitPrice ?? ''),
				});
			case 'hedge_filled':
				return t('btcUpdown.live.hedgeFilled', {
					shares: String(d.shares ?? ''),
					direction: String(d.direction ?? ''),
					price: String(typeof d.fillPrice === 'number' ? d.fillPrice.toFixed(2) : d.fillPrice ?? ''),
				});
			case 'hedge_sold':
				return t('btcUpdown.live.hedgeSold', {
					shares: String(typeof d.shares === 'number' ? d.shares.toFixed(2) : d.shares ?? ''),
					direction: String(d.direction ?? ''),
					price: String(typeof d.avgPrice === 'number' ? d.avgPrice.toFixed(2) : d.avgPrice ?? ''),
					revenue: String(typeof d.revenue === 'number' ? d.revenue.toFixed(2) : d.revenue ?? ''),
				});
			case 'hedge_expired':
				return t('btcUpdown.live.hedgeExpired', {
					direction: String(d.direction ?? ''),
				});
			case 'round_skip':
				return t('btcUpdown.live.roundSkip', {
					id: String(d.roundId ?? ''),
					checks: String(d.windowsChecked ?? ''),
					range: String(d.priceRange ?? ''),
				});
			default:
				return String(d.message ?? event.type);
		}
	}

	function getEventColorClass(type: string): string {
		switch (type) {
			case 'entry': return 'event-green';
			case 'settlement': return 'event-settlement';
			case 'round_start': return 'event-blue';
			case 'hedge_placed':
			case 'hedge_filled':
			case 'hedge_sold':
			case 'hedge_expired': return 'event-amber';
			case 'round_skip': return 'event-gray';
			default: return 'event-gray';
		}
	}

	function getRoundStatusLabel(round: Round): string {
		if (round.status === 'skipped') return t('btcUpdown.round.skip');
		if (round.status === 'watching') return t('btcUpdown.round.watching');
		if (round.status === 'pending') return t('btcUpdown.round.pending');
		if (round.status === 'entered') return t('btcUpdown.round.entered');
		if (round.status === 'settled') {
			if (round.total_profit !== null && round.total_profit >= 0) return t('btcUpdown.round.win');
			return t('btcUpdown.round.loss');
		}
		return round.status;
	}

	function getRoundBadgeClass(round: Round): string {
		if (round.status === 'skipped') return 'badge-skip';
		if (round.status === 'watching' || round.status === 'pending') return 'badge-watching';
		if (round.status === 'entered') return 'badge-entered';
		if (round.status === 'settled') {
			if (round.total_profit !== null && round.total_profit >= 0) return 'badge-win';
			return 'badge-loss';
		}
		return 'badge-watching';
	}

	function getHedgeStatusLabel(status: string): string {
		switch (status) {
			case 'filled': return t('btcUpdown.hedge.filled');
			case 'expired': return t('btcUpdown.hedge.expired');
			case 'sold': return t('btcUpdown.hedge.sold');
			case 'open': return t('btcUpdown.hedge.open');
			case 'pending': return t('btcUpdown.hedge.pending');
			default: return status;
		}
	}

	function getSkipReasonLabel(reason: string): string {
		switch (reason) {
			case 'no_qualifying_signal': return t('btcUpdown.skip.noQualifyingSignal');
			case 'window_expired': return t('btcUpdown.skip.windowExpired');
			case 'daemon_restarted': return t('btcUpdown.skip.daemonRestarted');
			default: return reason;
		}
	}

	function setFilter(filter: RoundStatusFilter) {
		roundsFilter = filter;
		roundsPage = 1;
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header -->
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<div class="title-row">
			<h1 class="page-title">{t('btcUpdown.title')}</h1>
			<div class="status-badge status-{connectionStatus}">
				<span class="status-dot"></span>
				{#if connectionStatus === 'connected'}
					{t('btcUpdown.connected')}
				{:else if connectionStatus === 'connecting'}
					{t('btcUpdown.connecting')}
				{:else if connectionStatus === 'reconnecting'}
					{t('btcUpdown.reconnecting')}
				{:else}
					{t('btcUpdown.disconnected')}
				{/if}
			</div>
		</div>
		<p class="page-description">{t('btcUpdown.description')}</p>
	</section>

	<!-- Strategy Link Banner -->
	<a
		href="https://shelchin.com/posts/bitcoin-up-or-down/"
		target="_blank"
		rel="noopener noreferrer"
		class="strategy-banner glass-card"
		use:fadeInUp={{ delay: 25 }}
	>
		<div class="strategy-icon">
			<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
				<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
			</svg>
		</div>
		<div class="strategy-text">
			<span class="strategy-title">{t('btcUpdown.strategyLink')}</span>
			<span class="strategy-desc">{t('btcUpdown.strategyLinkDesc')}</span>
		</div>
		<svg class="strategy-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="7" y1="17" x2="17" y2="7" />
			<polyline points="7 7 17 7 17 17" />
		</svg>
	</a>

	<!-- Disclaimer -->
	<div class="disclaimer" use:fadeInUp={{ delay: 30 }}>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10"/>
			<line x1="12" y1="8" x2="12" y2="12"/>
			<line x1="12" y1="16" x2="12.01" y2="16"/>
		</svg>
		<span>{t('btcUpdown.disclaimer')}</span>
	</div>

	<!-- Time Range Filter -->
	<div class="time-filter glass-card" use:fadeInUp={{ delay: 40 }}>
		<span class="time-filter-label">{t('btcUpdown.filter.timeRange')}</span>
		<div class="time-filter-inputs">
			<input type="datetime-local" class="time-input" bind:value={filterFrom} min={filterMin} />
			<span class="time-filter-sep">—</span>
			<input type="datetime-local" class="time-input" bind:value={filterTo} min={filterMin} />
			<button class="time-filter-btn" onclick={() => { fetchStats(); if (activeTab === 'history') { roundsPage = 1; fetchRounds(); } }}>{t('btcUpdown.filter.apply')}</button>
			<button class="time-filter-btn reset" onclick={() => { filterFrom = filterMin; filterTo = toDatetimeLocal(new Date().toISOString()); fetchStats(); if (activeTab === 'history') { roundsPage = 1; fetchRounds(); } }}>{t('btcUpdown.filter.reset')}</button>
		</div>
	</div>

	<!-- Stats Overview -->
	{#if stats}
		<section class="stats-grid" use:fadeInUp={{ delay: 50 }}>
			<div class="stat-card glass-card">
				<span class="stat-label">{t('btcUpdown.stats.winRate')}</span>
				<span class="stat-value highlight">{formatPercent(stats.winRate)}</span>
				<span class="stat-sub">{stats.wins}{t('btcUpdown.stats.wins')} / {stats.losses}{t('btcUpdown.stats.losses')}</span>
			</div>
			<div class="stat-card glass-card">
				<span class="stat-label">{t('btcUpdown.stats.totalProfit')}</span>
				<span class="stat-value" class:positive={stats.totalProfit >= 0} class:negative={stats.totalProfit < 0}>
					{formatProfit(stats.totalProfit)}
				</span>
				<span class="stat-sub">{t('btcUpdown.stats.avgProfit')}: {formatProfit(stats.avgProfit)}</span>
			</div>
			<div class="stat-card glass-card">
				<span class="stat-label">{t('btcUpdown.stats.totalRounds')}</span>
				<span class="stat-value">{stats.totalRounds}</span>
				<span class="stat-sub">{stats.entered} {t('btcUpdown.stats.entered')} / {stats.skipped} {t('btcUpdown.stats.skipped')}</span>
			</div>
			<div class="stat-card glass-card">
				<span class="stat-label">{t('btcUpdown.stats.streak')}</span>
				<span class="stat-value" class:positive={stats.currentStreak > 0} class:negative={stats.currentStreak < 0}>
					{stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak}
				</span>
				<span class="stat-sub">{t('btcUpdown.stats.best')}: {formatProfit(stats.bestRound)} / {t('btcUpdown.stats.worst')}: {formatProfit(stats.worstRound)}</span>
			</div>
		</section>
	{/if}

	<!-- Strategy Runtime -->
	{#if strategyStartTime}
		<div class="strategy-runtime glass-card" use:fadeInUp={{ delay: 60 }}>
			<div class="runtime-row">
				<span class="runtime-label">{t('btcUpdown.stats.duration')}</span>
				<span class="runtime-value">{formatDuration(strategyStartTime, now)}</span>
			</div>
			<div class="runtime-row">
				<span class="runtime-label">{t('btcUpdown.stats.runningSince', { date: '' })}</span>
				<span class="runtime-date">{formatDateTimeET(strategyStartTime)} ET</span>
			</div>
		</div>
	{/if}

	<!-- Tab Switcher -->
	<div class="tab-switcher" use:fadeInUp={{ delay: 75 }}>
		<button class="tab-btn" class:active={activeTab === 'live'} onclick={() => (activeTab = 'live')}>
			{t('btcUpdown.tabLive')}
			{#if events.length > 0}
				<span class="tab-count">{events.length}</span>
			{/if}
		</button>
		<button class="tab-btn" class:active={activeTab === 'history'} onclick={() => (activeTab = 'history')}>
			{t('btcUpdown.tabHistory')}
			{#if roundsTotal > 0}
				<span class="tab-count">{roundsTotal}</span>
			{/if}
		</button>
	</div>

	<!-- ===== Live Feed Tab ===== -->
	{#if activeTab === 'live'}
		<!-- Current Round Card -->
		<section class="current-round glass-card" use:fadeInUp={{ delay: 100 }}>
			<h3 class="section-label">{t('btcUpdown.live.currentRound')}</h3>
			{#if currentRound}
				<div class="current-round-header">
					<a class="round-id-link" href="https://polymarket.com/event/{currentRound.market_slug}" target="_blank" rel="noopener noreferrer">#{currentRound.id}</a>
					<span class="round-time-window">{formatTimeWindow(currentRound.event_start_time, currentRound.end_time)}</span>
					<span class="round-badge {getRoundBadgeClass(currentRound)}">{getRoundStatusLabel(currentRound)}</span>
				</div>
				{#if currentRound.entry_direction}
					<div class="current-round-body">
						<div class="round-row">
							<span class="round-label">{t('btcUpdown.round.direction')}</span>
							<span class="round-value direction-tag direction-{currentRound.entry_direction.toLowerCase()}">{currentRound.entry_direction}</span>
						</div>
						{#if currentRound.entry_price_avg !== null}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.entryPrice')}</span>
								<span class="round-value mono">${currentRound.entry_price_avg.toFixed(4)}</span>
							</div>
						{/if}
						{#if currentRound.entry_shares !== null}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.shares')}</span>
								<span class="round-value mono">{currentRound.entry_shares.toFixed(2)}</span>
							</div>
						{/if}
						{#if currentRound.entry_cost !== null}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.cost')}</span>
								<span class="round-value mono">${currentRound.entry_cost.toFixed(2)}</span>
							</div>
						{/if}
						{#if currentRound.entry_time}
							<div class="round-row">
								<span class="round-label">{t('btcUpdown.round.entryTime')}</span>
								<span class="round-value mono">{formatShortTimeET(currentRound.entry_time)} ET</span>
							</div>
						{/if}
					</div>
				{:else}
					<p class="current-round-waiting">{t('btcUpdown.live.noActiveRoundDesc')}</p>
				{/if}
				<div class="round-row" style="margin-top: var(--space-2);">
					<span class="round-label">{t('btcUpdown.round.countdown')}</span>
					<span class="round-value mono countdown-value">{formatCountdown(currentRound.end_time, now)}</span>
				</div>
			{:else}
				<p class="current-round-waiting">{t('btcUpdown.live.noActiveRound')}</p>
			{/if}
		</section>

		<!-- Scan Status -->
		{#if connectionStatus === 'connected'}
			<div class="scan-status">
				<span class="scan-dot"></span>
				<span class="scan-text">{t('btcUpdown.listening')}</span>
			</div>
		{/if}

		<!-- Events Feed -->
		<section class="events-feed">
			{#if events.length === 0}
				<div class="empty-state" use:fadeInUp={{ delay: 150 }}>
					<div class="empty-icon scanning">
						<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
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
									<span class="card-time">{formatTimeET(event.timestamp)}</span>
									<span class="card-type-badge {getEventColorClass(event.type)}-badge">
										{getEventTypeLabel(event.type)}
									</span>
								</div>
								<p class="event-message">{getEventMessage(event)}</p>

								{#if event.type === 'settlement'}
									{@const won = event.data.won}
									{@const profit = event.data.totalProfit as number}
									<div class="settlement-result" class:win={won} class:loss={!won}>
										<span class="settlement-label">{won ? t('btcUpdown.round.win') : t('btcUpdown.round.loss')}</span>
										<span class="settlement-profit">{formatProfit(profit)}</span>
									</div>
								{/if}

								{#if event.type === 'entry'}
									<div class="entry-details">
										<span class="direction-tag direction-{(event.data.direction as string ?? '').toLowerCase()}">{event.data.direction}</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- ===== Round History Tab ===== -->
	{#if activeTab === 'history'}
		<div class="filter-bar">
			<div class="filter-group">
				{#each [{ value: '', label: t('btcUpdown.filter.all') }, { value: 'entered', label: t('btcUpdown.filter.entered') }, { value: 'settled', label: t('btcUpdown.filter.settled') }, { value: 'skipped', label: t('btcUpdown.filter.skipped') }] as filter}
					<button
						class="filter-btn"
						class:active={roundsFilter === filter.value}
						onclick={() => setFilter(filter.value as RoundStatusFilter)}
					>
						{filter.label}
					</button>
				{/each}
			</div>
			<button class="refresh-btn" onclick={() => fetchRounds()} disabled={roundsLoading}>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="23 4 23 10 17 10"/>
					<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
				</svg>
				{t('btcUpdown.history.refresh')}
			</button>
		</div>

		{#if roundsLoading}
			<div class="loading-state">
				<span class="loading-dot"></span>
			</div>
		{:else if rounds.length === 0}
			<div class="empty-state" use:fadeInUp={{ delay: 100 }}>
				<h3 class="empty-title">{t('btcUpdown.noRounds')}</h3>
				<p class="empty-desc">{t('btcUpdown.noRoundsDesc')}</p>
			</div>
		{:else}
			<div class="rounds-list">
				{#each rounds as round (round.id)}
					<div class="round-card glass-card" use:fadeInUp={{ delay: 0 }}>
						<div class="round-header">
							<a class="round-id-link" href="https://polymarket.com/event/{round.market_slug}" target="_blank" rel="noopener noreferrer">#{round.id}</a>
							<span class="round-time-window">{formatTimeWindow(round.event_start_time, round.end_time)}</span>
							<span class="round-badge {getRoundBadgeClass(round)}">{getRoundStatusLabel(round)}</span>
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
										<span class="round-value mono">${round.entry_price_avg.toFixed(4)}</span>
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
										<span class="round-value mono">{formatShortTimeET(round.entry_time)} ET <span class="entry-remaining">({round.entry_remaining}s left)</span></span>
									</div>
								{/if}
								{#if round.hedge?.filled_at}
									<div class="round-row">
										<span class="round-label">{t('btcUpdown.round.hedgeFilledAt')}</span>
										<span class="round-value mono">{formatShortTimeET(round.hedge.filled_at)} ET</span>
									</div>
								{/if}
								{#if round.hedge?.sold_at}
									<div class="round-row">
										<span class="round-label">{t('btcUpdown.round.hedgeSoldAt')}</span>
										<span class="round-value mono">{formatShortTimeET(round.hedge.sold_at)} ET</span>
									</div>
								{/if}

								<!-- P&L Breakdown for settled rounds -->
								{#if round.status === 'settled'}
									<div class="pnl-divider"></div>
									<details class="pnl-details">
										<summary class="pnl-summary">
											<span class="pnl-total-label">{t('btcUpdown.pnl.netProfit')}</span>
											<span class="pnl-summary-right">
												<span class="pnl-total-value" class:positive={(round.total_profit ?? 0) >= 0} class:negative={(round.total_profit ?? 0) < 0}>
													{formatProfit(round.total_profit ?? 0)}
												</span>
												<svg class="pnl-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
											</span>
										</summary>
										<div class="pnl-section">
											<span class="pnl-title">{t('btcUpdown.pnl.title')}</span>
											<div class="pnl-row cost">
												<span class="pnl-label">{t('btcUpdown.pnl.entryCost')}</span>
												<span class="pnl-value">-${(round.entry_cost ?? 0).toFixed(2)}</span>
											</div>
											{#if (round.hedge_cost ?? 0) > 0}
												<div class="pnl-row cost">
													<span class="pnl-label">{t('btcUpdown.pnl.hedgeCost')}</span>
													<span class="pnl-value">-${(round.hedge_cost ?? 0).toFixed(2)}</span>
												</div>
											{/if}
											{#if (round.main_payout ?? 0) > 0}
												<div class="pnl-row income">
													<span class="pnl-label">{t('btcUpdown.pnl.mainPayout')}</span>
													<span class="pnl-value">+${(round.main_payout ?? 0).toFixed(2)}</span>
												</div>
											{/if}
											{#if (round.hedge_payout ?? 0) > 0}
												<div class="pnl-row income">
													<span class="pnl-label">{t('btcUpdown.pnl.hedgePayout')}</span>
													<span class="pnl-value">+${(round.hedge_payout ?? 0).toFixed(2)}</span>
												</div>
											{/if}
											{#if (round.hedge_sell_revenue ?? 0) > 0}
												<div class="pnl-row income">
													<span class="pnl-label">{t('btcUpdown.pnl.hedgeSellRevenue')}</span>
													<span class="pnl-value">+${(round.hedge_sell_revenue ?? 0).toFixed(2)}</span>
												</div>
											{/if}
											{#if (round.platform_fee ?? 0) > 0}
												<div class="pnl-row cost">
													<span class="pnl-label">{t('btcUpdown.pnl.platformFee')}</span>
													<span class="pnl-value">-${(round.platform_fee ?? 0).toFixed(2)}</span>
												</div>
											{/if}
											{#if round.hedge}
												<div class="pnl-row hedge-info">
													<span class="pnl-label">{t('btcUpdown.pnl.hedgeStatus')}</span>
													<span class="pnl-value">{round.hedge.direction} @ ${round.hedge.limit_price.toFixed(2)} &middot; {getHedgeStatusLabel(round.hedge.status)}</span>
												</div>
											{/if}
										</div>
									</details>
								{:else if round.entry_cost !== null}
									<div class="round-row">
										<span class="round-label">{t('btcUpdown.round.cost')}</span>
										<span class="round-value mono">${round.entry_cost.toFixed(2)}</span>
									</div>
								{/if}
							</div>
						{:else if round.skip_reason}
							<div class="round-body">
								<p class="skip-reason">{getSkipReasonLabel(round.skip_reason)}</p>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if totalPages > 1}
				<div class="pagination">
					<button class="pagination-btn" disabled={roundsPage <= 1} onclick={() => (roundsPage = Math.max(1, roundsPage - 1))}>
						{t('btcUpdown.pagination.prev')}
					</button>
					<span class="pagination-info">
						{t('btcUpdown.pagination.page', { page: String(roundsPage), total: String(totalPages) })}
					</span>
					<button class="pagination-btn" disabled={roundsPage >= totalPages} onclick={() => (roundsPage = Math.min(totalPages, roundsPage + 1))}>
						{t('btcUpdown.pagination.next')}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
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
	.page-header { margin-bottom: var(--space-6); }

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

	.status-dot { width: 6px; height: 6px; border-radius: 50%; }

	.status-connected { border-color: rgba(52, 211, 153, 0.3); color: #34d399; background: rgba(52, 211, 153, 0.08); }
	.status-connected .status-dot { background: #34d399; animation: breathe 2.5s ease-in-out infinite; }

	.status-connecting, .status-reconnecting { border-color: rgba(251, 191, 36, 0.3); color: #fbbf24; background: rgba(251, 191, 36, 0.08); }
	.status-connecting .status-dot, .status-reconnecting .status-dot { background: #fbbf24; animation: blink 1s ease-in-out infinite; }

	.status-disconnected { border-color: rgba(248, 113, 113, 0.3); color: #f87171; background: rgba(248, 113, 113, 0.08); }
	.status-disconnected .status-dot { background: #f87171; }

	@keyframes breathe { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
	@keyframes blink { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

	/* Strategy Banner */
	.strategy-banner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		text-decoration: none;
		margin-bottom: var(--space-6);
		transition: all var(--motion-fast) var(--easing);
	}
	.strategy-banner:hover { transform: translateY(-1px); background: rgba(255, 255, 255, 0.08); }
	.strategy-icon { color: var(--accent); flex-shrink: 0; }
	.strategy-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
	.strategy-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--fg-base); }
	.strategy-desc { font-size: var(--text-xs); color: var(--fg-muted); }
	.strategy-arrow { color: var(--fg-subtle); flex-shrink: 0; }

	/* Disclaimer */
	.disclaimer {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: rgba(251, 191, 36, 0.06);
		border: 1px solid rgba(251, 191, 36, 0.12);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
	}
	.disclaimer svg { color: #fbbf24; flex-shrink: 0; }

	/* Time Range Filter */
	.time-filter {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}
	.time-filter-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.time-filter-inputs {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		flex: 1;
	}
	.time-input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		font-family: var(--font-mono, ui-monospace, monospace);
		color: var(--fg-base);
		color-scheme: dark;
	}
	.time-input:focus { outline: none; border-color: var(--accent); }
	.time-filter-sep { color: var(--fg-subtle); font-size: var(--text-sm); }
	.time-filter-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.time-filter-btn:hover { border-color: rgba(255, 255, 255, 0.15); color: var(--fg-base); }
	.time-filter-btn.reset { color: var(--fg-subtle); }

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.stat-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.stat-label { font-size: var(--text-xs); color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.05em; }
	.stat-value { font-size: var(--text-xl); font-weight: var(--weight-bold); color: var(--fg-base); font-family: var(--font-mono, ui-monospace, monospace); }
	.stat-value.highlight { color: var(--accent); }
	.stat-sub { font-size: var(--text-xs); color: var(--fg-subtle); font-family: var(--font-mono, ui-monospace, monospace); }

	/* Strategy Runtime */
	.strategy-runtime {
		display: flex;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-6);
	}

	.runtime-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.runtime-label {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	.runtime-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.runtime-date {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
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
	.tab-btn:hover { color: var(--fg-muted); }
	.tab-btn.active { background: rgba(255, 255, 255, 0.08); color: var(--fg-base); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }

	.tab-count {
		font-size: var(--text-xs);
		padding: 0 6px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.08);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		line-height: 1.6;
	}
	.tab-btn.active .tab-count { background: rgba(52, 211, 153, 0.15); color: #34d399; }

	/* Current Round */
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

	/* Scan Status */
	.scan-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.scan-dot { width: 5px; height: 5px; border-radius: 50%; background: #34d399; animation: breathe 2.5s ease-in-out infinite; }
	.scan-text { opacity: 0.6; }

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-12) var(--space-6);
		text-align: center;
	}
	.empty-icon { color: var(--fg-faint); margin-bottom: var(--space-4); }
	.empty-icon.scanning { animation: breathe 2.5s ease-in-out infinite; }
	.empty-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--fg-muted); margin: 0 0 var(--space-2); }
	.empty-desc { font-size: var(--text-sm); color: var(--fg-subtle); margin: 0; }

	/* Loading State */
	.loading-state { display: flex; justify-content: center; padding: var(--space-12); }
	.loading-dot { width: 8px; height: 8px; background: var(--fg-subtle); border-radius: 50%; animation: blink 1s ease-in-out infinite; }

	/* Events Grid */
	.events-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-3); }

	/* Event Card */
	.event-card { border-radius: var(--radius-lg); padding: var(--space-4); }
	.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
	.card-time { font-size: var(--text-xs); color: var(--fg-subtle); font-family: var(--font-mono, ui-monospace, monospace); }

	.card-type-badge { font-size: var(--text-xs); font-weight: var(--weight-medium); padding: 2px var(--space-2); border-radius: var(--radius-sm); }
	.event-green-badge { background: rgba(52, 211, 153, 0.12); color: #34d399; }
	.event-blue-badge { background: rgba(96, 165, 250, 0.12); color: #60a5fa; }
	.event-amber-badge { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
	.event-gray-badge { background: rgba(255, 255, 255, 0.06); color: var(--fg-subtle); }
	.event-settlement-badge { background: rgba(168, 85, 247, 0.12); color: #a855f7; }

	.event-message {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
		word-break: break-word;
	}

	/* Settlement Result */
	.settlement-result {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.settlement-result.win { background: rgba(52, 211, 153, 0.1); }
	.settlement-result.loss { background: rgba(248, 113, 113, 0.1); }
	.settlement-label { font-size: var(--text-xs); font-weight: var(--weight-bold); text-transform: uppercase; }
	.settlement-result.win .settlement-label, .settlement-result.win .settlement-profit { color: #34d399; }
	.settlement-result.loss .settlement-label, .settlement-result.loss .settlement-profit { color: #f87171; }
	.settlement-profit { font-size: var(--text-sm); font-weight: var(--weight-semibold); }

	/* Entry Details */
	.entry-details { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }

	/* Direction Tag */
	.direction-tag {
		font-size: var(--text-sm);
		font-weight: var(--weight-bold);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.direction-up { color: #34d399; background: rgba(52, 211, 153, 0.12); }
	.direction-down { color: #f87171; background: rgba(248, 113, 113, 0.12); }

	/* Positive/Negative */
	.positive { color: #34d399; }
	.negative { color: #f87171; }

	/* Filter Bar */
	.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
	.filter-group { display: flex; gap: var(--space-2); flex-wrap: wrap; }
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
	.filter-btn:hover { border-color: rgba(255, 255, 255, 0.15); color: var(--fg-muted); }
	.filter-btn.active { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.15); color: var(--fg-base); }

	/* Refresh Button */
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
	.refresh-btn:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.15); color: var(--fg-muted); }
	.refresh-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	/* Rounds List */
	.rounds-list { display: grid; grid-template-columns: 1fr; gap: var(--space-3); }

	.round-card { border-radius: var(--radius-lg); padding: var(--space-4); }

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
	.round-id-link:hover { text-decoration: underline; }

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
	.badge-win { background: rgba(52, 211, 153, 0.12); color: #34d399; }
	.badge-loss { background: rgba(248, 113, 113, 0.12); color: #f87171; }
	.badge-skip { background: rgba(255, 255, 255, 0.06); color: var(--fg-subtle); }
	.badge-watching, .badge-entered { background: rgba(96, 165, 250, 0.12); color: #60a5fa; }

	.round-body { display: flex; flex-direction: column; gap: var(--space-2); }
	.round-row { display: flex; justify-content: space-between; align-items: center; }
	.round-label { font-size: var(--text-sm); color: var(--fg-subtle); }
	.round-value { font-size: var(--text-sm); color: var(--fg-base); font-weight: var(--weight-medium); }
	.round-value.mono { font-family: var(--font-mono, ui-monospace, monospace); }
	.countdown-value { color: #60a5fa; }
	.entry-remaining { color: var(--fg-subtle); font-size: var(--text-xs); }
	.skip-reason { font-size: var(--text-sm); color: var(--fg-subtle); margin: 0; font-style: italic; }

	/* P&L Breakdown */
	.pnl-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin: var(--space-2) 0;
	}

	.pnl-details {
		border: none;
	}

	.pnl-details summary { list-style: none; }
	.pnl-details summary::-webkit-details-marker { display: none; }

	.pnl-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		padding: var(--space-1) 0;
	}
	.pnl-summary:hover { opacity: 0.85; }

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

	.pnl-row.cost .pnl-value { color: #f87171; }
	.pnl-row.income .pnl-value { color: #34d399; }
	.pnl-row.hedge-info .pnl-value { color: #fbbf24; font-size: var(--text-xs); }

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

	/* Pagination */
	.pagination { display: flex; align-items: center; justify-content: center; gap: var(--space-4); margin-top: var(--space-6); }
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
	.pagination-btn:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.15); color: var(--fg-base); }
	.pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.pagination-info { font-size: var(--text-sm); color: var(--fg-subtle); font-family: var(--font-mono, ui-monospace, monospace); }

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Light mode overrides */
	:global([data-theme="light"]) .glass-card { background: rgba(0, 0, 0, 0.02); border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
	:global([data-theme="light"]) .tab-switcher { background: rgba(0, 0, 0, 0.03); border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .tab-btn.active { background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .tab-count { background: rgba(0, 0, 0, 0.06); }
	:global([data-theme="light"]) .tab-btn.active .tab-count { background: rgba(16, 185, 129, 0.12); color: #059669; }
	:global([data-theme="light"]) .positive { color: #059669; }
	:global([data-theme="light"]) .negative { color: #dc2626; }
	:global([data-theme="light"]) .direction-up { color: #059669; background: rgba(16, 185, 129, 0.1); }
	:global([data-theme="light"]) .direction-down { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
	:global([data-theme="light"]) .status-connected { border-color: rgba(16, 185, 129, 0.3); color: #059669; background: rgba(16, 185, 129, 0.06); }
	:global([data-theme="light"]) .status-connected .status-dot, :global([data-theme="light"]) .scan-dot { background: #059669; }
	:global([data-theme="light"]) .badge-win, :global([data-theme="light"]) .event-green-badge { background: rgba(16, 185, 129, 0.1); color: #059669; }
	:global([data-theme="light"]) .badge-loss { background: rgba(220, 38, 38, 0.1); color: #dc2626; }
	:global([data-theme="light"]) .settlement-result.win { background: rgba(16, 185, 129, 0.08); }
	:global([data-theme="light"]) .settlement-result.win .settlement-label, :global([data-theme="light"]) .settlement-result.win .settlement-profit { color: #059669; }
	:global([data-theme="light"]) .settlement-result.loss { background: rgba(220, 38, 38, 0.08); }
	:global([data-theme="light"]) .settlement-result.loss .settlement-label, :global([data-theme="light"]) .settlement-result.loss .settlement-profit { color: #dc2626; }
	:global([data-theme="light"]) .event-amber-badge { background: rgba(217, 119, 6, 0.1); color: #d97706; }
	:global([data-theme="light"]) .event-settlement-badge { background: rgba(147, 51, 234, 0.1); color: #9333ea; }
	:global([data-theme="light"]) .filter-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .filter-btn:hover { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme="light"]) .filter-btn.active { background: rgba(0, 0, 0, 0.04); border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme="light"]) .pagination-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .pagination-btn:hover:not(:disabled) { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme="light"]) .event-gray-badge, :global([data-theme="light"]) .badge-skip { background: rgba(0, 0, 0, 0.04); }
	:global([data-theme="light"]) .strategy-banner:hover { background: rgba(0, 0, 0, 0.04); }
	:global([data-theme="light"]) .disclaimer { background: rgba(217, 119, 6, 0.06); border-color: rgba(217, 119, 6, 0.15); }
	:global([data-theme="light"]) .disclaimer svg { color: #d97706; }
	:global([data-theme="light"]) .time-input { background: rgba(0, 0, 0, 0.03); border-color: rgba(0, 0, 0, 0.08); color-scheme: light; }
	:global([data-theme="light"]) .time-filter-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .time-filter-btn:hover { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme="light"]) .pnl-divider { background: rgba(0, 0, 0, 0.06); }
	:global([data-theme="light"]) .refresh-btn { border-color: rgba(0, 0, 0, 0.08); }
	:global([data-theme="light"]) .refresh-btn:hover:not(:disabled) { border-color: rgba(0, 0, 0, 0.15); }
	:global([data-theme="light"]) .pnl-row.cost .pnl-value { color: #dc2626; }
	:global([data-theme="light"]) .pnl-row.income .pnl-value { color: #059669; }
	:global([data-theme="light"]) .pnl-row.hedge-info .pnl-value { color: #d97706; }

	/* Responsive */
	@media (max-width: 768px) {
		main.page { padding: var(--space-6) var(--space-4); }
		.page-title { font-size: var(--text-2xl); }
		.stats-grid { grid-template-columns: repeat(2, 1fr); }
		.stat-value { font-size: var(--text-lg); }
		.strategy-banner { padding: var(--space-3) var(--space-4); }
		.strategy-runtime { flex-direction: column; gap: var(--space-2); }
	}
</style>
