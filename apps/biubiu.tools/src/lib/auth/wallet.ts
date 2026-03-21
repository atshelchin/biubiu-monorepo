/**
 * 多链钱包余额查询。
 *
 * 查询 native token + USDC/USDT 余额，只返回有余额的条目。
 */
import { createPublicClient, http, formatEther, formatUnits, erc20Abi, type Chain } from 'viem';
import { arbitrum, mainnet, base, optimism, polygon, bsc, avalanche } from 'viem/chains';

export interface TokenBalance {
	chainId: number;
	chainName: string;
	symbol: string;
	balance: string;
	balanceRaw: bigint;
}

/** 各链 USDC/USDT 合约地址 */
const STABLECOINS: Record<number, { symbol: string; address: `0x${string}`; decimals: number }[]> = {
	[arbitrum.id]: [
		{ symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
		{ symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 }
	],
	[mainnet.id]: [
		{ symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
		{ symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
	],
	[base.id]: [
		{ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
		{ symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 }
	],
	[optimism.id]: [
		{ symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
		{ symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 }
	],
	[polygon.id]: [
		{ symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
		{ symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 }
	],
	[bsc.id]: [
		{ symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
		{ symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
	],
	[avalanche.id]: [
		{ symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
		{ symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 }
	]
};

const CHAINS: { chain: Chain; nativeSymbol: string }[] = [
	{ chain: arbitrum, nativeSymbol: 'ETH' },
	{ chain: mainnet, nativeSymbol: 'ETH' },
	{ chain: base, nativeSymbol: 'ETH' },
	{ chain: optimism, nativeSymbol: 'ETH' },
	{ chain: polygon, nativeSymbol: 'POL' },
	{ chain: bsc, nativeSymbol: 'BNB' },
	{ chain: avalanche, nativeSymbol: 'AVAX' }
];

/**
 * 查询单链的所有余额（native + stablecoins），只返回非零项
 */
async function fetchChainBalances(
	chain: Chain,
	nativeSymbol: string,
	address: `0x${string}`
): Promise<TokenBalance[]> {
	const results: TokenBalance[] = [];

	try {
		const client = createPublicClient({ chain, transport: http() });

		// 并发查询 native + 所有 stablecoin
		const tokens = STABLECOINS[chain.id] ?? [];
		const [nativeBalance, ...tokenBalances] = await Promise.all([
			client.getBalance({ address }),
			...tokens.map((t) =>
				client.readContract({
					address: t.address,
					abi: erc20Abi,
					functionName: 'balanceOf',
					args: [address]
				})
			)
		]);

		if (nativeBalance > 0n) {
			results.push({
				chainId: chain.id,
				chainName: chain.name,
				symbol: nativeSymbol,
				balance: formatEther(nativeBalance),
				balanceRaw: nativeBalance
			});
		}

		tokens.forEach((t, i) => {
			const raw = tokenBalances[i] as bigint;
			if (raw > 0n) {
				results.push({
					chainId: chain.id,
					chainName: chain.name,
					symbol: t.symbol,
					balance: formatUnits(raw, t.decimals),
					balanceRaw: raw
				});
			}
		});
	} catch {
		// 链不可达，跳过
	}

	return results;
}

/**
 * 并发查询所有链余额，只返回有余额的条目
 */
export async function fetchAllBalances(address: string): Promise<TokenBalance[]> {
	const addr = address as `0x${string}`;
	const perChain = await Promise.all(
		CHAINS.map(({ chain, nativeSymbol }) => fetchChainBalances(chain, nativeSymbol, addr))
	);
	return perChain.flat();
}

/**
 * 格式化余额（最多 6 位小数，去尾零）
 */
export function formatBalance(balance: string): string {
	const num = parseFloat(balance);
	if (num === 0) return '0';
	if (num < 0.000001) return '<0.000001';
	return num.toFixed(6).replace(/\.?0+$/, '');
}
