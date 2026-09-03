/**
 * 执行 `send_batch`：MultiSend 打包 + 通过站点 `ConnectedWallet` 发送。
 *
 * 复用迁移前的 `infra/multisend.ts` 与 `core/wallet.ts`，**没有改动它们**。ABI 编码与
 * 各钱包后端的差异是**怎么做**，不是**是否允许做**（spec 001 research.md D6）。
 *
 * 这里**没有循环**。核心一次只给一批；下一批由这一批的结果触发（research.md D15）。
 * 也没有 `AbortController` —— 暂停由核心不再选下一批实现，而在途这一批**绝不撤回**：
 * 交易可能已上链，撤回等于让核心不知道那批钱发出去没有，下次续发会重复打款（D16）。
 */
import type { Address } from 'viem';
import type { SenderOperation } from '$lib/generated/sender/SenderOperation';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import type { SenderPhase as SendPhase } from '$lib/generated/sender/SenderPhase';
import { walletStore } from '$lib/wallet';
import { buildBatchSubTransactions } from '../infra/multisend.js';
import { FEE_COLLECTOR } from '../infra/fee-config.js';
import { createConnectedWallet } from '../core/wallet.js';
import { toRecipients, toTokenSenderNetwork } from './wire.js';

type SendBatchOp = Extract<SenderOperation, { type: 'send_batch' }>;

export interface SendBatchOptions {
	/** 进度档位回传通道。每一档都带上本次操作的 id。 */
	onPhase(result: SenderShellResult): void;
}

export async function executeSendBatch(
	op: SendBatchOp,
	{ onPhase }: SendBatchOptions,
): Promise<SenderShellResult> {
	const connected = walletStore.activeWallet;
	if (!connected) {
		return { type: 'batch_failed', operation_id: op.operation_id, error: 'no-wallet' };
	}

	const network = toTokenSenderNetwork(op.network);
	const calls = buildBatchSubTransactions({
		tokenType: op.token_type,
		tokenAddress: op.token_address ? (op.token_address as Address) : undefined,
		recipients: toRecipients(op.recipients),
		feeCollector: FEE_COLLECTOR,
		// 每批都收；会员时核心给的是 "0"。
		feeWei: BigInt(op.fee_wei),
	});

	const wallet = createConnectedWallet(connected);
	const { txHash, explorerUrl } = await wallet.sendBatch({
		network,
		calls,
		gasFeeToken: (op.gas_fee_token as Address | null) ?? null,
		onStatus: (status) =>
			onPhase({
				type: 'batch_phase_changed',
				operation_id: op.operation_id,
				phase: status as SendPhase,
			}),
	});

	return {
		type: 'batch_succeeded',
		operation_id: op.operation_id,
		tx_hash: txHash,
		explorer_url: explorerUrl,
	};
}
