/**
 * Network helpers: dynamic chain loading (ethereum-data API, same as
 * vela-chain-setup) + the chainId → site-wallet network-key mapping that
 * gates the write/batch/chain features.
 */
import type { ChainInfo, ChainSearchResult } from './types.js';
import { getEthereumDataURL } from '$lib/wallet/infra/endpoints.js';

/** Default data-API base. The active URL is `getEthereumDataURL()` (overridable in
 *  「服务节点」 settings); this constant is the default + a stable test anchor. */
export const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

/**
 * chainId → site-wallet network key (must match CHAIN_CONFIG in
 * `$lib/auth/safe-tx/constants.ts`). Only these chains can sign + send
 * transactions through the built-in Safe wallet; everywhere else the tool
 * is read-only (writes are exported as calldata instead).
 */
export const WRITE_NETWORK_BY_CHAIN_ID: Record<number, string> = {
	1: 'eth-mainnet',
	42161: 'arb-mainnet',
	8453: 'base-mainnet',
	10: 'opt-mainnet',
	137: 'matic-mainnet',
	56: 'bnb-mainnet',
	43114: 'avax-mainnet',
	100: 'gnosis-mainnet',
	130: 'unichain-mainnet',
	4217: 'tempo-mainnet',
	143: 'monad-mainnet',
	480: 'worldchain-mainnet',
	80002: 'polygon-amoy'
};

/** Resolve the site-wallet network key for a chain, or null if writes unsupported. */
export function writeNetworkKey(chainId: number | undefined | null): string | null {
	if (chainId == null) return null;
	return WRITE_NETWORK_BY_CHAIN_ID[chainId] ?? null;
}

export function chainLogoUrl(chainId: number): string {
	return `${getEthereumDataURL()}/chainlogos/eip155-${chainId}.png`;
}

let _searchCache: ChainSearchResult[] | null = null;

/** Load (and cache) the searchable chain index. */
export async function loadChainIndex(): Promise<ChainSearchResult[]> {
	if (_searchCache) return _searchCache;
	const res = await fetch(`${getEthereumDataURL()}/index/fuse-chains.json`);
	if (!res.ok) return [];
	const json = await res.json();
	_searchCache = (json.data ?? []) as ChainSearchResult[];
	return _searchCache;
}

/** Search the chain index by name / symbol / chainId. */
export async function searchChains(query: string): Promise<ChainSearchResult[]> {
	const q = query.toLowerCase().trim();
	if (!q) return [];
	const chains = await loadChainIndex();
	const chainIdNum = parseInt(q, 10);
	const exact = !Number.isNaN(chainIdNum) ? chains.find((c) => c.chainId === chainIdNum) : null;

	const matches = chains.filter(
		(c) =>
			c.name.toLowerCase().includes(q) ||
			c.nativeCurrencySymbol.toLowerCase().includes(q) ||
			c.shortName.toLowerCase().includes(q) ||
			String(c.chainId).includes(q)
	);

	const results: ChainSearchResult[] = [];
	if (exact) results.push(exact);
	for (const m of matches) {
		if (!results.find((r) => r.chainId === m.chainId)) results.push(m);
		if (results.length >= 10) break;
	}
	return results;
}

/** Filter the RPC list from a chain record to safe, key-free https endpoints. */
export function extractRpcUrls(data: { rpc?: unknown }): string[] {
	if (!Array.isArray(data.rpc)) return [];
	return data.rpc.filter(
		(u: unknown) =>
			typeof u === 'string' &&
			u.startsWith('https://') &&
			!u.includes('${') &&
			!u.includes('API_KEY')
	) as string[];
}

/** Fetch full chain info for a chainId. Throws on failure. */
export async function loadChainInfo(chainId: number): Promise<ChainInfo> {
	const res = await fetch(`${getEthereumDataURL()}/chains/eip155-${chainId}.json`);
	if (!res.ok) throw new Error('Chain not found');
	const data = await res.json();
	const rpcUrls = extractRpcUrls(data);
	if (rpcUrls.length === 0) throw new Error('No public RPC endpoints available for this chain');
	return {
		chainId: data.chainId ?? chainId,
		name: data.name ?? `Chain ${chainId}`,
		nativeCurrency: {
			name: data.nativeCurrency?.name ?? 'Ether',
			symbol: data.nativeCurrency?.symbol ?? 'ETH',
			decimals: data.nativeCurrency?.decimals ?? 18
		},
		rpcUrls,
		explorerUrl: data.explorers?.[0]?.url ?? '',
		logoURL: chainLogoUrl(chainId),
		isTestnet: data.testnet === true
	};
}

/** Raw JSON-RPC call (for chainId probing + latency). */
export async function rpcCall(
	rpcUrl: string,
	method: string,
	params: unknown[],
	timeoutMs = 8000
): Promise<unknown> {
	const res = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
		signal: AbortSignal.timeout(timeoutMs)
	});
	const json = await res.json();
	if (json.error) throw new Error(json.error.message);
	return json.result;
}

/** Probe a list of RPCs in parallel; returns latency/status for each. */
export async function probeRpcs(
	urls: string[]
): Promise<{ url: string; latencyMs: number | null; status: 'ok' | 'error' }[]> {
	return Promise.all(
		urls.map(async (url) => {
			try {
				const start = performance.now();
				await rpcCall(url, 'eth_chainId', [], 5000);
				return { url, latencyMs: Math.round(performance.now() - start), status: 'ok' as const };
			} catch {
				return { url, latencyMs: null, status: 'error' as const };
			}
		})
	);
}
