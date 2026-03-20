/**
 * Built-in strategy templates for quick-start instance creation.
 */
import type { StrategyConfigV2, StrategyTemplate } from './types.js';

export const BLANK_CONFIG: StrategyConfigV2 = {
	$schema: 'polymarket-strategy-v2',
	entry: {
		amount: 50,
		priceRange: [0.55, 0.70],
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
			zh: '低价入场 + 止盈止损保护 + 日亏损限制',
			en: 'Low price entry + TP/SL protection + daily loss limit'
		},
		config: {
			$schema: 'polymarket-strategy-v2',
			entry: {
				amount: 30,
				priceRange: [0.50, 0.60],
				windows: [
					{ window: 1, start: 220, end: 190 },
					{ window: 2, start: 160, end: 130 }
				],
				method: 'market',
				maxBuyPrice: 0.52
			},
			direction: { method: 'clob_follow' },
			exit: [
				{ type: 'take_profit', pct: 0.15 },
				{ type: 'stop_loss', price: 0.35, minHoldSec: 60 },
				{ type: 'settlement' }
			],
			hedge: { enabled: false, limitPrice: 0.10, shares: 50, sellThreshold: 35 },
			risk: {
				dailyLossLimit: 50,
				cooldown: { afterConsecutiveLosses: 3, pauseMinutes: 30 }
			}
		}
	},
	{
		id: 'momentum',
		label: { zh: '趋势策略', en: 'Momentum' },
		description: {
			zh: '趋势门控确认方向 + RSI 反转抓拐点',
			en: 'Trend gate confirms direction + RSI reversal catches turning points'
		},
		config: {
			$schema: 'polymarket-strategy-v2',
			entry: {
				amount: 50,
				priceRange: [0.50, 0.65],
				windows: [{ window: 1, start: 280, end: 240 }],
				method: 'market',
				maxBuyPrice: 0.55
			},
			direction: {
				method: 'rsi_reversal',
				rsiParams: { thresholdLow: 35, thresholdHigh: 65 }
			},
			gates: [
				{ type: 'trend', minER: 0.2, minBodyRatio: 0.3, requireMatch: true, period: 10 }
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
			zh: '低价挂单等待成交 + 高波动市场 + 止盈 25%',
			en: 'Limit order at low price + high volatility + 25% take profit'
		},
		config: {
			$schema: 'polymarket-strategy-v2',
			entry: {
				amount: 50,
				priceRange: [0.58, 0.68],
				windows: [
					{ window: 1, start: 220, end: 190 },
					{ window: 2, start: 160, end: 130 },
					{ window: 3, start: 100, end: 70 }
				],
				method: 'swing_limit',
				swingBuyPrice: 0.48,
				swingBuyWindowSec: 300
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
