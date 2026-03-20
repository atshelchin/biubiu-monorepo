// Shared types for Up/Down prediction dashboards (BTC, ETH, etc.)

// Re-export types used by components (canonical definitions live in formatters.ts / labels.ts)
export type { FormatterContext } from './formatters.js';
export type { TranslateFn } from './labels.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type RoundStatusFilter = '' | 'entered' | 'settled' | 'skipped';
export type SignalActionFilter = '' | 'bet' | 'reverse' | 'skip';
export type ResultFilter = '' | 'win' | 'loss' | 'stop_loss';

export interface SSEEvent {
	id: string;
	type: string;
	timestamp: string;
	data: Record<string, unknown>;
}

export interface Stats {
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
	stopLossCorrect: number;
	stopLossWrong: number;
}

export interface RoundHedge {
	direction: string;
	status: string;
	limit_price: number;
	target_shares: number;
	filled_at: string | null;
	sell_price_avg: number | null;
	sell_revenue: number | null;
	sold_at: string | null;
}

export interface Round {
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
	real_outcome: string | null;
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

export interface CurrentRoundResponse {
	round: Round | null;
	fills?: unknown[];
	snapshots?: unknown[];
	hedge?: unknown;
}

export interface RoundsResponse {
	rows: Round[];
	total: number;
	page: number;
	pageSize: number;
}

export interface HourlyStats {
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

export interface StrategyProfitData {
	current:
		| { status: 'settled'; profit: number; direction: string | null }
		| { status: 'entered'; direction: string | null }
		| { status: 'skipped' | 'watching' };
	hour: { profit: number; rounds: number; winRate: number };
	day: { profit: number; rounds: number; winRate: number };
	all: { profit: number; rounds: number; winRate: number };
}
