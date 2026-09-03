/**
 * 执行自定义网络 / RPC 覆盖 / 发送历史的读写（IndexedDB）。
 *
 * 回写是**整表替换**：核心是这些表的唯一真相来源，让宿主算差异等于把「哪些条目该在」
 * 这个判断搬回宿主（spec 001 research.md D10）。
 *
 * 失败在这里**不被吞掉**，而是作为 `persist_completed { ok: false }` 回到核心，由核心决定
 * 「不回滚、本次会话照常可用」。
 */
import type { SenderOperation } from '$lib/generated/sender/SenderOperation';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import {
	getCustomNetworks,
	getRpcOverrides,
	replaceAllCustomNetworks,
	replaceAllRpcOverrides,
} from '../infra/custom-store.js';
import { listSends, putSend } from '../history/send-history.js';
import {
	fromRpcOverrides,
	fromSendRecord,
	fromTokenSenderNetwork,
	toRpcOverrides,
	toSendRecord,
	toTokenSenderNetwork,
} from './wire.js';

type LoadOp = Extract<SenderOperation, { type: 'load_custom_data' }>;
type PersistOp = Extract<SenderOperation, { type: 'persist_custom_data' }>;
type HistoryOp = Extract<SenderOperation, { type: 'persist_history' }>;
type LoadHistoryOp = Extract<SenderOperation, { type: 'load_history' }>;
type VerifyOp = Extract<SenderOperation, { type: 'verify_multi_send' }>;

export async function executeLoadCustomData(op: LoadOp): Promise<SenderShellResult> {
	const [networks, overrides] = await Promise.all([getCustomNetworks(), getRpcOverrides()]);
	return {
		type: 'custom_data_loaded',
		operation_id: op.operation_id,
		networks: networks.map(fromTokenSenderNetwork),
		rpc_overrides: fromRpcOverrides(overrides),
	};
}

export async function executePersistCustomData(op: PersistOp): Promise<SenderShellResult> {
	await Promise.all([
		replaceAllCustomNetworks(op.networks.map(toTokenSenderNetwork)),
		replaceAllRpcOverrides(toRpcOverrides(op.rpc_overrides)),
	]);
	return { type: 'persist_completed', operation_id: op.operation_id, ok: true };
}

export async function executePersistHistory(op: HistoryOp): Promise<SenderShellResult> {
	await putSend(toSendRecord(op.record));
	return { type: 'persist_completed', operation_id: op.operation_id, ok: true };
}

export async function executeLoadHistory(op: LoadHistoryOp): Promise<SenderShellResult> {
	const records = await listSends(op.limit);
	return {
		type: 'history_loaded',
		operation_id: op.operation_id,
		records: records.map(fromSendRecord),
	};
}

/** 校验某 RPC 上 MultiSend 1.4.1 是否部署 —— 添加自定义网络时给用户反馈。 */
export async function executeVerifyMultiSend(op: VerifyOp): Promise<SenderShellResult> {
	const res = await fetch(op.rpc.trim(), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_getCode',
			params: [op.multi_send_address, 'latest'],
		}),
	});
	const json = await res.json();
	const code = json?.result;
	return {
		type: 'multi_send_verified',
		operation_id: op.operation_id,
		deployed: typeof code === 'string' && code !== '0x' && code.length > 2,
	};
}
