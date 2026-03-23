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

/** Navigation */
export type Page = 'landing' | 'hub' | 'space' | 'marketplace' | 'editor' | 'strategy-detail';

export const nav = $state<{
	page: Page;
	title: string;
	spaceId: string | null;
	strategyId: string | null;
	history: { page: Page; title: string; spaceId: string | null }[];
}>({
	page: 'hub',
	title: 'BTC Up/Down',
	spaceId: null,
	strategyId: null,
	history: []
});

export function goTo(page: Page, title: string, opts?: { spaceId?: string; strategyId?: string }) {
	nav.history.push({ page: nav.page, title: nav.title, spaceId: nav.spaceId });
	nav.page = page;
	nav.title = title;
	nav.spaceId = opts?.spaceId ?? nav.spaceId;
	nav.strategyId = opts?.strategyId ?? null;
}

export function goBack() {
	const prev = nav.history.pop();
	if (prev) {
		nav.page = prev.page;
		nav.title = prev.title;
		nav.spaceId = prev.spaceId;
	}
}

/** Hub tab */
export const hubTab = $state<{ active: number }>({ active: 0 });

/** Mode filter: all / sandbox / live */
export const modeFilter = $state<{ value: 'all' | 'sandbox' | 'live' }>({ value: 'all' });
