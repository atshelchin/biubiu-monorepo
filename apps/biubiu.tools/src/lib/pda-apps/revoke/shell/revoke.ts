/**
 * 执行 `revoke_approvals`：ABI 编码 + 通过站点 `ConnectedWallet` 发送。
 *
 * 复用迁移前的 `core/revoke.ts`（`buildRevokeCall` 与 `walletStore.sendCalls`），**没有改动
 * 它**。ABI 编码与 Safe MultiSend / EIP-5792 的差异是**怎么做**，不是**是否允许做**，因此
 * 留在这里而不进核心（research.md D6）。
 *
 * 进度回调被转成带 `operation_id` 的 `revoke_phase_changed` 结果 —— 一次已被取代的撤销的
 * 进度不得点亮当前的进度条，而做出这个判断的是核心，不是这里。
 */
import type { Address } from 'viem';
import type { RevokeOperation } from '$lib/generated/revoke/RevokeOperation';
import type { RevokeShellResult } from '$lib/generated/revoke/RevokeShellResult';
import type { SendPhase } from '$lib/generated/revoke/SendPhase';
import type { ApprovalRow } from '../types.js';
import { runRevoke } from '../core/revoke.js';

type RevokeOp = Extract<RevokeOperation, { type: 'revoke_approvals' }>;

export interface RevokeExecuteOptions {
	/** 进度档位回传通道。每一档都带上本次操作的 id。 */
	onPhase(result: RevokeShellResult): void;
}

export async function executeRevoke(
	op: RevokeOp,
	{ onPhase }: RevokeExecuteOptions,
): Promise<RevokeShellResult> {
	// `buildRevokeCall` 只读 id / standard / token / spender，因此这个投影足够；
	// 其余字段用不到，不必让核心把整行都送过来。
	const rows = op.rows.map(
		(r) =>
			({
				id: r.id,
				standard: r.standard,
				token: r.token as Address,
				spender: r.spender as Address,
			}) as ApprovalRow,
	);

	const result = await runRevoke({
		network: {
			slug: `chain-${op.chain_id}`,
			chainId: op.chain_id,
			name: '',
			symbol: '',
			rpcs: [],
			explorerUrl: op.explorer_url,
			multicall3: '0x' as Address,
		},
		rows,
		gasFeeToken: (op.gas_fee_token as Address | null) ?? null,
		onPhase: (phase) =>
			onPhase({
				type: 'revoke_phase_changed',
				operation_id: op.operation_id,
				phase: phase as SendPhase,
			}),
	});

	return {
		type: 'revoke_completed',
		operation_id: op.operation_id,
		success: result.success,
		tx_hash: result.txHash ?? null,
		explorer_url: result.explorerUrl ?? null,
		error: result.error ?? null,
	};
}
