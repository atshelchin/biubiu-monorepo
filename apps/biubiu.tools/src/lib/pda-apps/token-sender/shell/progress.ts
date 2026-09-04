/**
 * 执行发送进度的落盘、读盘、丢弃，以及未知批次的链上确认。
 *
 * 两处**不能吞异常**：
 * - 落盘失败必须如实回报 `ok: false` —— 核心据此决定不发送那一批（FR-004）。
 *   吞掉它就等于让一批交易发出去而没有任何记录。
 * - 确认失败必须回报 `unresolved`，**不是**猜一个结果。「确认不了」是一个明确答案
 *   （research.md D25）。
 */
import { createPublicClient, http } from 'viem';
import type { SenderOperation } from '$lib/generated/sender/SenderOperation';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import {
	clearPendingSend,
	readPendingSend,
	writePendingSend,
} from '../infra/pending-send.js';

type PersistOp = Extract<SenderOperation, { type: 'persist_send_progress' }>;
type LoadOp = Extract<SenderOperation, { type: 'load_pending_send' }>;
type DiscardOp = Extract<SenderOperation, { type: 'discard_pending_send' }>;
type ConfirmOp = Extract<SenderOperation, { type: 'confirm_batch' }>;

export async function executePersistSendProgress(op: PersistOp): Promise<SenderShellResult> {
	await writePendingSend(op.snapshot);
	return { type: 'progress_persisted', operation_id: op.operation_id, ok: true };
}

export async function executeLoadPendingSend(op: LoadOp): Promise<SenderShellResult> {
	return {
		type: 'pending_send_loaded',
		operation_id: op.operation_id,
		snapshot: await readPendingSend(),
	};
}

export async function executeDiscardPendingSend(op: DiscardOp): Promise<SenderShellResult> {
	await clearPendingSend();
	return { type: 'progress_persisted', operation_id: op.operation_id, ok: true };
}

/**
 * 去链上确认某一批到底成了没有。
 *
 * 凭据是 biubiu passkey Safe 路径下的 `userOpHash` —— bundler 的 `eth_getUserOperationReceipt`
 * 能据它回答「这笔 userOp 上链了吗、成功了吗」。
 *
 * **拿不到凭据、问不到答案，就回报 `unresolved`。** 不去用「收件人首地址 + 金额」反查区块：
 * 同一组转账可能来自别的交易，那是猜测而不是确认（research.md D26）。
 */
export async function executeConfirmBatch(op: ConfirmOp): Promise<SenderShellResult> {
	const unresolved: SenderShellResult = {
		type: 'batch_confirmed',
		operation_id: op.operation_id,
		outcome: 'unresolved',
		tx_hash: null,
		explorer_url: null,
	};

	if (!op.hint) return unresolved;

	// 凭据形状决定怎么查：0x + 64 位十六进制 = userOpHash 或 txHash。
	if (!/^0x[0-9a-fA-F]{64}$/.test(op.hint)) return unresolved;

	const rpc = op.rpcs[0];
	if (!rpc) return unresolved;

	try {
		const client = createPublicClient({ transport: http(rpc) });
		// 先按交易哈希查 —— 外部钱包（EIP-5792）给出的就是它。
		const receipt = await client.getTransactionReceipt({ hash: op.hint as `0x${string}` });
		return {
			type: 'batch_confirmed',
			operation_id: op.operation_id,
			outcome: receipt.status === 'success' ? 'confirmed' : 'not_on_chain',
			tx_hash: receipt.transactionHash,
			explorer_url: null,
		};
	} catch {
		// 查不到可能是「还没打包」也可能是「压根没发」，**两者不能混为一谈**，
		// 所以不敢断言 not_on_chain。
		return unresolved;
	}
}
