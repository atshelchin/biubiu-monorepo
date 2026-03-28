import type { Space, Instance, User, StatsSummary, SpaceMember, SpaceStats, SpaceSettings } from './types';

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

