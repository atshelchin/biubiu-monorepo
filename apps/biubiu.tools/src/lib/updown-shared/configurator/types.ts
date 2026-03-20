/**
 * Strategy Configuration V2 — JSON Schema Types
 *
 * 两层设计：
 *   StrategyJsonV2  — 文件/分享格式（含元数据：id, label, schedule, exportedAt）
 *   StrategyConfigV2 — 纯策略配置（引擎消费，无元数据）
 *
 * 分组逻辑：
 *   entry     — 何时、多少钱、以什么方式入场
 *   direction — 怎么决定 Up/Down（互斥）
 *   gates     — 入场前置过滤（有序管道，全部通过才入场）
 *   signal    — 信号评分精筛
 *   exit      — 退出条件（并行触发，任一命中即退出）
 *   hedge     — 对冲配置
 *   risk      — 风控兜底（冷却、日亏损上限、仓位管理）
 *
 * 对应后端：packages/core/src/engine/strategy-config.ts
 * 对应工具：tools/strategy-configurator.html
 */

// ═══════════════════════════════════════════
// Entry — 入场
// ═══════════════════════════════════════════

export interface EntryWindowConfig {
	/** 窗口编号 */
	window: 1 | 2 | 3;
	/** 剩余秒数：开始（start > end） */
	start: number;
	/** 剩余秒数：结束 */
	end: number;
}

/** 入场方式 */
export type EntryMethod = 'market' | 'limit' | 'swing_limit' | 'post_market_scan';

export interface EntryConfig {
	/** 单次入场预算（USD），0.01-10000 */
	amount: number;
	/** 最大买入价 (0.01-0.99) — 价格超过此值不买入 */
	maxBuyPrice: number;
	/** 入场时间窗口 (1-3 个); post_market_scan 时为空数组 */
	windows: EntryWindowConfig[];

	/**
	 * 入场方式：
	 * - market          — FOK 市价吃单，立刻成交
	 * - limit           — GTC 限价挂单，等待被动成交
	 * - swing_limit     — 轮询等目标价，到价后市价买入
	 * - post_market_scan — 市场关闭后扫描 orderbook 多次买入
	 */
	method: EntryMethod;

	// ── limit 专有 ──
	/** 挂单价格 */
	limitPrice?: number;
	/** 超时自动取消（秒） */
	limitTimeoutSec?: number;

	// ── swing_limit 专有 ──
	/** 目标价（midpoint <= 此值触发买入） */
	swingTargetPrice?: number;
	/** 等待窗口秒数 */
	swingWindowSec?: number;

	// ── post_market_scan 专有 ──
	/** 扫描价格上限 */
	scanMaxBuyPrice?: number;
	/** 扫描总预算（USD） */
	scanMaxSpend?: number;
	/** 市场关闭后等待秒数 */
	scanWaitSec?: number;
	/** 扫描持续时间（秒） */
	scanWindowSec?: number;
	/** 扫描轮询间隔（ms） */
	scanPollIntervalMs?: number;
}

// ═══════════════════════════════════════════
// Direction — 方向决策（互斥）
// ═══════════════════════════════════════════

/**
 * 方向决策方法：
 * - clob_follow           — 跟随 CLOB 中间价多数方
 * - prev_candle           — 跟随前一根 K 线方向
 * - rsi_reversal          — RSI 极值反转
 * - signal_score          — 多指标评分决策
 * - ml_model              — 机器学习模型预测（RF、GBDT、XGBoost 等）
 * - post_market_inference — 盘后从 CLOB 价格推断已知结果
 */
export type DirectionMethod =
	| 'clob_follow'
	| 'prev_candle'
	| 'rsi_reversal'
	| 'signal_score'
	| 'ml_model'
	| 'post_market_inference';

/** rsi_reversal 参数 */
export interface RsiReversalParams {
	/** RSI 低阈值（0-100） */
	thresholdLow: number;
	/** RSI 高阈值（> thresholdLow） */
	thresholdHigh: number;
}

