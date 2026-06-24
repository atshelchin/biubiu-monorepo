/**
 * Shared RPC plumbing for Contract Caller, tuned so the UI never hangs on a
 * slow endpoint: every public client gets a bounded timeout and we do our own
 * cross-endpoint failover (retryCount: 0) instead of viem's silent same-URL
 * retries (which can stack to 30s+ on a dead RPC).
 */
import { createPublicClient, http, type PublicClient } from 'viem';

/** Default per-request budget for a single RPC before we move on. */
export const RPC_TIMEOUT_MS = 8000;

/** A viem public client with a bounded timeout and no same-URL retry loop. */
export function makeClient(rpcUrl: string, timeoutMs = RPC_TIMEOUT_MS): PublicClient {
	return createPublicClient({
		transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 })
	});
}

/** `fetch` that aborts after `timeoutMs` so a stalled host can't wedge the UI. */
export async function fetchWithTimeout(
	url: string,
	timeoutMs = RPC_TIMEOUT_MS,
	init?: RequestInit
): Promise<Response> {
	return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Whether a failed call is worth re-trying on a different RPC. Reverts /
 * deterministic EVM errors will fail identically everywhere, so we surface them
 * immediately; transport problems (timeout, network, rate-limit) get failover.
 */
export function isRetryableRpcError(e: unknown): boolean {
	const parts: string[] = [];
	if (e && typeof e === 'object') {
		const anyE = e as { name?: string; shortMessage?: string; details?: string; message?: string };
		parts.push(anyE.name ?? '', anyE.shortMessage ?? '', anyE.details ?? '', anyE.message ?? '');
	} else {
		parts.push(String(e));
	}
	const msg = parts.join(' ').toLowerCase();
	// Deterministic execution outcomes — the same call reverts on any node.
	if (/revert|invalid opcode|out of gas|execution failed|0x[0-9a-f]{8}/.test(msg)) return false;
	return true;
}
