/**
 * Mock data generators for strategy detail views.
 * Generates Stats, HourlyStats[], DailyStat[], Round[] for any strategy.
 */
import type { Stats, HourlyStats, DailyStat, Round } from '$lib/updown-shared/types';

/** Simple seeded PRNG */
function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function hashStr(str: string): number {
	return [...str].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
}

/** Generate mock Stats for a strategy */
export function mockStats(strategyId: string, dateRange?: { from: string; to: string }): Stats {
	const seed = hashStr(strategyId + (dateRange?.from ?? '') + (dateRange?.to ?? ''));
	const rng = seeded(seed);

	const totalRounds = 50 + Math.floor(rng() * 200);
	const skipRate = 0.3 + rng() * 0.3;
	const skipped = Math.floor(totalRounds * skipRate);
	const entered = totalRounds - skipped;
	const winRate = 0.4 + rng() * 0.3;
	const wins = Math.floor(entered * winRate);
	const losses = entered - wins;
	const avgProfit = (rng() - 0.4) * 12;
	const totalProfit = avgProfit * entered;
	const totalInvested = entered * 5;

	return {
		totalRounds,
		entered,
		skipped,
		wins,
		losses,
		winRate: entered > 0 ? wins / entered : 0,
		totalInvested,
		totalHedgeCost: entered * 1.2,
		totalPayout: totalInvested + totalProfit,
		totalFees: entered * 0.15,
		totalProfit: Math.round(totalProfit * 100) / 100,
		avgProfit: Math.round(avgProfit * 100) / 100,
		bestRound: Math.round((5 + rng() * 150) * 100) / 100,
		worstRound: Math.round((-5 - rng() * 50) * 100) / 100,
		currentStreak: Math.floor((rng() - 0.4) * 10),
		maxWinStreak: 2 + Math.floor(rng() * 8),
		maxLoseStreak: 1 + Math.floor(rng() * 6),
		hedgeFills: Math.floor(entered * 0.8),
		hedgeSellRevenue: Math.round(entered * 0.9 * 100) / 100,
		signalBet: Math.floor(entered * 0.4),
		signalBetWins: Math.floor(entered * 0.4 * winRate),
		signalBetLosses: Math.floor(entered * 0.4 * (1 - winRate)),
		signalReverse: Math.floor(entered * 0.35),
		signalReverseWins: Math.floor(entered * 0.35 * (winRate + 0.05)),
		signalReverseLosses: Math.floor(entered * 0.35 * (1 - winRate - 0.05)),
		signalSkip: skipped,
		signalSkipWouldWin: Math.floor(skipped * 0.45),
		signalSkipWouldLose: Math.floor(skipped * 0.55),
		stopLossCount: Math.floor(rng() * 5),
		stopLossCorrect: Math.floor(rng() * 3),
		stopLossWrong: Math.floor(rng() * 2),
		stopLossProfit: Math.round((rng() - 0.3) * 20 * 100) / 100,
		takeProfitCount: Math.floor(rng() * 4)
	};
}

/** Generate mock HourlyStats for 24 hours */
export function mockHourlyStats(strategyId: string, date: string): HourlyStats[] {
	const seed = hashStr(strategyId + date);
	const rng = seeded(seed);
	const now = new Date();
	const isToday = date === now.toLocaleDateString('en-CA');
	const currentHour = now.getHours();

	const hours: HourlyStats[] = [];
	for (let h = 0; h < 24; h++) {
		// Future hours on today have no data
		if (isToday && h > currentHour) continue;

		const rounds = Math.floor(rng() * 12);
		if (rounds === 0) continue;

		const wr = 0.35 + rng() * 0.35;
		const wins = Math.floor(rounds * wr);
		const losses = rounds - wins;
		const profit = (rng() - 0.4) * rounds * 8;

		hours.push({
			hour: h,
			rounds,
			wins,
			losses,
			invested: rounds * 5,
			payout: rounds * 5 + profit,
			profit: Math.round(profit * 100) / 100,
			winRate: rounds > 0 ? wins / rounds : 0,
			avgProfit: Math.round((profit / rounds) * 100) / 100
		});
	}
	return hours;
}

