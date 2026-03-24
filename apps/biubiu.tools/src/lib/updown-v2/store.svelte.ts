import type { AuthState, Space, Instance, LeaderboardEntry, MarketStrategy, ActivityItem, StatsSummary } from './types';
import { MOCK_USER, MOCK_SPACES, MOCK_INSTANCES, MOCK_LEADERBOARD, MOCK_MARKET_STRATEGIES, MOCK_ACTIVITY, MOCK_SUMMARY } from './mock';

/** Auth state */
export const auth = $state<{ value: AuthState }>({ value: { loggedIn: false } });

export function login() {
	auth.value = { loggedIn: true, user: MOCK_USER };
}

export function logout() {
	auth.value = { loggedIn: false };
}

/** Spaces */
export const spaces = $state<{ list: Space[] }>({ list: MOCK_SPACES });

/** Instances (across all spaces) */
export const instances = $state<{ list: Instance[] }>({ list: MOCK_INSTANCES });

/** Leaderboard */
export const leaderboard = $state<{ list: LeaderboardEntry[] }>({ list: MOCK_LEADERBOARD });

/** Market strategies */
export const market = $state<{ list: MarketStrategy[] }>({ list: MOCK_MARKET_STRATEGIES });

/** Activity feed */
export const activity = $state<{ list: ActivityItem[] }>({ list: MOCK_ACTIVITY });

/** Summary stats */
export const summary = $state<{ data: StatsSummary }>({ data: MOCK_SUMMARY });

/** Hub tab */
export const hubTab = $state<{ active: number }>({ active: 0 });

/** Space tab: 0=Overview, 1=Strategies, 2=Members, 3=Admin */
export const spaceTab = $state<{ active: number }>({ active: 0 });

/** Mode filter: all / sandbox / live */
export const modeFilter = $state<{ value: 'all' | 'sandbox' | 'live' }>({ value: 'all' });

/** Update instance status */
export function setInstanceStatus(instanceId: string, status: Instance['status']) {
	const inst = instances.list.find(i => i.id === instanceId);
	if (inst) inst.status = status;
}

/** Create a new instance (mock) */
export function createInstance(opts: { label: string; strategyId: string; spaceId: string; spaceName: string; mode: 'sandbox' | 'live' }) {
	const id = 'inst_' + Date.now();
	instances.list.push({
		id,
		strategyId: opts.strategyId,
		label: opts.label,
		mode: opts.mode,
		status: 'stopped',
		spaceId: opts.spaceId,
		spaceName: opts.spaceName,
		stats: { rounds: 0, winRate: 0, profit: 0 },
		profits: { hour: 0, day: 0, thirtyDay: 0 },
		createdAt: new Date().toISOString()
	});
	return id;
}

/** Delete an instance */
export function deleteInstance(instanceId: string) {
	const idx = instances.list.findIndex(i => i.id === instanceId);
	if (idx >= 0) instances.list.splice(idx, 1);
}

/** UI modals (shared between layout and pages) */
export const showAuth = $state<{ value: boolean }>({ value: false });
export const showAddSpace = $state<{ value: boolean }>({ value: false });
export const addSpaceUrl = $state<{ value: string }>({ value: '' });