/** ml_model 参数 */
export interface MlModelParams {
	/** 模型类型 */
	modelType: 'random_forest' | 'gradient_boosting' | 'xgboost';
	/** 引擎内嵌模型标识 */
	modelId: string;
	/** 最低置信度（0.5-1.0） */
	confidenceThreshold: number;
	/** 价格上限 */
	maxBuyPrice: number;
	/** 等待交易数据的秒数 */
	tradeWindowSec: number;
}

/** post_market_inference 参数 */
export interface PostMarketInferenceParams {
	/** midpoint >= 此值判定为赢方（默认 0.95） */
	inferThreshold: number;
	/** 推断超时秒数 */
	inferTimeoutSec: number;
}

/** signal_score 参数 */
export interface SignalScoreParams {
	rules: SignalRuleDefinition[];
	/** 总分 >= 此值才下注 */
	betThreshold: number;
	/** 总分 <= 此值反向下注 */
	reverseThreshold: number;
	/** 是否启用反向下注 */
	reverseEnabled: boolean;
}

export interface DirectionConfig {
	method: DirectionMethod;
	params?: RsiReversalParams | SignalScoreParams | MlModelParams | PostMarketInferenceParams;
}

// ═══════════════════════════════════════════
// Gates — 入场门控
// ═══════════════════════════════════════════

export interface VolatilityGateConfig {
	type: 'volatility';
	/** ATR 百分比阈值（0.001-1） */
	maxAtrPct: number;
	/** require_low: 低波动才入场；require_high: 高波动才入场 */
	mode: 'require_low' | 'require_high';
}

export interface TrendGateConfig {
	type: 'trend';
	/** 最小 ATR 百分比（0-1），默认 0.04 */
	minAtrPct: number;
	/** 最小效率比（0-1） */
	minER: number;
	/** 最小实体比（0-1） */
	minBodyRatio: number;
	/** 趋势方向是否必须匹配 */
	requireMatch: boolean;
	/** K 线回看周期 */
	period: number;
}

export interface ScheduleGateConfig {
	type: 'schedule';
	/** IANA 时区（如 "Asia/Shanghai"） */
	timezone: string;
	/**
	 * 网格模式（小时粒度）— 与 rules 互斥。
	 * key = 星期缩写，value = 活跃小时数组（0-23）。
	 * 省略的日 = 不运行。
	 */
	grid?: Partial<Record<DayOfWeek, number[]>>;
	/**
	 * 规则模式（分钟粒度）— 与 grid 互斥。
	 */
	rules?: ScheduleTimeRule[];
}

export interface DailyLossLimitGateConfig {
	type: 'daily_loss_limit';
	/** 日亏损上限（USD） */
	maxLossUsd: number;
}

export interface CooldownGateConfig {
	type: 'cooldown';
	/** 连亏 N 轮后触发冷却 */
	afterConsecutiveLosses: number;
	/** 暂停分钟数（1-1440） */
	pauseMinutes: number;
}

export type GateConfig = VolatilityGateConfig | TrendGateConfig | ScheduleGateConfig | DailyLossLimitGateConfig | CooldownGateConfig;

// ═══════════════════════════════════════════
// Signal — 信号评分（属于 direction.method = "signal_score" 的参数）
// ═══════════════════════════════════════════

export interface RuleCondition {
	/** 值范围 [min|null, max|null] */
	range: [number | null, number | null];
	/** 统一分数（不分方向） */
	score?: number;
	/** Up 方向分数 */
	scoreUp?: number;
	/** Down 方向分数 */
	scoreDown?: number;
	/** 否决条件（触发时直接跳过，不管总分） */
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
	/** 规则名称 */
	name: string;
	/** 指标类型 */
	indicator: IndicatorType;
	/** 指标参数（如 { period: 14 }） */
	params?: Record<string, unknown>;
	/** 条件列表 */
	conditions: RuleCondition[];
	/** 是否为 AND gate 必须条件 */
	required?: boolean;
}

/** @deprecated Use SignalScoreParams in direction.params instead */
export type SignalConfig = SignalScoreParams;

