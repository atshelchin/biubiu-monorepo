// REST API layer for Up/Down prediction dashboards
// All functions are parameterized by baseUrl and fetchFn for reusability.

import type {
	CurrentRoundResponse,
	HourlyStats,
	RoundsResponse,
	Stats,
	StrategyProfitData
} from './types.js';
import { getDateRange, toUTCString, todayLocal } from './formatters.js';
import type { StrategyInfo } from '$lib/btc-updown-strategies';

export interface ApiFetchOptions {
	baseUrl: string;
	fetchFn: (url: string) => Promise<Response>;
}

export async function fetchStats(
	opts: ApiFetchOptions,
	filterDate: { from: string; to: string },
	selectedHour: number | null
): Promise<Stats | null> {
	try {
		const range = getDateRange(filterDate, selectedHour);
		const parts: string[] = [];
		if (range) {
			parts.push(`from=${encodeURIComponent(range.from)}`);
			parts.push(`to=${encodeURIComponent(range.to)}`);
		}
		const qs = parts.length ? '?' + parts.join('&') : '';
		const res = await opts.fetchFn(`${opts.baseUrl}/stats${qs}`);
		if (res.ok) return await res.json();
	} catch {
		// non-critical
	}
	return null;
}

export async function fetchCurrentRound(
	opts: ApiFetchOptions
): Promise<CurrentRoundResponse | null> {
	try {
		const res = await opts.fetchFn(`${opts.baseUrl}/rounds/current`);
		if (res.ok) return await res.json();
	} catch {
		// non-critical
	}
	return null;
}

export async function fetchRounds(
	opts: ApiFetchOptions,
	params: {
		page: number;
		pageSize: number;
		status?: string;
		signalAction?: string;
		result?: string;
		swingExitReason?: string;
		filterDate: { from: string; to: string };
		selectedHour: number | null;
	}
): Promise<RoundsResponse | null> {
	try {
		const qs = new URLSearchParams({
			page: String(params.page),
			pageSize: String(params.pageSize)
		});
		if (params.status) qs.set('status', params.status);
		if (params.signalAction) qs.set('signal_action', params.signalAction);
		if (params.result === 'win' || params.result === 'loss') qs.set('result', params.result);
		if (params.swingExitReason) qs.set('swing_exit_reason', params.swingExitReason);
		const range = getDateRange(params.filterDate, params.selectedHour);
		if (range) {
			qs.set('from', range.from);
			qs.set('to', range.to);
		}
		const res = await opts.fetchFn(`${opts.baseUrl}/rounds?${qs}`);
		if (res.ok) return await res.json();
	} catch {
		// non-critical
	}
	return null;
}

export async function fetchHourly(
	opts: ApiFetchOptions,
	filterDate: { from: string; to: string },
	isSingleDay: boolean
): Promise<HourlyStats[]> {
	if (!isSingleDay) return [];
	try {
		const range = getDateRange(filterDate);
		const parts: string[] = [];
		if (range) {
			parts.push(`from=${encodeURIComponent(range.from)}`);
			parts.push(`to=${encodeURIComponent(range.to)}`);
		}
		const qs = parts.length ? '?' + parts.join('&') : '';
		const res = await opts.fetchFn(`${opts.baseUrl}/stats/hourly${qs}`);
		if (res.ok) {
			const data: HourlyStats[] = await res.json();
			const offsetHours = new Date().getTimezoneOffset() / -60;
			return data.map((h) => ({
				...h,
				hour: (((h.hour + offsetHours) % 24) + 24) % 24
			}));
		}
	} catch {
		// non-critical
	}
	return [];
}

export async function fetchStrategyStart(opts: ApiFetchOptions): Promise<string | null> {
	try {
		const res1 = await opts.fetchFn(`${opts.baseUrl}/rounds?page=1&pageSize=1`);
		if (!res1.ok) return null;
		const data1: RoundsResponse = await res1.json();
		if (data1.total === 0) return null;

		const lastPage = Math.ceil(data1.total / 1);
		const res2 = await opts.fetchFn(`${opts.baseUrl}/rounds?page=${lastPage}&pageSize=1`);
		if (!res2.ok) return null;
		const data2: RoundsResponse = await res2.json();
		if (data2.rows.length > 0) {
			return data2.rows[0].event_start_time;
		}
	} catch {
		// non-critical
	}
	return null;
}

export async function fetchStrategyInfo(
	opts: ApiFetchOptions,
	lang: string
): Promise<StrategyInfo | null> {
	try {
		const res = await opts.fetchFn(`${opts.baseUrl}/strategy?lang=${lang}`);
		if (res.ok) return await res.json();
	} catch {
		// non-critical
	}
	return null;
}

// --- Profit helpers ---

export function parseCurrentRound(
	data: CurrentRoundResponse | null
): StrategyProfitData['current'] {
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

export function parseStats(
	data: Stats | null
): { profit: number; rounds: number; winRate: number } {
	if (!data) return { profit: 0, rounds: 0, winRate: 0 };
	return { profit: data.totalProfit, rounds: data.entered, winRate: data.winRate };
}

export interface ProfitFetchOptions {
	profitRoundOffset: number;
	profitHourOffset: number;
	profitDayOffset: number;
}

export async function fetchStrategyProfitData(
	opts: ApiFetchOptions,
	profitOpts: ProfitFetchOptions
): Promise<StrategyProfitData | null> {
	const now = Date.now();
	const localOffset = new Date(now).getTimezoneOffset() * 60_000;
	const localMs = now - localOffset;

	const currentHourStartMs = localMs - (localMs % 3_600_000) + localOffset;
	const hourShift = profitOpts.profitHourOffset * 3_600_000;
	const hourFrom = toUTCString(new Date(currentHourStartMs + hourShift));
	const hourTo =
		profitOpts.profitHourOffset === 0
			? toUTCString(new Date(now))
			: toUTCString(new Date(currentHourStartMs + hourShift + 3_600_000));

	const todayStart = new Date(`${todayLocal()}T00:00:00`).getTime();
	const dayShift = profitOpts.profitDayOffset * 86_400_000;
	const dayFrom = toUTCString(new Date(todayStart + dayShift));
	const dayTo =
		profitOpts.profitDayOffset === 0
			? toUTCString(new Date(now))
			: toUTCString(new Date(todayStart + dayShift + 86_400_000));

	const roundPage = Math.abs(profitOpts.profitRoundOffset);

	try {
		const roundPromise =
			profitOpts.profitRoundOffset === 0
				? opts.fetchFn(`${opts.baseUrl}/rounds/current`)
				: opts.fetchFn(`${opts.baseUrl}/rounds?page=${roundPage}&pageSize=1`);
		const [hourRes, dayRes, allRes, roundRes] = await Promise.all([
			opts.fetchFn(
				`${opts.baseUrl}/stats?from=${encodeURIComponent(hourFrom)}&to=${encodeURIComponent(hourTo)}`
			),
			opts.fetchFn(
				`${opts.baseUrl}/stats?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}`
			),
			opts.fetchFn(`${opts.baseUrl}/stats`),
			roundPromise
		]);
		const hourStats = hourRes.ok ? await hourRes.json() : null;
		const dayStats = dayRes.ok ? await dayRes.json() : null;
		const allStats = allRes.ok ? await allRes.json() : null;

		let current: StrategyProfitData['current'];
		if (profitOpts.profitRoundOffset === 0) {
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
			current,
			hour: parseStats(hourStats),
			day: parseStats(dayStats),
			all: parseStats(allStats)
		};
	} catch {
		return null;
	}
}
