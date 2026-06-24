/**
 * Shared chain types for the Chain Explorer.
 *
 * `ChainListItem` is the lightweight shape served by the fuse-chains index
 * (used by the list page + search). `ChainData` is the full per-chain record
 * served by `chains/eip155-<id>.json` (used by the detail page).
 */

export interface ChainListItem {
	chainId: number;
	name: string;
	shortName: string;
	nativeCurrencySymbol: string;
	hasLogo?: boolean;
}

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
	stables?: Array<{
		symbol: string;
		type: string;
		contract: string;
	}>;
	wrappedNativeToken?: string;
	dex?: {
		dex: string;
		protocol: string;
		contracts: Record<string, string>;
		url?: string;
	};
}

/** Result of probing a single RPC endpoint. */
export type RpcStatus = 'pending' | 'success' | 'error';

export interface RpcProbe {
	latency: number | null;
	status: RpcStatus;
}
