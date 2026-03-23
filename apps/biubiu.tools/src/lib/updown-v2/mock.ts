import type { Space, Instance, MarketStrategy, LeaderboardEntry, User, ActivityItem, StatsSummary, SpaceMember, SpaceStats, SpaceSettings } from './types';

export const MOCK_USER: User = {
	userId: 'user_shelchin',
	displayName: 'shelchin',
	safeAddress: '0x1234...abcd',
	membership: { active: true, tier: 'pro', expiresAt: '2027-01-01T00:00:00Z' }
};

export const MOCK_SPACES: Space[] = [
	{
		id: 'official',
		name: 'Public Square',
		endpointUrl: 'btc-updown-5m-bot-api.biubiu.tools',
		isOfficial: true,
		online: true,
		allowLiveTrading: false,
		maxFreeInstances: 3,
		maxMemberInstances: 100,
		stats: { totalUsers: 1247, activeInstances: 342, totalStrategies: 86 }
	},
	{
		id: 'alpha-club',
		name: 'Alpha Trading Club',
		endpointUrl: 'btc-bot.alpha-club.xyz',
		isOfficial: false,
		online: true,
		allowLiveTrading: true,
		maxFreeInstances: 3,
		maxMemberInstances: 50,
		stats: { totalUsers: 23, activeInstances: 15, totalStrategies: 12 }
	}
];

export const MOCK_INSTANCES: Instance[] = [
	{
		id: 'inst_001', strategyId: 'rsi-reversal-pro', label: 'RSI Reversal Pro',
		mode: 'live', status: 'running', spaceId: 'alpha-club', spaceName: 'Alpha Trading Club',
		stats: { rounds: 24, winRate: 58.3, profit: 42.80 },
		profits: { hour: 8.2, day: 42.8, thirtyDay: 386 },
		createdAt: '2026-03-01T00:00:00Z'
	},
	{
		id: 'inst_002', strategyId: 'clob-momentum', label: 'CLOB Momentum',
		mode: 'sandbox', status: 'paused', spaceId: 'alpha-club', spaceName: 'Alpha Trading Club',
		stats: { rounds: 12, winRate: 45.0, profit: -8.20 },
		profits: { hour: -3.1, day: -8.2, thirtyDay: 54 },
		createdAt: '2026-03-10T00:00:00Z'
	},
	{
		id: 'inst_003', strategyId: 'signal-score-v2', label: 'Signal Score v2',
		mode: 'sandbox', status: 'stopped', spaceId: 'alpha-club', spaceName: 'Alpha Trading Club',
		stats: { rounds: 18, winRate: 62.1, profit: 15.40 },
		profits: { hour: 0, day: 15.4, thirtyDay: 122 },
		createdAt: '2026-03-15T00:00:00Z'
	}
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
	{ rank: 1, id: 'mkt_001', name: 'Alpha Signal ML', creator: 'quant_whale', winRate: 64.8, profit: '+$127.40', rounds: 89, sparkline: gen24(), space: 'Public Square', visibility: 'private' },
	{ rank: 2, id: 'mkt_002', name: 'Volatility Gate Pro', creator: 'deep_value', winRate: 67.1, profit: '+$94.20', rounds: 42, sparkline: gen24(), space: 'Public Square', visibility: 'private' },
	{ rank: 3, id: 'mkt_003', name: 'Multi-Signal Scorer', creator: 'algo_queen', winRate: 59.4, profit: '+$68.80', rounds: 72, sparkline: gen24(), space: 'Public Square', visibility: 'public' },
	{ rank: 4, id: 'mkt_004', name: 'RSI Reversal v3', creator: 'shelchin', winRate: 58.7, profit: '+$52.10', rounds: 61, sparkline: gen24(), space: 'Alpha Trading Club', visibility: 'public' },
	{ rank: 5, id: 'mkt_005', name: 'CLOB Follow Basic', creator: 'trader_mike', winRate: 61.2, profit: '+$41.60', rounds: 54, sparkline: gen24(), space: 'Public Square', visibility: 'public' },
	{ rank: 6, id: 'mkt_006', name: 'Candle Follow + ATR', creator: 'btc_chad', winRate: 55.3, profit: '+$28.90', rounds: 68, sparkline: gen24(), space: 'Public Square', visibility: 'public' },
];

