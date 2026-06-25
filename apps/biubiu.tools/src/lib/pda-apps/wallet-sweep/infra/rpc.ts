/**
 * Resilient JSON-RPC with multi-endpoint failover.
 *
 * Every call tries the provided RPCs in order and moves to the next on failure,
 * so a single rate-limited / down endpoint never breaks an operation over many
 * wallets. Used for the raw account queries (getCode / nonce / balance) that
 * can't go through Multicall3.
 *
 * Each attempt is bounded by an AbortController timeout — without it a hung
 * endpoint (one that accepts the socket but never responds) would block the
 * whole flow forever and never trigger failover, leaving the UI spinning with
 * no error. The timer is cleared only AFTER res.json() resolves, so the abort
 * signal stays armed across the body read too: a server that sends headers then
 * stalls the body is aborted, res.json() throws, and we fall through to the next
 * RPC. On timeout we abort and fall through to the next RPC.
 */
const RPC_TIMEOUT_MS = 8_000;

export async function rpcCall(
	rpcs: string[],
	method: string,
	params: unknown[],
	timeoutMs = RPC_TIMEOUT_MS,
): Promise<unknown> {
	let lastErr: unknown;
	for (const url of rpcs) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				signal: controller.signal,
			});
			if (!res.ok) {
				lastErr = new Error(`HTTP ${res.status}`);
				continue;
			}
			// Keep the abort signal armed across the body read: a server that sends
			// headers then stalls the body would otherwise hang forever. Aborting
			// the fetch rejects res.json(), which falls through to the next RPC.
			const json = await res.json();
			if (json.error) {
				lastErr = new Error(json.error.message);
				continue;
			}
			return json.result;
		} catch (e) {
			lastErr =
				e instanceof DOMException && e.name === 'AbortError'
					? new Error(`RPC timed out after ${timeoutMs}ms`)
					: e;
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error('All RPCs failed');
}

export async function getCode(rpcs: string[], address: string): Promise<string> {
	return (await rpcCall(rpcs, 'eth_getCode', [address, 'latest'])) as string;
}

export async function hasCode(rpcs: string[], address: string): Promise<boolean> {
	const code = await getCode(rpcs, address);
	return !!code && code !== '0x' && code !== '0x0';
}

export async function getBalance(rpcs: string[], address: string): Promise<bigint> {
	return BigInt((await rpcCall(rpcs, 'eth_getBalance', [address, 'latest'])) as string);
}

export async function getPendingNonce(rpcs: string[], address: string): Promise<number> {
	return Number(BigInt((await rpcCall(rpcs, 'eth_getTransactionCount', [address, 'pending'])) as string));
}

export async function getGasPrice(rpcs: string[]): Promise<bigint> {
	return BigInt((await rpcCall(rpcs, 'eth_gasPrice', [])) as string);
}

/** First RPC that answers eth_chainId with the expected id (for the readiness probe). */
export async function pickWorkingRpc(rpcs: string[], chainId: number): Promise<string | null> {
	for (const url of rpcs) {
		try {
			const id = (await rpcCall([url], 'eth_chainId', [])) as string;
			if (BigInt(id) === BigInt(chainId)) return url;
		} catch {
			// try next
		}
	}
	return null;
}
