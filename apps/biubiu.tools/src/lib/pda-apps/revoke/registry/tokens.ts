/**
 * Built-in mainstream tokens + NFT collections to probe approvals for, keyed by
 * chainId. ERC20 stablecoins/wrapped-natives/majors dominate real approvals; a
 * handful of blue-chip ERC721 collections cover the common `setApprovalForAll`
 * grants to marketplaces. Users can add any token/collection on top (custom-store).
 *
 * A wrong/absent token here is harmless (its allowance reads as 0 and is skipped);
 * the only cost of an omission is a missed approval — which the optional deep scan
 * and custom-add are there to backfill.
 */
import { getAddress, type Address } from 'viem';
import type { TokenEntry } from '../types.js';

function erc20(address: string, symbol: string, decimals: number, name?: string): TokenEntry {
	return { standard: 'erc20', address: getAddress(address), symbol, decimals, name };
}
function erc721(address: string, symbol: string, name?: string): TokenEntry {
	return { standard: 'erc721', address: getAddress(address), symbol, name };
}

export const BUILTIN_TOKENS: Record<number, TokenEntry[]> = {
	// Ethereum
	1: [
		erc20('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 6, 'USD Coin'),
		erc20('0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 6, 'Tether USD'),
		erc20('0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI', 18, 'Dai'),
		erc20('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH', 18, 'Wrapped Ether'),
		erc20('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'WBTC', 8, 'Wrapped BTC'),
		erc20('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'UNI', 18, 'Uniswap'),
		erc20('0x514910771AF9Ca656af840dff83E8264EcF986CA', 'LINK', 18, 'Chainlink'),
		erc20('0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', 'AAVE', 18, 'Aave'),
		erc20('0x6982508145454Ce325dDbE47a25d4ec3d2311933', 'PEPE', 18, 'Pepe'),
		erc721('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', 'BAYC', 'Bored Ape Yacht Club'),
		erc721('0x60E4d786628Fea6478F785A6d7e704777c86a7c6', 'MAYC', 'Mutant Ape Yacht Club'),
		erc721('0xED5AF388653567Af2F388E6224dC7C4b3241C544', 'AZUKI', 'Azuki'),
		erc721('0xBd3531dA5CF5857e7CfAA92426877b022e612cf8', 'PPG', 'Pudgy Penguins'),
	],
	// Base
	8453: [
		erc20('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 6, 'USD Coin'),
		erc20('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 'DAI', 18, 'Dai'),
		erc20('0x4200000000000000000000000000000000000006', 'WETH', 18, 'Wrapped Ether'),
		erc20('0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', 'cbBTC', 8, 'Coinbase Wrapped BTC'),
	],
	// Arbitrum
	42161: [
		erc20('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 6, 'USD Coin'),
		erc20('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 'USDT', 6, 'Tether USD'),
		erc20('0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', 'DAI', 18, 'Dai'),
		erc20('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'WETH', 18, 'Wrapped Ether'),
		erc20('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', 'WBTC', 8, 'Wrapped BTC'),
		erc20('0x912CE59144191C1204E64559FE8253a0e49E6548', 'ARB', 18, 'Arbitrum'),
	],
	// Optimism
	10: [
		erc20('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'USDC', 6, 'USD Coin'),
		erc20('0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', 'USDT', 6, 'Tether USD'),
		erc20('0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', 'DAI', 18, 'Dai'),
		erc20('0x4200000000000000000000000000000000000006', 'WETH', 18, 'Wrapped Ether'),
		erc20('0x4200000000000000000000000000000000000042', 'OP', 18, 'Optimism'),
	],
	// Polygon
	137: [
		erc20('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'USDC', 6, 'USD Coin'),
		erc20('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', 'USDC.e', 6, 'USD Coin (PoS)'),
		erc20('0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'USDT', 6, 'Tether USD'),
		erc20('0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', 'DAI', 18, 'Dai'),
		erc20('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', 'WETH', 18, 'Wrapped Ether'),
		erc20('0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 'WMATIC', 18, 'Wrapped Matic'),
	],
	// BNB Chain
	56: [
		erc20('0x55d398326f99059fF775485246999027B3197955', 'USDT', 18, 'Tether USD'),
		erc20('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 18, 'USD Coin'),
		erc20('0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'BUSD', 18, 'Binance USD'),
		erc20('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB', 18, 'Wrapped BNB'),
		erc20('0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'ETH', 18, 'Ethereum Token'),
		erc20('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', 'CAKE', 18, 'PancakeSwap'),
	],
	// Avalanche
	43114: [
		erc20('0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', 'USDC', 6, 'USD Coin'),
		erc20('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', 'USDT', 6, 'Tether USD'),
		erc20('0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', 'WAVAX', 18, 'Wrapped AVAX'),
	],
	// Gnosis
	100: [
		erc20('0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0', 'USDC', 6, 'USD Coin'),
		erc20('0x4ECaBa5870353805a9F068101A40E0f32ed605C6', 'USDT', 6, 'Tether USD'),
		erc20('0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', 'WXDAI', 18, 'Wrapped XDAI'),
	],
};

/** Built-in tokens to probe on a chain (empty for chains we don't curate yet). */
export function tokensForChain(chainId: number): TokenEntry[] {
	return BUILTIN_TOKENS[chainId] ?? [];
}
