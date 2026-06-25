/**
 * Canonical chain table for the passkey-Safe wallet — the single source of truth
 * for every built-in network, keyed by chainId.
 *
 * Ported 1:1 from vela-wallet `models/chains.ts` (12 networks incl. Tempo's
 * stablecoin gas model). biubiu reaches RPC/bundler DIRECTLY from the browser
 * (no server proxy), so every `rpcUrls` entry MUST be a CORS-open public endpoint
 * — verified live (`eth_chainId` + Access-Control-Allow-Origin) for all 12 chains.
 *
 * `apiNetworkId` is the legacy Alchemy-style slug used by the older slug-keyed
 * `CHAIN_CONFIG` (auth/safe-tx/constants.ts) and several UIs, kept here so the two
 * tables can never drift. To add a network, add ONE entry here.
 */

export interface ChainInfo {
	/** Stable string id used in code/UI (e.g. 'ethereum'). */
	id: string;
	/** Human-readable name (e.g. 'Ethereum'). */
	name: string;
	chainId: number;
	/** Legacy slug shared with CHAIN_CONFIG / APIToken.network (e.g. 'eth-mainnet'). */
	apiNetworkId: string;
	/** Native gas-token symbol as displayed (POL, xDAI, USD, …). */
	nativeSymbol: string;
	/** Short label rendered when the logo can't load. */
	iconLabel: string;
	iconColor: string;
	iconBg: string;
	isL2: boolean;
	/** CORS-open public RPC endpoints, in failover order (first = primary). */
	rpcUrls: string[];
	/** Block-explorer base URL (no trailing slash), e.g. 'https://etherscan.io'. */
	explorerURL: string;
	/**
	 * How gas is settled. 'native' = standard ERC-4337 (UserOp paid in native coin
	 * via EntryPoint). 'tempo' = no native coin, gas paid in a USD stablecoin — see
	 * wallet/infra/tempo.ts. Defaults to 'native'.
	 */
	gasModel: 'native' | 'tempo';
}

