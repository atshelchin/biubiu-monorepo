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
	import {
		type ConnectionStatus,
		type RoundStatusFilter,
		type SignalActionFilter,
		type ResultFilter,
		type SSEEvent,
		type Stats,
		type Round,
		type HourlyStats,
		type StrategyProfitData,
		MAX_EVENTS,
		FEED_EVENTS,
	} from '$lib/updown-shared';
	import {
		type FormatterContext,
		fmtProfit as _fmtProfit,
		fmtDateTimeShort as _fmtDateTimeShort,
		formatDuration as _formatDuration,
		todayLocal,
		naturalCompare,
	} from '$lib/updown-shared';
	import {
		fetchStats as apiFetchStats,
		fetchCurrentRound as apiFetchCurrentRound,
		fetchRounds as apiFetchRounds,
		fetchHourly as apiFetchHourly,
		fetchStrategyStart as apiFetchStrategyStart,
		fetchStrategyInfo as apiFetchStrategyInfo,
		fetchStrategyProfitData,
		type ApiFetchOptions,
	} from '$lib/updown-shared';
	import { createSSEManager, type SSEManager } from '$lib/updown-shared';
	import StatsGrid from '$lib/updown-shared/components/StatsGrid.svelte';
	import HourlyChart from '$lib/updown-shared/components/HourlyChart.svelte';
	import RoundsHistory from '$lib/updown-shared/components/RoundsHistory.svelte';
	import LiveFeed from '$lib/updown-shared/components/LiveFeed.svelte';
	import AddStrategyModal from '$lib/updown-shared/components/AddStrategyModal.svelte';

	// --- Formatter context (bridges i18n reactive state to pure functions) ---

	function getFormatterCtx(): FormatterContext {
		return {
			formatNumber,
			formatCurrency,
			formatDate,
			formatDateTime,
			timezone: preferences.timezone,
			timeFormat,
		};
	}

	// Convenience wrappers (bind formatter context)
	const fmtProfit = (value: number) => _fmtProfit(getFormatterCtx(), value);
	const fmtDateTimeShort = (ts: string) => _fmtDateTimeShort(getFormatterCtx(), ts);
	const formatDuration = (startTime: string, _now: number) => _formatDuration(startTime, _now);

	function apiUrl(path: string): string {
		return `${activeStrategy.baseUrl}${path}`;
	}

	function getFetchFn(): (url: string) => Promise<Response> {
		return activeStrategy.type === 'custom'
			? strategyFetch
			: (url: string) => fetch(url, { cache: 'no-store' });
	}

	function getApiOpts(): ApiFetchOptions {
		return { baseUrl: activeStrategy.baseUrl, fetchFn: getFetchFn() };
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

	const totalPages = $derived(Math.max(1, Math.ceil(roundsTotal / roundsPageSize)));

	const seoProps = $derived(
		getBaseSEO({
			title: t('btcUpdown.title'),
			description: t('btcUpdown.description'),
			currentLocale: locale.value
		})
	);

	// --- SSE Connection (delegated to shared manager) ---

	let sseEventCounter = 0;

	const sseManager = createSSEManager(
		() => apiUrl('/sse/live'),
		() => activeStrategy.type === 'custom',
		{
			onEvent(eventType, data, timestamp) {
				if (FEED_EVENTS.has(eventType)) {
					const sseEvent: SSEEvent = {
						id: `evt-${++sseEventCounter}`,
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
			},
			onStatusChange(status) {
				connectionStatus = status;
			}
		}
	);

	function connectSSE() { sseManager.connect(); }
	function disconnectSSE() { sseManager.disconnect(); }

	// --- REST API (delegated to shared module) ---

	/** Whether the current filter is exactly one day */
	const isSingleDayFilter = $derived(
		filterDate.from !== '' && filterDate.from === filterDate.to
	);

	async function fetchStats() {
		const result = await apiFetchStats(getApiOpts(), filterDate, selectedHour);
		if (result) stats = result;
	}

	async function fetchCurrentRound() {
		const result = await apiFetchCurrentRound(getApiOpts());
		if (result) currentRound = result.round;
	}

	async function fetchRounds() {
		roundsLoading = true;
		try {
			const result = await apiFetchRounds(getApiOpts(), {
				page: roundsPage,
				pageSize: roundsPageSize,
				status: roundsFilter || undefined,
				signalAction: signalActionFilter || undefined,
				result: (resultFilter === 'win' || resultFilter === 'loss') ? resultFilter : undefined,
				swingExitReason: resultFilter === 'stop_loss' ? 'stop_loss' : undefined,
				filterDate,
				selectedHour,
			});
			if (result) {
				rounds = result.rows;
				roundsTotal = result.total;
			}
		} finally {
			roundsLoading = false;
		}
	}

	async function fetchHourly() {
		hourlyData = await apiFetchHourly(getApiOpts(), filterDate, isSingleDayFilter);
	}

	async function fetchStrategyStart() {
		const result = await apiFetchStrategyStart(getApiOpts());
		if (result) strategyStartTime = result;
	}

	async function fetchStrategyInfo() {
		const lang = locale.value === 'zh' ? 'zh' : 'en';
		const result = await apiFetchStrategyInfo(getApiOpts(), lang);
		if (result) strategyInfo = result;
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
		for (const r of results) {
			if (r.info) allStrategyInfos.set(r.id, r.info);
		}
	}

	async function fetchAllStrategyProfits() {
		profitRefreshing = true;
		const profitOpts = { profitRoundOffset, profitHourOffset, profitDayOffset };
		const results = await Promise.all(
			allRegisteredStrategies.map(async (s) => {
				const fetchFn = s.type === 'custom'
					? strategyFetch
					: (url: string) => fetch(url, { cache: 'no-store' });
				const profits = await fetchStrategyProfitData(
					{ baseUrl: s.baseUrl, fetchFn },
					profitOpts
				);
				return { id: s.id, profits };
			})
		);
		// Update in-place to avoid UI flash (bug fix: was allStrategyProfits.clear())
		const newIds = new Set(results.map((r) => r.id));
		for (const key of allStrategyProfits.keys()) {
			if (!newIds.has(key)) allStrategyProfits.delete(key);
		}
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

	// --- Filter helpers ---

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
					<StatsGrid
						{stats}
						{selectedHour}
						ctx={getFormatterCtx()}
						{t}
						onClearHour={() => { selectedHour = null; fetchStats(); }}
					/>
				{/if}

				<!-- Hourly Profit Chart (single day only) -->
				{#if isSingleDayFilter}
					<HourlyChart
						{hourlyData}
						filterDateFrom={filterDate.from}
						{selectedHour}
						ctx={getFormatterCtx()}
						{t}
						onSelectHour={(hour) => { selectedHour = hour; roundsPage = 1; fetchStats(); }}
					/>
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
					<RoundsHistory
						{rounds}
						roundsTotal={roundsTotal}
						roundsPage={roundsPage}
						roundsPageSize={roundsPageSize}
						roundsLoading={roundsLoading}
						roundsFilter={roundsFilter}
						signalActionFilter={signalActionFilter}
						resultFilter={resultFilter}
						{stats}
						ctx={getFormatterCtx()}
						{t}
						{formatCurrency}
						onPageChange={(page) => { roundsPage = page; }}
						onFilterChange={setFilter}
						onSignalFilterChange={setSignalFilter}
						onResultFilterChange={setResultFilter}
						onRefresh={() => fetchRounds()}
					/>
				{:else}
					<LiveFeed
						{currentRound}
						{events}
						{connectionStatus}
						{now}
						ctx={getFormatterCtx()}
						{t}
						{formatNumber}
						{formatCurrency}
						{getEventMessage}
					/>
				{/if}
			</div>
			<!-- /.main-data -->
		</div>
		<!-- /.main-content -->
	</div>
	<!-- /.page-layout -->

	<!-- Add Custom Strategy Modal -->
	<AddStrategyModal
		open={showAddStrategy}
		urlInput={customUrlInput}
		urlError={customUrlError}
		validating={customUrlValidating}
		{validationSteps}
		{t}
		onClose={() => { showAddStrategy = false; customUrlError = ''; validationSteps = []; }}
		onSubmit={addCustomStrategy}
		onUrlChange={(v) => { customUrlInput = v; }}
	/>
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
	:global([data-theme='light']) .status-connected .status-dot {
		background: #059669;
	}
	:global([data-theme='light']) .disclaimer {
		background: rgba(217, 119, 6, 0.06);
		border-color: rgba(217, 119, 6, 0.15);
	}
	:global([data-theme='light']) .disclaimer svg {
		color: #d97706;
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
	:global([data-theme='light']) .config-toggle-btn:hover {
		background: rgba(0, 0, 0, 0.04);
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
		.strategy-runtime {
			flex-direction: column;
			gap: var(--space-2);
		}
		/* Mobile touch targets - min 44px per Apple HIG */
		.version-btn {
			padding: var(--space-2) var(--space-3);
			min-height: 44px;
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
	}
</style>
