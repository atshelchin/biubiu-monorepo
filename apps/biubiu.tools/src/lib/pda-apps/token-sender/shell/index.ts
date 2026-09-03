/**
 * 批量代币发送域的 operation 路由 —— **这是整个域里唯一做 I/O 的地方**。
 *
 * 对 `operation.type` 做**穷尽** switch：核心新增一个 operation 时，TypeScript 在
 * `assertNever` 处报错。
 *
 * 这里没有、也不得出现：跨批次的循环、`AbortController`、`await` 的批间延时。
 * 那三样是迁移前 `runSend` 的全部形态，现在都由核心的状态机取代（research.md D15/D16）。
 */
import type { SenderEvent } from '$lib/generated/sender/SenderEvent';
import type { SenderOperation } from '$lib/generated/sender/SenderOperation';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import { executeSendBatch } from './send-batch.js';
import { executeQuoteFee, executePreflight, executeReadErc20Meta } from './reads.js';
import {
	executeLoadCustomData,
	executeLoadHistory,
	executePersistCustomData,
	executePersistHistory,
	executeVerifyMultiSend,
} from './storage.js';

export type SenderEffect = { id: number; operation: SenderOperation };

export interface SenderShellHooks {
	dispatch(event: SenderEvent): void;
}

export function createSenderShell({ dispatch }: SenderShellHooks) {
	async function execute(effect: SenderEffect): Promise<SenderShellResult> {
		const op = effect.operation;
		switch (op.type) {
			case 'send_batch':
				return executeSendBatch(op, {
					onPhase: (result) => dispatch({ type: 'shell_completed', result }),
				});

			case 'wait_between_batches':
				// 批间喘息。**不保存句柄、不做取消** —— 用户暂停时核心把这个 id 移出在途表，
				// 到期回送因此被丢弃。宿主不需要知道自己被取消了（research.md D16）。
				await new Promise((resolve) => setTimeout(resolve, op.delay_ms));
				return { type: 'delay_elapsed', operation_id: op.operation_id };

			case 'read_erc20_meta':
				return executeReadErc20Meta(op);
			case 'quote_fee':
				return executeQuoteFee(op);
			case 'preflight':
				return executePreflight(op);
			case 'load_custom_data':
				return executeLoadCustomData(op);
			case 'persist_custom_data':
				return executePersistCustomData(op);
			case 'persist_history':
				return executePersistHistory(op);
			case 'load_history':
				return executeLoadHistory(op);
			case 'verify_multi_send':
				return executeVerifyMultiSend(op);

			default:
				return assertNever(op);
		}
	}

	/** 把平台异常翻译成核心认识的失败结果。异常在这里不被吞掉。 */
	function toFailure(effect: SenderEffect, error: unknown): SenderShellResult {
		const message = error instanceof Error ? error.message : String(error);
		const op = effect.operation;
		switch (op.type) {
			case 'send_batch':
				// 一批失败不中止整轮 —— 那条策略在核心里（FR-008）。
				return { type: 'batch_failed', operation_id: op.operation_id, error: message };

			case 'wait_between_batches':
				return { type: 'delay_elapsed', operation_id: op.operation_id };

			case 'read_erc20_meta':
				return {
					type: 'erc20_meta_read',
					operation_id: op.operation_id,
					ok: false,
					symbol: null,
					decimals: null,
				};

			case 'quote_fee':
			case 'preflight':
				return { type: 'preflight_failed', operation_id: op.operation_id, message };

			case 'load_custom_data':
				// best-effort：交回空表，核心保持为空，不产生错误提示。
				return {
					type: 'custom_data_loaded',
					operation_id: op.operation_id,
					networks: [],
					rpc_overrides: [],
				};

			case 'persist_custom_data':
			case 'persist_history':
				// 落盘失败由核心决定「不回滚、不影响发送结果的呈现」。
				return { type: 'persist_completed', operation_id: op.operation_id, ok: false };

			case 'load_history':
				return { type: 'history_loaded', operation_id: op.operation_id, records: [] };

			case 'verify_multi_send':
				return { type: 'multi_send_verified', operation_id: op.operation_id, deployed: false };

			default:
				return assertNever(op);
		}
	}

	return { execute, toFailure };
}

/** 新增 operation 而忘了在两个 switch 里覆盖时，这里编译不过。 */
function assertNever(op: never): never {
	throw new Error(`未处理的 sender operation: ${JSON.stringify(op)}`);
}
