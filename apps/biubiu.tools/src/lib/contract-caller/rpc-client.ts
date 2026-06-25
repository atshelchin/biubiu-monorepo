/**
 * Shared RPC plumbing for Contract Caller, tuned so the UI never hangs on a
 * slow endpoint: every public client gets a bounded timeout and we do our own
 * cross-endpoint failover (retryCount: 0) instead of viem's silent same-URL
 * retries (which can stack to 30s+ on a dead RPC).
 */
import { createPublicClient, http, type Address, type PublicClient } from 'viem';

/** Default per-request budget for a single RPC before we move on. */
export const RPC_TIMEOUT_MS = 8000;

/**
 * Drop empty/falsy entries and de-duplicate an RPC-URL list, preserving order
 * (first occurrence wins). The single canonical place for read-RPC dedup.
 */
export function dedupRpcs(urls: ReadonlyArray<string | undefined | null>): string[] {
	return [...new Set(urls.filter(Boolean) as string[])];
}

/** A viem public client with a bounded timeout and no same-URL retry loop. */
export function makeClient(rpcUrl: string, timeoutMs = RPC_TIMEOUT_MS): PublicClient {
	return createPublicClient({
		transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 })
	});
}

/**
 * Whether `address` has contract code via an existing client. `getCode` returns
 * `undefined`/`'0x'` for an EOA or undeployed address. Any RPC failure resolves
 * to `false` (treated as "not deployed") so callers needn't try/catch.
 */
export async function isDeployedWith(client: PublicClient, address: Address): Promise<boolean> {
	try {
		const code = await client.getCode({ address });
		return !!code && code !== '0x';
	} catch {
		return false;
	}
}

/** Whether `address` is a deployed contract on the chain behind `rpcUrl`. */
export async function isDeployed(rpcUrl: string, address: Address): Promise<boolean> {
	return isDeployedWith(makeClient(rpcUrl), address);
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
	// NOTE: do NOT match a bare 0x-selector here — viem embeds the request's
	// calldata (e.g. 0x06fdde03 for name()) in EVERY CallExecutionError message,
	// including timeouts/429s, so a selector match misclassifies transport errors
	// as reverts and kills failover. Real reverts always contain "revert".
	if (/revert|invalid opcode|out of gas|execution failed/.test(msg)) return false;
	return true;
}
