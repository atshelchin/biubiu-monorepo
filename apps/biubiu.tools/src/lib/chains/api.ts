/**
 * Chain data access for the Chain Explorer.
 *
 * The full chain index (~2.6k entries) is fetched once and shared across every
 * caller via a module-level promise cache, so the list page and the search
 * widget no longer download it independently.
 */

import type { ChainListItem } from './types';

export const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

/** PNG logo for a chain, hosted alongside the chain data. */
export function getChainLogoUrl(chainId: number): string {
	return `${ETHEREUM_DATA_BASE_URL}/chainlogos/eip155-${chainId}.png`;
}

/** Neutral inline fallback used when a chain has no logo / the PNG 404s. */
export const DEFAULT_CHAIN_LOGO =
	'data:image/svg+xml,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#e9ecef"/><path d="M24 12l9 6v12l-9 6-9-6V18l9-6z" fill="none" stroke="#adb5bd" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="24" r="3.5" fill="#adb5bd"/></svg>`
	);

let chainsCache: Promise<ChainListItem[]> | null = null;

/**
 * Load the full chain index. Cached for the lifetime of the page so repeated
 * callers (list page, search) share a single network request. Pass a custom
 * `fetch` (e.g. SvelteKit's) when calling from a load function.
 */
export function loadAllChains(fetchFn: typeof fetch = fetch): Promise<ChainListItem[]> {
	if (chainsCache) return chainsCache;

	chainsCache = (async () => {
		try {
			const response = await fetchFn(`${ETHEREUM_DATA_BASE_URL}/index/fuse-chains.json`);
			const json = await response.json();
			return (json.data as ChainListItem[]) ?? [];
		} catch {
			// Allow a later caller to retry rather than caching a permanent failure.
			chainsCache = null;
			return [];
		}
	})();

	return chainsCache;
}
