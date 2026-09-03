/**
 * Core ↔ 既有 TypeScript 实现之间的形状转换。
 *
 * 两侧命名约定不同（核心 `snake_case`，既有代码 `camelCase`），金额在核心侧是十进制字符串、
 * 在这里是 `bigint`（`JSON.stringify(1n)` 直接抛 —— spec 001 D4）。
 *
 * 只做形状转换，不含业务判断。
 */
import type { Address } from 'viem';
import type { SenderNetwork as Network } from '$lib/generated/sender/SenderNetwork';
import type { Recipient as CoreRecipient } from '$lib/generated/sender/Recipient';
import type { HistoryRecord } from '$lib/generated/sender/HistoryRecord';
import type { RpcOverride } from '$lib/generated/sender/RpcOverride';
import type { Recipient, SendRecord, TokenSenderNetwork } from '../types.js';

export function toTokenSenderNetwork(n: Network): TokenSenderNetwork {
	return {
		slug: n.slug,
		name: n.name,
		chainId: n.chain_id,
		symbol: n.symbol,
		decimals: n.decimals,
		rpcs: n.rpcs,
		explorerTxUrl: n.explorer_tx_url,
		multiSendAddress: n.multi_send_address as Address,
		maxBatchNative: n.max_batch_native,
		maxBatchErc20: n.max_batch_erc20,
		chainlinkNativeUsdFeed: (n.chainlink_native_usd_feed ?? undefined) as Address | undefined,
		isTestnet: n.is_testnet,
		isCustom: n.is_custom,
	};
}

export function fromTokenSenderNetwork(n: TokenSenderNetwork): Network {
	return {
		slug: n.slug,
		name: n.name,
		chain_id: n.chainId,
		symbol: n.symbol,
		decimals: n.decimals,
		rpcs: n.rpcs,
		explorer_tx_url: n.explorerTxUrl,
		multi_send_address: n.multiSendAddress,
		max_batch_native: n.maxBatchNative,
		max_batch_erc20: n.maxBatchErc20,
		chainlink_native_usd_feed: n.chainlinkNativeUsdFeed ?? null,
		is_testnet: n.isTestnet ?? false,
		is_custom: n.isCustom ?? false,
	};
}

/** 核心送来的收件人已经是**该批的那一片**，且金额已按精度换算成最小单位。 */
export function toRecipients(list: CoreRecipient[]): Recipient[] {
	return list.map((r) => ({ address: r.address as Address, amount: BigInt(r.amount) }));
}

export function fromRpcOverrides(map: Record<string, string[]>): RpcOverride[] {
	return Object.entries(map).map(([slug, rpcs]) => ({ slug, rpcs }));
}

export function toRpcOverrides(list: RpcOverride[]): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const { slug, rpcs } of list) out[slug] = rpcs;
	return out;
}

export function toSendRecord(r: HistoryRecord): SendRecord {
	return {
		id: r.id,
		createdAt: r.created_at,
		network: r.network,
		networkName: r.network_name,
		tokenType: r.token_type,
		tokenAddress: r.token_address ?? undefined,
		tokenSymbol: r.token_symbol,
		decimals: r.decimals,
		totalRecipients: r.total_recipients,
		totalAmount: r.total_amount,
		feeWei: r.fee_wei,
		isMember: r.is_member,
		status: r.status,
		batches: r.batches.map((b) => ({
			index: b.index,
			txHash: b.tx_hash ?? undefined,
			status: b.status as 'confirmed' | 'failed',
			count: b.count,
			explorerUrl: b.explorer_url ?? undefined,
			error: b.error ?? undefined,
		})),
	};
}

export function fromSendRecord(r: SendRecord): HistoryRecord {
	return {
		id: r.id,
		created_at: r.createdAt,
		network: r.network,
		network_name: r.networkName,
		token_type: r.tokenType,
		token_address: r.tokenAddress ?? null,
		token_symbol: r.tokenSymbol,
		decimals: r.decimals,
		total_recipients: r.totalRecipients,
		total_amount: r.totalAmount,
		fee_wei: r.feeWei,
		is_member: r.isMember,
		status: r.status,
		batches: r.batches.map((b) => ({
			index: b.index,
			tx_hash: b.txHash ?? null,
			status: b.status,
			count: b.count,
			explorer_url: b.explorerUrl ?? null,
			error: b.error ?? null,
		})),
	};
}