export const CHAINS: ChainInfo[] = [
	{
		id: 'ethereum', name: 'Ethereum', chainId: 1, apiNetworkId: 'eth-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'ETH', iconColor: '#627EEA', iconBg: '#EEF0F8', isL2: false,
		rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
		explorerURL: 'https://etherscan.io', gasModel: 'native'
	},
	{
		id: 'bnb', name: 'BNB Chain', chainId: 56, apiNetworkId: 'bnb-mainnet',
		nativeSymbol: 'BNB', iconLabel: 'BNB', iconColor: '#F0B90B', iconBg: '#FFF8E1', isL2: false,
		rpcUrls: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
		explorerURL: 'https://bscscan.com', gasModel: 'native'
	},
	{
		id: 'polygon', name: 'Polygon', chainId: 137, apiNetworkId: 'matic-mainnet',
		nativeSymbol: 'POL', iconLabel: 'POL', iconColor: '#8247E5', iconBg: '#F0EAFF', isL2: true,
		rpcUrls: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com'],
		explorerURL: 'https://polygonscan.com', gasModel: 'native'
	},
	{
		id: 'arbitrum', name: 'Arbitrum', chainId: 42161, apiNetworkId: 'arb-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'ARB', iconColor: '#28A0F0', iconBg: '#E8F4FD', isL2: true,
		rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
		explorerURL: 'https://arbiscan.io', gasModel: 'native'
	},
	{
		id: 'optimism', name: 'Optimism', chainId: 10, apiNetworkId: 'opt-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'OP', iconColor: '#FF0420', iconBg: '#FFECEC', isL2: true,
		rpcUrls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
		explorerURL: 'https://optimistic.etherscan.io', gasModel: 'native'
	},
	{
		id: 'base', name: 'Base', chainId: 8453, apiNetworkId: 'base-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'BASE', iconColor: '#0052FF', iconBg: '#E8EEFF', isL2: true,
		rpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
		explorerURL: 'https://basescan.org', gasModel: 'native'
	},
	{
		id: 'avalanche', name: 'Avalanche', chainId: 43114, apiNetworkId: 'avax-mainnet',
		nativeSymbol: 'AVAX', iconLabel: 'AVAX', iconColor: '#E84142', iconBg: '#FFF0F0', isL2: false,
		rpcUrls: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
		explorerURL: 'https://snowtrace.io', gasModel: 'native'
	},
	{
		id: 'gnosis', name: 'Gnosis', chainId: 100, apiNetworkId: 'gnosis-mainnet',
		nativeSymbol: 'xDAI', iconLabel: 'xDAI', iconColor: '#04795B', iconBg: '#E8F5F0', isL2: false,
		rpcUrls: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com'],
		explorerURL: 'https://gnosisscan.io', gasModel: 'native'
	},
	{
		id: 'unichain', name: 'Unichain', chainId: 130, apiNetworkId: 'unichain-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'UNI', iconColor: '#F50DB4', iconBg: '#FDE8F6', isL2: true,
		rpcUrls: ['https://mainnet.unichain.org', 'https://unichain-rpc.publicnode.com'],
		explorerURL: 'https://uniscan.xyz', gasModel: 'native'
	},
	{
		// Tempo has NO native gas coin: gas is paid in USD stablecoins (TIP-20).
		// gasModel 'tempo' routes sends through wallet/infra/tempo.ts (maxFee=0 UserOp +
		// bundler 0x76 + batched stablecoin reimbursement).
		id: 'tempo', name: 'Tempo', chainId: 4217, apiNetworkId: 'tempo-mainnet',
		nativeSymbol: 'USD', iconLabel: 'USD', iconColor: '#0B0B0B', iconBg: '#ECECEC', isL2: false,
		rpcUrls: ['https://rpc.mainnet.tempo.xyz'],
		explorerURL: 'https://explore.tempo.xyz', gasModel: 'tempo'
	},
	{
		id: 'monad', name: 'Monad', chainId: 143, apiNetworkId: 'monad-mainnet',
		nativeSymbol: 'MON', iconLabel: 'MON', iconColor: '#836EF9', iconBg: '#EFEBFF', isL2: false,
		rpcUrls: ['https://rpc.monad.xyz'],
		explorerURL: 'https://monadscan.com', gasModel: 'native'
	},
	{
		id: 'worldchain', name: 'World Chain', chainId: 480, apiNetworkId: 'worldchain-mainnet',
		nativeSymbol: 'ETH', iconLabel: 'WLD', iconColor: '#000000', iconBg: '#ECECEC', isL2: true,
		rpcUrls: ['https://worldchain.drpc.org', 'https://worldchain-mainnet.gateway.tenderly.co'],
		explorerURL: 'https://worldscan.org', gasModel: 'native'
	}
];

/** Tempo mainnet (4217) + Moderato testnet (42431) — kept in sync with infra/tempo.ts. */
const TEMPO_CHAIN_IDS = new Set<number>([4217, 42431]);

const BY_ID = new Map<number, ChainInfo>(CHAINS.map((c) => [c.chainId, c]));
const BY_SLUG = new Map<string, ChainInfo>(CHAINS.map((c) => [c.apiNetworkId, c]));

/** Look up canonical metadata for a chainId; undefined if not built in. */
export function chainInfo(chainId: number): ChainInfo | undefined {
	return BY_ID.get(chainId);
}

/** Look up canonical metadata by legacy slug (apiNetworkId, e.g. 'base-mainnet'). */
export function chainInfoBySlug(slug: string): ChainInfo | undefined {
	return BY_SLUG.get(slug);
}

/** chainId -> legacy slug (apiNetworkId), or undefined if not built in. */
export function slugForChainId(chainId: number): string | undefined {
	return BY_ID.get(chainId)?.apiNetworkId;
}

/** True for any Tempo chain (stablecoin gas model). */
export function isTempoChain(chainId: number): boolean {
	return TEMPO_CHAIN_IDS.has(chainId) || BY_ID.get(chainId)?.gasModel === 'tempo';
}

/** Explorer transaction URL prefix for a chain (… + txHash). Empty string if unknown. */
export function explorerTxUrl(chainId: number): string {
	const info = BY_ID.get(chainId);
	return info ? `${info.explorerURL}/tx/` : '';
}