export const MOCK_MARKET_STRATEGIES: MarketStrategy[] = [
	{
		id: 'mkt_003', name: 'CLOB Follow Basic', description: 'Simple CLOB midpoint follower. Enters in direction favored by majority open limit orders.',
		visibility: 'public', price: 0, riskLevel: 'conservative', tags: ['beginner', 'clob'],
		author: { id: 'user_mike', name: 'trader_mike' },
		performance: {
			hour: { profit: 6.2, rounds: 3, winRate: 66.7 },
			today: { profit: 41.6, rounds: 18, winRate: 61.1 },
			ninetyDay: { profit: 892, rounds: 412, winRate: 61.2 },
			maxDrawdown: 45
		},
		config: {
			$schema: 'BIP-323', id: 'clob-follow-basic', name: 'CLOB Follow Basic',
			signal: { method: 'clob_imbalance', params: { threshold: 0.6, window: '5m', depthLevels: 5 } },
			entry: { amount: 5, method: 'market', maxPrice: 0.65, minPrice: 0.35 },
			risk: { dailyLossLimit: 50, maxConsecutiveLosses: 5 },
		},
		followCount: 89, copyCount: 34, createdAt: '2026-01-15T00:00:00Z'
	},
	{
		id: 'mkt_004', name: 'RSI Reversal v3', description: 'Contrarian: goes opposite when RSI indicates overbought/oversold on 5m candles.',
		visibility: 'public', price: 0, riskLevel: 'balanced', tags: ['reversal', 'rsi'],
		author: { id: 'user_shelchin', name: 'shelchin' },
		performance: {
			hour: { profit: 8.5, rounds: 4, winRate: 75.0 },
			today: { profit: 52.1, rounds: 22, winRate: 59.1 },
			ninetyDay: { profit: 445, rounds: 305, winRate: 58.7 },
			maxDrawdown: 32
		},
		config: {
			$schema: 'BIP-323', id: 'rsi-reversal-v3', name: 'RSI Reversal v3',
			signal: { method: 'rsi_reversal', params: { period: 14, overbought: 70, oversold: 30, source: 'close' } },
			filter: { minVolume: 1000, volatilityGate: { enabled: true, minATR: 0.02 } },
			entry: { amount: 5, method: 'market', maxPerHour: 8 },
			risk: { dailyLossLimit: 80, maxConsecutiveLosses: 6, stopLoss: { type: 'trailing', percent: 3 } },
			exit: [{ type: 'take_profit', percent: 5 }, { type: 'stop_loss', percent: 3 }],
		},
		followCount: 56, copyCount: 22, createdAt: '2026-02-01T00:00:00Z'
	},
	{
		id: 'mkt_001', name: 'Alpha Signal ML', description: 'ML-based GBDT model trained on 6 months of BTC 5-minute market data.',
		visibility: 'private', price: 20, riskLevel: 'aggressive', tags: ['ml', 'gbdt'],
		author: { id: 'user_whale', name: 'quant_whale' },
		performance: {
			hour: { profit: 18.4, rounds: 6, winRate: 83.3 },
			today: { profit: 127.4, rounds: 48, winRate: 64.6 },
			ninetyDay: { profit: 3200, rounds: 1203, winRate: 64.8 },
			maxDrawdown: 120
		},
		followCount: 234, copyCount: 67, createdAt: '2026-01-01T00:00:00Z'
	},
	{
		id: 'mkt_005', name: 'Volatility Gate Pro', description: 'Only enters during high-volatility windows. ATR filtering with trend gates.',
		visibility: 'private', price: 20, riskLevel: 'balanced', tags: ['volatility', 'gate'],
		author: { id: 'user_dv', name: 'deep_value' },
		performance: {
			hour: { profit: 12.1, rounds: 5, winRate: 80.0 },
			today: { profit: 94.2, rounds: 32, winRate: 68.8 },
			ninetyDay: { profit: 1680, rounds: 198, winRate: 67.1 },
			maxDrawdown: 88
		},
		followCount: 145, copyCount: 41, createdAt: '2026-01-20T00:00:00Z'
	}
];

