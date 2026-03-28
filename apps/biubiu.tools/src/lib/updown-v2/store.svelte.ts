import type { AuthState, Space, Instance, StatsSummary } from './types';
import { MOCK_USER, MOCK_SPACES, MOCK_INSTANCES, MOCK_SUMMARY } from './mock';

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

/** Summary stats */
export const summary = $state<{ data: StatsSummary }>({ data: MOCK_SUMMARY });

/** Space tab: 0=Overview, 1=Members, 2=Admin */
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
