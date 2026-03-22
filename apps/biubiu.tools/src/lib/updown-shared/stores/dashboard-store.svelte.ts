/**
 * DashboardStore — reactive data store for Up/Down prediction dashboards.
 *
 * Owns all fetched data, SSE connection, filter state, and fetch coordination.
 * Reusable across BTC, ETH, or any prediction market dashboard by passing
 * different config (baseUrl, fetchFn).
 *
 * Key properties:
 * - Background SSE updates are silent (no loading indicator, no flickering)
 * - User-initiated actions (filter, page) show subtle loading state
 * - Rapid SSE events are coalesced into one batch via FetchCoordinator
 * - Stale requests are aborted when newer ones start
 * - Events array uses mutation (unshift/pop) for fine-grained reactivity
 */

import type {
	ConnectionStatus,
	CurrentRoundResponse,
	DailyStat,
	HourlyStats,
	Round,
	RoundStatusFilter,
	RoundsResponse,
	ResultFilter,
	SignalActionFilter,
	SSEEvent,
	Stats
} from '../types.js';
import { todayLocal } from '../formatters.js';
import {
	fetchStats as apiFetchStats,
	fetchCurrentRound as apiFetchCurrentRound,
	fetchRounds as apiFetchRounds,
	fetchHourly as apiFetchHourly,
	fetchDaily as apiFetchDaily,
	fetchStrategyStart as apiFetchStrategyStart,
	fetchStrategyInfo as apiFetchStrategyInfo,
	type ApiFetchOptions
} from '../api.js';
import { createSSEManager, type SSEManager } from '../sse.js';
import { FEED_EVENTS, MAX_EVENTS } from '../constants.js';
import { FetchCoordinator } from './fetch-coordinator.js';
import type { StrategyInfo } from '$lib/btc-updown-strategies';

// --- Configuration ---

export interface DashboardStoreConfig {
	/** Returns API options for the currently active strategy. */
	getApiOpts: () => ApiFetchOptions;
	/** Returns the SSE endpoint URL. */
	getSseUrl: () => string;
	/** Whether the active strategy is a custom (CORS-proxied) strategy. */
	isCustomStrategy: () => boolean;
}

// --- Fetch keys ---

const FK = {
	STATS: 'stats',
	CURRENT_ROUND: 'currentRound',
	ROUNDS: 'rounds',
	HOURLY: 'hourly',
	DAILY: 'daily',
	STRATEGY_START: 'strategyStart',
	STRATEGY_INFO: 'strategyInfo'
} as const;

// --- Store ---

export class DashboardStore {
	// ---- Data state ----
	stats = $state<Stats | null>(null);
	currentRound = $state<Round | null>(null);
	rounds = $state<Round[]>([]);
	roundsTotal = $state(0);
	hourlyData = $state<HourlyStats[]>([]);
	dailyData = $state<DailyStat[]>([]);
	events = $state<SSEEvent[]>([]);
	connectionStatus = $state<ConnectionStatus>('disconnected');
	strategyStartTime = $state<string | null>(null);
	strategyInfo = $state<StrategyInfo | null>(null);

	// ---- Filter state ----
	roundsPage = $state(1);
	readonly roundsPageSize = 10;
	roundsFilter = $state<RoundStatusFilter>('');
	signalActionFilter = $state<SignalActionFilter>('');
	resultFilter = $state<ResultFilter>('');
	filterDate = $state<{ from: string; to: string }>({ from: todayLocal(), to: todayLocal() });
	selectedHour = $state<number | null>(null);

	// ---- Loading state ----
	/** True during initial data load on mount. */
	initialLoading = $state(true);
	/** True only during user-initiated rounds fetch (filter/page change). Never set by background refresh. */
	roundsRefreshing = $state(false);

	// ---- Derived ----
	get totalPages(): number {
		return Math.ceil(this.roundsTotal / this.roundsPageSize);
	}

	get isSingleDayFilter(): boolean {
		return this.filterDate.from !== '' && this.filterDate.from === this.filterDate.to;
	}

	get isMultiDayFilter(): boolean {
		return this.filterDate.from !== '' && this.filterDate.from !== this.filterDate.to;
	}

