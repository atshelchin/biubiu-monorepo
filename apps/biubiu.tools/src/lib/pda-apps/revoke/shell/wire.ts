/**
 * Core ↔ 既有 TypeScript 实现之间的形状转换。
 *
 * 两侧的命名约定不同（核心是 `snake_case`，本仓库既有代码是 `camelCase`），额度在核心侧是
 * 十进制字符串、在这里是 `bigint`（`JSON.stringify(1n)` 会直接抛异常，所以 JSON 边界上
 * bigint 必须是字符串 —— research.md D4）。
 *
 * 这个文件**只做形状转换**，不含任何业务判断。唯一接近判断的是 `isPermit2`，而它读的是
 * 迁移前就已经存在的 id 前缀约定，不是新规则。
 */
import type { Address } from 'viem';
import type { Network } from '$lib/generated/revoke/Network';
import type { ScannedApproval } from '$lib/generated/revoke/ScannedApproval';
import type { SpenderEntry as CoreSpender } from '$lib/generated/revoke/SpenderEntry';
import type { TokenEntry as CoreToken } from '$lib/generated/revoke/TokenEntry';
import type {
	ApprovalRow,
	RevokeNetwork,
	SpenderEntry,
	TokenEntry,
	TokenStandard,
} from '../types.js';

export function toRevokeNetwork(n: Network): RevokeNetwork {
	return {
		slug: n.slug,
		chainId: n.chain_id,
		name: n.name,
		symbol: n.symbol,
		rpcs: n.rpcs,
		explorerUrl: n.explorer_url,
		multicall3: n.multicall3 as Address,
		isTestnet: n.is_testnet,
		isCustom: n.is_custom,
	};
}

export function fromRevokeNetwork(n: RevokeNetwork): Network {
	return {
		slug: n.slug,
		chain_id: n.chainId,
		name: n.name,
		symbol: n.symbol,
		rpcs: n.rpcs,
		explorer_url: n.explorerUrl,
		multicall3: n.multicall3,
		is_testnet: n.isTestnet ?? false,
		is_custom: n.isCustom ?? false,
	};
}

export function toTokenEntry(t: CoreToken): TokenEntry {
	return {
		standard: t.standard as TokenStandard,
		address: t.address as Address,
		symbol: t.symbol,
		name: t.name ?? undefined,
		decimals: t.decimals ?? undefined,
		isCustom: t.is_custom,
	};
}

export function fromTokenEntry(t: TokenEntry): CoreToken {
	return {
		standard: t.standard,
		address: t.address,
		symbol: t.symbol,
		name: t.name ?? null,
		decimals: t.decimals ?? null,
		is_custom: t.isCustom ?? false,
	};
}

export function toSpenderEntry(s: CoreSpender): SpenderEntry {
	return {
		address: s.address as Address,
		label: s.label,
		kind: s.kind,
		isCustom: s.is_custom,
	};
}

export function fromSpenderEntry(s: SpenderEntry): CoreSpender {
	return {
		address: s.address,
		label: s.label,
		kind: s.kind,
		is_custom: s.isCustom ?? false,
	};
}

/**
 * 扫描结果 → 核心的入参形状。
 *
 * **不带 id** —— id 由核心生成（FR-021）。宿主因此没有机会把这条规则写错，重新扫描后逐行
 * 状态也就不可能错位。
 */
export function toScannedApproval(row: ApprovalRow): ScannedApproval {
	return {
		standard: row.standard,
		token: row.token,
		token_symbol: row.tokenSymbol,
		token_name: row.tokenName ?? null,
		decimals: row.decimals ?? null,
		spender: row.spender,
		spender_label: row.spenderLabel ?? null,
		spender_kind: row.spenderKind ?? null,
		// bigint 不能进 JSON —— 十进制字符串过界（research.md D4）。
		allowance: row.allowance === undefined ? null : row.allowance.toString(),
		approved_for_all: row.approvedForAll ?? null,
		unlimited: row.unlimited,
		from_logs: row.fromLogs ?? false,
		// 迁移前就用 id 前缀表达这件事（`buildRevokeCall` 读 `row.id.startsWith('permit2:')`）。
		// 这里把它提成一个显式字段，核心据此决定 id 的标准段。
		is_permit2: row.id.startsWith('permit2:'),
	};
}