/** Generate mock DailyStat for a date range */
export function mockDailyStats(strategyId: string, from: string, to: string): DailyStat[] {
	const start = new Date(from + 'T12:00:00');
	const end = new Date(to + 'T12:00:00');
	const days: DailyStat[] = [];

	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toLocaleDateString('en-CA');
		const seed = hashStr(strategyId + dateStr);
		const rng = seeded(seed);

		const rounds = 8 + Math.floor(rng() * 40);
		const skipRate = 0.3 + rng() * 0.3;
		const skipped = Math.floor(rounds * skipRate);
		const entered = rounds - skipped;
		const wr = 0.35 + rng() * 0.35;
		const wins = Math.floor(entered * wr);
		const losses = entered - wins;
		const profit = (rng() - 0.4) * entered * 6;

		days.push({
			date: dateStr,
			rounds,
			entered,
			skipped,
			wins,
			losses,
			winRate: entered > 0 ? wins / entered : 0,
			invested: entered * 5,
			payout: entered * 5 + profit,
			profit: Math.round(profit * 100) / 100
		});
	}
	return days;
}

/** Generate mock Rounds for a strategy */
export function mockRounds(
	strategyId: string,
	page: number,
	pageSize: number,
	total?: number
): { rows: Round[]; total: number } {
	const seed = hashStr(strategyId + 'rounds');
	const rng = seeded(seed);
	const t = total ?? (80 + Math.floor(rng() * 200));
	const startId = t - page * pageSize;

	const rows: Round[] = [];
	const now = Date.now();

	for (let i = 0; i < pageSize && startId - i > 0; i++) {
		const id = startId - i;
		const r = seeded(seed + id);
		const skipChance = r();
		const isSkipped = skipChance < 0.35;
		const direction = r() > 0.5 ? 'Up' : 'Down';
		const won = r() > 0.45;
		const profit = isSkipped ? null : Math.round(((won ? 1 : -1) * (2 + r() * 8)) * 100) / 100;
		const entryTime = new Date(now - id * 300_000); // 5 min intervals
		const endTime = new Date(entryTime.getTime() + 300_000);

		rows.push({
			id,
			market_slug: 'btc-5min-up-or-down',
			status: id === startId && page === 0 ? 'watching' : isSkipped ? 'skipped' : 'settled',
			entry_direction: isSkipped ? null : direction,
			entry_price_avg: isSkipped ? null : 0.5 + r() * 0.02,
			entry_shares: isSkipped ? null : 10,
			entry_cost: isSkipped ? null : 5,
			entry_time: isSkipped ? null : entryTime.toISOString(),
			entry_remaining: null,
			outcome: isSkipped ? null : (won ? direction : (direction === 'Up' ? 'Down' : 'Up')),
			real_outcome: isSkipped ? null : (won ? direction : (direction === 'Up' ? 'Down' : 'Up')),
			main_payout: isSkipped ? null : (won ? 5 + (profit ?? 0) : 0),
			hedge_cost: isSkipped ? null : 1.2,
			hedge_payout: null,
			hedge_sell_revenue: isSkipped ? null : 0.9,
			platform_fee: isSkipped ? null : 0.15,
			total_profit: profit,
			signal_action: isSkipped ? 'skip' : (r() > 0.5 ? 'bet' : 'reverse'),
			skip_reason: isSkipped ? (r() > 0.5 ? 'low_confidence' : 'volatility_gate') : null,
			swing_mode: null,
			swing_exit_reason: null,
			swing_exit_price: null,
			stop_loss_checked_at: null,
			event_start_time: entryTime.toISOString(),
			end_time: endTime.toISOString(),
			created_at: entryTime.toISOString(),
			settled_at: isSkipped ? null : endTime.toISOString(),
			hedge: null
		});
	}

	return { rows, total: t };
}

/** Get today's date string in YYYY-MM-DD format */
export function todayStr(): string {
	return new Date().toLocaleDateString('en-CA');
}

/** Get date N days ago in YYYY-MM-DD format */
export function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toLocaleDateString('en-CA');
}
