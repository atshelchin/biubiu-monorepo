/**
 * Minimal viem Chain + client builders for a SweepNetwork. Kept tiny and
 * self-contained so the relayer / upgrade / balance layers all share one shape.
 */
import { createPublicClient, createWalletClient, http, fallback, type Chain, type PublicClient } from 'viem';
import type { Account } from 'viem';
import type { SweepNetwork } from '../types.js';

export function makeChain(network: SweepNetwork, rpcs: string[]): Chain {
	return {
		id: network.chainId,
		name: network.name,
		nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals },
		rpcUrls: { default: { http: rpcs } },
		// Required so viem's multicall() knows the aggregator address on this chain.
		contracts: { multicall3: { address: network.multicall3 } },
	};
}

/** Read client with failover across all `rpcs` (first = primary). */
export function makePublicClient(network: SweepNetwork, rpcs: string[]): PublicClient {
	return createPublicClient({
		chain: makeChain(network, rpcs),
		transport: fallback(rpcs.map((u) => http(u))),
	});
}

/** Wallet client (type-4 broadcast) with failover across `rpcs`. */
export function makeWalletClient(network: SweepNetwork, rpcs: string[], account: Account) {
	// Return type is inferred so the account stays concretely typed (viem's
	// sendTransaction then doesn't require `account` in every call's params).
	return createWalletClient({
		account,
		chain: makeChain(network, rpcs),
		transport: fallback(rpcs.map((u) => http(u))),
	});
}
