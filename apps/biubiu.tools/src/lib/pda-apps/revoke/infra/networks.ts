/**
 * Networks the revoke tool scans. Derived 1:1 from the wallet's canonical
 * `CHAINS` table (12 built-ins) so it can never drift from what the wallet can
 * actually send on, plus user-added custom networks.
 *
 * `slug` = apiNetworkId (e.g. 'eth-mainnet'): matches chain visuals AND the
 * safe-tx CHAIN_CONFIG the wallet's `sendCalls` resolves by slug.
 */
import type { Address } from 'viem';
import { CHAINS } from '$lib/wallet/infra/chains.js';
import type { RevokeNetwork } from '../types.js';

/** Multicall3 — same deterministic address on every chain. */
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;

export const BUILTIN_NETWORKS: RevokeNetwork[] = CHAINS.map((c) => ({
	slug: c.apiNetworkId,
	chainId: c.chainId,
	name: c.name,
	symbol: c.nativeSymbol,
	rpcs: c.rpcUrls,
	explorerUrl: c.explorerURL,
	multicall3: MULTICALL3,
}));

const DEFAULT_SLUG = 'eth-mainnet';

/** Built-ins + custom, in display order. */
export function listNetworks(custom: RevokeNetwork[] = []): RevokeNetwork[] {
	return [...BUILTIN_NETWORKS, ...custom];
}

export function networkBySlug(slug: string, custom: RevokeNetwork[] = []): RevokeNetwork {
	const all = listNetworks(custom);
	return all.find((n) => n.slug === slug) ?? all.find((n) => n.slug === DEFAULT_SLUG) ?? all[0];
}

export function networkByChainId(chainId: number, custom: RevokeNetwork[] = []): RevokeNetwork | undefined {
	return listNetworks(custom).find((n) => n.chainId === chainId);
}

/** Stable key for a user-defined network. */
export function customNetworkKey(chainId: number): string {
	return `custom-${chainId}`;
}

export { DEFAULT_SLUG };
