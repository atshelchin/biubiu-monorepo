import type { PageServerLoad } from './$types';

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface ContractSourceCode {
	url: string;
	commitId: string;
	compilerVersion: string;
	optimization: {
		enabled: boolean;
		runs: number;
	};
	evmVersion: string;
}

export interface ContractProxy {
	isProxy: boolean;
	proxyType: string;
	implementation: string;
}

export interface ContractData {
	id: string;
	chainId: number;
	name: string;
	address: string;
	explorer: string;
	sourceCode: ContractSourceCode;
	proxy: ContractProxy;
}

export interface ContractPayload {
	abi: unknown[];
	bytecode: string;
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { chainId, address } = params;

	try {
		// Fetch contract info
		const infoResponse = await fetch(
			`${ETHEREUM_DATA_BASE_URL}/contracts/eip155-${chainId}/${address}/info.json`
		);

		if (!infoResponse.ok) {
			if (infoResponse.status === 404) {
				return {
					contract: null,
					payload: null,
					chainId: Number(chainId),
					address,
					error: 'not_found'
				};
			}
			throw new Error(`Failed to fetch contract data: ${infoResponse.status}`);
		}

		const contract: ContractData = await infoResponse.json();

		// Fetch contract payload (ABI)
		let payload: ContractPayload | null = null;
		try {
			const payloadResponse = await fetch(
				`${ETHEREUM_DATA_BASE_URL}/contracts/eip155-${chainId}/${address}/payload.json`
			);
			if (payloadResponse.ok) {
				payload = await payloadResponse.json();
			}
		} catch {
			// Payload is optional
		}

		return {
			contract,
			payload,
			chainId: Number(chainId),
			address,
			error: null
		};
	} catch (err) {
		console.error('Error fetching contract data:', err);
		return {
			contract: null,
			payload: null,
			chainId: Number(chainId),
			address,
			error: 'fetch_error'
		};
	}
};
