/** BIP-323 Strategy Description */
export interface Strategy {
	$schema: 'BIP-323';
	id: string;
	name: string | { zh: string; en: string };
	description?: string | { zh: string; en: string };
	tags?: string[];
	riskLevel?: 'conservative' | 'balanced' | 'aggressive';
	author?: string;
	version?: number;
	createdAt?: string;
	signal: { method: string; params?: Record<string, unknown> };
	filter?: Record<string, unknown>;
	entry: { amount: number; method: string; maxPrice?: number; minPrice?: number; maxPerHour?: number; [k: string]: unknown };
	risk?: Record<string, unknown>;
	exit?: { type: string; [k: string]: unknown }[];
}

/** Space (endpoint) */
export interface Space {
	id: string;
	name: string;
	endpointUrl: string;
	isOfficial: boolean;
	online: boolean;
	allowLiveTrading: boolean;
	maxFreeInstances: number;
	maxMemberInstances: number;
	stats: { totalUsers: number; activeInstances: number; totalStrategies: number };
}

/** Strategy Instance */
export interface Instance {
	id: string;
	strategyId: string;
	label: string;
	mode: 'sandbox' | 'live';
	status: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
	spaceId: string;
	spaceName: string;
	stats: { rounds: number; winRate: number; profit: number };
	profits: { hour: number; day: number; thirtyDay: number };
	createdAt: string;
	startedAt?: string;
}

/** Period stats for a time window */
export interface PeriodStats {
	profit: number;
	rounds: number;
	winRate: number;
}

/** Marketplace Strategy */
export interface MarketStrategy {
	id: string;
	name: string;
	description: string;
	visibility: 'public' | 'private';
	price: number;
	riskLevel: 'conservative' | 'balanced' | 'aggressive';
	tags: string[];
	author: { id: string; name: string };
	performance: {
		hour: PeriodStats;
		today: PeriodStats;
		ninetyDay: PeriodStats;
		maxDrawdown: number;
	};
	config?: Strategy;
	followCount: number;
	copyCount: number;
	createdAt: string;
}

/** Leaderboard entry */
export interface LeaderboardEntry {
	rank: number;
	id: string;
	name: string;
	creator: string;
	winRate: number;
	profit: string;
	rounds: number;
	sparkline: number[];
	space: string;
	visibility: 'public' | 'private';
}

/** User */
export interface User {
	userId: string;
	displayName: string;
	safeAddress: string;
	membership: { active: boolean; tier: 'free' | 'pro'; expiresAt?: string };
}

/** Auth state */
export type AuthState = { loggedIn: false } | { loggedIn: true; user: User };

/** Activity feed item */
export interface ActivityItem {
	time: string;
	instance: string;
	message: string;
	type: 'win' | 'loss' | 'entry' | 'pause' | 'info';
	space: string;
}

/** Stats summary */
export interface StatsSummary {
	todayProfit: number;
	activeInstances: number;
	avgWinRate: number;
	thirtyDayProfit: number;
	totalRoundsToday: number;
	spacesCount: number;
}

/** Space member */
export interface SpaceMember {
	userId: string;
	displayName: string;
	safeAddress: string;
	tier: 'free' | 'pro';
	role: 'member' | 'admin';
	activeInstances: number;
	totalRounds: number;
	totalProfit: number;
	winRate: number;
	joinedAt: string;
	isFollowing?: boolean;
}

/** Space stats (aggregate for the whole space) */
export interface SpaceStats {
	totalUsers: number;
	activeInstances: number;
	totalStrategies: number;
	totalRoundsToday: number;
	todayProfit: number;
	allTimeProfit: number;
	avgWinRate: number;
	topStrategy: string;
}

/** Space settings (admin view) */
export interface SpaceSettings {
	allowLiveTrading: boolean;
	maxFreeInstances: number;
	maxMemberInstances: number;
	maxProInstances: number;
	adminCodes: { code: string; label: string; linkedUser: string | null; createdAt: string }[];
}
