import { defineChain, type Chain } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';
import type { NetworkConfig, TokenSpec } from '../types';

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

export const CHAIN_MAP: Record<number, Chain> = {
    1: mainnet,
    137: polygon,
    42161: arbitrum,
    10: optimism,
    8453: base,
    648: endurance,
};

/** Stable key for a user-defined network. */
export function customNetworkKey(chainId: number): string {
    return `custom-${chainId}`;
}

/**
 * Resolve a viem Chain for a network config: prefer the predefined chain
 * (richer metadata, known Multicall3), else build one from the config so
 * custom networks work without a hardcoded viem chain.
 */
export function toViemChain(config: NetworkConfig): Chain {
    const known = CHAIN_MAP[config.chainId];
    if (known) return known;
    return defineChain({
        id: config.chainId,
        name: config.name,
        nativeCurrency: { name: config.symbol, symbol: config.symbol, decimals: config.decimals },
        rpcUrls: { default: { http: config.rpcs } },
    });
}

/**
 * Merge built-in networks with user-defined custom networks into a single
 * registry + chainMap. Custom networks are keyed `custom-<chainId>`.
 */
export function mergeNetworks(custom: NetworkConfig[] = []): {
    networks: Record<string, NetworkConfig>;
    chainMap: Record<number, Chain>;
} {
    const networks: Record<string, NetworkConfig> = { ...NETWORKS };
    const chainMap: Record<number, Chain> = { ...CHAIN_MAP };

    for (const cfg of custom) {
        const key = customNetworkKey(cfg.chainId);
        const entry: NetworkConfig = { ...cfg, isCustom: true };
        networks[key] = entry;
        chainMap[cfg.chainId] = toViemChain(entry);
    }

    return { networks, chainMap };
}

/**
 * Curated ERC20 tokens per built-in network key. Addresses are checksummed
 * mainnet contracts; USDC/USDT use 6 decimals, DAI/WETH use 18.
 */
export const PRESET_TOKENS: Record<string, TokenSpec[]> = {
    ethereum: [
        { kind: 'erc20', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
        { kind: 'erc20', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
        { kind: 'erc20', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
        { kind: 'erc20', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
    ],
    polygon: [
        { kind: 'erc20', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
        { kind: 'erc20', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
        { kind: 'erc20', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', symbol: 'DAI', decimals: 18 },
        { kind: 'erc20', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18 },
    ],
    arbitrum: [
        { kind: 'erc20', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
        { kind: 'erc20', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
        { kind: 'erc20', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18 },
        { kind: 'erc20', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
    ],
    optimism: [
        { kind: 'erc20', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
        { kind: 'erc20', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
        { kind: 'erc20', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18 },
        { kind: 'erc20', address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
    ],
    base: [
        { kind: 'erc20', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
        { kind: 'erc20', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18 },
        { kind: 'erc20', address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
    ],
};

/** Native token spec for a network config. */
export function nativeToken(config: NetworkConfig): TokenSpec {
    return { kind: 'native', symbol: config.symbol, decimals: config.decimals };
}
