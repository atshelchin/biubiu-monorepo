/**
 * 钱包余额查询（通过后端 API 代理 Alchemy Portfolio API）。
 *
 * 一次调用获取多链所有 token 余额，只返回非零项。
 * API key 在服务端，前端不暴露。
 */
import { getFxRate } from '$lib/wallet/infra/fiat-fx.js';
import { getChainlinkRate } from '$lib/wallet/infra/fiat-chainlink.js';

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
	/** 单价（USD），null 表示无报价 */
	priceUsd: number | null;
	/** 疑似垃圾币（无报价且不在已知白名单） */
	spam: boolean;
}

/** 单个 token 的 USD 价值 */
export function tokenValueUsd(token: TokenBalance): number | null {
	if (token.priceUsd == null) return null;
	return parseFloat(token.balance) * token.priceUsd;
}

/** 所有 token 的 USD 总价值 */
export function totalValueUsd(tokens: TokenBalance[]): number {
	return tokens.reduce((sum, t) => sum + (tokenValueUsd(t) ?? 0), 0);
}

/**
 * 获取 USD → 目标货币的汇率。
 *
 * 走可配置的 `fiatRatesURL` 服务节点（默认 Frankfurter v2 直连，全币种 + 6h 缓存，
 * 见 wallet/infra/fiat-fx.ts）；失败时回退到旧的 /api/exchange-rate 代理。
 */
export async function fetchExchangeRate(currency: string): Promise<number> {
	if (currency === 'USD') return 1;
	// 1. Chainlink on-chain feed (decentralized) for the 16 major fiats.
	try {
		const cl = await getChainlinkRate(currency);
		if (cl && cl > 0) return cl;
	} catch {
		/* fall through */
	}
	// 2. Configurable HTTP provider (Frankfurter v2, all currencies).
	try {
		const rate = await getFxRate(currency);
		if (rate && rate > 0 && rate !== 1) return rate;
	} catch {
		/* fall through to legacy proxy */
	}
	// 3. Legacy /api/exchange-rate proxy (last resort).
	try {
		const res = await fetch(`/api/exchange-rate?currency=${encodeURIComponent(currency)}`);
		if (!res.ok) return 1;
		const data = await res.json();
		return data.rate ?? 1;
	} catch {
		return 1;
	}
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
