/**
 * Third-party RPC providers — Alchemy, dRPC, Ankr.
 *
 * Ported from vela-wallet `services/rpc-providers.ts`. Each provider works with a
 * SINGLE global API key that unlocks every network it serves. The user stores one
 * key per provider (wallet/infra/endpoints.ts); we build the per-chain RPC URL on
 * demand from a static slug map. A user key produces an endpoint the RPC pool
 * ranks ABOVE the keyless public defaults.
 *
 * Slugs verified live (`eth_chainId`) across all 12 chains: Alchemy and dRPC serve
 * all 12; Ankr serves 8 (no Unichain / World Chain / Monad / Tempo). A wrong/missing
 * slug degrades to "unavailable", never to silently serving the wrong chain.
 */

export type ProviderId = 'alchemy' | 'drpc' | 'ankr';

/** One stored API key per provider. */
export type RpcProviderKeys = Partial<Record<ProviderId, string>>;

/**
 * Cold-start preference order within the provider tier (ties only — fastest wins
 * once latency data exists). Alchemy best reliability; dRPC multi-provider failover;
 * Ankr broad coverage.
 */
export const PROVIDER_ORDER: ProviderId[] = ['alchemy', 'drpc', 'ankr'];

/** UI metadata for each provider. */
export interface ProviderMeta {
	id: ProviderId;
	label: string;
	/** Placeholder shown in the key input. */
	keyPlaceholder: string;
	/** Dashboard URL where the user creates/copies a key. */
	keyUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
	alchemy: { id: 'alchemy', label: 'Alchemy', keyPlaceholder: 'API key', keyUrl: 'https://dashboard.alchemy.com/apikeys' },
	drpc: { id: 'drpc', label: 'dRPC', keyPlaceholder: 'dkey', keyUrl: 'https://drpc.org/dashboard' },
	ankr: { id: 'ankr', label: 'Ankr', keyPlaceholder: 'API key', keyUrl: 'https://www.ankr.com/rpc/projects/' }
};

/** chainId -> provider network slug. Absent = we don't build a URL for that pair. */
const PROVIDER_CHAIN_SLUGS: Record<ProviderId, Record<number, string>> = {
	// https://{slug}.g.alchemy.com/v2/{key} — serves all 12 chains.
	alchemy: {
		1: 'eth-mainnet', 56: 'bnb-mainnet', 137: 'polygon-mainnet', 42161: 'arb-mainnet',
		10: 'opt-mainnet', 8453: 'base-mainnet', 43114: 'avax-mainnet', 100: 'gnosis-mainnet',
		130: 'unichain-mainnet', 4217: 'tempo-mainnet', 143: 'monad-mainnet', 480: 'worldchain-mainnet'
	},
	// https://lb.drpc.org/ogrpc?network={slug}&dkey={key} — serves all 12 chains.
	drpc: {
		1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 8453: 'base',
		43114: 'avalanche', 100: 'gnosis', 130: 'unichain', 4217: 'tempo', 143: 'monad', 480: 'worldchain'
	},
	// https://rpc.ankr.com/{slug}/{key} — no Unichain / World Chain / Monad / Tempo.
	ankr: {
		1: 'eth', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 8453: 'base',
		43114: 'avalanche', 100: 'gnosis'
	}
};

/** Build the RPC URL for a provider/chain/key, or undefined if unsupported. */
export function buildProviderRpcUrl(id: ProviderId, chainId: number, key: string): string | undefined {
	const slug = PROVIDER_CHAIN_SLUGS[id]?.[chainId];
	if (!slug || !key) return undefined;
	switch (id) {
		case 'alchemy':
			return `https://${slug}.g.alchemy.com/v2/${key}`;
		case 'drpc':
			return `https://lb.drpc.org/ogrpc?network=${slug}&dkey=${key}`;
		case 'ankr':
			return `https://rpc.ankr.com/${slug}/${key}`;
	}
}
