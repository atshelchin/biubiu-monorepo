import type { PageServerLoad } from './$types';

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface AssetLink {
	name: string;
	url: string;
}

export interface AssetData {
	name: string;
	symbol: string;
	type: string;
	decimals: number;
	status: string;
	id: string;
	description?: string;
	website?: string;
	explorer?: string;
	tags?: string[];
	links?: AssetLink[];
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { chainId, address } = params;

	try {
		const response = await fetch(
			`${ETHEREUM_DATA_BASE_URL}/assets/eip155-${chainId}/${address}/info.json`
		);

		if (!response.ok) {
			if (response.status === 404) {
				return {
					asset: null,
					chainId,
					address,
					error: 'not_found'
				};
			}
			throw new Error(`Failed to fetch asset data: ${response.status}`);
		}

		const asset: AssetData = await response.json();

		// Logo URL (may not exist, handled in frontend)
		const logoUrl = `${ETHEREUM_DATA_BASE_URL}/assets/eip155-${chainId}/${address}/logo.png`;

		return {
			asset,
			chainId,
			address,
			logoUrl,
			error: null
		};
	} catch (err) {
		console.error('Error fetching asset data:', err);
		return {
			asset: null,
			chainId,
			address,
			error: 'fetch_error'
		};
	}
};