// ═══════════════════════════════════════════
// Exit — 退出规则
// ═══════════════════════════════════════════

export interface SettlementExit {
	type: 'settlement';
}

export interface TakeProfitExit {
	type: 'take_profit';
	/** 止盈百分比（0.25 = 25%） */
	pct: number;
}

export interface StopLossExit {
	type: 'stop_loss';
	/** 止损价格 */
	price: number;
	/** 止损前最小持仓秒数 */
	minHoldSec?: number;
}

export interface TrailingStopExit {
	type: 'trailing_stop';
	/** 回撤百分比（0.10 = 10%） */
	drawdownPct: number;
}

export interface CheckpointExit {
	type: 'checkpoint';
	/** 在剩余 N 秒时检查方向一致性 */
	remainingSec: number;
}

export type ExitRule =
	| SettlementExit
	| TakeProfitExit
	| StopLossExit
	| TrailingStopExit
	| CheckpointExit;

// ═══════════════════════════════════════════
// Hedge — 对冲
// ═══════════════════════════════════════════

export interface HedgeConfig {
	enabled: boolean;
	/** 对冲限价（0.001-0.99） */
	limitPrice: number;
	/** 对冲份数（1-10000） */
	shares: number;
	/** 卖出阈值 */
	sellThreshold: number;
}

// ═══════════════════════════════════════════
// Risk — 风控
// ═══════════════════════════════════════════

export interface CooldownConfig {
	/** 连亏 N 轮后触发冷却 */
	afterConsecutiveLosses: number;
	/** 暂停分钟数（1-1440） */
	pauseMinutes: number;
}

export interface PositionSizingConfig {
	/** 仓位计算方式 */
	method: 'fixed' | 'kelly' | 'atr_scaled';
	/** 方法专有参数 */
	params?: Record<string, number>;
}

export interface RiskConfig {
	cooldown?: CooldownConfig;
	/** 日亏损上限（USD） */
	dailyLossLimit?: number;
	/** 最大同时持仓数 */
	maxOpenPositions?: number;
	/** 仓位计算方式 */
	positionSizing?: PositionSizingConfig;
}

// ═══════════════════════════════════════════
// Schedule — 时间门控辅助类型
// ═══════════════════════════════════════════

/** 星期缩写 */
export type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** 精确规则（分钟粒度） */
export interface ScheduleTimeRule {
	/** 星期几 (0=Sun, 1=Mon, ..., 6=Sat) */
	days: number[];
	/** 开始时间 HH:MM */
	start: string;
	/** 结束时间 HH:MM（不跨午夜；跨午夜拆成两条） */
	end: string;
}

// ═══════════════════════════════════════════
// BilingualText — 双语文本
// ═══════════════════════════════════════════

export interface BilingualText {
	zh: string;
	en: string;
}

// ═══════════════════════════════════════════
// StrategyConfigV2 — 纯策略配置（无元数据）
// ═══════════════════════════════════════════

export interface StrategyConfigV2 {
	entry: EntryConfig;
	direction: DirectionConfig;
	gates?: GateConfig[];
	exit: ExitRule[];
	hedge: HedgeConfig;
	dataSources?: string[];
	platformFeeRate?: number;
}

// ═══════════════════════════════════════════
// StrategyJsonV2 — 文件/分享格式（含元数据）
// ═══════════════════════════════════════════

export interface StrategyJsonV2 extends StrategyConfigV2 {
	$schema: 'polymarket-strategy-v2';
	/** 策略 ID (3-40 chars, alphanumeric + hyphens) */
	id: string;
	/** 显示名称 */
	label: BilingualText;
	/** 策略描述 */
	description: BilingualText;
	/** 策略版本号（每次修改递增） */
	version?: number;
	/** 导出时间戳 */
	exportedAt?: string;
}

// ═══════════════════════════════════════════
// Template — 快速预设
// ═══════════════════════════════════════════

export interface StrategyTemplate {
	id: string;
	label: BilingualText;
	description: BilingualText;
	config: StrategyConfigV2;
}
