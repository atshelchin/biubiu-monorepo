/**
 * Built-in strategy templates for quick-start instance creation.
 */
import type { StrategyConfigV2, StrategyTemplate } from './types.js';

export const BLANK_CONFIG: StrategyConfigV2 = {
	entry: {
		amount: 50,
		maxBuyPrice: 0.65,
		windows: [
			{ window: 1, start: 220, end: 190 },
			{ window: 2, start: 160, end: 130 },
			{ window: 3, start: 100, end: 70 }
		],
		method: 'market'
	},
	direction: { method: 'clob_follow' },
	exit: [{ type: 'settlement' }],
	hedge: { enabled: false, limitPrice: 0.10, shares: 50, sellThreshold: 35 }
};

export const TEMPLATES: StrategyTemplate[] = [
	{
		id: 'conservative',
		label: { zh: '稳健策略', en: 'Conservative' },
		description: {
			zh: '低价入场 + 止盈止损 + 日亏损限制',
			en: 'Low price entry + TP/SL + daily loss limit'
		},
		config: {
			entry: {
				amount: 30,
				maxBuyPrice: 0.52,
				windows: [
					{ window: 1, start: 220, end: 190 },
					{ window: 2, start: 160, end: 130 }
				],
				method: 'market'
			},
			direction: { method: 'clob_follow' },
			gates: [
				{ type: 'daily_loss_limit', maxLossUsd: 50 },
				{ type: 'cooldown', afterConsecutiveLosses: 3, pauseMinutes: 30 }
			],
			exit: [
				{ type: 'take_profit', pct: 0.15 },
				{ type: 'stop_loss', price: 0.35, minHoldSec: 60 },
				{ type: 'settlement' }
			],
			hedge: { enabled: false, limitPrice: 0.10, shares: 50, sellThreshold: 35 }
		}
	},
	{
		id: 'momentum',
		label: { zh: '趋势策略', en: 'Momentum' },
		description: {
			zh: '趋势门控 + RSI 反转抓拐点',
			en: 'Trend gate + RSI reversal catches turning points'
		},
		config: {
			entry: {
				amount: 50,
				maxBuyPrice: 0.55,
				windows: [{ window: 1, start: 280, end: 240 }],
				method: 'market'
			},
			direction: {
				method: 'rsi_reversal',
				params: { thresholdLow: 35, thresholdHigh: 65 }
			},
			gates: [
				{ type: 'trend', minAtrPct: 0.04, minER: 0.2, minBodyRatio: 0.3, requireMatch: true, period: 10 }
			],
			exit: [{ type: 'checkpoint', remainingSec: 180 }, { type: 'settlement' }],
			hedge: { enabled: false, limitPrice: 0.10, shares: 50, sellThreshold: 35 },
			dataSources: ['binance']
		}
	},
	{
		id: 'swing',
		label: { zh: '低吸策略', en: 'Swing' },
		description: {
			zh: '高波动 + 低价等待成交 + 止盈 25%',
			en: 'High volatility + limit wait + 25% take profit'
		},
		config: {
			entry: {
				amount: 50,
				maxBuyPrice: 0.55,
				windows: [
					{ window: 1, start: 220, end: 190 },
					{ window: 2, start: 160, end: 130 },
					{ window: 3, start: 100, end: 70 }
				],
				method: 'swing_limit',
				swingTargetPrice: 0.48,
				swingWindowSec: 300
			},
			direction: { method: 'clob_follow' },
			gates: [{ type: 'volatility', maxAtrPct: 0.07, mode: 'require_high' }],
			exit: [
				{ type: 'take_profit', pct: 0.25 },
				{ type: 'stop_loss', price: 0.30, minHoldSec: 60 },
				{ type: 'settlement' }
			],
			hedge: { enabled: false, limitPrice: 0.10, shares: 50, sellThreshold: 35 },
			dataSources: ['binance']
		}
	}
];

/** Deep-clone a config to avoid mutation */
export function cloneConfig(config: StrategyConfigV2): StrategyConfigV2 {
	return JSON.parse(JSON.stringify(config));
}
