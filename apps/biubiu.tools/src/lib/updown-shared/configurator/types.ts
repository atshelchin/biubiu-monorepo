/**
 * Strategy Configuration V2 types.
 *
 * Mirrors the schema from polymarket-strategy-v2 used in
 * packages/core/src/engine/strategy-config.ts and tools/strategy-configurator.html.
 */

// ─── Entry ───

export interface EntryWindowConfig {
	window: 1 | 2 | 3;
	start: number;
	end: number;
}

export interface EntryConfig {
	amount: number;
	priceRange: [number, number];
	windows: EntryWindowConfig[];
	method: 'market' | 'swing_limit';
	maxBuyPrice?: number;
	swingBuyPrice?: number;
	swingBuyWindowSec?: number;
}

// ─── Direction ───

export type DirectionMethod = 'clob_follow' | 'prev_candle' | 'rsi_reversal' | 'rf_model';

export interface DirectionConfig {
	method: DirectionMethod;
	rsiParams?: {
		thresholdLow: number;
		thresholdHigh: number;
	};
	rfParams?: {
		modelPath: string;
		confidenceThreshold: number;
		maxBuyPrice: number;
		tradeWindowSec: number;
	};
}

// ─── Gates ───

export interface VolatilityGateConfig {
	type: 'volatility';
	maxAtrPct: number;
	mode: 'require_low' | 'require_high';
}

export interface TrendGateConfig {
	type: 'trend';
	minAtrPct?: number;
	minER: number;
	minBodyRatio: number;
	requireMatch: boolean;
	period: number;
}

export type GateConfig = VolatilityGateConfig | TrendGateConfig;

// ─── Signal ───

export interface RuleCondition {
	range: [number | null, number | null];
	score?: number;
	scoreUp?: number;
	scoreDown?: number;
	veto?: boolean;
}

export type IndicatorType =
	| 'roc'
	| 'rsi'
	| 'taker_buy_ratio'
	| 'body_ratio'
	| 'ema_crossover'
	| 'vwap_deviation'
	| 'volume_ratio'
	| 'bullish_candles'
	| 'candle_range_pct'
	| 'volume_trend';

export interface SignalRuleDefinition {
	name: string;
	indicator: IndicatorType;
	params?: Record<string, unknown>;
	conditions: RuleCondition[];
	required?: boolean;
}

export interface SignalConfig {
	rules: SignalRuleDefinition[];
	betThreshold: number;
	reverseThreshold: number;
	reverseEnabled: boolean;
}

// ─── Exit ───

export interface SettlementExit {
	type: 'settlement';
}

export interface TakeProfitExit {
	type: 'take_profit';
	pct: number;
}

export interface StopLossExit {
	type: 'stop_loss';
	price: number;
	minHoldSec?: number;
}

export interface TrailingStopExit {
	type: 'trailing_stop';
	drawdownPct: number;
}

export interface CheckpointExit {
	type: 'checkpoint';
	remainingSec: number;
}

export type ExitRule =
	| SettlementExit
	| TakeProfitExit
	| StopLossExit
	| TrailingStopExit
	| CheckpointExit;

// ─── Hedge ───

export interface HedgeConfig {
	enabled: boolean;
	limitPrice: number;
	shares: number;
	sellThreshold: number;
}

// ─── Risk ───

export interface CooldownConfig {
	afterConsecutiveLosses: number;
	pauseMinutes: number;
}

export interface RiskConfig {
	cooldown?: CooldownConfig;
	dailyLossLimit?: number;
	maxOpenPositions?: number;
}

// ─── Full Config ───

export interface StrategyConfigV2 {
	$schema?: string;
	id?: string;
	label?: { zh?: string; en?: string };
	description?: { zh?: string; en?: string };
	entry: EntryConfig;
	direction: DirectionConfig;
	gates?: GateConfig[];
	signal?: SignalConfig;
	exit: ExitRule[];
	hedge: HedgeConfig;
	risk?: RiskConfig;
	dataSources?: string[];
	platformFeeRate?: number;
}

/** Template type for quick-start presets */
export interface StrategyTemplate {
	id: string;
	label: { zh: string; en: string };
	description: { zh: string; en: string };
	config: StrategyConfigV2;
}
