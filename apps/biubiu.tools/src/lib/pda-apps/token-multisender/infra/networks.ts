import { defineChain, type Address } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';
import type { MultisenderNetworkConfig } from '../types';

const endurance = defineChain({
    id: 648,
    name: 'Endurance',
    nativeCurrency: { name: 'ACE', symbol: 'ACE', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc-endurance.fusionist.io'] },
    },
    blockExplorers: {
        default: { name: 'Endurance Explorer', url: 'https://explorer-endurance.fusionist.io' },
    },
});

// Contract addresses are placeholders — fill after deployment
const PLACEHOLDER: Address = '0x0000000000000000000000000000000000000000';

export const NETWORKS: Record<string, MultisenderNetworkConfig> = {
    ethereum: {
        name: 'Ethereum',
        chainId: 1,
        rpcs: [
            'https://eth.llamarpc.com',
            'https://rpc.ankr.com/eth',
            'https://ethereum.publicnode.com',
        ],
        symbol: 'ETH',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://etherscan.io',
    },
    polygon: {
        name: 'Polygon',
        chainId: 137,
        rpcs: [
            'https://polygon.llamarpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon-bor.publicnode.com',
        ],
        symbol: 'MATIC',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://polygonscan.com',
    },
    arbitrum: {
        name: 'Arbitrum',
        chainId: 42161,
        rpcs: [
            'https://arbitrum.llamarpc.com',
            'https://rpc.ankr.com/arbitrum',
            'https://arbitrum-one.publicnode.com',
        ],
        symbol: 'ETH',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://arbiscan.io',
    },
    optimism: {
        name: 'Optimism',
        chainId: 10,
        rpcs: [
            'https://optimism.llamarpc.com',
            'https://rpc.ankr.com/optimism',
            'https://optimism.publicnode.com',
        ],
        symbol: 'ETH',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://optimistic.etherscan.io',
    },
    base: {
        name: 'Base',
        chainId: 8453,
        rpcs: [
            'https://mainnet.base.org',
            'https://base.llamarpc.com',
            'https://base.publicnode.com',
        ],
        symbol: 'ETH',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://basescan.org',
    },
    endurance: {
        name: 'Endurance',
        chainId: 648,
        rpcs: ['https://rpc-endurance.fusionist.io'],
        symbol: 'ACE',
        decimals: 18,
        ethDistributionAddress: PLACEHOLDER,
        erc20DistributionAddress: PLACEHOLDER,
        explorerUrl: 'https://explorer-endurance.fusionist.io',
    },
};

export const CHAIN_MAP = {
    1: mainnet,
    137: polygon,
    42161: arbitrum,
    10: optimism,
    8453: base,
    648: endurance,
} as const;