	// ---- Internal ----
	private config: DashboardStoreConfig;
	private coordinator = new FetchCoordinator();
	private sseManager: SSEManager;
	private sseEventCounter = 0;
	private lastRoundRefetchTime = 0;
	private fallbackTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: DashboardStoreConfig) {
		this.config = config;

		// Wire coalesced batch executor
		this.coordinator.setBatchExecutor((keys) => {
			this.executeBatch(keys, false);
		});

		// Create SSE manager
		this.sseManager = createSSEManager(
			config.getSseUrl,
			config.isCustomStrategy,
			{
				onEvent: (eventType, data, timestamp) => this.handleSSEEvent(eventType, data, timestamp),
				onStatusChange: (status) => {
					this.connectionStatus = status;
				}
			}
		);
	}

	// ---- Lifecycle ----

	/** Start SSE connection and periodic fallback timer. */
	connect(): void {
		this.sseManager.connect();

		// Fallback: re-fetch currentRound every 15s in case SSE events are missed
		this.fallbackTimer = setInterval(() => {
			this.fetchCurrentRoundInternal();
		}, 15_000);
	}

	/** Stop SSE, abort all in-flight requests, clear timers. */
	disconnect(): void {
		this.sseManager.disconnect();
		this.coordinator.abortAll();
		if (this.fallbackTimer) {
			clearInterval(this.fallbackTimer);
			this.fallbackTimer = null;
		}
	}

	/** Reset all data, abort requests, reconnect SSE with new config. */
	switchStrategy(config: DashboardStoreConfig): void {
		this.disconnect();
		this.config = config;

		// Reset data
		this.stats = null;
		this.currentRound = null;
		this.rounds = [];
		this.roundsTotal = 0;
		this.hourlyData = [];
		this.dailyData = [];
		this.events = [];
		this.strategyInfo = null;
		this.strategyStartTime = null;
		this.selectedHour = null;
		this.filterDate = { from: todayLocal(), to: todayLocal() };
		this.roundsFilter = '';
		this.signalActionFilter = '';
		this.resultFilter = '';
		this.roundsPage = 1;
		this.sseEventCounter = 0;
		this.lastRoundRefetchTime = 0;
		this.initialLoading = true;

		// Recreate SSE manager with new config
		this.sseManager = createSSEManager(
			config.getSseUrl,
			config.isCustomStrategy,
			{
				onEvent: (eventType, data, timestamp) => this.handleSSEEvent(eventType, data, timestamp),
				onStatusChange: (status) => {
					this.connectionStatus = status;
				}
			}
		);

		// Rewire coordinator batch executor (closure captures new this.config)
		this.coordinator.setBatchExecutor((keys) => {
			this.executeBatch(keys, false);
		});

		this.connect();
	}

	// ---- User actions (show loading indicator) ----

	/** User changed round status filter. Resets other filters and page. */
	setFilter(filter: RoundStatusFilter): void {
		this.roundsFilter = filter;
		this.signalActionFilter = '';
		this.resultFilter = '';
		this.roundsPage = 1;
		this.fetchRoundsUser();
	}

	/** User changed signal action filter. Resets other filters and page. */
	setSignalFilter(filter: SignalActionFilter): void {
		this.signalActionFilter = filter;
		this.roundsFilter = '';
		this.resultFilter = '';
		this.roundsPage = 1;
		this.fetchRoundsUser();
	}

	/** User changed result filter. Resets other filters and page. */
	setResultFilter(filter: ResultFilter): void {
		this.resultFilter = filter;
		this.roundsFilter = '';
		this.signalActionFilter = '';
		this.roundsPage = 1;
		this.fetchRoundsUser();
	}

	/** User changed page number. */
	setPage(page: number): void {
		this.roundsPage = page;
		this.fetchRoundsUser();
	}

	/** User selected an hour in the hourly chart. */
	selectHour(hour: number | null): void {
		this.selectedHour = hour;
		this.roundsPage = 1;
		// Refresh stats + rounds for this hour
		this.fetchStatsInternal();
		this.fetchRoundsUser();
	}

	/** User changed date range. Triggers coordinated multi-fetch. */
	setDateRange(from: string, to: string): void {
		this.filterDate = { from, to };
		this.selectedHour = null;
		this.roundsPage = 1;
		// Coordinated: stats + rounds + hourly + daily
		this.fetchStatsInternal();
		this.fetchRoundsUser();
		this.fetchHourlyInternal();
		this.fetchDailyInternal();
	}

	/** Manual refresh button. */
	refresh(): void {
		this.fetchRoundsUser();
	}

	// ---- Initial data load ----

	/** Fetch all initial data. Call after connect(). */
	async fetchInitialData(lang: string): Promise<void> {
		this.initialLoading = true;
		await Promise.all([
			this.fetchStatsInternal(),
			this.fetchCurrentRoundInternal(),
			this.fetchRoundsInternal(),
			this.fetchHourlyInternal(),
			this.fetchStrategyStartInternal(),
			this.fetchStrategyInfoInternal(lang)
		]);
		this.initialLoading = false;
	}

	/** Fetch strategy info (e.g., on locale change). */
	async fetchStrategyInfo(lang: string): Promise<void> {
		await this.fetchStrategyInfoInternal(lang);
	}

	// ---- Round countdown auto-refresh ----

	/**
	 * Call from an $effect that watches `clock.now`.
	 * Checks if current round has expired and triggers background refresh.
	 */
	checkRoundExpiry(nowMs: number): void {
		if (!this.currentRound) return;
		const endMs = new Date(this.currentRound.end_time).getTime();
		if (nowMs >= endMs && nowMs - this.lastRoundRefetchTime > 5000) {
			this.lastRoundRefetchTime = nowMs;
			this.coordinator.scheduleRefresh([FK.CURRENT_ROUND, FK.ROUNDS]);
		}
	}

	// ---- SSE event handling ----

	private handleSSEEvent(eventType: string, data: Record<string, unknown>, timestamp: string): void {
		// Add to feed events
		if (FEED_EVENTS.has(eventType)) {
			const sseEvent: SSEEvent = {
				id: `evt-${++this.sseEventCounter}`,
				type: eventType,
				timestamp,
				data
			};
			// In-place mutation for fine-grained Svelte 5 reactivity
			this.events.unshift(sseEvent);
			if (this.events.length > MAX_EVENTS) {
				this.events.length = MAX_EVENTS;
			}
		}

		// Schedule coalesced background refresh
		if (eventType === 'settlement' || eventType === 'exit_trigger' || eventType === 'round_skip') {
			this.coordinator.scheduleRefresh([FK.STATS, FK.CURRENT_ROUND, FK.ROUNDS]);
		} else if (eventType === 'round_start' || eventType === 'entry') {
			this.coordinator.scheduleRefresh([FK.CURRENT_ROUND]);
		}
	}

	// ---- Internal fetch methods ----

	private getOptsWithSignal(signal: AbortSignal): ApiFetchOptions {
		return { ...this.config.getApiOpts(), signal };
	}

	private async fetchStatsInternal(): Promise<void> {
		await this.coordinator.execute(FK.STATS, async (signal) => {
			const result = await apiFetchStats(
				this.getOptsWithSignal(signal),
				this.filterDate,
				this.selectedHour
			);
			if (result) this.stats = result;
		});
	}

	private async fetchCurrentRoundInternal(): Promise<void> {
		await this.coordinator.execute(FK.CURRENT_ROUND, async (signal) => {
			const result = await apiFetchCurrentRound(this.getOptsWithSignal(signal));
			if (result) this.currentRound = result.round;
		});
	}

	private async fetchRoundsInternal(): Promise<void> {
		await this.coordinator.execute(FK.ROUNDS, async (signal) => {
			const result = await apiFetchRounds(this.getOptsWithSignal(signal), {
				page: this.roundsPage,
				pageSize: this.roundsPageSize,
				status: this.roundsFilter || undefined,
				signalAction: this.signalActionFilter || undefined,
				result:
					this.resultFilter === 'win' || this.resultFilter === 'loss'
						? this.resultFilter
						: undefined,
				swingExitReason: this.resultFilter === 'stop_loss' ? 'stop_loss' : undefined,
				filterDate: this.filterDate,
				selectedHour: this.selectedHour
			});
			if (result) {
				this.rounds = result.rows;
				this.roundsTotal = result.total;
			}
		});
	}

	/** User-initiated rounds fetch: sets roundsRefreshing flag. */
	private async fetchRoundsUser(): Promise<void> {
		this.roundsRefreshing = true;
		try {
			await this.fetchRoundsInternal();
		} finally {
			this.roundsRefreshing = false;
		}
	}

	private async fetchHourlyInternal(): Promise<void> {
		if (!this.filterDate.from) {
			this.hourlyData = [];
			return;
		}
		await this.coordinator.execute(FK.HOURLY, async (signal) => {
			const result = await apiFetchHourly(
				this.getOptsWithSignal(signal),
				this.filterDate
			);
			this.hourlyData = result;
		});
	}

	private async fetchDailyInternal(): Promise<void> {
		if (!this.isMultiDayFilter) {
			this.dailyData = [];
			return;
		}
		await this.coordinator.execute(FK.DAILY, async (signal) => {
			const result = await apiFetchDaily(
				this.getOptsWithSignal(signal),
				this.filterDate
			);
			this.dailyData = result;
		});
	}

	private async fetchStrategyStartInternal(): Promise<void> {
		await this.coordinator.execute(FK.STRATEGY_START, async (signal) => {
			const result = await apiFetchStrategyStart(this.getOptsWithSignal(signal));
			if (result) this.strategyStartTime = result;
		});
	}

	private async fetchStrategyInfoInternal(lang: string): Promise<void> {
		await this.coordinator.execute(FK.STRATEGY_INFO, async (signal) => {
			const result = await apiFetchStrategyInfo(this.getOptsWithSignal(signal), lang);
			if (result) this.strategyInfo = result;
		});
	}

	/**
	 * Execute a coalesced batch of fetches (called by FetchCoordinator).
	 * Background refreshes: no loading indicators.
	 */
	private executeBatch(keys: ReadonlySet<string>, _isUserInitiated: boolean): void {
		if (keys.has(FK.STATS)) this.fetchStatsInternal();
		if (keys.has(FK.CURRENT_ROUND)) this.fetchCurrentRoundInternal();
		if (keys.has(FK.ROUNDS)) this.fetchRoundsInternal();
		if (keys.has(FK.HOURLY)) this.fetchHourlyInternal();
		if (keys.has(FK.DAILY)) this.fetchDailyInternal();
	}
}
