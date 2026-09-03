/**
 * 授权撤销域的 operation 路由 —— **这是整个域里唯一做 I/O 的地方**。
 *
 * 它对 `operation.type` 做**穷尽** switch：核心新增一个 operation 时，TypeScript 会在
 * `assertNever` 那里报错。这是「合约变更不会被静默忽略」的机制保证，不是纪律
 * （contracts/revoke.md §4）。
 *
 * 这里没有、也不得出现任何业务判断：什么时候能扫、结果算不算数、失败要不要回滚，全在核心。
 */
import type { RevokeEvent } from '$lib/generated/revoke/RevokeEvent';
import type { RevokeOperation } from '$lib/generated/revoke/RevokeOperation';
import type { RevokeShellResult } from '$lib/generated/revoke/RevokeShellResult';
import { executeScan } from './scan.js';
import { executeRevoke } from './revoke.js';
import { executeLoadCustomData, executePersistCustomData } from './custom-data.js';
import { executeFetchChainMetadata } from './chain-metadata.js';

export type RevokeEffect = { id: number; operation: RevokeOperation };

export interface RevokeShellHooks {
	/** 把一个中途产生的结果（撤销进度）直接送回核心。 */
	dispatch(event: RevokeEvent): void;
}

export function createRevokeShell({ dispatch }: RevokeShellHooks) {
	async function execute(effect: RevokeEffect): Promise<RevokeShellResult> {
		const op = effect.operation;
		switch (op.type) {
			case 'scan_approvals':
				return executeScan(op);

			case 'revoke_approvals':
				return executeRevoke(op, {
					onPhase: (result) => dispatch({ type: 'shell_completed', result }),
				});

			case 'schedule_dismiss':
				// 时钟在宿主，策略（6 秒）在核心。
				//
				// **不保存 timer 句柄，也不做取消。** 取消由核心的 id 判定完成：用户手动关闭
				// 提示后，这个 id 就不在在途表里了，到期回送也会被丢弃（research.md D5）。
				// 这正是这条边界的价值 —— 正确性不依赖宿主记得调 clearTimeout。
				await new Promise((resolve) => setTimeout(resolve, op.delay_ms));
				return { type: 'dismiss_due', operation_id: op.operation_id };

			case 'fetch_chain_metadata':
				return executeFetchChainMetadata(op);

			case 'load_custom_data':
				return executeLoadCustomData(op);

			case 'persist_custom_data':
				return executePersistCustomData(op);

			default:
				return assertNever(op);
		}
	}

	/**
	 * 把一个平台异常翻译成该域的结果，好让核心按业务规则处理失败。
	 *
	 * 异常在这里**不被吞掉**：每一种都对应一个核心认识的失败结果。
	 */
	function toFailure(effect: RevokeEffect, error: unknown): RevokeShellResult {
		const message = error instanceof Error ? error.message : String(error);
		const op = effect.operation;
		switch (op.type) {
			case 'scan_approvals':
				return { type: 'scan_failed', operation_id: op.operation_id, message };

			case 'revoke_approvals':
				return {
					type: 'revoke_completed',
					operation_id: op.operation_id,
					success: false,
					tx_hash: null,
					explorer_url: null,
					error: message,
				};

			case 'load_custom_data':
				// 回灌失败是 best-effort：交回空表，核心保持三张表为空，不产生错误提示。
				return {
					type: 'custom_data_loaded',
					operation_id: op.operation_id,
					networks: [],
					tokens: [],
					spenders: [],
				};

			case 'persist_custom_data':
				// 落盘失败由核心决定「不回滚」（FR-018）。
				return { type: 'persist_completed', operation_id: op.operation_id, ok: false };

			case 'fetch_chain_metadata':
				return {
					type: 'chain_metadata_fetched',
					operation_id: op.operation_id,
					found: false,
					name: null,
					symbol: null,
					explorer_url: null,
					rpcs: [],
					is_testnet: false,
				};

			case 'schedule_dismiss':
				// setTimeout 不会失败；真出了意外，如实回送到期即可 —— 核心会按 id 判定。
				return { type: 'dismiss_due', operation_id: op.operation_id };

			default:
				return assertNever(op);
		}
	}

	return { execute, toFailure };
}

/** 新增 operation 而忘了在两个 switch 里覆盖时，这里编译不过。 */
function assertNever(op: never): never {
	throw new Error(`未处理的 revoke operation: ${JSON.stringify(op)}`);
}
