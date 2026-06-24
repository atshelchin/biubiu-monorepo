/**
 * viem public client for a RevokeNetwork — failover transport across the shared
 * RPC pool (user override > provider key > built-in public), with Multicall3 set
 * so `client.multicall()` works on every chain.
 */
import { createPublicClient, http, fallback, defineChain, type PublicClient } from 'viem';
import { resolveRpcUrls } from '$lib/wallet/infra/rpc-client.js';
import type { RevokeNetwork } from '../types.js';

/** Ordered RPC list honoring the user's service-node settings, then network defaults. */
export function rpcsFor(network: RevokeNetwork): string[] {
	const urls = resolveRpcUrls(network.chainId, network.rpcs);
	return urls.length > 0 ? urls : network.rpcs;
}

export function makeClient(network: RevokeNetwork): PublicClient {
	const rpcs = rpcsFor(network);
	const chain = defineChain({
		id: network.chainId,
		name: network.name,
		nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
		rpcUrls: { default: { http: rpcs } },
		contracts: { multicall3: { address: network.multicall3 } },
	});
	return createPublicClient({ chain, transport: fallback(rpcs.map((u) => http(u))) });
}
