/**
 * Token Sender 支持的网络注册表。
 *
 * slug 对齐钱包层 CHAIN_CONFIG（lib/auth/safe-tx/constants），因为发送最终调用
 * `sendContractCall({ network: slug })`。只列出 passkey Safe 钱包能运行的链
 * （已部署 Safe 1.4.1 全套 + MultiSend + P256 验证）。新增网络见 vela-wallet-chain-setup。
 */
import type { Address } from 'viem';
import { CONTRACTS } from '$lib/auth/safe-tx/constants';
import type { TokenSenderNetwork } from '../types.js';

const MULTISEND = CONTRACTS.multiSend as Address;
const DEFAULT_MAX_BATCH = 100;

/** 注册一条网络，套用默认 chunk = 100 */
function net(
	cfg: Omit<TokenSenderNetwork, 'multiSendAddress' | 'maxBatchNative' | 'maxBatchErc20' | 'decimals'> &
		Partial<Pick<TokenSenderNetwork, 'maxBatchNative' | 'maxBatchErc20' | 'decimals'>>,
): TokenSenderNetwork {
	return {
		decimals: 18,
		multiSendAddress: MULTISEND,
		maxBatchNative: DEFAULT_MAX_BATCH,
		maxBatchErc20: DEFAULT_MAX_BATCH,
		...cfg,
	};
}

export const NETWORKS: Record<string, TokenSenderNetwork> = {
	'eth-mainnet': net({
		slug: 'eth-mainnet',
		name: 'Ethereum',
		chainId: 1,
		symbol: 'ETH',
		rpcs: ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com'],
		explorerTxUrl: 'https://etherscan.io/tx/',
		chainlinkNativeUsdFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
	}),
	'arb-mainnet': net({
		slug: 'arb-mainnet',
		name: 'Arbitrum',
		chainId: 42161,
		symbol: 'ETH',
		rpcs: ['https://arbitrum.llamarpc.com', 'https://arbitrum-one-rpc.publicnode.com'],
		explorerTxUrl: 'https://arbiscan.io/tx/',
		chainlinkNativeUsdFeed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
	}),
	'base-mainnet': net({
		slug: 'base-mainnet',
		name: 'Base',
		chainId: 8453,
		symbol: 'ETH',
		rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
		explorerTxUrl: 'https://basescan.org/tx/',
		chainlinkNativeUsdFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
	}),
	'opt-mainnet': net({
		slug: 'opt-mainnet',
		name: 'Optimism',
		chainId: 10,
		symbol: 'ETH',
		rpcs: ['https://optimism.llamarpc.com', 'https://optimism-rpc.publicnode.com'],
		explorerTxUrl: 'https://optimistic.etherscan.io/tx/',
		chainlinkNativeUsdFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
	}),
	'matic-mainnet': net({
		slug: 'matic-mainnet',
		name: 'Polygon',
		chainId: 137,
		symbol: 'POL',
		rpcs: ['https://polygon.llamarpc.com', 'https://polygon-bor-rpc.publicnode.com'],
		explorerTxUrl: 'https://polygonscan.com/tx/',
		chainlinkNativeUsdFeed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
	}),
	'bnb-mainnet': net({
		slug: 'bnb-mainnet',
		name: 'BNB Chain',
		chainId: 56,
		symbol: 'BNB',
		rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
		explorerTxUrl: 'https://bscscan.com/tx/',
		chainlinkNativeUsdFeed: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
	}),
	'avax-mainnet': net({
		slug: 'avax-mainnet',
		name: 'Avalanche',
		chainId: 43114,
		symbol: 'AVAX',
		rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
		explorerTxUrl: 'https://snowtrace.io/tx/',
		chainlinkNativeUsdFeed: '0x0A77230d17318075983913bC2145DB16C7366156',
	}),
	'gnosis-mainnet': net({
		slug: 'gnosis-mainnet',
		name: 'Gnosis',
		chainId: 100,
		symbol: 'xDAI',
		rpcs: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com'],
		explorerTxUrl: 'https://gnosisscan.io/tx/',
		chainlinkNativeUsdFeed: '0x678df3415fc31947dA4324eC63212874be5a82f8',
	}),
	'polygon-amoy': net({
		slug: 'polygon-amoy',
		name: 'Polygon Amoy (Testnet)',
		chainId: 80002,
		symbol: 'POL',
		rpcs: ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy-bor-rpc.publicnode.com'],
		explorerTxUrl: 'https://amoy.polygonscan.com/tx/',
		isTestnet: true,
	}),
};

export function getNetwork(slug: string): TokenSenderNetwork | undefined {
	return NETWORKS[slug];
}

export function listNetworks(): TokenSenderNetwork[] {
	return Object.values(NETWORKS);
}
