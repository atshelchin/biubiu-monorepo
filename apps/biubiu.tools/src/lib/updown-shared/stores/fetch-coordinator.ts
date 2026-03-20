/**
 * FetchCoordinator — request deduplication, abort, and coalescing.
 *
 * Solves three problems:
 * 1. **Dedup**: If a fetch for the same key is already in-flight, the old one is
 *    aborted before the new one starts (prevents stale data overwriting fresh).
 * 2. **Coalesce**: Multiple SSE events within a short window (50ms) are batched
 *    into a single refresh call instead of N×3 individual fetches.
 * 3. **Abort-all**: On strategy switch or unmount, all in-flight requests are
 *    cancelled immediately.
 *
 * Pure TypeScript — no Svelte runes, fully unit-testable.
 */

export type FetchFn<T> = (signal: AbortSignal) => Promise<T>;
export type BatchExecutor = (keys: ReadonlySet<string>) => void;

interface InflightEntry {
	controller: AbortController;
	promise: Promise<unknown>;
}

export class FetchCoordinator {
	private inflight = new Map<string, InflightEntry>();

	// --- Coalescing ---
	private pendingKeys = new Set<string>();
	private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
	private batchExecutor: BatchExecutor | null = null;
	private coalesceMs: number;

	constructor(opts?: { coalesceMs?: number }) {
		this.coalesceMs = opts?.coalesceMs ?? 50;
	}

	/**
	 * Register the callback that runs when coalesced keys are flushed.
	 * Typically this calls the store's internal fetch methods.
	 */
	setBatchExecutor(executor: BatchExecutor): void {
		this.batchExecutor = executor;
	}

	/**
	 * Schedule keys for a coalesced refresh (background/SSE-triggered).
	 * Multiple calls within `coalesceMs` are merged into one batch.
	 */
	scheduleRefresh(keys: string[]): void {
		for (const k of keys) this.pendingKeys.add(k);
		if (this.coalesceTimer !== null) return; // already scheduled
		this.coalesceTimer = setTimeout(() => {
			const batch = new Set(this.pendingKeys);
			this.pendingKeys.clear();
			this.coalesceTimer = null;
			this.batchExecutor?.(batch);
		}, this.coalesceMs);
	}

	/**
	 * Execute a fetch for the given key. If a fetch for the same key is
	 * already in-flight, it is aborted first.
	 *
	 * Returns the result of `fn`. If the request is aborted (by a newer call
	 * or by `abortAll`), returns `undefined`.
	 */
	async execute<T>(key: string, fn: FetchFn<T>): Promise<T | undefined> {
		// Abort any existing request for this key
		const existing = this.inflight.get(key);
		if (existing) {
			existing.controller.abort();
		}

		const controller = new AbortController();
		const promise = fn(controller.signal);
		this.inflight.set(key, { controller, promise });

		try {
			const result = await promise;
			return result;
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return undefined;
			}
			throw err;
		} finally {
			// Only clean up if this is still the active entry (not replaced by a newer call)
			if (this.inflight.get(key)?.promise === promise) {
				this.inflight.delete(key);
			}
		}
	}

	/**
	 * Abort all in-flight requests and cancel any pending coalesce timer.
	 * Call on strategy switch or component unmount.
	 */
	abortAll(): void {
		if (this.coalesceTimer !== null) {
			clearTimeout(this.coalesceTimer);
			this.coalesceTimer = null;
		}
		this.pendingKeys.clear();

		for (const entry of this.inflight.values()) {
			entry.controller.abort();
		}
		this.inflight.clear();
	}

	/** Returns true if any request is currently in-flight. */
	get hasInflight(): boolean {
		return this.inflight.size > 0;
	}

	/** Returns true if a coalesce batch is pending. */
	get hasPending(): boolean {
		return this.pendingKeys.size > 0;
	}
}
