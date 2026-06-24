/**
 * Wallet Lab shared state.
 *
 * Single source of truth = `walletStore` (the active connected wallet). This store
 * adds the debug-only bits: the currently selected target chain and a rolling
 * console log that every panel appends to (mirrors the Sequence demo's Output box).
 */
import { walletStore } from '$lib/wallet';
import type { ConnectedWallet } from '$lib/wallet';

export interface LogEntry {
	id: number;
	ts: number;
	/** Short action label, e.g. "signMessage" / "sendCalls" / "getBalance". */
	action: string;
	ok: boolean;
	/** Arbitrary JSON-serialisable payload (bigints handled by safeJson). */
	data: unknown;
}

const MAX_LOG = 100;

class DebugStore {
	/** Target chain for reads/sends. For external wallets we keep it in sync via ensureChain. */
	selectedChainId = $state<number>(8453);
	log = $state<LogEntry[]>([]);
	private seq = 0;

	get wallet(): ConnectedWallet | null {
		return walletStore.activeWallet;
	}

	/** Append a console entry (newest first), capped at MAX_LOG. */
	push(action: string, ok: boolean, data: unknown): void {
		this.seq += 1;
		const entry: LogEntry = { id: this.seq, ts: Date.now(), action, ok, data };
		this.log = [entry, ...this.log].slice(0, MAX_LOG);
	}

	clear(): void {
		this.log = [];
	}
}

export const debug = new DebugStore();
