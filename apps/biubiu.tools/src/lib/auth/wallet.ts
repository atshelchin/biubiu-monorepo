/**
 * 多链钱包余额查询。
 *
 * 通过公共 RPC 查询 Safe 地址在各链上的 native token 余额。
 * 主网络: Arbitrum，同时支持查询其他 EVM 链余额。
 */
import { createPublicClient, http, formatEther, type Chain } from 'viem';
import { arbitrum, mainnet, base, optimism, polygon } from 'viem/chains';

export interface ChainBalance {
	chainId: number;
	name: string;
	symbol: string;
	balance: string; // formatted (e.g. "0.1234")
	balanceRaw: bigint;
	loading: boolean;
	error: boolean;
}

export const SUPPORTED_CHAINS: { chain: Chain; symbol: string }[] = [
	{ chain: arbitrum, symbol: 'ETH' },
	{ chain: mainnet, symbol: 'ETH' },
	{ chain: base, symbol: 'ETH' },
	{ chain: optimism, symbol: 'ETH' },
	{ chain: polygon, symbol: 'POL' }
];

/**
 * 查询单条链的余额
 */
async function fetchChainBalance(
	chain: Chain,
	symbol: string,
	address: `0x${string}`
): Promise<ChainBalance> {
	const result: ChainBalance = {
		chainId: chain.id,
		name: chain.name,
		symbol,
		balance: '0',
		balanceRaw: 0n,
		loading: false,
		error: false
	};

	try {
		const client = createPublicClient({
			chain,
			transport: http()
		});

		const balanceRaw = await client.getBalance({ address });
		result.balanceRaw = balanceRaw;
		result.balance = formatEther(balanceRaw);
	} catch {
		result.error = true;
	}

	return result;
}

/**
 * 并发查询所有链的余额
 */
export async function fetchAllBalances(address: string): Promise<ChainBalance[]> {
	const addr = address as `0x${string}`;
	const results = await Promise.all(
		SUPPORTED_CHAINS.map(({ chain, symbol }) => fetchChainBalance(chain, symbol, addr))
	);
	return results;
}

/**
 * 格式化余额显示（最多 6 位小数，去尾零）
 */
export function formatBalance(balance: string): string {
	const num = parseFloat(balance);
	if (num === 0) return '0';
	if (num < 0.000001) return '<0.000001';
	// 最多 6 位小数，去掉尾部零
	return num.toFixed(6).replace(/\.?0+$/, '');
}
