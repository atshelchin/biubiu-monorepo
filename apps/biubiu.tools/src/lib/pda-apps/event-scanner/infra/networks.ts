/**
 * Network registry for the scanner. Unlike balance-radar (a curated list), the
 * event scanner works on ANY chain the user searches for (vela-style), so the
 * "registry" is built at runtime from the single selected chain + chosen RPCs.
 */
import { defineChain, type Chain } from 'viem';
import type { ScanNetwork } from '../types.js';

/** Stable registry key for a chain. */
export function networkKey(chainId: number): string {
	return `chain-${chainId}`;
}

/** Build a viem Chain from a ScanNetwork (no curated metadata needed). */
export function toViemChain(net: ScanNetwork): Chain {
	return defineChain({
		id: net.chainId,
		name: net.name,
		nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: net.decimals },
		rpcUrls: { default: { http: net.rpcs } },
		blockExplorers: net.explorerUrl
			? { default: { name: 'Explorer', url: net.explorerUrl } }
			: undefined,
	});
}

/** Build the single-entry registry + chainMap the EVM pool expects. */
export function buildRegistry(net: ScanNetwork): {
	key: string;
	networks: Record<string, { chainId: number; rpcs: string[] }>;
	chainMap: Record<number, Chain>;
} {
	const key = net.key || networkKey(net.chainId);
	return {
		key,
		networks: { [key]: { chainId: net.chainId, rpcs: net.rpcs } },
		chainMap: { [net.chainId]: toViemChain(net) },
	};
}
