import { describe, it, expect } from 'vitest';
import { mainnet } from 'viem/chains';
import {
	NETWORKS,
	CHAIN_MAP,
	PRESET_TOKENS,
	customNetworkKey,
	toViemChain,
	mergeNetworks,
	nativeToken,
} from './networks.js';
import type { NetworkConfig } from '../types.js';

const CUSTOM_BSC: NetworkConfig = {
	name: 'BNB Chain',
	chainId: 56,
	rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'],
	symbol: 'BNB',
	decimals: 18,
};

// ── customNetworkKey ─────────────────────────────────────────────────────────

describe('customNetworkKey', () => {
	it('formats a chainId as custom-<chainId>', () => {
		expect(customNetworkKey(56)).toBe('custom-56');
		expect(customNetworkKey(1)).toBe('custom-1');
	});
});

// ── nativeToken ──────────────────────────────────────────────────────────────

describe('nativeToken', () => {
	it('derives a native TokenSpec from a network config', () => {
		expect(nativeToken(NETWORKS.ethereum)).toEqual({
			kind: 'native',
			symbol: 'ETH',
			decimals: 18,
		});
		expect(nativeToken(CUSTOM_BSC)).toEqual({ kind: 'native', symbol: 'BNB', decimals: 18 });
	});
});

// ── toViemChain ──────────────────────────────────────────────────────────────

describe('toViemChain', () => {
	it('returns the predefined viem chain for a known chainId', () => {
		const chain = toViemChain(NETWORKS.ethereum);
		// Identity with the built-in mainnet chain (richer metadata, known Multicall3)
		expect(chain).toBe(mainnet);
		expect(chain.contracts?.multicall3).toBeDefined();
	});

	it('builds a chain from config for an unknown chainId', () => {
		const chain = toViemChain(CUSTOM_BSC);
		expect(chain.id).toBe(56);
		expect(chain.name).toBe('BNB Chain');
		expect(chain.nativeCurrency).toEqual({ name: 'BNB', symbol: 'BNB', decimals: 18 });
		expect(chain.rpcUrls.default.http).toEqual(CUSTOM_BSC.rpcs);
	});
});

// ── mergeNetworks ────────────────────────────────────────────────────────────

describe('mergeNetworks', () => {
	it('returns the built-in registry unchanged when no custom networks are given', () => {
		const { networks, chainMap } = mergeNetworks([]);
		expect(Object.keys(networks).sort()).toEqual(Object.keys(NETWORKS).sort());
		// chainMap keeps all built-in chains
		for (const id of Object.keys(CHAIN_MAP)) {
			expect(chainMap[Number(id)]).toBeDefined();
		}
	});

	it('defaults to built-ins when called with no argument', () => {
		const { networks } = mergeNetworks();
		expect(networks.ethereum).toBeDefined();
	});

	it('adds a custom network under custom-<chainId> with isCustom=true', () => {
		const { networks, chainMap } = mergeNetworks([CUSTOM_BSC]);
		const key = customNetworkKey(56);
		expect(networks[key]).toMatchObject({ name: 'BNB Chain', chainId: 56, isCustom: true });
		// built-ins still present
		expect(networks.ethereum).toBeDefined();
		// chainMap gains the custom chain
		expect(chainMap[56]?.id).toBe(56);
	});

	it('does not mutate the shared built-in NETWORKS/CHAIN_MAP objects', () => {
		const before = Object.keys(NETWORKS).length;
		mergeNetworks([CUSTOM_BSC]);
		expect(Object.keys(NETWORKS).length).toBe(before);
		expect(NETWORKS['custom-56']).toBeUndefined();
		expect(CHAIN_MAP[56]).toBeUndefined();
	});

	it('a custom network reusing a built-in chainId keeps the predefined chain', () => {
		const customEth: NetworkConfig = { ...CUSTOM_BSC, chainId: 1, name: 'My ETH', symbol: 'ETH' };
		const { networks, chainMap } = mergeNetworks([customEth]);
		// keyed separately from the built-in 'ethereum'
		expect(networks['custom-1']).toBeDefined();
		expect(networks.ethereum).toBeDefined();
		// chainId 1 still resolves to the predefined mainnet chain
		expect(chainMap[1]).toBe(mainnet);
	});
});

// ── PRESET_TOKENS integrity ──────────────────────────────────────────────────

describe('PRESET_TOKENS', () => {
	const addressRe = /^0x[a-fA-F0-9]{40}$/;

	it('only lists ERC20 tokens with valid contract addresses', () => {
		for (const [network, tokens] of Object.entries(PRESET_TOKENS)) {
			for (const t of tokens) {
				expect(t.kind, `${network}/${t.symbol}`).toBe('erc20');
				expect(t.address, `${network}/${t.symbol}`).toMatch(addressRe);
				expect(t.symbol.length, `${network}/${t.symbol}`).toBeGreaterThan(0);
			}
		}
	});

	it('uses correct decimals for stablecoins (USDC/USDT = 6, DAI/WETH = 18)', () => {
		for (const tokens of Object.values(PRESET_TOKENS)) {
			for (const t of tokens) {
				if (t.symbol === 'USDC' || t.symbol === 'USDT') expect(t.decimals).toBe(6);
				if (t.symbol === 'DAI' || t.symbol === 'WETH') expect(t.decimals).toBe(18);
			}
		}
	});

	it('has no duplicate token addresses within a network', () => {
		for (const [network, tokens] of Object.entries(PRESET_TOKENS)) {
			const addrs = tokens.map((t) => t.address!.toLowerCase());
			expect(new Set(addrs).size, network).toBe(addrs.length);
		}
	});

	it('only references built-in network keys', () => {
		for (const key of Object.keys(PRESET_TOKENS)) {
			expect(NETWORKS[key], key).toBeDefined();
		}
	});
});
