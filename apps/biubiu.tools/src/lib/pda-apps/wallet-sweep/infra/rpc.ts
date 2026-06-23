/**
 * Resilient JSON-RPC with multi-endpoint failover.
 *
 * Every call tries the provided RPCs in order and moves to the next on failure,
 * so a single rate-limited / down endpoint never breaks an operation over many
 * wallets. Used for the raw account queries (getCode / nonce / balance) that
 * can't go through Multicall3.
 */
export async function rpcCall(rpcs: string[], method: string, params: unknown[]): Promise<unknown> {
	let lastErr: unknown;
	for (const url of rpcs) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
			});
			if (!res.ok) {
				lastErr = new Error(`HTTP ${res.status}`);
				continue;
			}
			const json = await res.json();
			if (json.error) {
				lastErr = new Error(json.error.message);
				continue;
			}
			return json.result;
		} catch (e) {
			lastErr = e;
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
