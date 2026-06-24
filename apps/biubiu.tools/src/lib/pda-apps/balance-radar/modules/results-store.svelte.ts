/**
 * Heavy result data lives here, OUTSIDE the PageKit module context.
 *
 * PageKit wraps each module's `ctx` in `$state(...)` — a *deep* reactive proxy.
 * Putting the flattened result rows there means every one of (addresses ×
 * tokens × networks) objects gets proxied — at 10k–100k addresses that's
 * millions of proxied objects → the tab runs out of memory and every
 * sort/filter pass walks proxies. So we keep only light scalars (counts,
 * status, duration, view state) in `ctx`, and store the big arrays here in
 * `$state.raw`: reassignment is reactive, but the contents are NOT proxied.
 */
import type { ResultEntry } from './execution.js';
import type { BalanceFailure } from '../types.js';

let rows = $state.raw<ResultEntry[]>([]);
let failures = $state.raw<BalanceFailure[]>([]);

export const resultsStore = {
	get rows(): ResultEntry[] {
		return rows;
	},
	get failures(): BalanceFailure[] {
		return failures;
	},
	set(nextRows: ResultEntry[], nextFailures: BalanceFailure[]): void {
		rows = nextRows;
		failures = nextFailures;
	},
	clear(): void {
		rows = [];
		failures = [];
	},
};
