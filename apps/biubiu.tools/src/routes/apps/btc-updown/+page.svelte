<script lang="ts">
	import {
		t,
		locale,
		preferences,
		formatNumber,
		formatCurrency,
		formatDate,
		formatDateTime
	} from '$lib/i18n';
	import {
		loadSettings,
		applyTheme,
		applyTextScale,
		type Theme,
		type TextScale,
		type TimeFormat
	} from '$lib/settings';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import DatePicker from '$lib/ui/DatePicker.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { fly } from 'svelte/transition';
	import {
		type StrategyEndpoint,
		type StrategyInfo,
		type ValidationProgress,
		FALLBACK_STRATEGIES,
		DEFAULT_VISIBLE_BUILTINS,
		API_HOST,
		generateCustomId,
		normalizeStrategyUrl,
		validateStrategyUrl,
		strategyFetch,
		loadPersistedState,
		savePersistedState,
		discoverStrategies,
		getDiscoveryUrl
	} from '$lib/btc-updown-strategies';

	const VALIDATE_STEP_KEYS = {
		strategy: 'btcUpdown.validate.strategy',
		stats: 'btcUpdown.validate.stats',
		rounds: 'btcUpdown.validate.rounds',
		health: 'btcUpdown.validate.health',
		format: 'btcUpdown.validate.format'
	} as const;

	const MAX_EVENTS = 50;
	const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

	function apiUrl(path: string): string {
		return `${activeStrategy.baseUrl}${path}`;
	}

	function getFetchFn(): (url: string) => Promise<Response> {
		return activeStrategy.type === 'custom'
			? strategyFetch
			: (url: string) => fetch(url, { cache: 'no-store' });
	}

	// --- Types ---

	type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
	type RoundStatusFilter = '' | 'entered' | 'settled' | 'skipped';
	type SignalActionFilter = '' | 'bet' | 'reverse' | 'skip';
	type ResultFilter = '' | 'win' | 'loss' | 'stop_loss';

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
		signalBet: number;
		signalBetWins: number;
		signalBetLosses: number;
		signalReverse: number;
		signalReverseWins: number;
		signalReverseLosses: number;
		signalSkip: number;
		signalSkipWouldWin: number;
		signalSkipWouldLose: number;
		stopLossCount: number;
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
		signal_action: string | null;
		skip_reason: string | null;
		swing_mode: number | null;
		swing_exit_reason: string | null;
		swing_exit_price: number | null;
		stop_loss_checked_at: string | null;
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

	interface HourlyStats {
		hour: number;
		rounds: number;
		wins: number;
		losses: number;
		invested: number;
		payout: number;
		profit: number;
		winRate: number;
		avgProfit: number;
	}

	// --- Reactive State ---

	let builtinStrategies = $state<StrategyEndpoint[]>(FALLBACK_STRATEGIES);
	let customStrategies = $state<StrategyEndpoint[]>([]);
	let discoveredSiblings = new SvelteMap<string, StrategyEndpoint[]>();
	let visibleDiscoveredIds = $state<Set<string>>(new Set());
	let hiddenStrategyIds = $state<Set<string>>(new Set());
	let activeStrategyId = $state('builtin:v1');
	// All strategies including hidden (for config panels)
	const allKnownStrategies = $derived([
		...builtinStrategies,
		...customStrategies,
		...[...discoveredSiblings.values()].flat().filter((s) => visibleDiscoveredIds.has(s.id))
	]);
	// Only visible strategies (for sidebar display, profits, comparison)
	// Discovered siblings: visibility solely by visibleDiscoveredIds (already filtered in allKnownStrategies)
	// Builtin/custom: visibility by hiddenStrategyIds (opt-out)
	const allRegisteredStrategies = $derived(
		allKnownStrategies.filter((s) => s.type === 'discovered' || !hiddenStrategyIds.has(s.id))
	);
	const activeStrategy = $derived(
		allRegisteredStrategies.find((s) => s.id === activeStrategyId) ??
			allRegisteredStrategies[0] ??
			builtinStrategies[0] ??
			FALLBACK_STRATEGIES[0]
	);
	let strategyInfo = $state<StrategyInfo | null>(null);
	let allStrategyInfos = new SvelteMap<string, StrategyInfo | null>();
	interface StrategyProfitData {
		current:
			| { status: 'settled'; profit: number; direction: string | null }
			| { status: 'entered'; direction: string | null }
			| { status: 'skipped' | 'watching' };
		hour: { profit: number; rounds: number; winRate: number };
		day: { profit: number; rounds: number; winRate: number };
		all: { profit: number; rounds: number; winRate: number };
	}
	let allStrategyProfits = new SvelteMap<string, StrategyProfitData | null>();
	let lastProfitRefreshTime = $state(0);
	let profitRefreshing = $state(false);
	const customStrategiesByHost = $derived(
		Array.from(
			customStrategies.reduce((groups, s) => {
				let host: string;
				try {
					host = new URL(s.baseUrl).host;
				} catch {
					host = 'unknown';
				}
				if (!groups.has(host)) groups.set(host, []);
				groups.get(host)!.push(s);
				return groups;
			}, new Map<string, StrategyEndpoint[]>())
		)
	);
	// Sidebar profit column navigation offsets (0 = current, -1 = previous, etc.)
	let profitRoundOffset = $state(0);
	let profitHourOffset = $state(0);
	let profitDayOffset = $state(0);
	// Sidebar sort state
	let profitSortColumn = $state<'name' | 'hour' | 'day' | 'all' | null>(null);
	let profitSortDir = $state<'asc' | 'desc'>('desc');
	// Visibility config panel: which section is open (null = closed)
	let configPanelSection = $state<string | null>(null);
	let collapsedSections = new SvelteSet<string>();

	function toggleCollapse(key: string) {
		if (collapsedSections.has(key)) collapsedSections.delete(key);
		else collapsedSections.add(key);
		persistState();
	}
	const hiddenBuiltinCount = $derived(
		builtinStrategies.filter((s) => hiddenStrategyIds.has(s.id)).length
	);
	// Custom strategy UI state
	let showAddStrategy = $state(false);
	let customUrlInput = $state('');
	let customUrlError = $state('');
	let customUrlValidating = $state(false);
	let validationSteps = $state<ValidationProgress[]>([]);

	let timeFormat = $state<TimeFormat>('24');
	let connectionStatus = $state<ConnectionStatus>('disconnected');
	let events = $state<SSEEvent[]>([]);
	let stats = $state<Stats | null>(null);
	let currentRound = $state<Round | null>(null);
	let strategyStartTime = $state<string | null>(null);
	let now = $state(Date.now());

	// Sticky strategy title (shown when strategy-info card scrolls out of view)
	let showStickyTitle = $state(false);
	function observeVisibility(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => {
				showStickyTitle = !entry.isIntersecting;
			},
			{ threshold: 0 }
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	// History / Live tab toggle
	let historyTab = $state<'rounds' | 'live'>('rounds');

	// History tab state
	let rounds = $state<Round[]>([]);
	let roundsTotal = $state(0);
	let roundsPage = $state(1);
	let roundsPageSize = 10;
	let roundsFilter = $state<RoundStatusFilter>('');
	let signalActionFilter = $state<SignalActionFilter>('');
	let resultFilter = $state<ResultFilter>('');
	let roundsLoading = $state(false);

	// Date filter: '' means "All", 'YYYY-MM-DD' means specific date
	let filterDate = $state<{ from: string; to: string }>({ from: '', to: '' });
	let hourlyData = $state<HourlyStats[]>([]);
	let selectedHour = $state<number | null>(null);

	// Non-reactive connection refs
	const connRef: {
		es: EventSource | null;
		reader: ReadableStreamDefaultReader<Uint8Array> | null;
		abortController: AbortController | null;
		timer: ReturnType<typeof setTimeout> | null;
		counter: number;
	} = {
		es: null,
		reader: null,
		abortController: null,
		timer: null,
		counter: 0
	};

	const totalPages = $derived(Math.max(1, Math.ceil(roundsTotal / roundsPageSize)));

	const seoProps = $derived(
		getBaseSEO({
			title: t('btcUpdown.title'),
			description: t('btcUpdown.description'),
			currentLocale: locale.value
		})
	);

	// --- SSE Connection ---

	// Events to show in the feed (skip noisy ones)
	const FEED_EVENTS = new Set([
		'round_start',
		'entry',
		'settlement',
		'exit_trigger',
		'round_skip',
		'hedge_placed',
		'hedge_filled',
		'hedge_sold',
		'hedge_expired'
	]);

	function handleSSEEvent(eventType: string, data: Record<string, unknown>, timestamp: string) {
		if (FEED_EVENTS.has(eventType)) {
			const sseEvent: SSEEvent = {
				id: `evt-${++connRef.counter}`,
				type: eventType,
				timestamp,
				data
			};
			events = [sseEvent, ...events].slice(0, MAX_EVENTS);
		}
		if (eventType === 'settlement' || eventType === 'exit_trigger' || eventType === 'round_skip') {
			fetchStats();
			fetchCurrentRound();
			fetchRounds();
		} else if (eventType === 'round_start' || eventType === 'entry') {
			fetchCurrentRound();
		}
	}

	function connectSSEViaEventSource(sseUrl: string) {
		const es = new EventSource(sseUrl);
		connRef.es = es;

		es.onopen = () => {
			connectionStatus = 'connected';
		};

		const eventTypes = [
			'round_start',
			'waiting_for_window',
			'window_check',
			'window_miss',
			'entry',
			'hedge_placed',
			'hedge_filled',
			'hedge_sold',
			'hedge_expired',
			'price_update',
			'settlement',
			'exit_trigger',
			'round_skip',
			'heartbeat'
		];

		for (const eventType of eventTypes) {
			es.addEventListener(eventType, (e: MessageEvent) => {
				try {
					const parsed = JSON.parse(e.data);
					handleSSEEvent(
						eventType,
						parsed.data ?? parsed,
						parsed.timestamp ?? new Date().toISOString()
					);
				} catch {
					// ignore parse errors
				}
			});
		}

		es.onerror = () => {
			connectionStatus = 'disconnected';
			connRef.es?.close();
			connRef.es = null;
			// For custom strategies, try proxy fallback on first failure
			if (activeStrategy.type === 'custom' && !connRef.reader) {
				connectSSEViaProxy(sseUrl);
				return;
			}
			connRef.timer = setTimeout(() => {
				connRef.timer = null;
				connectSSE();
			}, 3000);
		};
	}

	async function connectSSEViaProxy(sseUrl: string) {
		connectionStatus = 'connecting';
		const proxyUrl = `/api/proxy?url=${encodeURIComponent(sseUrl)}`;
		try {
			const controller = new AbortController();
			connRef.abortController = controller;
			const res = await fetch(proxyUrl, { signal: controller.signal });
			if (!res.body) return;
			connRef.reader = res.body.getReader();
			connectionStatus = 'connected';
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await connRef.reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				// Parse SSE lines
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				let currentEvent = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith('data: ') && currentEvent) {
						try {
							const parsed = JSON.parse(line.slice(6));
							handleSSEEvent(
								currentEvent,
								parsed.data ?? parsed,
								parsed.timestamp ?? new Date().toISOString()
							);
						} catch {
							/* ignore */
						}
						currentEvent = '';
					} else if (line.trim() === '') {
						currentEvent = '';
					}
				}
			}
		} catch {
			// Connection closed or aborted
		}
		// Reconnect if not intentionally disconnected
		if (connRef.reader || connRef.abortController) {
			connRef.reader = null;
			connRef.abortController = null;
			connectionStatus = 'disconnected';
			connRef.timer = setTimeout(() => {
				connRef.timer = null;
				connectSSE();
			}, 3000);
		}
	}

	function connectSSE() {
		disconnectSSE();
		connectionStatus = 'connecting';
		const sseUrl = apiUrl('/sse/live');
		connectSSEViaEventSource(sseUrl);
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
		if (connRef.reader) {
			connRef.reader.cancel();
			connRef.reader = null;
		}
		if (connRef.abortController) {
			connRef.abortController.abort();
			connRef.abortController = null;
		}
		connectionStatus = 'disconnected';
	}

	// --- REST API ---

	function getDateRange(hourFilter?: number | null): { from: string; to: string } | null {
		if (!filterDate.from) return null;
		const h = hourFilter ?? null;
		const endDate = filterDate.to || filterDate.from;
		// Convert local date boundaries to UTC for the API
		const start =
			h !== null
				? new Date(`${filterDate.from}T${String(h).padStart(2, '0')}:00:00`)
				: new Date(`${filterDate.from}T00:00:00`);
		const end =
			h !== null
				? new Date(`${filterDate.from}T${String(h).padStart(2, '0')}:59:59`)
				: new Date(`${endDate}T23:59:59`);
		return {
			from: start.toISOString().slice(0, 19).replace('T', ' '),
			to: end.toISOString().slice(0, 19).replace('T', ' ')
		};
	}

	/** Whether the current filter is exactly one day */
	const isSingleDayFilter = $derived(
		filterDate.from !== '' && filterDate.from === filterDate.to
	);

	function todayLocal(): string {
		return new Date().toLocaleDateString('en-CA');
	}

	async function fetchStats() {
		try {
			const range = getDateRange(selectedHour);
			const parts: string[] = [];
			if (range) {
				parts.push(`from=${encodeURIComponent(range.from)}`);
				parts.push(`to=${encodeURIComponent(range.to)}`);
			}
			const qs = parts.length ? '?' + parts.join('&') : '';
			const res = await getFetchFn()(apiUrl(`/stats${qs}`));
			if (res.ok) stats = await res.json();
		} catch {
			// non-critical
		}
	}

	async function fetchCurrentRound() {
		try {
			const res = await getFetchFn()(apiUrl('/rounds/current'));
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
				pageSize: String(roundsPageSize)
			});
			if (roundsFilter) params.set('status', roundsFilter);
			if (signalActionFilter) params.set('signal_action', signalActionFilter);
			if (resultFilter === 'win' || resultFilter === 'loss') params.set('result', resultFilter);
			if (resultFilter === 'stop_loss') params.set('swing_exit_reason', 'stop_loss');
			const range = getDateRange(selectedHour);
			if (range) {
				params.set('from', range.from);
				params.set('to', range.to);
			}

			const res = await getFetchFn()(apiUrl(`/rounds?${params}`));
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

	async function fetchHourly() {
		if (!isSingleDayFilter) {
			hourlyData = [];
			return;
		}
		try {
			const range = getDateRange();
			const parts: string[] = [];
			if (range) {
				parts.push(`from=${encodeURIComponent(range.from)}`);
				parts.push(`to=${encodeURIComponent(range.to)}`);
			}
			const qs = parts.length ? '?' + parts.join('&') : '';
			const res = await getFetchFn()(apiUrl(`/stats/hourly${qs}`));
			if (res.ok) {
				const data: HourlyStats[] = await res.json();
				// Convert UTC hours to local hours
				const offsetHours = new Date().getTimezoneOffset() / -60;
				hourlyData = data.map((h) => ({
					...h,
					hour: (((h.hour + offsetHours) % 24) + 24) % 24
				}));
			}
		} catch {
			// non-critical
		}
	}

	async function fetchStrategyStart() {
		try {
			const f = getFetchFn();
			const res1 = await f(apiUrl('/rounds?page=1&pageSize=1'));
			if (!res1.ok) return;
			const data1: RoundsResponse = await res1.json();
			if (data1.total === 0) return;

			const lastPage = Math.ceil(data1.total / 1);
			const res2 = await f(apiUrl(`/rounds?page=${lastPage}&pageSize=1`));
			if (!res2.ok) return;
			const data2: RoundsResponse = await res2.json();
			if (data2.rows.length > 0) {
				strategyStartTime = data2.rows[0].event_start_time;
			}
		} catch {
			// non-critical
		}
	}

	async function fetchStrategyInfo() {
		try {
			const lang = locale.value === 'zh' ? 'zh' : 'en';
			const res = await getFetchFn()(apiUrl(`/strategy?lang=${lang}`));
			if (res.ok) strategyInfo = await res.json();
		} catch {
			// non-critical
		}
	}

	async function fetchAllStrategies() {
		const lang = locale.value === 'zh' ? 'zh' : 'en';
		const results = await Promise.all(
			allKnownStrategies.map(async (s) => {
				try {
					const f = s.type === 'custom' ? strategyFetch : fetch;
					const res = await f(`${s.baseUrl}/strategy?lang=${lang}`);
					return { id: s.id, info: res.ok ? ((await res.json()) as StrategyInfo) : null };
				} catch {
					return { id: s.id, info: null };
				}
			})
		);
		// Don't clear — only update entries that returned successfully (avoids race with discovery)
		for (const r of results) {
			if (r.info) allStrategyInfos.set(r.id, r.info);
		}
	}

	function toUTCString(d: Date): string {
		return d.toISOString().slice(0, 19).replace('T', ' ');
	}

	function parseCurrentRound(data: CurrentRoundResponse | null): StrategyProfitData['current'] {
		const round = data?.round ?? null;
		if (!round) return { status: 'watching' };
		if (round.status === 'settled') {
			return {
				status: 'settled',
				profit: round.total_profit ?? 0,
				direction: round.entry_direction
			};
		}
		if (round.status === 'skipped') return { status: 'skipped' };
		if (round.status === 'entered') return { status: 'entered', direction: round.entry_direction };
		return { status: 'watching' };
	}

	function parseStats(data: Stats | null): { profit: number; rounds: number; winRate: number } {
		if (!data) return { profit: 0, rounds: 0, winRate: 0 };
		return { profit: data.totalProfit, rounds: data.entered, winRate: data.winRate };
	}

	async function fetchAllStrategyProfits() {
		profitRefreshing = true;
		const now = Date.now();
		const localOffset = new Date(now).getTimezoneOffset() * 60_000;
		const localMs = now - localOffset;

		// Hour range with offset
		const currentHourStartMs = localMs - (localMs % 3_600_000) + localOffset;
		const hourShift = profitHourOffset * 3_600_000;
		const hourFrom = toUTCString(new Date(currentHourStartMs + hourShift));
		const hourTo =
			profitHourOffset === 0
				? toUTCString(new Date(now))
				: toUTCString(new Date(currentHourStartMs + hourShift + 3_600_000));

		// Day range with offset
		const todayStart = new Date(`${todayLocal()}T00:00:00`).getTime();
		const dayShift = profitDayOffset * 86_400_000;
		const dayFrom = toUTCString(new Date(todayStart + dayShift));
		const dayTo =
			profitDayOffset === 0
				? toUTCString(new Date(now))
				: toUTCString(new Date(todayStart + dayShift + 86_400_000));

		// Round offset: 0 = current, negative = historical page
		const roundPage = Math.abs(profitRoundOffset);

		const results = await Promise.all(
			allRegisteredStrategies.map(async (s) => {
				try {
					const f = s.type === 'custom' ? strategyFetch : (url: string) => fetch(url, { cache: 'no-store' });
					const roundPromise =
						profitRoundOffset === 0
							? f(`${s.baseUrl}/rounds/current`)
							: f(`${s.baseUrl}/rounds?page=${roundPage}&pageSize=1`);
					const [hourRes, dayRes, allRes, roundRes] = await Promise.all([
						f(
							`${s.baseUrl}/stats?from=${encodeURIComponent(hourFrom)}&to=${encodeURIComponent(hourTo)}`
						),
						f(
							`${s.baseUrl}/stats?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}`
						),
						f(`${s.baseUrl}/stats`),
						roundPromise
					]);
					const hourStats = hourRes.ok ? await hourRes.json() : null;
					const dayStats = dayRes.ok ? await dayRes.json() : null;
					const allStats = allRes.ok ? await allRes.json() : null;
					let current: StrategyProfitData['current'];
					if (profitRoundOffset === 0) {
						const curData: CurrentRoundResponse | null = roundRes.ok ? await roundRes.json() : null;
						current = parseCurrentRound(curData);
					} else {
						const data = roundRes.ok ? await roundRes.json() : null;
						const row = data?.rows?.[0] ?? null;
						if (row && row.status === 'settled') {
							current = {
								status: 'settled',
								profit: row.total_profit ?? 0,
								direction: row.entry_direction
							};
						} else if (row && row.status === 'skipped') {
							current = { status: 'skipped' };
						} else if (row && row.status === 'entered') {
							current = { status: 'entered', direction: row.entry_direction };
						} else {
							current = { status: 'watching' };
						}
					}
					return {
						id: s.id,
						profits: {
							current,
							hour: parseStats(hourStats),
							day: parseStats(dayStats),
							all: parseStats(allStats)
						} as StrategyProfitData
					};
				} catch {
					return { id: s.id, profits: null };
				}
			})
		);
		allStrategyProfits.clear();
		for (const r of results) allStrategyProfits.set(r.id, r.profits);
		lastProfitRefreshTime = Date.now();
		profitRefreshing = false;
	}

	/** Sync URL query params to reflect the active strategy */
	function syncUrlParams(strategyId?: string) {
		if (!browser) return;
		const url = new URL(window.location.href);
		// Strategy params
		const sid = strategyId ?? activeStrategyId;
		const strategy = allKnownStrategies.find((s) => s.id === sid);
		if (strategy) {
			if (strategy.type === 'builtin') {
				url.searchParams.set('s', strategy.label);
				url.searchParams.delete('url');
			} else {
				url.searchParams.set('s', 'custom');
				url.searchParams.set('url', strategy.baseUrl);
			}
		}
		// Settings params (only write non-default values)
		const settings = loadSettings();
		if (settings.theme !== 'dark') url.searchParams.set('th', settings.theme);
		else url.searchParams.delete('th');
		if (settings.textScale !== 'md') url.searchParams.set('ts', settings.textScale);
		else url.searchParams.delete('ts');
		if (preferences.numberLocale !== 'en-US') url.searchParams.set('nl', preferences.numberLocale);
		else url.searchParams.delete('nl');
		if (preferences.dateLocale !== 'en-US') url.searchParams.set('dl', preferences.dateLocale);
		else url.searchParams.delete('dl');
		if (preferences.currency !== 'USD') url.searchParams.set('cur', preferences.currency);
		else url.searchParams.delete('cur');
		history.replaceState(history.state, '', url.toString());
	}

	function onStrategyChange(strategyId: string) {
		if (strategyId === activeStrategyId) return;
		disconnectSSE();
		activeStrategyId = strategyId;
		syncUrlParams(strategyId);
		persistState();
		// Reset state
		events = [];
		stats = null;
		currentRound = null;
		rounds = [];
		roundsTotal = 0;
		roundsPage = 1;
		hourlyData = [];
		selectedHour = null;
		strategyInfo = allStrategyInfos.get(strategyId) ?? null;
		strategyStartTime = null;
		// Reconnect and refetch
		connectSSE();
		fetchCurrentRound();
		fetchStrategyInfo();
		fetchStrategyStart().then(() => {
			fetchStats();
			fetchHourly();
		});
		fetchRounds();
	}

	function persistState() {
		savePersistedState({
			customStrategies,
			visibleDiscoveredIds: [...visibleDiscoveredIds],
			hiddenStrategyIds: [...hiddenStrategyIds],
			activeStrategyId,
			collapsedSections: [...collapsedSections]
		});
	}

	async function addCustomStrategy() {
		const url = normalizeStrategyUrl(customUrlInput);
		if (!url) {
			customUrlError = t('btcUpdown.strategy.invalidUrl');
			return;
		}
		try {
			new URL(url);
		} catch {
			customUrlError = t('btcUpdown.strategy.invalidUrl');
			return;
		}
		// Check duplicate
		if (allRegisteredStrategies.some((s) => s.baseUrl === url)) {
			customUrlError = t('btcUpdown.strategy.duplicateUrl');
			return;
		}
		customUrlError = '';
		validationSteps = [];
		customUrlValidating = true;
		const lang = locale.value === 'zh' ? 'zh' : 'en';
		const result = await validateStrategyUrl(url, lang, (steps) => {
			validationSteps = steps;
		});
		customUrlValidating = false;
		if (!result.valid) {
			customUrlError = result.error;
			return;
		}
		const newStrategy: StrategyEndpoint = {
			id: generateCustomId(),
			label: result.info.name || url,
			baseUrl: url,
			type: 'custom',
			addedAt: Date.now()
		};
		customStrategies = [...customStrategies, newStrategy];
		customUrlInput = '';
		validationSteps = [];
		showAddStrategy = false;
		persistState();
		onStrategyChange(newStrategy.id);
		fetchAllStrategies();
		// Probe for sibling strategies on the same server
		probeServerSiblings(url);
	}

	async function probeServerSiblings(strategyUrl: string) {
		const disc = getDiscoveryUrl(strategyUrl);
		if (!disc) return;
		const lang = locale.value === 'zh' ? 'zh' : 'en';
		const result = await discoverStrategies(disc.origin, disc.path, lang, strategyFetch);
		if (!result) return;
		const host = new URL(strategyUrl).host;
		// Filter out strategies that the user explicitly added as custom
		const customUrls = new Set(customStrategies.map((s) => s.baseUrl));
		const siblings = result.strategies.filter((s) => !customUrls.has(s.baseUrl));
		discoveredSiblings.set(host, siblings);
		// Store their info
		for (let i = 0; i < result.strategies.length; i++) {
			const s = result.strategies[i];
			if (siblings.some((sib) => sib.id === s.id)) {
				allStrategyInfos.set(s.id, result.raw[i]);
			}
		}
	}

	function removeCustomStrategy(id: string) {
		const removed = customStrategies.find((s) => s.id === id);
		customStrategies = customStrategies.filter((s) => s.id !== id);
		if (removed) cleanupHost(removed.baseUrl);
		if (activeStrategyId === id) {
			activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
			onStrategyChange(activeStrategyId);
		}
		persistState();
		fetchAllStrategies();
	}

	function removeHostStrategies(host: string) {
		const hostStrategies = customStrategies.filter((s) => {
			try {
				return new URL(s.baseUrl).host === host;
			} catch {
				return false;
			}
		});
		customStrategies = customStrategies.filter((s) => !hostStrategies.some((h) => h.id === s.id));
		// Clean up discovered siblings
		const siblings = discoveredSiblings.get(host) ?? [];
		for (const sib of siblings) visibleDiscoveredIds.delete(sib.id);
		visibleDiscoveredIds = new Set(visibleDiscoveredIds);
		discoveredSiblings.delete(host);
		configPanelSection = null;
		// Switch active if needed
		if (
			hostStrategies.some((s) => s.id === activeStrategyId) ||
			siblings.some((s) => s.id === activeStrategyId)
		) {
			activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
			onStrategyChange(activeStrategyId);
		}
		persistState();
		fetchAllStrategies();
	}

	/** Clean up host siblings if no custom strategies remain for that host */
	function cleanupHost(baseUrl: string) {
		try {
			const host = new URL(baseUrl).host;
			const remaining = customStrategies.filter((s) => {
				try {
					return new URL(s.baseUrl).host === host;
				} catch {
					return false;
				}
			});
			if (remaining.length === 0) {
				const siblings = discoveredSiblings.get(host) ?? [];
				for (const sib of siblings) visibleDiscoveredIds.delete(sib.id);
				visibleDiscoveredIds = new Set(visibleDiscoveredIds);
				discoveredSiblings.delete(host);
			}
		} catch {
			/* ignore */
		}
	}

	function toggleStrategyVisibility(id: string) {
		if (id.startsWith('discovered:')) {
			// Discovered siblings: opt-in via visibleDiscoveredIds only
			if (visibleDiscoveredIds.has(id)) {
				visibleDiscoveredIds.delete(id);
				visibleDiscoveredIds = new Set(visibleDiscoveredIds);
				// If this was active, switch away
				if (activeStrategyId === id) {
					const first = allRegisteredStrategies.find((s) => s.id !== id);
					if (first) onStrategyChange(first.id);
				}
			} else {
				visibleDiscoveredIds.add(id);
				visibleDiscoveredIds = new Set(visibleDiscoveredIds);
			}
		} else {
			// Builtin / custom: opt-out via hiddenStrategyIds
			if (hiddenStrategyIds.has(id)) {
				hiddenStrategyIds.delete(id);
				hiddenStrategyIds = new Set(hiddenStrategyIds);
			} else {
				hiddenStrategyIds.add(id);
				hiddenStrategyIds = new Set(hiddenStrategyIds);
				// If hidden strategy was active, switch away
				if (activeStrategyId === id) {
					const first = allRegisteredStrategies.find((s) => s.id !== id);
					if (first) onStrategyChange(first.id);
				}
			}
		}
		persistState();
		fetchAllStrategyProfits();
	}

	function toggleConfigPanel(section: string) {
		if (configPanelSection === section) {
			configPanelSection = null;
			return;
		}
		configPanelSection = section;
		// Re-probe strategies when opening config panel
		if (section === 'builtin') {
			const lang = locale.value === 'zh' ? 'zh' : 'en';
			discoverStrategies(API_HOST, '/api/strategies', lang).then((result) => {
				if (!result) return;
				builtinStrategies = result.strategies.map((s) => ({
					...s,
					id: `builtin:${s.label}`,
					type: 'builtin' as const
				}));
				for (let i = 0; i < result.strategies.length; i++) {
					allStrategyInfos.set(`builtin:${result.strategies[i].label}`, result.raw[i]);
				}
			});
		} else {
			const sample = customStrategies.find((s) => {
				try {
					return new URL(s.baseUrl).host === section;
				} catch {
					return false;
				}
			});
			if (sample) probeServerSiblings(sample.baseUrl);
		}
	}

	function navigateProfitColumn(column: 'round' | 'hour' | 'day' | 'all', dir: -1 | 1) {
		if (column === 'all') return;
		if (column === 'round') {
			const next = profitRoundOffset + dir;
			if (next > 0) return;
			profitRoundOffset = next;
		} else if (column === 'hour') {
			const next = profitHourOffset + dir;
			if (next > 0) return;
			profitHourOffset = next;
		} else {
			const next = profitDayOffset + dir;
			if (next > 0) return;
			profitDayOffset = next;
		}
		fetchAllStrategyProfits();
	}

	function naturalCompare(a: string, b: string): number {
		const re = /(\d+)|(\D+)/g;
		const pa = a.match(re) ?? [];
		const pb = b.match(re) ?? [];
		for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
			const sa = pa[i] ?? '';
			const sb = pb[i] ?? '';
			const na = Number(sa);
			const nb = Number(sb);
			if (!isNaN(na) && !isNaN(nb)) {
				if (na !== nb) return na - nb;
			} else {
				const cmp = sa.localeCompare(sb);
				if (cmp !== 0) return cmp;
			}
		}
		return 0;
	}

	function sortStrategies<T extends { id: string; label: string }>(list: T[]): T[] {
		if (!profitSortColumn) return list;
		const col = profitSortColumn;
		const dir = profitSortDir === 'desc' ? -1 : 1;
		if (col === 'name') {
			return [...list].sort((a, b) => {
				const na = allStrategyInfos.get(a.id)?.name ?? a.label;
				const nb = allStrategyInfos.get(b.id)?.name ?? b.label;
				return naturalCompare(na, nb) * dir;
			});
		}
		return [...list].sort((a, b) => {
			const pa = allStrategyProfits.get(a.id);
			const pb = allStrategyProfits.get(b.id);
			const va = pa ? pa[col].profit : 0;
			const vb = pb ? pb[col].profit : 0;
			return (va - vb) * dir;
		});
	}

	function resetProfitColumn(column: 'round' | 'hour' | 'day') {
		if (column === 'round') profitRoundOffset = 0;
		else if (column === 'hour') profitHourOffset = 0;
		else profitDayOffset = 0;
		fetchAllStrategyProfits();
	}

	/** Jump main content filters to the date/hour the sidebar column is showing */
	function jumpToColumnContext(column: 'round' | 'hour' | 'day') {
		if (column === 'day' && profitDayOffset !== 0) {
			const d = new Date();
			d.setDate(d.getDate() + profitDayOffset);
			const ds = d.toLocaleDateString('en-CA');
			filterDate = { from: ds, to: ds };
			selectedHour = null;
			onDateChange();
		} else if (column === 'hour' && profitHourOffset !== 0) {
			const d = new Date();
			d.setMinutes(0, 0, 0);
			d.setHours(d.getHours() + profitHourOffset);
			// Set date to that hour's date (could be yesterday if offset crosses midnight)
			const ds = d.toLocaleDateString('en-CA');
			filterDate = { from: ds, to: ds };
			selectedHour = d.getHours();
			roundsPage = 1;
			fetchHourly();
			fetchStats();
			// Rounds will re-fetch via effect tracking selectedHour
		} else if (column === 'round' && profitRoundOffset !== 0) {
			// For round, jump to the rounds tab and set page to the offset
			roundsPage = Math.abs(profitRoundOffset);
			fetchRounds();
		}
	}

	function getProfitColumnLabel(column: 'round' | 'hour' | 'day' | 'all'): string {
		if (column === 'round') {
			if (profitRoundOffset === 0) return t('btcUpdown.strategy.profitLast');
			return `${profitRoundOffset}`;
		}
		if (column === 'hour') {
			if (profitHourOffset === 0) return t('btcUpdown.strategy.profit1h');
			// Show actual hour, e.g. "14:00"
			const d = new Date();
			d.setMinutes(0, 0, 0);
			d.setHours(d.getHours() + profitHourOffset);
			return `${String(d.getHours()).padStart(2, '0')}:00`;
		}
		if (column === 'all') return t('btcUpdown.strategy.profitAll');
		if (profitDayOffset === 0) return t('btcUpdown.strategy.profitToday');
		// Show actual date, e.g. "03/15"
		const d = new Date();
		d.setDate(d.getDate() + profitDayOffset);
		return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
	}

	function onDateChange() {
		roundsPage = 1;
		selectedHour = null;
		fetchStats();
		fetchHourly();
		fetchRounds();
	}

	// --- Effects ---

	$effect(() => {
		if (browser) {
			untrack(() => {
				// Load persisted state
				const persisted = loadPersistedState();
				customStrategies = persisted.customStrategies;
				visibleDiscoveredIds = new Set(persisted.visibleDiscoveredIds ?? []);
				const needsDefaultHidden = persisted.hiddenStrategyIds === null;
				hiddenStrategyIds = new Set(persisted.hiddenStrategyIds ?? []);
				activeStrategyId = persisted.activeStrategyId;
				if (persisted.collapsedSections?.length) {
					for (const s of persisted.collapsedSections) collapsedSections.add(s);
				}

				// Read URL query params for strategy sharing
				const urlParams = new URLSearchParams(window.location.search);
				const urlStrategy = urlParams.get('s');
				const urlEndpoint = urlParams.get('url');

				// Apply settings from URL (temporary override for shared links)
				const urlTheme = urlParams.get('th');
				const urlTextScale = urlParams.get('ts');
				const urlNumberLocale = urlParams.get('nl');
				const urlDateLocale = urlParams.get('dl');
				const urlCurrency = urlParams.get('cur');
				if (urlTheme && ['dark', 'light'].includes(urlTheme)) {
					applyTheme(urlTheme as Theme);
				}
				if (urlTextScale && ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(urlTextScale)) {
					applyTextScale(urlTextScale as TextScale);
				}
				if (urlNumberLocale) preferences.numberLocale = urlNumberLocale;
				if (urlDateLocale) preferences.dateLocale = urlDateLocale;
				if (urlCurrency) preferences.currency = urlCurrency;

				// Load time format and timezone from settings
				const pageSettings = loadSettings();
				timeFormat = pageSettings.timeFormat;
				if (pageSettings.timezone) preferences.timezone = pageSettings.timezone;
				// Listen for settings changes (same-tab custom event)
				const onSettingsChanged = (e: Event) => {
					const s = (e as CustomEvent).detail;
					if (s.timeFormat === '12' || s.timeFormat === '24') timeFormat = s.timeFormat;
					if (s.timezone) preferences.timezone = s.timezone;
				};
				window.addEventListener('settings-changed', onSettingsChanged);

				// Handle custom strategy from URL: auto-add if not already present
				if (urlStrategy === 'custom' && urlEndpoint) {
					const normalized = normalizeStrategyUrl(urlEndpoint);
					if (normalized) {
						const existing = [...customStrategies, ...builtinStrategies].find(
							(s) => s.baseUrl === normalized
						);
						if (existing) {
							activeStrategyId = existing.id;
							// Unhide if hidden
							if (hiddenStrategyIds.has(existing.id)) {
								hiddenStrategyIds.delete(existing.id);
								hiddenStrategyIds = new Set(hiddenStrategyIds);
							}
						} else {
							// Auto-add as custom strategy
							const newStrategy: StrategyEndpoint = {
								id: generateCustomId(),
								label: normalized,
								baseUrl: normalized,
								type: 'custom',
								addedAt: Date.now()
							};
							customStrategies = [...customStrategies, newStrategy];
							activeStrategyId = newStrategy.id;
							// Fetch name and probe siblings in background
							const lang = locale.value === 'zh' ? 'zh' : 'en';
							strategyFetch(`${normalized}/strategy?lang=${lang}`)
								.then(async (res) => {
									if (res.ok) {
										const info = await res.json();
										if (info?.name) {
											newStrategy.label = info.name;
											customStrategies = [...customStrategies];
											allStrategyInfos.set(newStrategy.id, info);
											persistState();
										}
									}
								})
								.catch(() => {});
							probeServerSiblings(normalized);
						}
						persistState();
					}
				}

				// Default to today's date
				filterDate = { from: todayLocal(), to: todayLocal() };

				// Discover default server strategies (replaces hardcoded list)
				const lang = locale.value === 'zh' ? 'zh' : 'en';
				discoverStrategies(API_HOST, '/api/strategies', lang).then((result) => {
					if (result) {
						builtinStrategies = result.strategies.map((s) => ({
							...s,
							id: `builtin:${s.label}`,
							type: 'builtin' as const
						}));
						// Populate strategy infos from discovery
						for (let i = 0; i < result.strategies.length; i++) {
							allStrategyInfos.set(`builtin:${result.strategies[i].label}`, result.raw[i]);
						}
					}
					// First visit: hide builtins not in DEFAULT_VISIBLE_BUILTINS
					if (needsDefaultHidden) {
						const toHide = builtinStrategies
							.filter((s) => !DEFAULT_VISIBLE_BUILTINS.has(s.label))
							.map((s) => s.id);
						hiddenStrategyIds = new Set(toHide);
						persistState();
					}
					// Handle builtin strategy from URL (after discovery so we know all versions)
					if (urlStrategy && urlStrategy !== 'custom') {
						const builtinId = `builtin:${urlStrategy}`;
						if (builtinStrategies.some((s) => s.id === builtinId)) {
							activeStrategyId = builtinId;
							// Unhide if hidden
							if (hiddenStrategyIds.has(builtinId)) {
								hiddenStrategyIds.delete(builtinId);
								hiddenStrategyIds = new Set(hiddenStrategyIds);
							}
							persistState();
						}
					}
					// Validate active strategy exists (after discovery resolves)
					if (!allRegisteredStrategies.find((s) => s.id === activeStrategyId)) {
						activeStrategyId = builtinStrategies[0]?.id ?? 'builtin:v1';
					}
					syncUrlParams(activeStrategyId);
					// Re-fetch strategy names with current locale (discovery may have used stale lang)
					fetchAllStrategies();
					fetchAllStrategyProfits();
					// Start data fetching now that strategy is finalized from URL/discovery
					fetchStrategyInfo();
					connectSSE();
					fetchCurrentRound();
					fetchRounds();
					fetchStrategyStart().then(() => {
						fetchStats();
						fetchHourly();
					});
				});

				// Re-probe siblings for custom servers
				const customHosts = new Set<string>();
				for (const s of customStrategies) {
					try {
						customHosts.add(new URL(s.baseUrl).host);
					} catch {
						/* ignore */
					}
				}
				for (const host of customHosts) {
					const sample = customStrategies.find((s) => {
						try {
							return new URL(s.baseUrl).host === host;
						} catch {
							return false;
						}
					});
					if (sample) probeServerSiblings(sample.baseUrl);
				}
			});
		}
	});

	// Re-fetch strategy info when locale changes (layout $effect sets locale async)
	$effect(() => {
		if (!browser) return;
		void locale.value; // track locale reactively
		untrack(() => {
			fetchStrategyInfo();
			fetchAllStrategies();
			fetchAllStrategyProfits();
		});
	});

	$effect(() => {
		if (browser) {
			const _page = roundsPage;
			const _filter = roundsFilter;
			void signalActionFilter;
			void resultFilter;
			void selectedHour;
			untrack(() => {
				fetchRounds();
			});
		}
	});

	$effect(() => {
		if (browser) {
			const interval = setInterval(() => {
				now = Date.now();
			}, 1000);
			return () => clearInterval(interval);
		}
	});

	// Auto-refresh currentRound when countdown expires or periodically as fallback
	let lastRoundRefetchTime = 0;
	$effect(() => {
		if (!browser || !currentRound) return;
		const endMs = new Date(currentRound.end_time).getTime();
		const _now = now; // track reactivity
		if (_now >= endMs && _now - lastRoundRefetchTime > 5000) {
			lastRoundRefetchTime = _now;
			untrack(() => {
				fetchCurrentRound();
				fetchRounds();
			});
		}
	});

	// Fallback: periodically re-fetch currentRound in case SSE events are missed
	$effect(() => {
		if (browser) {
			const interval = setInterval(() => {
				fetchCurrentRound();
			}, 15_000);
			return () => clearInterval(interval);
		}
	});

	// Auto-refresh strategy profits every 30s (only when viewing current data)
	$effect(() => {
		if (browser) {
			const interval = setInterval(() => {
				if (profitRoundOffset === 0 && profitHourOffset === 0 && profitDayOffset === 0) {
					fetchAllStrategyProfits();
				}
			}, 30_000);
			return () => clearInterval(interval);
		}
	});

	// Re-sync URL when preferences change (so shared links reflect current settings)
	$effect(() => {
		if (!browser) return;
		// Track reactive preferences
		void preferences.numberLocale;
		void preferences.dateLocale;
		void preferences.currency;
		untrack(() => syncUrlParams());
	});

	onDestroy(() => {
		disconnectSSE();
	});

	// --- Helpers (ET timezone) ---

	// Settings-aware formatting helpers (use user's preferences for locale, currency, timezone)

	function fmtTimeRaw(ts: string, style: 'short' | 'medium'): string {
		const dateObj = new Date(ts);
		const tz = preferences.timezone;
		if (timeFormat === '12') {
			// Always use en-US for consistent "9:46 AM" format
			return new Intl.DateTimeFormat('en-US', {
				timeStyle: style,
				timeZone: tz,
				hour12: true
			}).format(dateObj);
		}
		return formatDate(ts, { timeStyle: style });
	}

	function fmtTime(ts: string): string {
		return fmtTimeRaw(ts, 'medium');
	}

	function fmtShortTime(ts: string): string {
		return fmtTimeRaw(ts, 'medium');
	}

	function fmtLocalDate(ts: string): string {
		return formatDate(ts, { dateStyle: 'short' });
	}

	function tzLabel(): string {
		const tz = preferences.timezone;
		switch (tz) {
			case 'UTC':
				return 'UTC';
			case 'America/New_York':
				return 'ET';
			case 'Asia/Shanghai':
				return 'UTC+8';
			default: {
				// Use Intl to get short timezone name, e.g. "EST", "GMT+8"
				try {
					const parts = new Intl.DateTimeFormat('en-US', {
						timeZone: tz,
						timeZoneName: 'short'
					}).formatToParts(new Date());
					return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
				} catch {
					return tz;
				}
			}
		}
	}

	function fmtTimeWindow(start: string, end: string): string {
		const s = fmtShortTime(start);
		const e = fmtShortTime(end);
		if (timeFormat === '12') {
			// Extract period (AM/PM/上午/下午) from end time, strip from both
			const periodRe = /\s*(AM|PM|上午|下午|午前|午後)/i;
			const periodMatch = e.match(periodRe);
			const period = periodMatch ? periodMatch[1] : '';
			const sClean = s.replace(periodRe, '').trim();
			const eClean = e.replace(periodRe, '').trim();
			return `${sClean} - ${eClean} ${period} ${tzLabel()}`.trim();
		}
		return `${s} - ${e} ${tzLabel()}`;
	}

	function fmtProfit(value: number): string {
		const sign = value >= 0 ? '+' : '';
		return sign + formatCurrency(value);
	}

	function fmtPct(value: number): string {
		return formatNumber(value, {
			style: 'percent',
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		});
	}

	function fmtDateTimeShort(ts: string): string {
		return formatDateTime(ts, {
			dateStyle: 'medium',
			timeStyle: 'short',
			hour12: timeFormat === '12'
		});
	}

	function fmtPrice(value: number): string {
		return formatNumber(value, {
			style: 'currency',
			minimumFractionDigits: 4,
			maximumFractionDigits: 4
		});
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
			case 'round_start':
				return t('btcUpdown.event.roundStart');
			case 'entry':
				return t('btcUpdown.event.entry');
			case 'settlement':
				return t('btcUpdown.event.settlement');
			case 'exit_trigger':
				return t('btcUpdown.event.exitTrigger');
			case 'hedge_placed':
				return t('btcUpdown.event.hedgePlaced');
			case 'hedge_filled':
				return t('btcUpdown.event.hedgeFilled');
			case 'hedge_sold':
				return t('btcUpdown.event.hedgeSold');
			case 'hedge_expired':
				return t('btcUpdown.event.hedgeExpired');
			case 'round_skip':
				return t('btcUpdown.event.roundSkip');
			default:
				return type;
		}
	}

	function getEventMessage(event: SSEEvent): string {
		const d = event.data;
		switch (event.type) {
			case 'round_start':
				return t('btcUpdown.live.roundStart', {
					id: String(d.roundId ?? ''),
					remaining: String(d.totalRemaining ?? ''),
					range: String(d.priceRange ?? '')
				});
			case 'entry':
				return t('btcUpdown.live.entry', {
					direction: String(d.direction ?? ''),
					shares: String(
						typeof d.shares === 'number'
							? formatNumber(d.shares, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
							: (d.shares ?? '')
					),
					price: String(
						typeof d.avgPrice === 'number'
							? formatNumber(d.avgPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
							: (d.avgPrice ?? '')
					),
					cost: String(d.cost ?? '50')
				});
			case 'settlement': {
				const won = d.won as boolean;
				const key = won ? 'btcUpdown.live.settlementWin' : 'btcUpdown.live.settlementLoss';
				return t(key, {
					direction: String(d.direction ?? ''),
					outcome: String(d.outcome ?? ''),
					profit: fmtProfit((d.totalProfit as number) ?? 0)
				});
			}
			case 'exit_trigger':
				return t('btcUpdown.live.exitTrigger', {
					type: String(d.type ?? ''),
					price: String(
						typeof d.exitPrice === 'number'
							? formatNumber(d.exitPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
							: (d.exitPrice ?? '')
					),
					profit: fmtProfit((d.profit as number) ?? 0)
				});
			case 'hedge_placed':
				return t('btcUpdown.live.hedgePlaced', {
					shares: String(d.shares ?? '100'),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.limitPrice === 'number' ? formatCurrency(d.limitPrice) : (d.limitPrice ?? '')
					)
				});
			case 'hedge_filled':
				return t('btcUpdown.live.hedgeFilled', {
					shares: String(d.shares ?? ''),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.fillPrice === 'number' ? formatCurrency(d.fillPrice) : (d.fillPrice ?? '')
					)
				});
			case 'hedge_sold':
				return t('btcUpdown.live.hedgeSold', {
					shares: String(
						typeof d.shares === 'number'
							? formatNumber(d.shares, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
							: (d.shares ?? '')
					),
					direction: String(d.direction ?? ''),
					price: String(
						typeof d.avgPrice === 'number' ? formatCurrency(d.avgPrice) : (d.avgPrice ?? '')
					),
					revenue: String(
						typeof d.revenue === 'number' ? formatCurrency(d.revenue) : (d.revenue ?? '')
					)
				});
			case 'hedge_expired':
				return t('btcUpdown.live.hedgeExpired', {
					direction: String(d.direction ?? '')
				});
			case 'round_skip':
				return t('btcUpdown.live.roundSkip', {
					id: String(d.roundId ?? ''),
					checks: String(d.windowsChecked ?? ''),
					range: String(d.priceRange ?? '')
				});
			default:
				return String(d.message ?? event.type);
		}
	}

	function getEventColorClass(type: string): string {
		switch (type) {
			case 'entry':
				return 'event-green';
			case 'settlement':
			case 'exit_trigger':
				return 'event-settlement';
			case 'round_start':
				return 'event-blue';
			case 'hedge_placed':
			case 'hedge_filled':
			case 'hedge_sold':
			case 'hedge_expired':
				return 'event-amber';
			case 'round_skip':
				return 'event-gray';
			default:
				return 'event-gray';
		}
	}

	function isRoundWon(round: Round): boolean {
		return round.outcome != null && round.outcome === round.entry_direction;
	}

	function getRoundStatusLabel(round: Round): string {
		if (round.status === 'skipped') return t('btcUpdown.round.skip');
		if (round.status === 'watching') return t('btcUpdown.round.watching');
		if (round.status === 'pending') return t('btcUpdown.round.pending');
		if (round.status === 'entered') return t('btcUpdown.round.entered');
		if (round.status === 'settled') {
			return isRoundWon(round) ? t('btcUpdown.round.win') : t('btcUpdown.round.loss');
		}
		return round.status;
	}

	function getRoundBadgeClass(round: Round): string {
		if (round.status === 'skipped') return 'badge-skip';
		if (round.status === 'watching' || round.status === 'pending') return 'badge-watching';
		if (round.status === 'entered') return 'badge-entered';
		if (round.status === 'settled') {
			return isRoundWon(round) ? 'badge-win' : 'badge-loss';
		}
		return 'badge-watching';
	}

	function getHedgeStatusLabel(status: string): string {
		switch (status) {
			case 'filled':
				return t('btcUpdown.hedge.filled');
			case 'expired':
				return t('btcUpdown.hedge.expired');
			case 'sold':
				return t('btcUpdown.hedge.sold');
			case 'open':
				return t('btcUpdown.hedge.open');
			case 'pending':
				return t('btcUpdown.hedge.pending');
			default:
				return status;
		}
	}

	function getSkipReasonLabel(reason: string): string {
		if (reason.startsWith('signal_skip')) {
			const match = reason.match(/score=(\d+)/);
			return t('btcUpdown.skip.signalSkip', { score: match?.[1] ?? '0' });
		}
		switch (reason) {
			case 'no_qualifying_signal':
				return t('btcUpdown.skip.noQualifyingSignal');
			case 'no_signal':
				return t('btcUpdown.skip.noSignal');
			case 'market_expired':
				return t('btcUpdown.skip.marketExpired');
			case 'window_expired':
				return t('btcUpdown.skip.windowExpired');
			case 'daemon_restarted':
				return t('btcUpdown.skip.daemonRestarted');
			default:
				return reason;
		}
	}

	function getSwingExitLabel(reason: string): string {
		const zh = locale.value === 'zh';
		switch (reason) {
			case 'stop_loss':
				return zh ? '止损' : 'Stop Loss';
			case 'binance_stop_loss':
				return zh ? '币安止损' : 'Binance Stop Loss';
			case 'take_profit':
				return zh ? '止盈' : 'Take Profit';
			case 'checkpoint_mismatch':
				return zh ? '信号反转' : 'Signal Reversed';
			case 'clob_direction_mismatch':
				return zh ? '方向偏离' : 'Direction Mismatch';
			case 'price_moved_against':
				return zh ? '价格反向' : 'Price Moved Against';
			case 'manual':
				return zh ? '手动退出' : 'Manual Exit';
			case 'timeout':
				return zh ? '超时退出' : 'Timeout';
			default:
				return reason;
		}
	}

	function setFilter(filter: RoundStatusFilter) {
		roundsFilter = filter;
		signalActionFilter = '';
		resultFilter = '';
		roundsPage = 1;
	}

	function setSignalFilter(filter: SignalActionFilter) {
		signalActionFilter = filter;
		roundsFilter = '';
		resultFilter = '';
		roundsPage = 1;
	}

	function setResultFilter(filter: ResultFilter) {
		resultFilter = filter;
		roundsFilter = '';
		signalActionFilter = '';
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

	<div class="page-layout">
		<!-- Sidebar (strategy panel) -->
		<aside class="sidebar">
			{#snippet profitCells(profits: StrategyProfitData)}
				<span class="strategy-profits">
					<span class="profit-cell">
						<span
							class="profit-val"
							class:positive={profits.hour.profit >= 0}
							class:negative={profits.hour.profit < 0}
							>{profits.hour.profit >= 0 ? '+' : ''}{Math.round(profits.hour.profit)}</span
						>
						<span class="profit-meta"
							>{profits.hour.rounds}r {Math.round(profits.hour.winRate * 100)}%</span
						>
					</span>
					<span class="profit-cell">
						<span
							class="profit-val"
							class:positive={profits.day.profit >= 0}
							class:negative={profits.day.profit < 0}
							>{profits.day.profit >= 0 ? '+' : ''}{Math.round(profits.day.profit)}</span
						>
						<span class="profit-meta"
							>{profits.day.rounds}r {Math.round(profits.day.winRate * 100)}%</span
						>
					</span>
				<span class="profit-cell">
					<span
						class="profit-val"
						class:positive={profits.all.profit >= 0}
						class:negative={profits.all.profit < 0}
						>{profits.all.profit >= 0 ? '+' : ''}{Math.round(profits.all.profit)}</span
					>
					<span class="profit-meta"
						>{profits.all.rounds}r {Math.round(profits.all.winRate * 100)}%</span
					>
				</span>
				</span>
			{/snippet}

			{#snippet columnHeaders()}
				<div class="profit-column-labels">
					<span
						class="profit-col-label name-col-label"
						class:sort-active={profitSortColumn === 'name'}
						onclick={() => {
							if (profitSortColumn === 'name') {
								profitSortDir = profitSortDir === 'desc' ? 'asc' : 'desc';
							} else {
								profitSortColumn = 'name';
								profitSortDir = 'asc';
							}
						}}
						role="button"
						tabindex={0}
						title={locale.value === 'zh' ? '点击排序' : 'Click to sort'}
					>
						{locale.value === 'zh' ? '策略' : 'Name'}
						{#if profitSortColumn === 'name'}
							<span class="sort-indicator">{profitSortDir === 'desc' ? '↓' : '↑'}</span>
						{/if}
					</span>
					<span class="profit-col-labels-right">
						{#each ['hour', 'day', 'all'] as col (col)}
							{@const offset =
								col === 'round'
									? profitRoundOffset
									: col === 'hour'
										? profitHourOffset
										: col === 'day' ? profitDayOffset : 0}
							{@const colKey = col as 'round' | 'hour' | 'day' | 'all'}
							<div class="profit-col-nav">
								{#if col !== 'all'}
							<button class="col-nav-btn-v" onclick={() => navigateProfitColumn(colKey, -1)}>
									<svg width="12" height="7" viewBox="0 0 12 7"
										><path
											d="M1 6L6 1L11 6"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
								</button>
								{/if}
								<span
									class="profit-col-label"
									class:offset-active={offset !== 0}
									class:sort-active={profitSortColumn === col}
									onclick={() => {
										if (profitSortColumn === col) {
											profitSortDir = profitSortDir === 'desc' ? 'asc' : 'desc';
										} else {
											profitSortColumn = col as 'hour' | 'day' | 'all';
											profitSortDir = 'desc';
										}
									}}
									role="button"
									tabindex={0}
									title={locale.value === 'zh' ? '点击排序' : 'Click to sort'}
								>
									{getProfitColumnLabel(colKey)}
									{#if profitSortColumn === col}
										<span class="sort-indicator">{profitSortDir === 'desc' ? '↓' : '↑'}</span>
									{/if}
								</span>
								{#if col !== 'all'}
								<button
									class="col-nav-btn-v"
									disabled={offset === 0}
									onclick={() => navigateProfitColumn(colKey, 1)}
								>
									<svg width="12" height="7" viewBox="0 0 12 7"
										><path
											d="M1 1L6 6L11 1"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
								</button>
								{/if}
							</div>
						{/each}
					</span>
				</div>
			{/snippet}

			<!-- Strategy Selector -->
			{#snippet refreshIndicator()}
				{#if lastProfitRefreshTime > 0}
					{@const elapsed = Math.floor((now - lastProfitRefreshTime) / 1000)}
					<span class="last-refresh-time">{elapsed}s</span>
				{/if}
				<button
					class="profit-refresh-btn"
					class:refreshing={profitRefreshing}
					onclick={() => fetchAllStrategyProfits()}
					title={t('btcUpdown.strategy.refresh')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path
							d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
						/></svg
					>
				</button>
			{/snippet}

			<div class="version-selector glass-card" use:fadeInUp={{ delay: 10 }}>
				<div class="version-header">
					<span class="version-label">{t('btcUpdown.strategy.title')}</span>
				</div>
				<!-- Built-in strategies -->
				<div class="version-header">
					<button class="section-collapse-btn" onclick={() => toggleCollapse('builtin')}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class:collapsed={collapsedSections.has('builtin')}
							><polyline points="6 9 12 15 18 9" /></svg
						>
					</button>
					<span class="version-type-label">{t('btcUpdown.strategy.builtin')}</span>
					{@render refreshIndicator()}
					<button
						class="section-config-btn"
						class:has-hidden={hiddenBuiltinCount > 0}
						onclick={() => toggleConfigPanel('builtin')}
					>
						<span class="config-count" class:has-hidden={hiddenBuiltinCount > 0}
							>{builtinStrategies.length - hiddenBuiltinCount}/{builtinStrategies.length}</span
						>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><circle cx="12" cy="12" r="3" /><path
								d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
							/></svg
						>
					</button>
				</div>
				{#if !collapsedSections.has('builtin')}
					{#if configPanelSection === 'builtin'}
						<div class="config-batch-actions">
							<button
								class="config-batch-btn"
								onclick={() => {
									builtinStrategies.forEach((s) => hiddenStrategyIds.delete(s.id));
									hiddenStrategyIds = new Set(hiddenStrategyIds);
									persistState();
									fetchAllStrategyProfits();
								}}>{t('btcUpdown.strategy.showAll')}</button
							>
							<button
								class="config-batch-btn"
								onclick={() => {
									builtinStrategies.forEach((s) => {
										if (s.id !== activeStrategyId) hiddenStrategyIds.add(s.id);
									});
									hiddenStrategyIds = new Set(hiddenStrategyIds);
									persistState();
									fetchAllStrategyProfits();
								}}>{t('btcUpdown.strategy.hideAll')}</button
							>
						</div>
					{/if}
					{@render columnHeaders()}
					<div class="version-options">
						{#each sortStrategies(builtinStrategies) as s (s.id)}
							{@const profits = allStrategyProfits.get(s.id)}
							{@const isHidden = hiddenStrategyIds.has(s.id)}
							{#if !isHidden || configPanelSection === 'builtin'}
								<div class="version-row" class:row-hidden={isHidden}>
									<button
										class="version-btn"
										class:active={activeStrategyId === s.id}
										onclick={() => onStrategyChange(s.id)}
									>
										<span class="strategy-name">{allStrategyInfos.get(s.id)?.name ?? s.label}</span>
										{#if profits && !isHidden}
											{@render profitCells(profits)}
										{/if}
									</button>
									{#if activeStrategyId !== s.id}
										<button
											class="row-hide-btn"
											onclick={() => toggleStrategyVisibility(s.id)}
											title={locale.value === 'zh'
												? isHidden
													? '显示'
													: '隐藏'
												: isHidden
													? 'Show'
													: 'Hide'}
										>
											{#if isHidden}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													><path
														d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
													/><line x1="1" y1="1" x2="23" y2="23" /></svg
												>
											{:else}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
														cx="12"
														cy="12"
														r="3"
													/></svg
												>
											{/if}
										</button>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
				<!-- Custom strategy groups -->
				{#each customStrategiesByHost as [host, strategies] (host)}
					{@const siblings = discoveredSiblings.get(host) ?? []}
					{@const allHostStrategies = [...strategies, ...siblings]}
					{@const totalHostCount = allHostStrategies.length}
					{@const visibleCount = allHostStrategies.filter((s) =>
						s.type === 'discovered' ? visibleDiscoveredIds.has(s.id) : !hiddenStrategyIds.has(s.id)
					).length}
					<div class="version-header custom-header">
						<button class="section-collapse-btn" onclick={() => toggleCollapse(host)}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class:collapsed={collapsedSections.has(host)}
								><polyline points="6 9 12 15 18 9" /></svg
							>
						</button>
						<span class="version-type-label host-label" title={host}>{host}</span>
						<button
							class="host-remove-btn"
							onclick={() => removeHostStrategies(host)}
							title={t('btcUpdown.strategy.remove')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
							>
						</button>
						{@render refreshIndicator()}
						<button
							class="section-config-btn"
							class:has-hidden={visibleCount < totalHostCount}
							onclick={() => toggleConfigPanel(host)}
						>
							<span class="config-count" class:has-hidden={visibleCount < totalHostCount}
								>{visibleCount}/{totalHostCount}</span
							>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><circle cx="12" cy="12" r="3" /><path
									d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
								/></svg
							>
						</button>
					</div>
					{#if !collapsedSections.has(host)}
						{#if configPanelSection === host}
							<div class="config-batch-actions">
								<button
									class="config-batch-btn"
									onclick={() => {
										[...strategies, ...siblings].forEach((s) => {
											if (s.id.startsWith('discovered:')) {
												visibleDiscoveredIds.add(s.id);
											} else {
												hiddenStrategyIds.delete(s.id);
											}
										});
										hiddenStrategyIds = new Set(hiddenStrategyIds);
										visibleDiscoveredIds = new Set(visibleDiscoveredIds);
										persistState();
										fetchAllStrategyProfits();
									}}>{t('btcUpdown.strategy.showAll')}</button
								>
								<button
									class="config-batch-btn"
									onclick={() => {
										[...strategies, ...siblings].forEach((s) => {
											if (s.id === activeStrategyId) return;
											if (s.id.startsWith('discovered:')) {
												visibleDiscoveredIds.delete(s.id);
											} else {
												hiddenStrategyIds.add(s.id);
											}
										});
										hiddenStrategyIds = new Set(hiddenStrategyIds);
										visibleDiscoveredIds = new Set(visibleDiscoveredIds);
										persistState();
										fetchAllStrategyProfits();
									}}>{t('btcUpdown.strategy.hideAll')}</button
								>
							</div>
						{/if}
						{@render columnHeaders()}
						<div class="version-options">
							{#each sortStrategies(allHostStrategies) as s (s.id)}
								{@const profits = allStrategyProfits.get(s.id)}
								{@const isHidden =
									s.type === 'discovered'
										? !visibleDiscoveredIds.has(s.id)
										: hiddenStrategyIds.has(s.id)}
								{#if !isHidden || configPanelSection === host}
									<div class="version-row" class:row-hidden={isHidden}>
										<button
											class="version-btn custom-version-btn"
											class:active={activeStrategyId === s.id}
											onclick={() => onStrategyChange(s.id)}
										>
											<span class="custom-dot"></span>
											<span class="strategy-name"
												>{allStrategyInfos.get(s.id)?.name ?? s.label}</span
											>
											{#if profits && !isHidden}
												{@render profitCells(profits)}
											{/if}
										</button>
										{#if activeStrategyId !== s.id}
											<button
												class="row-hide-btn"
												onclick={() => toggleStrategyVisibility(s.id)}
												title={locale.value === 'zh'
													? isHidden
														? '显示'
														: '隐藏'
													: isHidden
														? 'Show'
														: 'Hide'}
											>
												{#if isHidden}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														><path
															d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
														/><line x1="1" y1="1" x2="23" y2="23" /></svg
													>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
															cx="12"
															cy="12"
															r="3"
														/></svg
													>
												{/if}
											</button>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				{/each}
				<button class="add-strategy-btn" onclick={() => (showAddStrategy = true)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
					>
					{t('btcUpdown.strategy.addCustom')}
				</button>
			</div>
		</aside>

		<!-- Main content -->
		<div class="main-content">
			<!-- Disclaimer -->
			<div
				class="disclaimer"
				class:disclaimer-live={strategyInfo?.mode === 'live'}
				use:fadeInUp={{ delay: 30 }}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if strategyInfo?.mode === 'live'}
						<path
							d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
						/>
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					{:else}
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					{/if}
				</svg>
				<span
					>{t(
						strategyInfo?.mode === 'live'
							? 'btcUpdown.disclaimer.live'
							: 'btcUpdown.disclaimer.simulation'
					)}</span
				>
			</div>

			<!-- Sticky strategy title (shown when strategy-info card scrolls away) -->
			{#if strategyInfo && showStickyTitle}
				<div class="sticky-strategy-title" transition:fly={{ y: -20, duration: 200 }}>
					<svg
						class="sticky-strategy-icon"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" stroke-width="1.2" />
						<circle cx="8" cy="8" r="2" fill="currentColor" />
					</svg>
					<span class="sticky-strategy-name">{strategyInfo.name}</span>
				</div>
			{/if}
			<!-- Strategy Info Card -->
			{#if strategyInfo}
				<div class="strategy-info glass-card" use:observeVisibility use:fadeInUp={{ delay: 15 }}>
					<h3 class="strategy-info-name">{strategyInfo.name}</h3>
					{#if strategyInfo.description?.length}
						<div class="strategy-description">
							<p>{strategyInfo.description}</p>
						</div>
					{/if}
					<div class="strategy-summary-grid">
						{#each strategyInfo.summary as item (item.label)}
							<div class="strategy-summary-item" class:summary-wide={item.value.length > 20}>
								<span class="strategy-summary-label">{item.label}</span>
								<span class="strategy-summary-value">{item.value}</span>
							</div>
						{/each}
					</div>
				</div>
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
						<span class="runtime-date">{fmtDateTimeShort(strategyStartTime)}</span>
					</div>
				</div>
			{/if}

			<!-- Data section (wrapped for mobile reordering – appears after live feed on mobile) -->
			<div class="main-data">
				<!-- Date Filter -->
				<div class="date-filter glass-card" use:fadeInUp={{ delay: 40 }}>
					<span class="date-filter-label">{t('btcUpdown.filter.date')}</span>
					<DatePicker
						mode="range"
						bind:value={filterDate}
						onchange={onDateChange}
						presets={['all', 'today', '7d', '30d']}
						navigation
						max={todayLocal()}
					/>
				</div>

				<!-- Stats Overview -->
				{#if stats}
					{#if selectedHour !== null}
						<div class="stats-hour-badge">
							<span
								>{String(selectedHour).padStart(2, '0')}:00 – {String(selectedHour).padStart(
									2,
									'0'
								)}:59</span
							>
							<button
								class="stats-hour-clear"
								onclick={() => {
									selectedHour = null;
									fetchStats();
								}}>✕</button
							>
						</div>
					{/if}
					<section class="stats-grid" use:fadeInUp={{ delay: 45 }}>
						<div class="stat-card glass-card">
							<span class="stat-label">{t('btcUpdown.stats.winRate')}</span>
							<span class="stat-value highlight">{fmtPct(stats.winRate)}</span>
							<span class="stat-sub stat-sub-rows">
								<span>{stats.wins}{t('btcUpdown.stats.wins')}</span>
								<span>{stats.losses}{t('btcUpdown.stats.losses')}</span>
							</span>
						</div>
						<div class="stat-card glass-card">
							<span class="stat-label">{t('btcUpdown.stats.totalProfit')}</span>
							<span
								class="stat-value"
								class:positive={stats.totalProfit >= 0}
								class:negative={stats.totalProfit < 0}
							>
								{fmtProfit(stats.totalProfit)}
							</span>
							<span class="stat-sub stat-sub-rows">
								<span>{t('btcUpdown.stats.avgProfit')}</span>
								<span class:positive={stats.avgProfit >= 0} class:negative={stats.avgProfit < 0}>{fmtProfit(stats.avgProfit)}</span>
							</span>
						</div>
						<div class="stat-card glass-card">
							<span class="stat-label">{t('btcUpdown.stats.totalRounds')}</span>
							<span class="stat-value">{stats.totalRounds}</span>
							<span class="stat-sub stat-sub-rows">
								<span>{stats.entered} {t('btcUpdown.stats.entered')}</span>
								<span>{stats.skipped} {t('btcUpdown.stats.skipped')}</span>
							</span>
						</div>
						<div class="stat-card glass-card">
							<span class="stat-label">{t('btcUpdown.stats.streak')}</span>
							<span
								class="stat-value"
								class:positive={stats.currentStreak > 0}
								class:negative={stats.currentStreak < 0}
							>
								{stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak}
							</span>
							<span class="stat-sub stat-sub-rows">
								<span>{t('btcUpdown.stats.best')}: <span class="positive">{fmtProfit(stats.bestRound)}</span></span>
								<span>{t('btcUpdown.stats.worst')}: <span class="negative">{fmtProfit(stats.worstRound)}</span></span>
							</span>
						</div>
					</section>
				{/if}

				<!-- Hourly Profit Chart (single day only) -->
				{#if isSingleDayFilter}
					{@const maxAbs = Math.max(...hourlyData.map((h) => Math.abs(h.profit)), 1)}
					{@const hourlyMap = new Map(hourlyData.map((h) => [h.hour, h]))}
					{@const currentLocalHour = new Date().getHours()}
					{@const isToday = filterDate.from === todayLocal()}
					{@const isPastDate = filterDate.from < todayLocal()}
					<section class="hourly-chart glass-card" use:fadeInUp={{ delay: 50 }}>
						<h3 class="section-label">{t('btcUpdown.chart.hourlyProfit')}</h3>
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
											onclick={() => {
												selectedHour = selectedHour === hour ? null : hour;
												roundsPage = 1;
												fetchStats();
											}}
										>
											{#if h}
												<span
													class="chart-value"
													class:positive={h.profit >= 0}
													class:negative={h.profit < 0}
												>
													{fmtProfit(h.profit)}
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
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</section>
				{/if}

				<!-- ===== Round History / Live Feed ===== -->
				<div class="history-header">
					<div class="history-tabs">
						<button
							class="history-tab"
							class:active={historyTab === 'rounds'}
							onclick={() => {
								historyTab = 'rounds';
							}}
						>
							{t('btcUpdown.tabHistory')}
						</button>
						<button
							class="history-tab"
							class:active={historyTab === 'live'}
							onclick={() => {
								historyTab = 'live';
							}}
						>
							{t('btcUpdown.tabLive')}
							{#if connectionStatus === 'connected'}
								<span class="tab-live-dot"></span>
							{/if}
						</button>
					</div>
				</div>
				{#if historyTab === 'rounds'}
					<div class="filter-bar">
						<div class="filter-row">
							<div class="filter-group">
								{#each [{ value: '', label: t('btcUpdown.filter.all'), count: stats?.totalRounds ?? null }, { value: 'entered', label: t('btcUpdown.filter.entered'), count: stats ? stats.entered - stats.wins - stats.losses : null }, { value: 'settled', label: t('btcUpdown.filter.settled'), count: stats ? stats.wins + stats.losses : null }, { value: 'skipped', label: t('btcUpdown.filter.skipped'), count: stats?.skipped ?? null }] as filter (filter.value)}
									<button
										class="filter-btn"
										class:active={roundsFilter === filter.value &&
											!signalActionFilter &&
											!resultFilter}
										onclick={() => setFilter(filter.value as RoundStatusFilter)}
									>
										{filter.label}{#if filter.count !== null}<span class="filter-count"
												>{filter.count}</span
											>{/if}
									</button>
								{/each}
							</div>
							<span class="filter-sep">|</span>
							<div class="filter-group">
								<button
									class="filter-btn signal-filter-btn"
									class:active={signalActionFilter === 'bet'}
									onclick={() => setSignalFilter(signalActionFilter === 'bet' ? '' : 'bet')}
								>
									{t('btcUpdown.filter.signalBet')}{#if stats?.signalBet != null}<span
											class="filter-count">{stats.signalBet}</span
										>{/if}
									{#if stats && (stats.signalBetWins || stats.signalBetLosses)}
										<span class="filter-wl"
											><span class="wl-w">{stats.signalBetWins}W</span><span class="wl-l"
												>{stats.signalBetLosses}L</span
											></span
										>
									{/if}
								</button>
								<button
									class="filter-btn signal-filter-btn"
									class:active={signalActionFilter === 'reverse'}
									onclick={() => setSignalFilter(signalActionFilter === 'reverse' ? '' : 'reverse')}
								>
									{t('btcUpdown.filter.signalReverse')}{#if stats?.signalReverse != null}<span
											class="filter-count">{stats.signalReverse}</span
										>{/if}
									{#if stats && (stats.signalReverseWins || stats.signalReverseLosses)}
										<span class="filter-wl"
											><span class="wl-w">{stats.signalReverseWins}W</span><span class="wl-l"
												>{stats.signalReverseLosses}L</span
											></span
										>
										<span
											class="filter-delta"
											class:positive={stats.signalReverseWins - stats.signalReverseLosses > 0}
											class:negative={stats.signalReverseWins - stats.signalReverseLosses < 0}
											>{stats.signalReverseWins - stats.signalReverseLosses > 0
												? '+'
												: ''}{stats.signalReverseWins - stats.signalReverseLosses}</span
										>
									{/if}
								</button>
								<button
									class="filter-btn signal-filter-btn"
									class:active={signalActionFilter === 'skip'}
									onclick={() => setSignalFilter(signalActionFilter === 'skip' ? '' : 'skip')}
								>
									{t('btcUpdown.filter.signalSkip')}{#if stats?.signalSkip != null}<span
											class="filter-count">{stats.signalSkip}</span
										>{/if}
									{#if stats && (stats.signalSkipWouldWin || stats.signalSkipWouldLose)}
										<span class="filter-wl"
											><span class="wl-w">-{stats.signalSkipWouldWin}W</span><span class="wl-l"
												>-{stats.signalSkipWouldLose}L</span
											></span
										>
										<span
											class="filter-delta"
											class:positive={stats.signalSkipWouldLose - stats.signalSkipWouldWin > 0}
											class:negative={stats.signalSkipWouldLose - stats.signalSkipWouldWin < 0}
											>{stats.signalSkipWouldLose - stats.signalSkipWouldWin > 0
												? '+'
												: ''}{stats.signalSkipWouldLose - stats.signalSkipWouldWin}</span
										>
									{/if}
								</button>
							</div>
							<span class="filter-sep">|</span>
							<div class="filter-group">
								<button
									class="filter-btn"
									class:active={resultFilter === 'win'}
									onclick={() => setResultFilter(resultFilter === 'win' ? '' : 'win')}
								>
									{t('btcUpdown.filter.win')}{#if stats?.wins != null}<span class="filter-count"
											>{stats.wins}</span
										>{/if}
								</button>
								<button
									class="filter-btn"
									class:active={resultFilter === 'loss'}
									onclick={() => setResultFilter(resultFilter === 'loss' ? '' : 'loss')}
								>
									{t('btcUpdown.filter.loss')}{#if stats?.losses != null}<span class="filter-count"
											>{stats.losses}</span
										>{/if}
								</button>
								<button
									class="filter-btn"
									class:active={resultFilter === 'stop_loss'}
									onclick={() => setResultFilter(resultFilter === 'stop_loss' ? '' : 'stop_loss')}
								>
									{t('btcUpdown.filter.stopLoss')}{#if stats?.stopLossCount != null}<span
											class="filter-count">{stats.stopLossCount}</span
										>{/if}
								</button>
							</div>
						</div>
						<button class="refresh-btn" onclick={() => fetchRounds()} disabled={roundsLoading}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="23 4 23 10 17 10" />
								<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
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
										<a
											class="round-id-link"
											href="https://polymarket.com/event/{round.market_slug}"
											target="_blank"
											rel="noopener noreferrer">#{round.id}</a
										>
										<span class="round-time-window"
											><span class="round-local-date">{fmtLocalDate(round.event_start_time)}</span>
											{fmtTimeWindow(round.event_start_time, round.end_time)}</span
										>
										<span class="round-badge {getRoundBadgeClass(round)}"
											>{getRoundStatusLabel(round)}</span
										>
									</div>

									{#if round.entry_direction}
										<div class="round-body">
											<div class="round-row">
												<span class="round-label">{t('btcUpdown.round.direction')}</span>
												<span
													class="round-value direction-tag direction-{round.entry_direction.toLowerCase()}"
													>{round.entry_direction}</span
												>
											</div>
											{#if round.entry_price_avg !== null}
												<div class="round-row">
													<span class="round-label">{t('btcUpdown.round.entryPrice')}</span>
													<span class="round-value mono">{fmtPrice(round.entry_price_avg)}</span>
												</div>
											{/if}
											{#if round.outcome}
												<div class="round-row">
													<span class="round-label">{t('btcUpdown.round.outcome')}</span>
													<span
														class="round-value direction-tag direction-{round.outcome.toLowerCase()}"
														>{round.outcome}</span
													>
												</div>
											{/if}
											{#if round.entry_time}
												<div class="round-row">
													<span class="round-label">{t('btcUpdown.round.entryTime')}</span>
													<span class="round-value mono"
														>{fmtShortTime(round.entry_time)}
														<span class="entry-remaining">({round.entry_remaining}s left)</span
														></span
													>
												</div>
											{/if}
											{#if round.hedge?.filled_at}
												<div class="round-row">
													<span class="round-label">{t('btcUpdown.round.hedgeFilledAt')}</span>
													<span class="round-value mono">{fmtShortTime(round.hedge.filled_at)}</span
													>
												</div>
											{/if}
											{#if round.hedge?.sold_at}
												<div class="round-row">
													<span class="round-label">{t('btcUpdown.round.hedgeSoldAt')}</span>
													<span class="round-value mono">{fmtShortTime(round.hedge.sold_at)}</span>
												</div>
											{/if}
											{#if round.swing_exit_reason}
												<div class="round-row">
													<span class="round-label"
														>{locale.value === 'zh' ? '止损原因' : 'Exit Reason'}</span
													>
													<span
														class="round-value swing-exit-badge swing-exit-{round.swing_exit_reason}"
													>
														{getSwingExitLabel(round.swing_exit_reason)}
													</span>
												</div>
												{#if round.swing_exit_price !== null}
													<div class="round-row">
														<span class="round-label"
															>{locale.value === 'zh' ? '止损价格' : 'Exit Price'}</span
														>
														<span class="round-value mono">{fmtPrice(round.swing_exit_price)}</span>
													</div>
												{/if}
												{@const exitTime = round.stop_loss_checked_at ?? round.settled_at}
												{#if exitTime}
													<div class="round-row">
														<span class="round-label"
															>{locale.value === 'zh' ? '止损时间' : 'Exit Time'}</span
														>
														<span class="round-value mono">{fmtShortTime(exitTime)}</span>
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
															<span
																class="pnl-total-value"
																class:positive={(round.total_profit ?? 0) >= 0}
																class:negative={(round.total_profit ?? 0) < 0}
															>
																{fmtProfit(round.total_profit ?? 0)}
															</span>
															<svg
																class="pnl-chevron"
																xmlns="http://www.w3.org/2000/svg"
																width="14"
																height="14"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
															>
														</span>
													</summary>
													<div class="pnl-section">
														<span class="pnl-title">{t('btcUpdown.pnl.title')}</span>
														<div class="pnl-row cost">
															<span class="pnl-label">{t('btcUpdown.pnl.entryCost')}</span>
															<span class="pnl-value">{fmtProfit(-(round.entry_cost ?? 0))}</span>
														</div>
														{#if (round.hedge_cost ?? 0) > 0}
															<div class="pnl-row cost">
																<span class="pnl-label">{t('btcUpdown.pnl.hedgeCost')}</span>
																<span class="pnl-value">{fmtProfit(-(round.hedge_cost ?? 0))}</span>
															</div>
														{/if}
														{#if (round.main_payout ?? 0) > 0}
															<div class="pnl-row income">
																<span class="pnl-label">{t('btcUpdown.pnl.mainPayout')}</span>
																<span class="pnl-value">{fmtProfit(round.main_payout ?? 0)}</span>
															</div>
														{/if}
														{#if (round.hedge_payout ?? 0) > 0}
															<div class="pnl-row income">
																<span class="pnl-label">{t('btcUpdown.pnl.hedgePayout')}</span>
																<span class="pnl-value">{fmtProfit(round.hedge_payout ?? 0)}</span>
															</div>
														{/if}
														{#if (round.hedge_sell_revenue ?? 0) > 0}
															<div class="pnl-row income">
																<span class="pnl-label">{t('btcUpdown.pnl.hedgeSellRevenue')}</span>
																<span class="pnl-value"
																	>{fmtProfit(round.hedge_sell_revenue ?? 0)}</span
																>
															</div>
														{/if}
														{#if (round.platform_fee ?? 0) > 0}
															<div class="pnl-row cost">
																<span class="pnl-label">{t('btcUpdown.pnl.platformFee')}</span>
																<span class="pnl-value"
																	>{fmtProfit(-(round.platform_fee ?? 0))}</span
																>
															</div>
														{/if}
														{#if round.hedge}
															<div class="pnl-row hedge-info">
																<span class="pnl-label">{t('btcUpdown.pnl.hedgeStatus')}</span>
																<span class="pnl-value"
																	>{round.hedge.direction} @ {formatCurrency(
																		round.hedge.limit_price
																	)} &middot;
																	{getHedgeStatusLabel(round.hedge.status)}</span
																>
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
											<p class="skip-reason">{getSkipReasonLabel(round.skip_reason)}</p>
										</div>
									{/if}
								</div>
							{/each}
						</div>

						{#if totalPages > 1}
							<div class="pagination">
								<button
									class="pagination-btn"
									disabled={roundsPage <= 1}
									onclick={() => (roundsPage = Math.max(1, roundsPage - 1))}
								>
									{t('btcUpdown.pagination.prev')}
								</button>
								<span class="pagination-info">
									{t('btcUpdown.pagination.page', {
										page: String(roundsPage),
										total: String(totalPages)
									})}
								</span>
								<button
									class="pagination-btn"
									disabled={roundsPage >= totalPages}
									onclick={() => (roundsPage = Math.min(totalPages, roundsPage + 1))}
								>
									{t('btcUpdown.pagination.next')}
								</button>
							</div>
						{/if}
					{/if}
				{:else}
					<!-- Live Feed (tab content) -->
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
									>{fmtTimeWindow(currentRound.event_start_time, currentRound.end_time)}</span
								>
								<span class="round-badge {getRoundBadgeClass(currentRound)}"
									>{getRoundStatusLabel(currentRound)}</span
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
											<span class="round-value mono">{fmtPrice(currentRound.entry_price_avg)}</span>
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
											<span class="round-value mono">{formatCurrency(currentRound.entry_cost)}</span
											>
										</div>
									{/if}
									{#if currentRound.entry_time}
										<div class="round-row">
											<span class="round-label">{t('btcUpdown.round.entryTime')}</span>
											<span class="round-value mono">{fmtShortTime(currentRound.entry_time)}</span>
										</div>
									{/if}
								</div>
							{:else}
								<p class="current-round-waiting">{t('btcUpdown.live.noActiveRoundDesc')}</p>
							{/if}
							<div class="round-row" style="margin-top: var(--space-2);">
								<span class="round-label">{t('btcUpdown.round.countdown')}</span>
								<span class="round-value mono countdown-value"
									>{formatCountdown(currentRound.end_time, now)}</span
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
												<span class="card-time">{fmtTime(event.timestamp)}</span>
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
													<span class="settlement-profit">{fmtProfit(profit)}</span>
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
				{/if}
			</div>
			<!-- /.main-data -->
		</div>
		<!-- /.main-content -->
	</div>
	<!-- /.page-layout -->

	<!-- Add Custom Strategy Modal (top-level to avoid sidebar stacking context) -->
	{#if showAddStrategy}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="modal-overlay"
			onclick={() => {
				if (!customUrlValidating) {
					showAddStrategy = false;
					customUrlError = '';
					validationSteps = [];
				}
			}}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<button
					class="modal-close"
					aria-label="Close"
					disabled={customUrlValidating}
					onclick={() => {
						showAddStrategy = false;
						customUrlError = '';
						validationSteps = [];
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
					>
				</button>
				<div class="modal-icon">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
							d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
						/></svg
					>
				</div>
				<h3 class="modal-title">{t('btcUpdown.strategy.addCustom')}</h3>
				<p class="modal-desc">{t('btcUpdown.strategy.addCustomDesc')}</p>
				<div class="modal-input-wrap" class:input-error={!!customUrlError}>
					<svg
						class="modal-input-icon"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path
							d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
						/></svg
					>
					<input
						type="url"
						class="strategy-url-input"
						placeholder="https://your-server.com/api/v1"
						bind:value={customUrlInput}
						disabled={customUrlValidating}
						onkeydown={(e) => {
							if (e.key === 'Enter') addCustomStrategy();
						}}
					/>
				</div>
				{#if customUrlError}
					<p class="url-error">{customUrlError}</p>
				{/if}
				{#if validationSteps.length > 0}
					<div class="validation-steps">
						{#each validationSteps as step (step.step)}
							<div
								class="validation-step"
								class:step-ok={step.status === 'ok'}
								class:step-fail={step.status === 'fail'}
								class:step-checking={step.status === 'checking'}
							>
								<span class="step-icon">
									{#if step.status === 'ok'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
										>
									{:else if step.status === 'fail'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											><line x1="18" y1="6" x2="6" y2="18" /><line
												x1="6"
												y1="6"
												x2="18"
												y2="18"
											/></svg
										>
									{:else if step.status === 'checking'}
										<span class="step-spinner"></span>
									{:else}
										<span class="step-pending-dot"></span>
									{/if}
								</span>
								<span class="step-label"
									>{t(
										VALIDATE_STEP_KEYS[step.step as keyof typeof VALIDATE_STEP_KEYS] ?? step.step
									)}</span
								>
							</div>
						{/each}
					</div>
				{/if}
				<div class="modal-actions">
					<button
						class="modal-btn cancel"
						disabled={customUrlValidating}
						onclick={() => {
							showAddStrategy = false;
							customUrlError = '';
							validationSteps = [];
						}}
					>
						{t('btcUpdown.strategy.cancel')}
					</button>
					<button
						class="modal-btn primary"
						disabled={customUrlValidating || !customUrlInput.trim()}
						onclick={addCustomStrategy}
					>
						{#if customUrlValidating}
							<span class="btn-spinner"></span>
						{/if}
						{customUrlValidating ? t('btcUpdown.strategy.validating') : t('btcUpdown.strategy.add')}
					</button>
				</div>
			</div>
		</div>
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

	/* Page layout */
	.page-layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.sidebar {
		display: contents;
	}
	.main-content {
		display: contents;
	}
	.main-data {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* 2-column: sidebar sticky col 1, content in col 2 */
	@media (min-width: 1280px) {
		main.page {
			max-width: 1320px;
		}
		.page-layout {
			display: grid;
			grid-template-columns: 380px 1fr;
			gap: var(--space-4) var(--space-6);
			align-items: start;
		}
		.sidebar {
			display: flex;
			flex-direction: column;
			grid-column: 1;
			grid-row: 1 / span 20;
			position: sticky;
			top: 150px;
			max-height: calc(100vh - 150px - var(--space-6));
			overflow-y: auto;
			scrollbar-width: thin;
			scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
		}
		.sidebar::-webkit-scrollbar {
			width: 4px;
		}
		.sidebar::-webkit-scrollbar-thumb {
			background: rgba(255, 255, 255, 0.1);
			border-radius: 2px;
		}
		.main-content {
			display: flex;
			flex-direction: column;
			gap: var(--space-4);
			grid-column: 2;
		}
		.sidebar .version-selector {
			margin-bottom: 0;
		}
	}

	/* Header */
	.page-header {
		margin-bottom: var(--space-6);
	}
	@media (min-width: 1280px) {
		.page-header {
			position: sticky;
			top: 60px;
			z-index: var(--z-sticky, 10);
			background: var(--bg-base);
			padding-bottom: var(--space-4);
			margin-bottom: var(--space-2);
		}
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

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.7;
		}
	}
	@keyframes blink {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}

	/* Version Selector */
	.version-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-4);
	}
	.version-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.version-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.version-type-label {
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.6;
	}
	.custom-header {
		margin-top: var(--space-1);
	}
	.host-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-mono, monospace);
	}
	.version-options {
		display: flex;
		gap: var(--space-1);
		flex-direction: column;
	}
	.version-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-2);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
		width: 100%;
		text-align: left;
	}
	.version-btn:hover {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-muted);
	}
	.version-btn.active {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-base);
	}

	/* Strategy name + profits layout */
	.strategy-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.profit-column-labels {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) calc(var(--space-3) + 1px); /* match version-btn padding + border */
		margin-bottom: 2px;
		background: var(--bg-sunken, rgba(255, 255, 255, 0.03));
		border-radius: var(--radius-sm);
	}
	.profit-col-labels-right {
		margin-left: auto;
		display: flex;
		gap: var(--space-1); /* match .strategy-profits gap */
		flex-shrink: 0;
	}
	.name-col-label {
		text-transform: none;
		letter-spacing: 0;
	}
	.profit-col-nav {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 64px;
		flex-shrink: 0;
		gap: 0;
	}
	.col-nav-btn-v {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 28px;
		padding: 4px 0;
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.4;
		transition:
			opacity 0.15s,
			background 0.15s;
		border-radius: var(--radius-sm);
	}
	.col-nav-btn-v:active:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}
	.col-nav-btn-v:hover:not(:disabled) {
		opacity: 0.8;
		background: rgba(255, 255, 255, 0.04);
	}
	.col-nav-btn-v:disabled {
		opacity: 0.1;
		cursor: default;
	}
	.profit-col-label {
		font-size: 11px;
		font-weight: var(--weight-semibold);
		color: var(--fg-subtle);
		opacity: 0.65;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		text-align: center;
		flex-shrink: 0;
		white-space: nowrap;
		user-select: none;
		cursor: pointer;
		padding: 4px 2px;
		border-radius: var(--radius-sm);
		transition:
			opacity 0.15s,
			background 0.15s;
	}
	.profit-col-label:hover {
		opacity: 0.9;
		background: rgba(255, 255, 255, 0.04);
	}
	.profit-col-label.offset-active {
		color: var(--accent, #60a5fa);
		opacity: 0.9;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}
	.profit-col-label.sort-active {
		color: var(--accent, #60a5fa);
		opacity: 0.8;
		cursor: pointer;
	}
	.sort-indicator {
		font-size: calc(10px * var(--text-scale, 1));
		margin-left: 2px;
		opacity: 0.8;
	}
	.strategy-profits {
		margin-left: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		font-size: calc(10px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		opacity: 0.85;
		flex-shrink: 0;
	}
	.profit-cell {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		width: 64px;
		flex-shrink: 0;
		gap: 1px;
	}
	.profit-val {
		white-space: nowrap;
	}
	.profit-val.positive {
		color: #34d399;
	}
	.profit-val.negative {
		color: #f87171;
	}
	.profit-status {
		font-size: calc(9px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.6;
	}
	.profit-status.pending {
		color: #fbbf24;
		opacity: 1;
	}
	.profit-dir {
		font-size: calc(9px * var(--text-scale, 1));
		margin-left: 1px;
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
	}
	.profit-meta {
		font-size: calc(8px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.5;
		white-space: nowrap;
	}

	/* Last refresh timestamp */
	.last-refresh-time {
		font-size: calc(9px * var(--text-scale, 1));
		color: var(--fg-subtle);
		opacity: 0.4;
		font-variant-numeric: tabular-nums;
		margin-left: auto;
		white-space: nowrap;
	}

	/* Refresh button */
	.profit-refresh-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}
	.profit-refresh-btn:hover {
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.06);
	}
	.profit-refresh-btn.refreshing svg {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Custom strategy elements */
	.host-remove-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0;
		flex-shrink: 0;
		transition: all var(--motion-fast) var(--easing);
	}
	.custom-header:hover .host-remove-btn {
		opacity: 0.5;
	}
	.host-remove-btn:hover {
		opacity: 1 !important;
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}
	.version-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.version-row .version-btn {
		flex: 1;
		min-width: 0;
	}
	.row-hide-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-faint);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.15s var(--easing),
			color 0.15s var(--easing),
			background 0.15s var(--easing);
	}
	.version-row:hover .row-hide-btn {
		opacity: 0.6;
	}
	.row-hide-btn:hover {
		opacity: 1 !important;
		color: var(--fg-subtle);
		background: rgba(255, 255, 255, 0.06);
	}
	.version-row.row-hidden {
		opacity: 0.35;
	}
	.version-row.row-hidden .row-hide-btn {
		opacity: 0.6;
	}
	.version-row.row-hidden:hover {
		opacity: 0.6;
	}
	.section-collapse-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: color 0.15s var(--easing);
	}
	.section-collapse-btn:hover {
		color: var(--fg-base);
	}
	.section-collapse-btn svg {
		transition: transform 0.2s var(--easing);
	}
	.section-collapse-btn svg.collapsed {
		transform: rotate(-90deg);
	}
	.custom-version-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.custom-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}
	/* Section config button (gear icon) */
	.section-config-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.6;
		transition:
			opacity 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.section-config-btn:hover {
		opacity: 1;
		color: var(--fg-muted);
	}
	.section-config-btn.has-hidden {
		opacity: 0.7;
	}
	.config-count {
		font-size: calc(9px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--fg-subtle);
		opacity: 0.5;
	}
	.config-count.has-hidden {
		opacity: 0.8;
		color: var(--fg-muted);
	}

	/* Config panel (inline settings) */
	.config-panel {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--space-1) 0;
		margin-bottom: var(--space-1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.config-batch-actions {
		display: flex;
		gap: var(--space-2);
		padding: 0 var(--space-2);
		margin-bottom: var(--space-1);
	}
	.config-batch-btn {
		font-size: calc(9px * var(--text-scale, 1));
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}
	.config-batch-btn:hover {
		border-color: rgba(255, 255, 255, 0.2);
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.04);
	}
	.config-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 3px var(--space-2);
		border-radius: var(--radius-sm);
		transition: opacity 0.15s;
	}
	.config-row.config-hidden {
		opacity: 0.4;
	}
	.config-name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.config-tag {
		font-size: 9px;
		color: var(--fg-subtle);
		opacity: 0.5;
		flex-shrink: 0;
	}
	.config-toggle-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		opacity: 0.5;
		transition:
			opacity 0.15s,
			color 0.15s,
			background 0.15s;
	}
	.config-toggle-btn:hover {
		opacity: 1;
		color: var(--fg-default);
		background: rgba(255, 255, 255, 0.06);
	}

	/* Add Strategy Button */
	.add-strategy-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px dashed rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.add-strategy-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		padding: var(--space-4);
		animation: modal-fade-in 0.2s ease-out;
	}
	@keyframes modal-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes modal-scale-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	.modal {
		position: relative;
		width: 100%;
		max-width: 420px;
		padding: var(--space-8, 2rem) var(--space-7, 1.75rem) var(--space-6);
		border-radius: 16px;
		background: rgba(30, 30, 34, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.05) inset;
		text-align: center;
		animation: modal-scale-in 0.25s ease-out;
	}
	.modal-close {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.modal-close:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--fg-base);
	}
	.modal-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto var(--space-4);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--accent);
	}
	.modal-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}
	.modal-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0 0 var(--space-5, 1.25rem);
		line-height: 1.5;
	}
	.modal-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.2);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}
	.modal-input-wrap:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(54, 160, 122, 0.15);
	}
	.modal-input-wrap.input-error {
		border-color: #ef4444;
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
	}
	.modal-input-icon {
		position: absolute;
		left: 12px;
		color: var(--fg-muted);
		pointer-events: none;
		flex-shrink: 0;
	}
	.strategy-url-input {
		width: 100%;
		padding: 10px 12px 10px 36px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono, ui-monospace, monospace);
		outline: none;
		box-sizing: border-box;
	}
	.strategy-url-input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}
	.url-error {
		font-size: var(--text-xs);
		color: #ef4444;
		margin: var(--space-2) 0 0;
		text-align: left;
	}
	.modal-actions {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-5, 1.25rem);
	}
	.modal-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px var(--space-4);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.modal-btn.cancel {
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--fg-muted);
	}
	.modal-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--fg-base);
	}
	.modal-btn.primary {
		border: none;
		background: var(--accent);
		color: white;
	}
	.modal-btn.primary:hover {
		filter: brightness(1.1);
	}
	.modal-btn.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		filter: none;
	}
	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Validation Steps */
	.validation-steps {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		margin-top: var(--space-3);
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.validation-step {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		transition: color 0.15s ease;
	}
	.validation-step.step-ok {
		color: #34d399;
	}
	.validation-step.step-fail {
		color: #ef4444;
	}
	.validation-step.step-checking {
		color: var(--fg-base);
	}
	.step-icon {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.step-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.step-pending-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.15);
	}

	/* Disclaimer variants */
	.disclaimer-live {
		background: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.2);
	}
	.disclaimer-live svg {
		color: #ef4444;
	}

	/* Strategy Info */
	.strategy-info {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-2);
	}
	.strategy-info-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}
	.sticky-strategy-title {
		position: sticky;
		top: 143px;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--bg-base);
		border: 1px solid rgba(255, 255, 255, 0.08);
		padding: var(--space-2) var(--space-3);
		backdrop-filter: blur(16px);
		border-radius: var(--radius-md);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		margin: calc(-1 * var(--space-4)) 0 0;
	}
	:global([data-theme='light']) .sticky-strategy-title {
		border-color: rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	.sticky-strategy-icon {
		width: 14px;
		height: 14px;
		color: var(--accent);
		flex-shrink: 0;
	}
	.sticky-strategy-name {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		letter-spacing: 0.01em;
	}
	.strategy-description {
		margin-bottom: var(--space-3);
	}
	.strategy-description p {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin: 0;
		line-height: 1.5;
	}
	.strategy-description p + p {
		margin-top: var(--space-1);
	}
	.strategy-summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-2);
		margin-top: 24px;
	}
	.strategy-summary-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.strategy-summary-item.summary-wide {
		grid-column: 1 / -1;
	}
	.strategy-summary-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.strategy-summary-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	/* Strategy Banner */
	.strategy-banner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		text-decoration: none;
		margin-bottom: var(--space-2);
		transition: all var(--motion-fast) var(--easing);
	}
	.strategy-banner:hover {
		transform: translateY(-1px);
		background: rgba(255, 255, 255, 0.08);
	}
	.strategy-icon {
		color: var(--accent);
		flex-shrink: 0;
	}
	.strategy-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.strategy-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.strategy-desc {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.strategy-arrow {
		color: var(--fg-subtle);
		flex-shrink: 0;
	}

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
		margin-bottom: var(--space-2);
	}
	.disclaimer svg {
		color: #fbbf24;
		flex-shrink: 0;
	}

	/* Date Filter */
	.date-filter {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-2);
	}
	.date-filter-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	/* Hourly Chart */
	.hourly-chart {
		padding: var(--space-5);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-4);
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
	.chart-col-selected {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 6px;
	}
	.chart-col:has(.chart-bar) {
		cursor: pointer;
	}
	/* Stats Grid */
	.stats-hour-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent);
		background: var(--accent-subtle);
		border: 1px solid var(--accent-muted);
		border-radius: var(--radius-full);
	}
	.stats-hour-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		font-size: 10px;
		line-height: 1;
		opacity: 0.6;
		transition: opacity 0.15s var(--easing);
	}
	.stats-hour-clear:hover {
		opacity: 1;
	}
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.stat-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.stat-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.stat-value {
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.stat-value.highlight {
		color: var(--accent);
	}
	.stat-sub {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.stat-sub-rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Strategy Runtime */
	.strategy-runtime {
		display: flex;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		/* margin-bottom: var(--space-6); */
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

	/* Live sidebar & History headers */
	.history-header {
		margin-bottom: var(--space-3);
	}
	.history-tabs {
		display: flex;
		gap: var(--space-1);
	}
	.history-tab {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.history-tab:hover {
		color: var(--fg-base);
	}
	.history-tab.active {
		color: var(--fg-base);
		border-bottom-color: var(--accent, #60a5fa);
	}
	.tab-live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #34d399;
		display: inline-block;
	}

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

	/* Loading State */
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

	/* Events Grid */
	.events-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
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

	/* Entry Details */
	.entry-details {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}

	/* Direction Tag */
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

	/* Positive/Negative */
	.positive {
		color: #34d399;
	}
	.negative {
		color: #f87171;
	}

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
	.filter-wl {
		margin-left: 4px;
		font-size: 10px;
	}
	.wl-w {
		color: var(--color-profit-positive, #34d399);
	}
	.wl-l {
		color: var(--color-profit-negative, #f87171);
		margin-left: 2px;
	}
	.filter-delta {
		margin-left: 3px;
		font-size: 10px;
		font-weight: var(--weight-semibold);
	}
	.filter-delta.positive {
		color: var(--color-profit-positive, #34d399);
	}
	.filter-delta.negative {
		color: var(--color-profit-negative, #f87171);
	}

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
	.badge-win {
		background: rgba(52, 211, 153, 0.12);
		color: #34d399;
	}
	.badge-loss {
		background: rgba(248, 113, 113, 0.12);
		color: #f87171;
	}
	.badge-skip {
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-subtle);
	}
	.badge-watching,
	.badge-entered {
		background: rgba(96, 165, 250, 0.12);
		color: #60a5fa;
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
	.countdown-value {
		color: #60a5fa;
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

	/* P&L Breakdown */
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

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Light mode overrides */
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .positive {
		color: #059669;
	}
	:global([data-theme='light']) .negative {
		color: #dc2626;
	}
	:global([data-theme='light']) .direction-up,
	:global([data-theme='light']) .direction-down {
		color: var(--fg-muted);
		background: rgba(0, 0, 0, 0.05);
	}
	:global([data-theme='light']) .status-connected {
		border-color: rgba(16, 185, 129, 0.3);
		color: #059669;
		background: rgba(16, 185, 129, 0.06);
	}
	:global([data-theme='light']) .status-connected .status-dot,
	:global([data-theme='light']) .scan-dot {
		background: #059669;
	}
	:global([data-theme='light']) .badge-win,
	:global([data-theme='light']) .event-green-badge {
		background: rgba(16, 185, 129, 0.1);
		color: #059669;
	}
	:global([data-theme='light']) .badge-loss {
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
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
	:global([data-theme='light']) .event-amber-badge {
		background: rgba(217, 119, 6, 0.1);
		color: #d97706;
	}
	:global([data-theme='light']) .event-settlement-badge {
		background: rgba(147, 51, 234, 0.1);
		color: #9333ea;
	}
	:global([data-theme='light']) .filter-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .filter-btn:hover {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .filter-btn.active {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .pagination-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .pagination-btn:hover:not(:disabled) {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .event-gray-badge,
	:global([data-theme='light']) .badge-skip {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .strategy-banner:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .disclaimer {
		background: rgba(217, 119, 6, 0.06);
		border-color: rgba(217, 119, 6, 0.15);
	}
	:global([data-theme='light']) .disclaimer svg {
		color: #d97706;
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
	:global([data-theme='light']) .version-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .version-btn:hover {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .version-btn.active {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .profit-val.positive {
		color: #059669;
	}
	:global([data-theme='light']) .profit-val.negative {
		color: #dc2626;
	}
	:global([data-theme='light']) .profit-status.pending {
		color: #d97706;
	}
	:global([data-theme='light']) .profit-refresh-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .config-count.has-hidden {
		color: var(--fg-subtle);
	}
	:global([data-theme='light']) .config-panel {
		border-bottom-color: rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .config-toggle-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .pnl-divider {
		background: rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .refresh-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .refresh-btn:hover:not(:disabled) {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .pnl-row.cost .pnl-value {
		color: #dc2626;
	}
	:global([data-theme='light']) .pnl-row.income .pnl-value {
		color: #059669;
	}
	:global([data-theme='light']) .pnl-row.hedge-info .pnl-value {
		color: #d97706;
	}
	:global([data-theme='light']) .modal-overlay {
		background: rgba(0, 0, 0, 0.4);
	}
	:global([data-theme='light']) .modal {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.08);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.15),
			0 0 0 1px rgba(0, 0, 0, 0.04) inset;
	}
	:global([data-theme='light']) .modal-close {
		background: rgba(0, 0, 0, 0.04);
		color: rgba(0, 0, 0, 0.4);
	}
	:global([data-theme='light']) .modal-close:hover {
		background: rgba(0, 0, 0, 0.08);
		color: rgba(0, 0, 0, 0.6);
	}
	:global([data-theme='light']) .modal-icon {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .modal-input-wrap {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.1);
	}
	:global([data-theme='light']) .modal-input-wrap:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(54, 160, 122, 0.12);
	}
	:global([data-theme='light']) .strategy-url-input::placeholder {
		color: rgba(0, 0, 0, 0.3);
	}
	:global([data-theme='light']) .modal-btn.cancel {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .modal-btn.cancel:hover {
		background: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .validation-steps {
		background: rgba(0, 0, 0, 0.02);
		border-color: rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .validation-step.step-ok {
		color: #059669;
	}
	:global([data-theme='light']) .validation-step.step-fail {
		color: #dc2626;
	}
	:global([data-theme='light']) .step-pending-dot {
		background: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .step-spinner {
		border-color: rgba(0, 0, 0, 0.1);
		border-top-color: var(--accent);
	}
	:global([data-theme='light']) .disclaimer-live {
		background: rgba(220, 38, 38, 0.06);
		border-color: rgba(220, 38, 38, 0.15);
	}
	:global([data-theme='light']) .disclaimer-live svg {
		color: #dc2626;
	}
	:global([data-theme='light']) .sidebar {
		scrollbar-color: rgba(0, 0, 0, 0.08) transparent;
	}
	:global([data-theme='light']) .sidebar::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.1);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}
		.page-title {
			font-size: var(--text-2xl);
		}
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.stat-value {
			font-size: var(--text-lg);
		}
		.strategy-banner {
			padding: var(--space-3) var(--space-4);
		}
		.strategy-runtime {
			flex-direction: column;
			gap: var(--space-2);
		}
		/* Mobile touch targets - min 44px per Apple HIG */
		.version-btn {
			padding: var(--space-2) var(--space-3);
			min-height: 44px;
		}
		.col-nav-btn-v {
			height: 22px;
		}
		.profit-refresh-btn {
			width: 36px;
			height: 36px;
		}
		.profit-col-label {
			font-size: 12px;
			padding: 8px 4px;
		}
		.col-nav-btn-v {
			min-height: 36px;
			padding: 6px 0;
		}
		.profit-cell {
			width: 68px;
		}
		.profit-col-nav {
			width: 68px;
		}
		.strategy-profits {
			gap: var(--space-1);
		}
		.profit-column-labels {
			gap: var(--space-1);
		}
		.section-config-btn {
			padding: 6px 10px;
			font-size: 11px;
		}
		.config-toggle-btn {
			width: 36px;
			height: 36px;
		}
		.config-row {
			padding: var(--space-1) var(--space-2);
			min-height: 40px;
		}
		.config-batch-btn {
			font-size: 11px;
			padding: 6px 12px;

			
		}
		.row-hide-btn {
			opacity: 0.4;
			width: 24px;
			height: 24px;
		}
		/* Date filter: stacked layout on mobile */
		.date-filter {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-2);
			padding: var(--space-3);
		}
		.date-filter-label {
			display: none;
		}
		/* Prevent iOS zoom on input focus (requires >= 16px) */
		.strategy-url-input {
			font-size: 16px;
		}
	}
</style>
