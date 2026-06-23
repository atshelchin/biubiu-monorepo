/**
 * Wallet Sweep network whitelist.
 *
 * Only chains that (a) support EIP-7702 (post-Pectra) AND (b) pass the vela
 * rules — RIP-7212 P256 precompile + the Safe 1.4.1 stack — so the user's
 * passkey Safe can act as the Sweeper's controller. Slugs match CHAIN_CONFIG
 * (lib/auth/safe-tx/constants) so Phase-B sweeps go through sendContractCall.
 *
 * Ethereum mainnet is intentionally excluded: it has 7702 but no RIP-7212 P256
 * precompile, so the passkey wallet cannot operate there.
 *
 * `supports7702` is curated; the definitive check is the upgrade broadcast
 * itself (an RPC that rejects type-4 surfaces an error). probeNetwork() verifies
 * the live, checkable signals: reachability, P256, and Safe-stack presence.
 */
import type { Address } from 'viem';
import { CONTRACTS } from '$lib/auth/safe-tx/constants';
import { rpcCall, hasCode, checkP256Precompile } from '$lib/vela-chain-setup/contracts';
import type { SweepNetwork, NetworkReadiness } from '../types.js';

const MULTISEND = CONTRACTS.multiSend as Address;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;
const DEFAULT_BATCH = 100;

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
				| 'decimals'
				| 'maxBatchUpgrade'
				| 'maxBatchSweep'
				| 'supports7702'
				| 'writableRpcs'
			>
		>,
): SweepNetwork {
	return {
		decimals: 18,
		multiSendAddress: MULTISEND,
		multicall3: MULTICALL3,
		maxBatchUpgrade: DEFAULT_BATCH,
		maxBatchSweep: DEFAULT_BATCH,
		supports7702: true,
		writableRpcs: cfg.rpcs,
		...cfg,
	};
}

export const NETWORKS: Record<string, SweepNetwork> = {
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
	'polygon-amoy': net({
		slug: 'polygon-amoy',
		name: 'Polygon Amoy (Testnet)',
		chainId: 80002,
		symbol: 'POL',
		rpcs: ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy-bor-rpc.publicnode.com'],
		explorerTxUrl: 'https://amoy.polygonscan.com/tx/',
		explorerAddressUrl: 'https://amoy.polygonscan.com/address/',
		isTestnet: true,
	}),
};

export function getNetwork(slug: string): SweepNetwork | undefined {
	return NETWORKS[slug];
}

export function listNetworks(opts?: { includeTestnets?: boolean }): SweepNetwork[] {
	const all = Object.values(NETWORKS);
	return opts?.includeTestnets ? all : all.filter((n) => !n.isTestnet);
}

/** First RPC in `urls` that answers eth_chainId with the expected id. */
export async function pickWorkingRpc(urls: string[], chainId: number): Promise<string | null> {
	for (const url of urls) {
		try {
			const id = (await rpcCall(url, 'eth_chainId', [])) as string;
			if (BigInt(id) === BigInt(chainId)) return url;
		} catch {
			// try next
		}
	}
	return null;
}

/**
 * Probe a network's live readiness: reachable + P256 precompile + Safe stack.
 * (7702 itself is curated; its definitive check is the upgrade broadcast.)
 */
export async function probeNetwork(network: SweepNetwork): Promise<NetworkReadiness> {
	const base: NetworkReadiness = {
		slug: network.slug,
		reachable: false,
		p256: false,
		safeStack: false,
		ready: false,
	};
	try {
		const rpc = await pickWorkingRpc(network.rpcs, network.chainId);
		if (!rpc) return { ...base, error: 'No reachable RPC' };
		base.reachable = true;

		const [p256, safeStack] = await Promise.all([
			checkP256Precompile(rpc),
			hasCode(rpc, network.multiSendAddress),
		]);
		base.p256 = p256;
		base.safeStack = safeStack;
		base.ready = network.supports7702 && p256 && safeStack;
		if (!base.ready) {
			base.error = !p256 ? 'No P256 precompile' : !safeStack ? 'Safe stack missing' : 'Not 7702-ready';
		}
		return base;
	} catch (e) {
		return { ...base, error: e instanceof Error ? e.message : String(e) };
	}
}
