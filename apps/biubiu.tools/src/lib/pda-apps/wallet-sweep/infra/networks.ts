/**
 * Wallet Sweep (v2) networks — any EIP-7702 chain works (no passkey/Safe/P256
 * requirement). Curated list of known 7702 chains + user-added custom networks.
 * The definitive 7702 check is the broadcast itself; the live probe only checks
 * reachability.
 */
import type { Address } from 'viem';
import { pickWorkingRpc } from './rpc.js';
import type { SweepNetwork, NetworkReadiness } from '../types.js';

export { pickWorkingRpc };

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;
const DEFAULT_BATCH = 50; // combined upgrade+sweep per tx — conservative vs block gas

function net(
	cfg: Omit<
		SweepNetwork,
		| 'decimals'
		| 'multiSendAddress'
		| 'multicall3'
		| 'maxBatchUpgrade'
		| 'maxBatchSweep'
		| 'supports7702'
		| 'writableRpcs'
	> &
		Partial<
			Pick<
				SweepNetwork,
				'decimals' | 'maxBatchUpgrade' | 'maxBatchSweep' | 'supports7702' | 'writableRpcs'
			>
		>,
): SweepNetwork {
	return {
		decimals: 18,
		// multiSendAddress kept in the type for compatibility; unused in v2.
		multiSendAddress: MULTICALL3,
		multicall3: MULTICALL3,
		maxBatchUpgrade: DEFAULT_BATCH,
		maxBatchSweep: DEFAULT_BATCH,
		supports7702: true,
		writableRpcs: cfg.rpcs,
		...cfg,
	};
}

export const NETWORKS: Record<string, SweepNetwork> = {
	'eth-mainnet': net({
		slug: 'eth-mainnet',
		name: 'Ethereum',
		chainId: 1,
		symbol: 'ETH',
		rpcs: ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth'],
		explorerTxUrl: 'https://etherscan.io/tx/',
		explorerAddressUrl: 'https://etherscan.io/address/',
		chainlinkNativeUsdFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
	}),
	'base-mainnet': net({
		slug: 'base-mainnet',
		name: 'Base',
		chainId: 8453,
		symbol: 'ETH',
		rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
		explorerTxUrl: 'https://basescan.org/tx/',
		explorerAddressUrl: 'https://basescan.org/address/',
		chainlinkNativeUsdFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
	}),
	'opt-mainnet': net({
		slug: 'opt-mainnet',
		name: 'Optimism',
		chainId: 10,
		symbol: 'ETH',
		rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
		explorerTxUrl: 'https://optimistic.etherscan.io/tx/',
		explorerAddressUrl: 'https://optimistic.etherscan.io/address/',
		chainlinkNativeUsdFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
	}),
	'arb-mainnet': net({
		slug: 'arb-mainnet',
		name: 'Arbitrum',
		chainId: 42161,
		symbol: 'ETH',
		rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
		explorerTxUrl: 'https://arbiscan.io/tx/',
		explorerAddressUrl: 'https://arbiscan.io/address/',
		chainlinkNativeUsdFeed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
	}),
	'matic-mainnet': net({
		slug: 'matic-mainnet',
		name: 'Polygon',
		chainId: 137,
		symbol: 'POL',
		rpcs: ['https://polygon-rpc.com', 'https://polygon-bor-rpc.publicnode.com'],
		explorerTxUrl: 'https://polygonscan.com/tx/',
		explorerAddressUrl: 'https://polygonscan.com/address/',
		chainlinkNativeUsdFeed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
	}),
	'bnb-mainnet': net({
		slug: 'bnb-mainnet',
		name: 'BNB Chain',
		chainId: 56,
		symbol: 'BNB',
		rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
		explorerTxUrl: 'https://bscscan.com/tx/',
		explorerAddressUrl: 'https://bscscan.com/address/',
		chainlinkNativeUsdFeed: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
	}),
	'gnosis-mainnet': net({
		slug: 'gnosis-mainnet',
		name: 'Gnosis',
		chainId: 100,
		symbol: 'xDAI',
		rpcs: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com'],
		explorerTxUrl: 'https://gnosisscan.io/tx/',
		explorerAddressUrl: 'https://gnosisscan.io/address/',
		chainlinkNativeUsdFeed: '0x678df341fc31947dA4324eC63212874be5a82f8',
	}),
	'base-sepolia': net({
		slug: 'base-sepolia',
		name: 'Base Sepolia (Testnet)',
		chainId: 84532,
		symbol: 'ETH',
		rpcs: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
		explorerTxUrl: 'https://sepolia.basescan.org/tx/',
		explorerAddressUrl: 'https://sepolia.basescan.org/address/',
		isTestnet: true,
	}),
	'sepolia': net({
		slug: 'sepolia',
		name: 'Ethereum Sepolia (Testnet)',
		chainId: 11155111,
		symbol: 'ETH',
		rpcs: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://rpc.sepolia.org'],
		explorerTxUrl: 'https://sepolia.etherscan.io/tx/',
		explorerAddressUrl: 'https://sepolia.etherscan.io/address/',
		isTestnet: true,
	}),
};

/** Build a SweepNetwork from user input (custom EIP-7702 chain). */
export function makeCustomNetwork(cfg: {
	name: string;
	chainId: number;
	symbol: string;
	rpcs: string[];
	explorerTxUrl?: string;
}): SweepNetwork {
	const slug = `custom-${cfg.chainId}`;
	const base = (cfg.explorerTxUrl ?? '').replace(/tx\/?$/, '');
	return net({
		slug,
		name: cfg.name,
		chainId: cfg.chainId,
		symbol: cfg.symbol || 'ETH',
		rpcs: cfg.rpcs.filter((r) => /^https?:\/\//.test(r)),
		explorerTxUrl: cfg.explorerTxUrl ?? '',
		explorerAddressUrl: base ? `${base}address/` : '',
		isCustom: true,
	});
}

export function getNetwork(slug: string): SweepNetwork | undefined {
	return NETWORKS[slug];
}

export function listNetworks(opts?: { includeTestnets?: boolean }): SweepNetwork[] {
	const all = Object.values(NETWORKS);
	return opts?.includeTestnets ? all : all.filter((n) => !n.isTestnet);
}

/** Live readiness — reachability only (7702 is curated; broadcast is definitive). */
export async function probeNetwork(network: SweepNetwork): Promise<NetworkReadiness> {
	try {
		const rpc = await pickWorkingRpc(network.rpcs, network.chainId);
		if (!rpc) return { slug: network.slug, reachable: false, ready: false, error: 'No reachable RPC' };
		return { slug: network.slug, reachable: true, ready: true };
	} catch (e) {
		return {
			slug: network.slug,
			reachable: false,
			ready: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/** Quick reachability + chainId verification for a custom RPC. */
export async function verifyCustomRpc(rpc: string, chainId: number): Promise<boolean> {
	return (await pickWorkingRpc([rpc], chainId)) !== null;
}
