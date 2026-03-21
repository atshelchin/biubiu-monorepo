/**
 * 钱包余额查询（通过后端 API 代理 Alchemy Portfolio API）。
 *
 * 一次调用获取多链所有 token 余额，只返回非零项。
 * API key 在服务端，前端不暴露。
 */

export interface TokenBalance {
	network: string;
	chainName: string;
	symbol: string;
	balance: string;
	decimals: number;
	logo: string | null;
	name: string;
	/** token 合约地址（native token 为 null） */
	tokenAddress: string | null;
}

/**
 * 通过后端 /api/wallet 获取多链余额
 */
export async function fetchAllBalances(address: string): Promise<TokenBalance[]> {
	try {
		const res = await fetch(`/api/wallet?address=${encodeURIComponent(address)}`);
		if (!res.ok) return [];
		const data = await res.json();
		return data.tokens ?? [];
	} catch {
		return [];
	}
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