export const MOCK_ACTIVITY: ActivityItem[] = [
	{ time: '14:35', instance: 'RSI Reversal Pro', message: 'Round #24 — WIN +$4.10', type: 'win', space: 'Alpha Trading Club' },
	{ time: '14:30', instance: 'RSI Reversal Pro', message: 'Entry UP @ $5.00', type: 'entry', space: 'Alpha Trading Club' },
	{ time: '14:25', instance: 'Signal Score v2', message: 'Round #18 — WIN +$2.80', type: 'win', space: 'Alpha Trading Club' },
	{ time: '14:20', instance: 'CLOB Momentum', message: 'Paused — daily loss limit', type: 'pause', space: 'Alpha Trading Club' },
	{ time: '14:15', instance: 'RSI Reversal Pro', message: 'Round #22 — WIN +$4.50', type: 'win', space: 'Alpha Trading Club' },
];

export const MOCK_SUMMARY: StatsSummary = {
	todayProfit: 50.0,
	activeInstances: 2,
	avgWinRate: 56.8,
	thirtyDayProfit: 562,
	totalRoundsToday: 54,
	spacesCount: 2
};

/** Mock space members for Alpha Trading Club */
export const MOCK_SPACE_MEMBERS: Record<string, SpaceMember[]> = {
	'official': [
		{ userId: 'user_shelchin', displayName: 'shelchin', safeAddress: '0x1234...abcd', tier: 'pro', role: 'admin', activeInstances: 2, totalRounds: 305, totalProfit: 445, winRate: 58.7, joinedAt: '2026-01-01T00:00:00Z' },
		{ userId: 'user_whale', displayName: 'quant_whale', safeAddress: '0x5678...efgh', tier: 'pro', role: 'member', activeInstances: 4, totalRounds: 1203, totalProfit: 3200, winRate: 64.8, joinedAt: '2026-01-02T00:00:00Z' },
		{ userId: 'user_mike', displayName: 'trader_mike', safeAddress: '0x9abc...ijkl', tier: 'free', role: 'member', activeInstances: 2, totalRounds: 412, totalProfit: 892, winRate: 61.2, joinedAt: '2026-01-10T00:00:00Z' },
		{ userId: 'user_dv', displayName: 'deep_value', safeAddress: '0xdef0...mnop', tier: 'pro', role: 'member', activeInstances: 3, totalRounds: 198, totalProfit: 1680, winRate: 67.1, joinedAt: '2026-01-15T00:00:00Z' },
		{ userId: 'user_queen', displayName: 'algo_queen', safeAddress: '0x1111...qrst', tier: 'free', role: 'member', activeInstances: 1, totalRounds: 72, totalProfit: 68.8, winRate: 59.4, joinedAt: '2026-02-01T00:00:00Z' },
		{ userId: 'user_chad', displayName: 'btc_chad', safeAddress: '0x2222...uvwx', tier: 'free', role: 'member', activeInstances: 1, totalRounds: 68, totalProfit: 28.9, winRate: 55.3, joinedAt: '2026-02-15T00:00:00Z' },
	],
	'alpha-club': [
		{ userId: 'user_shelchin', displayName: 'shelchin', safeAddress: '0x1234...abcd', tier: 'pro', role: 'member', activeInstances: 1, totalRounds: 24, totalProfit: 42.8, winRate: 58.3, joinedAt: '2026-03-01T00:00:00Z' },
		{ userId: 'user_whale', displayName: 'quant_whale', safeAddress: '0x5678...efgh', tier: 'pro', role: 'admin', activeInstances: 3, totalRounds: 450, totalProfit: 1280, winRate: 63.5, joinedAt: '2026-01-20T00:00:00Z' },
		{ userId: 'user_dv', displayName: 'deep_value', safeAddress: '0xdef0...mnop', tier: 'pro', role: 'member', activeInstances: 2, totalRounds: 120, totalProfit: 560, winRate: 65.0, joinedAt: '2026-02-10T00:00:00Z' },
	]
};

