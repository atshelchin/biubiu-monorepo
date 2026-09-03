/**
 * 三个读操作：ERC20 元数据、费用报价、余额预检。
 *
 * 全部复用迁移前的实现（`core/wallet.ts` / `core/fee.ts` / `core/orchestrator.ts`），
 * 一行未改。核心拥有的是它们的**后果**——能否离开第一步、总费用是多少、余额够不够——
 * 而不是怎么读链。
 */
import type { Address } from 'viem';
import type { SenderOperation } from '$lib/generated/sender/SenderOperation';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import { walletStore } from '$lib/wallet';
import { createConnectedWallet } from '../core/wallet.js';
import { quoteFee } from '../core/fee.js';
import { preflight } from '../core/orchestrator.js';
import { toTokenSenderNetwork } from './wire.js';

type MetaOp = Extract<SenderOperation, { type: 'read_erc20_meta' }>;
type FeeOp = Extract<SenderOperation, { type: 'quote_fee' }>;
type PreflightOp = Extract<SenderOperation, { type: 'preflight' }>;

export async function executeReadErc20Meta(op: MetaOp): Promise<SenderShellResult> {
	const connected = walletStore.activeWallet;
	if (!connected) {
		return { type: 'erc20_meta_read', operation_id: op.operation_id, ok: false, symbol: null, decimals: null };
	}
	const wallet = createConnectedWallet(connected);
	const meta = await wallet.getErc20Meta(toTokenSenderNetwork(op.network), op.address as Address);
	return {
		type: 'erc20_meta_read',
		operation_id: op.operation_id,
		ok: true,
		symbol: meta.symbol,
		decimals: meta.decimals,
	};
}

export async function executeQuoteFee(op: FeeOp): Promise<SenderShellResult> {
	const quote = await quoteFee({
		network: toTokenSenderNetwork(op.network),
		isMember: op.is_member,
	});
	return {
		type: 'fee_quoted',
		operation_id: op.operation_id,
		// bigint 不能进 JSON（spec 001 D4）。
		amount: quote.amount.toString(),
		is_member: op.is_member,
		// 来源与单价是**用户可见的**（界面上解释这笔钱怎么算出来的），必须一并过界。
		source: quote.source,
		usd: quote.usd ?? null,
		native_usd_price: quote.nativeUsdPrice ?? null,
	};
}

export async function executePreflight(op: PreflightOp): Promise<SenderShellResult> {
	const connected = walletStore.activeWallet;
	if (!connected) {
		return { type: 'preflight_failed', operation_id: op.operation_id, message: 'no-wallet' };
	}

	const result = await preflight({
		wallet: createConnectedWallet(connected),
		network: toTokenSenderNetwork(op.network),
		tokenType: op.token_type,
		tokenAddress: op.token_address ? (op.token_address as Address) : undefined,
		totalAmount: BigInt(op.total_amount),
		// 核心已经把「单批 × 批次数」算好了 —— 预检用的是总费用，不是单批。
		fee: { amount: BigInt(op.fee_total), source: 'config' },
	});

	return {
		type: 'preflight_done',
		operation_id: op.operation_id,
		result: {
			ok: result.ok,
			reason: result.reason ?? null,
			native_balance: result.nativeBalance.toString(),
			native_needed: result.nativeNeeded.toString(),
			token_balance: result.tokenBalance?.toString() ?? null,
			token_needed: result.tokenNeeded?.toString() ?? null,
		},
	};
}
