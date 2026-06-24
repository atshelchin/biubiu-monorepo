/**
 * Look up EVM chain metadata by chain ID from the public ethereum-lists / chainid
 * registry (the same data chainlist.org uses). Lets "add custom network" auto-fill
 * name / native symbol / decimals / RPCs from just a chain ID instead of making the
 * user type everything by hand.
 */
export interface ChainInfo {
	name: string;
	symbol: string;
	decimals: number;
	/** Public https RPC endpoints (ws:// and ${API_KEY}-templated ones removed). */
	rpcs: string[];
}

// Per-chain JSON files. chainid.network is primary; the raw ethereum-lists repo is
// a fallback if it's unreachable. Both send `access-control-allow-origin: *`.
const SOURCES = [
	(id: number) => `https://chainid.network/chains/eip155-${id}.json`,
	(id: number) => `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${id}.json`,
];

function cleanRpcs(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const entry of raw) {
		// Some entries are objects ({ url, tracking, ... }); most are strings.
		const url = typeof entry === 'string' ? entry : typeof entry?.url === 'string' ? entry.url : '';
		if (!url.startsWith('https://')) continue; // drop ws:// and http://
		if (url.includes('${')) continue; // drop templated API-key URLs
		if (seen.has(url)) continue;
		seen.add(url);
		out.push(url);
		if (out.length >= 10) break;
	}
	return out;
}

/**
 * Resolve chain metadata, or `null` if the chain ID isn't in the registry (404).
 * Throws only on a total network failure (all sources unreachable) so the caller
 * can distinguish "unknown chain" (fill manually) from "lookup failed" (retry).
 */
export async function lookupChain(chainId: number, signal?: AbortSignal): Promise<ChainInfo | null> {
	let lastError: unknown = null;
	for (const makeUrl of SOURCES) {
		try {
			const res = await fetch(makeUrl(chainId), { signal });
			if (res.status === 404) return null; // definitively unknown chain
			if (!res.ok) {
				lastError = new Error(`HTTP ${res.status}`);
				continue;
			}
			const data = await res.json();
			const nc = (data?.nativeCurrency ?? {}) as { symbol?: unknown; decimals?: unknown };
			return {
				name: typeof data?.name === 'string' ? data.name : '',
				symbol: typeof nc.symbol === 'string' ? nc.symbol : '',
				decimals: typeof nc.decimals === 'number' && Number.isFinite(nc.decimals) ? nc.decimals : 18,
				rpcs: cleanRpcs(data?.rpc),
			};
		} catch (err) {
			if (signal?.aborted) throw err;
			lastError = err;
		}
	}
	throw lastError ?? new Error('Chain lookup failed');
}
