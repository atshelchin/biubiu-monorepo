import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface ChainData {
	name: string;
	chain: string;
	shortName: string;
	chainId: number;
	networkId: number;
	icon?: string;
	rpc: string[];
	features?: Array<{ name: string }>;
	faucets: string[];
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
	infoURL: string;
	ens?: {
		registry: string;
	};
	explorers?: Array<{
		name: string;
		url: string;
		standard?: string;
		icon?: string;
	}>;
	slip44?: number;
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { chainID } = params;

	try {
		const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${chainID}.json`);

		if (!response.ok) {
			if (response.status === 404) {
				return {
					chain: null,
					chainId: chainID,
					error: 'not_found'
				};
			}
			throw new Error(`Failed to fetch chain data: ${response.status}`);
		}

		const chain: ChainData = await response.json();

		return {
			chain,
			chainId: chainID,
			error: null
		};
	} catch (err) {
		console.error('Error fetching chain data:', err);
		return {
			chain: null,
			chainId: chainID,
			error: 'fetch_error'
		};
	}
};
