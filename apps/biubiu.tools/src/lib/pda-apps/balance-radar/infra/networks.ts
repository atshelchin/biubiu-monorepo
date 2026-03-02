import { defineChain } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';
import type { NetworkConfig } from '../types';

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
    contracts: {
        multicall3: {
            address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        },
    },
});

export const NETWORKS: Record<string, NetworkConfig> = {
    ethereum: {
        name: 'Ethereum',
        chainId: 1,
        rpcs: [
            'https://ethereum-rpc.publicnode.com',
            'https://1rpc.io/eth',
            'https://eth.drpc.org',
        ],
        symbol: 'ETH',
        decimals: 18,
    },
    polygon: {
        name: 'Polygon',
        chainId: 137,
        rpcs: [
            'https://polygon-bor-rpc.publicnode.com',
            'https://1rpc.io/matic',
            'https://polygon.drpc.org',
        ],
        symbol: 'MATIC',
        decimals: 18,
    },
    arbitrum: {
        name: 'Arbitrum',
        chainId: 42161,
        rpcs: [
            'https://arbitrum-one-rpc.publicnode.com',
            'https://1rpc.io/arb',
            'https://arbitrum.drpc.org',
        ],
        symbol: 'ETH',
        decimals: 18,
    },
    optimism: {
        name: 'Optimism',
        chainId: 10,
        rpcs: [
            'https://optimism-rpc.publicnode.com',
            'https://1rpc.io/op',
            'https://optimism.drpc.org',
        ],
        symbol: 'ETH',
        decimals: 18,
    },
    base: {
        name: 'Base',
        chainId: 8453,
        rpcs: [
            'https://base-rpc.publicnode.com',
            'https://1rpc.io/base',
            'https://base.drpc.org',
        ],
        symbol: 'ETH',
        decimals: 18,
    },
    endurance: {
        name: 'Endurance',
        chainId: 648,
        rpcs: ['https://rpc-endurance.fusionist.io'],
        symbol: 'ACE',
        decimals: 18,
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
