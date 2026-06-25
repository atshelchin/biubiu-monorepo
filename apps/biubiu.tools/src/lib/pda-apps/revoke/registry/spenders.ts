/**
 * Built-in known spenders (approval recipients). Used by the fast scan to probe
 * `allowance` / `isApprovedForAll` against the things people most commonly grant.
 *
 * IMPORTANT: an extra spender is *harmless* — we only ever surface an approval
 * whose allowance is > 0 (or operator = true), and a Multicall to an address with
 * no code on a given chain fails and is treated as 0. So spenders deployed at the
 * same CREATE2 address across chains (Permit2, Seaport, 0x, 1inch…) are listed
 * once in CROSS_CHAIN and applied everywhere; chain-specific DEXes go in PER_CHAIN.
 */
import { getAddress, type Address } from 'viem';
import type { SpenderEntry } from '../types.js';
import { PERMIT2_ADDRESS } from '../infra/abis.js';
import { dedupeBy } from '../infra/dedupe.js';

function sp(address: string, label: string, kind: SpenderEntry['kind']): SpenderEntry {
	return { address: getAddress(address), label, kind };
}

/**
 * Spenders deployed at the SAME address on every major EVM chain (CREATE2 /
 * deterministic deploys). Safe to probe on all chains.
 */
export const CROSS_CHAIN_SPENDERS: SpenderEntry[] = [
	sp(PERMIT2_ADDRESS, 'Uniswap Permit2', 'permit2'),
	// OpenSea
	sp('0x0000000000000068F116a894984e2DB1123eB395', 'OpenSea (Seaport 1.6)', 'marketplace'),
	sp('0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC', 'OpenSea (Seaport 1.5)', 'marketplace'),
	sp('0x1E0049783F008A0085193E00003D00cd54003c71', 'OpenSea Conduit', 'marketplace'),
	// Aggregators / routers with cross-chain deterministic deploys
	sp('0x111111125421cA6dc452d289314280a0f8842A65', '1inch Router v6', 'dex'),
	sp('0x1111111254EEB25477B68fb85Ed929f73A960582', '1inch Router v5', 'dex'),
	sp('0xDef1C0ded9bec7F1a1670819833240f027b25EfF', '0x Exchange Proxy', 'dex'),
	sp('0x000000000022D473030F116dDEE9F6B43aC78BA3', 'Uniswap Permit2', 'permit2'),
];

/** Chain-specific spenders (DEX routers, marketplaces, lending), keyed by chainId. */
export const PER_CHAIN_SPENDERS: Record<number, SpenderEntry[]> = {
	// Ethereum
	1: [
		sp('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', 'Uniswap V2 Router', 'dex'),
		sp('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', 'Uniswap V3 SwapRouter02', 'dex'),
		sp('0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af', 'Uniswap Universal Router', 'dex'),
		sp('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', 'SushiSwap Router', 'dex'),
		sp('0xC92E8bdf79f0507f65a392b0ab4667716BFE0110', 'CoW Protocol (Vault Relayer)', 'dex'),
		sp('0x216B4B4Ba9F3e719726886d34a177484278Bfcae', 'ParaSwap v5', 'dex'),
		sp('0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 'Aave V3 Pool', 'lending'),
		sp('0x000000000000Ad05Ccc4F10045630fb830B95127', 'Blur Marketplace', 'marketplace'),
		sp('0x00000000000111AbE46ff893f3B2fdF1F759a8A8', 'Blur Execution Delegate', 'marketplace'),
	],
	// Base
	8453: [
		sp('0x2626664c2603336E57B271c5C0b26F421741e481', 'Uniswap V3 SwapRouter02', 'dex'),
		sp('0x6fF5693b99212Da76ad316178A184AB56D299b43', 'Uniswap Universal Router', 'dex'),
		sp('0xC92E8bdf79f0507f65a392b0ab4667716BFE0110', 'CoW Protocol (Vault Relayer)', 'dex'),
	],
	// Arbitrum
	42161: [
		sp('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', 'Uniswap V3 SwapRouter02', 'dex'),
		sp('0x5E325eDA8064b456f4781070C0738d849c824258', 'Uniswap Universal Router', 'dex'),
		sp('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', 'SushiSwap Router', 'dex'),
		sp('0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'Aave V3 Pool', 'lending'),
	],
	// Optimism
	10: [
		sp('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', 'Uniswap V3 SwapRouter02', 'dex'),
		sp('0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8', 'Uniswap Universal Router', 'dex'),
		sp('0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'Aave V3 Pool', 'lending'),
	],
	// Polygon
	137: [
		sp('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', 'Uniswap V3 SwapRouter02', 'dex'),
		sp('0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2', 'Uniswap Universal Router', 'dex'),
		sp('0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'Aave V3 Pool', 'lending'),
		sp('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', 'SushiSwap Router', 'dex'),
	],
	// BNB Chain
	56: [
		sp('0x10ED43C718714eb63d5aA57B78B54704E256024E', 'PancakeSwap V2 Router', 'dex'),
		sp('0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', 'PancakeSwap Smart Router', 'dex'),
		sp('0x1A0A18AC4BECDDbd6389559687d1A73d8927E416', 'PancakeSwap Universal Router', 'dex'),
	],
	// Avalanche
	43114: [
		sp('0x60aE616a2155Ee3d9A68541Ba4544862310933d4', 'Trader Joe Router', 'dex'),
	],
	// Gnosis
	100: [
		sp('0xC92E8bdf79f0507f65a392b0ab4667716BFE0110', 'CoW Protocol (Vault Relayer)', 'dex'),
	],
};

/** All built-in spenders to probe on a chain: cross-chain set + chain-specific. */
export function spendersForChain(chainId: number): SpenderEntry[] {
	const merged = [...CROSS_CHAIN_SPENDERS, ...(PER_CHAIN_SPENDERS[chainId] ?? [])];
	// De-dupe by address (CROSS_CHAIN lists Permit2 twice on purpose for clarity).
	return dedupeBy(merged, (s) => s.address.toLowerCase());
}
