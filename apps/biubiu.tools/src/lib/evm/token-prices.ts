/**
 * USD price lookup via the CoinGecko free API (no key required; CORS-enabled).
 *
 * A balance run produces at most a handful of distinct (network, token) pairs, so
 * pricing is one batched native call + one batched token call per platform —
 * cheap and well within the free tier. Anything not in the registry maps simply
 * has no price (the UI shows "—"), so missing prices never break the results.
 *
 * Set a CoinGecko Pro key on `window.__COINGECKO_KEY__` (or via PUBLIC_COINGECKO_KEY)
 * to lift rate limits — see the optional `apiKey` argument.
 */

const COINGECKO = 'https://api.coingecko.com/api/v3';

// Built-in network key → CoinGecko platform id (for ERC-20 contract pricing).
const PLATFORM: Record<string, string> = {
	ethereum: 'ethereum',
	polygon: 'polygon-pos',
	arbitrum: 'arbitrum-one',
	optimism: 'optimistic-ethereum',
	base: 'base',
};

// Built-in network key → CoinGecko coin id for the NATIVE coin.
const NATIVE_ID: Record<string, string> = {
	ethereum: 'ethereum',
	arbitrum: 'ethereum',
	optimism: 'ethereum',
	base: 'ethereum',
	polygon: 'polygon-ecosystem-token', // POL (matic-network is deprecated)
};

export interface PriceItem {
	network: string;
	kind: 'native' | 'erc20';
	address?: string;
}

/** Stable key for a price: `${network}:native` or `${network}:${addressLower}`. */
export function priceKey(network: string, kind: 'native' | 'erc20', address?: string): string {
	return kind === 'native' ? `${network}:native` : `${network}:${(address ?? '').toLowerCase()}`;
}

function withKey(url: string, apiKey?: string): string {
	return apiKey ? `${url}${url.includes('?') ? '&' : '?'}x_cg_demo_api_key=${apiKey}` : url;
}

/**
 * Resolve USD prices for the distinct items. Returns a map keyed by `priceKey`.
 * Never throws — on any failure the affected entries are simply absent.
 */
export async function fetchUsdPrices(
	items: PriceItem[],
	opts: { signal?: AbortSignal; apiKey?: string } = {},
): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	const { signal, apiKey } = opts;

	// Gather distinct native coin ids and ERC-20 contracts per platform.
	const nativeIds = new Set<string>();
	const tokensByPlatform = new Map<string, Set<string>>();
	for (const it of items) {
		if (it.kind === 'native') {
			const id = NATIVE_ID[it.network];
			if (id) nativeIds.add(id);
		} else if (it.address) {
			const platform = PLATFORM[it.network];
			if (!platform) continue;
			if (!tokensByPlatform.has(platform)) tokensByPlatform.set(platform, new Set());
			tokensByPlatform.get(platform)!.add(it.address.toLowerCase());
		}
	}

	// Native coins — one batched request.
	if (nativeIds.size > 0) {
		try {
			const url = withKey(
				`${COINGECKO}/simple/price?ids=${[...nativeIds].join(',')}&vs_currencies=usd`,
				apiKey,
			);
			const res = await fetch(url, { signal });
			if (res.ok) {
				const data = (await res.json()) as Record<string, { usd?: number }>;
				for (const it of items) {
					if (it.kind !== 'native') continue;
					const id = NATIVE_ID[it.network];
					const usd = id ? data[id]?.usd : undefined;
					if (typeof usd === 'number') out.set(priceKey(it.network, 'native'), usd);
				}
			}
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') throw e;
		}
	}

	// ERC-20 tokens — one batched request per platform.
	for (const [platform, addrs] of tokensByPlatform) {
		try {
			const url = withKey(
				`${COINGECKO}/simple/token_price/${platform}?contract_addresses=${[...addrs].join(',')}&vs_currencies=usd`,
				apiKey,
			);
			const res = await fetch(url, { signal });
			if (!res.ok) continue;
			const data = (await res.json()) as Record<string, { usd?: number }>;
			for (const it of items) {
				if (it.kind !== 'erc20' || !it.address || PLATFORM[it.network] !== platform) continue;
				const usd = data[it.address.toLowerCase()]?.usd;
				if (typeof usd === 'number') out.set(priceKey(it.network, 'erc20', it.address), usd);
			}
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') throw e;
		}
	}

	return out;
}
