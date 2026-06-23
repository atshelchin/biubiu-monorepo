/**
 * Forever networks.
 *
 * Writing a note goes through the passkey-Safe ERC-4337 path (`sendContractCall`), which only
 * works on chains that have: a bundler, the Safe 1.4.1 + 4337 module + WebAuthn shared signer,
 * and the RIP-7212 P-256 precompile. That intersection is exactly the `CHAIN_CONFIG` set used by
 * the wallet, so we derive the write list from it (single source of truth — keep in sync there).
 */
import { CHAIN_CONFIG } from '$lib/auth/safe-tx/constants.js';

export interface ForeverNetwork {
	/** safe-tx network slug, e.g. 'base-mainnet' (passed to sendContractCall). */
	slug: string;
	chainId: number;
	name: string;
	nativeSymbol: string;
	explorerUrl: string;
	isTestnet?: boolean;
}

/** Friendly display names + ordering (Base first: cheapest UX, public-beta default). */
const META: Record<string, { name: string; order: number; isTestnet?: boolean }> = {
	'base-mainnet': { name: 'Base', order: 0 },
	'arb-mainnet': { name: 'Arbitrum', order: 1 },
	'opt-mainnet': { name: 'Optimism', order: 2 },
	'matic-mainnet': { name: 'Polygon', order: 3 },
	'bnb-mainnet': { name: 'BNB Chain', order: 4 },
	'avax-mainnet': { name: 'Avalanche', order: 5 },
	'gnosis-mainnet': { name: 'Gnosis', order: 6 },
	'eth-mainnet': { name: 'Ethereum', order: 7 },
	'polygon-amoy': { name: 'Polygon Amoy (testnet)', order: 8, isTestnet: true }
};

export const WRITE_NETWORKS: ForeverNetwork[] = Object.entries(CHAIN_CONFIG)
	.map(([slug, cfg]) => ({
		slug,
		chainId: Number(cfg.chainId),
		name: META[slug]?.name ?? slug,
		nativeSymbol: cfg.nativeSymbol,
		explorerUrl: cfg.explorerUrl,
		isTestnet: META[slug]?.isTestnet
	}))
	.sort((a, b) => (META[a.slug]?.order ?? 99) - (META[b.slug]?.order ?? 99));

export function networkBySlug(slug: string): ForeverNetwork | undefined {
	return WRITE_NETWORKS.find((n) => n.slug === slug);
}
