/**
 * 执行 `scan_approvals`：Multicall 读链。
 *
 * 复用迁移前的 `infra/multicall.ts`，**没有改动它**。这里唯一新增的是形状转换。
 *
 * 注意本文件**不查注册表**：内置与自定义条目的合并去重已经由核心完成，清单是随请求送来的
 * （contracts/revoke.md §2）。「哪些目标该被探测」是业务规则，不是 I/O。
 */
import type { Address } from 'viem';
import type { RevokeOperation } from '$lib/generated/RevokeOperation';
import type { RevokeShellResult } from '$lib/generated/RevokeShellResult';
import { scanApprovals } from '../infra/multicall.js';
import { toScannedApproval, toSpenderEntry, toTokenEntry } from './wire.js';

type ScanOp = Extract<RevokeOperation, { type: 'scan_approvals' }>;

export async function executeScan(op: ScanOp): Promise<RevokeShellResult> {
	const rows = await scanApprovals(
		{
			slug: `chain-${op.chain_id}`,
			chainId: op.chain_id,
			name: '',
			symbol: '',
			rpcs: op.rpcs,
			explorerUrl: '',
			multicall3: op.multicall3 as Address,
		},
		op.owner as Address,
		op.tokens.map(toTokenEntry),
		op.spenders.map(toSpenderEntry),
	);

	return {
		type: 'approvals_scanned',
		operation_id: op.operation_id,
		rows: rows.map(toScannedApproval),
	};
}
