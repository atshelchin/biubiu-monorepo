/**
 * 费用报价。优先级（用户既定）：
 *   ① 会员            → 免费
 *   ② 代码配置 fixed   → 固定 native
 *   ③ $5 等值          → 取到价时 = 5 / price
 *   ④ 兜底            → 1 native
 */
import { parseUnits } from 'viem';
import type { FeeQuote, TokenSenderNetwork } from '../types.js';
import { FEE_USD, FEE_FIXED_NATIVE, FEE_FALLBACK_NATIVE } from '../infra/fee-config.js';
import { fetchNativeUsdPrice } from './price.js';

export async function quoteFee(params: {
	network: TokenSenderNetwork;
	isMember: boolean;
}): Promise<FeeQuote> {
	const { network, isMember } = params;

	if (isMember) return { amount: 0n, source: 'member-free' };

	const fixed = FEE_FIXED_NATIVE[network.slug];
	if (fixed != null) return { amount: fixed, source: 'config' };

	const price = await fetchNativeUsdPrice(network);
	if (price && price > 0) {
		const native = FEE_USD / price;
		// toFixed(decimals) 保证 parseUnits 不超精度
		const amount = parseUnits(native.toFixed(network.decimals), network.decimals);
		return { amount, source: 'usd', usd: FEE_USD, nativeUsdPrice: price };
	}

	return { amount: FEE_FALLBACK_NATIVE, source: 'fallback' };
}
