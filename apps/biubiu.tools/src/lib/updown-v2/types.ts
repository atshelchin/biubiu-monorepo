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

/** User */
export interface User {
	userId: string;
	displayName: string;
	safeAddress: string;
	membership: { active: boolean; tier: 'free' | 'pro'; expiresAt?: string };
}

/** Auth state */
export type AuthState = { loggedIn: false } | { loggedIn: true; user: User };

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
