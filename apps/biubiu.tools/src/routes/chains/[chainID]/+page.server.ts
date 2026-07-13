import type { PageServerLoad } from './$types';
import {
	ETHEREUM_DATA_BASE_URL,
	getChainLogoUrl,
	loadAllChains,
	searchChains
} from '$lib/chains';
import type { ChainData } from '$lib/chains';

export type { ChainData };

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { chainID } = params;
	let resolvedChainId = chainID;
	let searchQuery: string | undefined;

	// Resolve friendly name URLs on the server so the first matching chain's
	// complete detail page is present in the initial SSR response.
	if (!/^\d+$/.test(chainID)) {
		searchQuery = chainID;
		const chains = await loadAllChains(fetch);
		const firstMatch = searchChains(chains, chainID, 1)[0];
		if (!firstMatch) {
			return { chain: null, chainId: chainID, searchQuery, error: 'search' };
		}
		resolvedChainId = firstMatch.chainId.toString();
	}

	try {
		const response = await fetch(
			`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${resolvedChainId}.json`
		);

		if (!response.ok) {
			if (response.status === 404) {
				return { chain: null, chainId: chainID, error: 'not_found' };
			}
			throw new Error(`Failed to fetch chain data: ${response.status}`);
		}

		const chain: ChainData = await response.json();

		return {
			chain,
			chainId: resolvedChainId,
			searchQuery,
			logoUrl: getChainLogoUrl(chain.chainId),
			error: null
		};
	} catch (err) {
		console.error('Error fetching chain data:', err);
		return { chain: null, chainId: chainID, error: 'fetch_error' };
	}
};
