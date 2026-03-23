import type { Space, Instance, MarketStrategy, LeaderboardEntry, User, ActivityItem, StatsSummary } from './types';

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
		performance: { totalRounds: 412, winRate: 61.2, profit24h: 41.6, profit30d: 238, profitAll: 892, maxDrawdown: 45 },
		followCount: 89, copyCount: 34, createdAt: '2026-01-15T00:00:00Z'
	},
	{
		id: 'mkt_004', name: 'RSI Reversal v3', description: 'Contrarian: goes opposite when RSI indicates overbought/oversold on 5m candles.',
		visibility: 'public', price: 0, riskLevel: 'balanced', tags: ['reversal', 'rsi'],
		author: { id: 'user_shelchin', name: 'shelchin' },
		performance: { totalRounds: 305, winRate: 58.7, profit24h: 52.1, profit30d: 185, profitAll: 445, maxDrawdown: 32 },
		followCount: 56, copyCount: 22, createdAt: '2026-02-01T00:00:00Z'
	},
	{
		id: 'mkt_001', name: 'Alpha Signal ML', description: 'ML-based GBDT model trained on 6 months of BTC 5-minute market data.',
		visibility: 'private', price: 20, riskLevel: 'aggressive', tags: ['ml', 'gbdt'],
		author: { id: 'user_whale', name: 'quant_whale' },
		performance: { totalRounds: 1203, winRate: 64.8, profit24h: 127.4, profit30d: 892, profitAll: 3200, maxDrawdown: 120 },
		followCount: 234, copyCount: 67, createdAt: '2026-01-01T00:00:00Z'
	},
	{
		id: 'mkt_005', name: 'Volatility Gate Pro', description: 'Only enters during high-volatility windows. ATR filtering with trend gates.',
		visibility: 'private', price: 20, riskLevel: 'balanced', tags: ['volatility', 'gate'],
		author: { id: 'user_dv', name: 'deep_value' },
		performance: { totalRounds: 198, winRate: 67.1, profit24h: 94.2, profit30d: 445, profitAll: 1680, maxDrawdown: 88 },
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

function gen24(): number[] {
	return Array.from({ length: 24 }, () => (Math.random() - 0.38) * 8);
}