/** Mock space-level stats */
export const MOCK_SPACE_STATS: Record<string, SpaceStats> = {
	'official': {
		totalUsers: 1247, activeInstances: 342, totalStrategies: 86,
		totalRoundsToday: 4280, todayProfit: 12450, allTimeProfit: 892000,
		avgWinRate: 58.2, topStrategy: 'Alpha Signal ML'
	},
	'alpha-club': {
		totalUsers: 23, activeInstances: 15, totalStrategies: 12,
		totalRoundsToday: 186, todayProfit: 820, allTimeProfit: 34500,
		avgWinRate: 61.4, topStrategy: 'RSI Reversal Pro'
	}
};

/** Mock space admin settings */
export const MOCK_SPACE_SETTINGS: Record<string, SpaceSettings> = {
	'official': {
		allowLiveTrading: false, maxFreeInstances: 3, maxMemberInstances: 100, maxProInstances: -1,
		adminCodes: [
			{ code: 'ADM-001-XXXX', label: 'Primary Admin', linkedUser: 'shelchin', createdAt: '2026-01-01T00:00:00Z' },
			{ code: 'ADM-002-XXXX', label: 'Ops Admin', linkedUser: null, createdAt: '2026-01-01T00:00:00Z' },
		]
	},
	'alpha-club': {
		allowLiveTrading: true, maxFreeInstances: 3, maxMemberInstances: 50, maxProInstances: 200,
		adminCodes: [
			{ code: 'ATC-001-XXXX', label: 'Owner', linkedUser: 'quant_whale', createdAt: '2026-01-20T00:00:00Z' },
		]
	}
};

function gen24(): number[] {
	return Array.from({ length: 24 }, () => (Math.random() - 0.38) * 8);
}

/**
 * Simple seeded PRNG for deterministic mock data.
 * Given same seed, always returns same sequence.
 */
function seededRandom(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

/**
 * Generate mock PeriodStats for a strategy at a given period offset.
 * offset=0 returns the strategy's own data, offset<0 generates deterministic past data.
 */
export function mockPeriodStats(
	strategyId: string,
	period: 'hour' | 'today' | 'ninetyDay',
	offset: number
): import('./types').PeriodStats {
	// offset 0 = current data from MOCK_MARKET_STRATEGIES
	if (offset === 0) {
		const s = MOCK_MARKET_STRATEGIES.find(m => m.id === strategyId);
		if (s) return s.performance[period];
	}

	// Generate deterministic data based on id + period + offset
	const hash = [...(strategyId + period + offset)].reduce((a, c) => a + c.charCodeAt(0), 0);
	const rng = seededRandom(hash);

	const baseRounds = period === 'hour' ? 4 : period === 'today' ? 24 : 300;
	const baseProfit = period === 'hour' ? 8 : period === 'today' ? 50 : 800;

	const rounds = Math.max(1, Math.round(baseRounds * (0.5 + rng())));
	const winRate = 40 + rng() * 35; // 40–75%
	const profit = (rng() - 0.3) * baseProfit * 2; // can be negative

	return {
		profit: Math.round(profit * 100) / 100,
		rounds,
		winRate: Math.round(winRate * 10) / 10
	};
}
