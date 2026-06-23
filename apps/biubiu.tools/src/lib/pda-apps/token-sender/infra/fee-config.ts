import type { Address } from 'viem';

/** 非会员每次发送的目标费用（美元等值） */
export const FEE_USD = 5;

/** 费用收款地址（biubiu.tools） */
export const FEE_COLLECTOR: Address = '0x2C1c9470E6A6fc6340C9e24670361fEC4c347c23';

/**
 * 取不到 native 价格时的兜底：收 1 个 native。
 * 各链 native 精度均为 18。
 */
export const FEE_FALLBACK_NATIVE = 10n ** 18n;

/**
 * 代码配置（最高优先级）：指定某网络固定收多少 native（wei）。
 * 留空 → 走「$5 等值 → 兜底 1 native」。
 *
 * 例：{ 'eth-mainnet': 2_000_000_000_000_000n }  // 0.002 ETH
 */
export const FEE_FIXED_NATIVE: Record<string, bigint> = {};
