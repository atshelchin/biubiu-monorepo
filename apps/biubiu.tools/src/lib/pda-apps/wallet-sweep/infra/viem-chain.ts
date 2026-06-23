/**
 * Minimal viem Chain + client builders for a SweepNetwork. Kept tiny and
 * self-contained so the relayer / upgrade / balance layers all share one shape.
 */
import { createPublicClient, createWalletClient, http, type Chain, type PublicClient } from 'viem';
import type { Account } from 'viem';
import type { SweepNetwork } from '../types.js';

export function makeChain(network: SweepNetwork, rpcUrl: string): Chain {
	return {
		id: network.chainId,
		name: network.name,
		nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals },
		rpcUrls: { default: { http: [rpcUrl] } },
	};
}

export function makePublicClient(network: SweepNetwork, rpcUrl: string): PublicClient {
	return createPublicClient({ chain: makeChain(network, rpcUrl), transport: http(rpcUrl) });
}

export function makeWalletClient(network: SweepNetwork, rpcUrl: string, account: Account) {
	// Return type is inferred so the account stays concretely typed (viem's
	// sendTransaction then doesn't require `account` in every call's params).
	return createWalletClient({ account, chain: makeChain(network, rpcUrl), transport: http(rpcUrl) });
}
