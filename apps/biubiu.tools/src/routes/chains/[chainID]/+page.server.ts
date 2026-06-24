import type { PageServerLoad } from './$types';
import { ETHEREUM_DATA_BASE_URL, getChainLogoUrl } from '$lib/chains';
import type { ChainData } from '$lib/chains';

export type { ChainData };

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { chainID } = params;

	try {
		const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${chainID}.json`);

		if (!response.ok) {
			if (response.status === 404) {
				return { chain: null, chainId: chainID, error: 'not_found' };
			}
			throw new Error(`Failed to fetch chain data: ${response.status}`);
		}

		const chain: ChainData = await response.json();

		return {
			chain,
			chainId: chainID,
			logoUrl: getChainLogoUrl(chain.chainId),
			error: null
		};
	} catch (err) {
		console.error('Error fetching chain data:', err);
		return { chain: null, chainId: chainID, error: 'fetch_error' };
	}
};
