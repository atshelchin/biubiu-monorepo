/**
 * 执行 `load_custom_data` / `persist_custom_data`：IndexedDB 读写。
 *
 * 核心是这三张表的唯一真相来源，所以回写是**整表替换**而不是增量指令 —— 让宿主自己算差异，
 * 等于把「哪些条目该在」这个判断又搬回宿主（research.md D10）。
 *
 * 失败在这里**不被吞掉**：它作为 `persist_completed { ok: false }` 回到核心，由核心决定
 * 「不回滚、本次会话照常可用」。迁移前这条决定散落在四个「catch 后什么都不做」里，
 * 没有任何地方记录它是一个决定而不是偷懒。
 */
import type { RevokeOperation } from '$lib/generated/RevokeOperation';
import type { RevokeShellResult } from '$lib/generated/RevokeShellResult';
import {
	getCustomNetworks,
	getCustomSpenders,
	getCustomTokens,
	replaceAllCustomNetworks,
	replaceAllCustomSpenders,
	replaceAllCustomTokens,
} from '../infra/custom-store.js';
import type { SpenderEntry, TokenEntry } from '../types.js';
import {
	fromRevokeNetwork,
	fromSpenderEntry,
	fromTokenEntry,
	toRevokeNetwork,
	toSpenderEntry,
	toTokenEntry,
} from './wire.js';

type LoadOp = Extract<RevokeOperation, { type: 'load_custom_data' }>;
type PersistOp = Extract<RevokeOperation, { type: 'persist_custom_data' }>;

export async function executeLoadCustomData(op: LoadOp): Promise<RevokeShellResult> {
	const [networks, tokens, spenders] = await Promise.all([
		getCustomNetworks(),
		getCustomTokens(),
		getCustomSpenders(),
	]);

	return {
		type: 'custom_data_loaded',
		operation_id: op.operation_id,
		networks: networks.map(fromRevokeNetwork),
		tokens: Object.entries(tokens).map(([chainId, list]) => ({
			chain_id: Number(chainId),
			tokens: list.map(fromTokenEntry),
		})),
		spenders: Object.entries(spenders).map(([chainId, list]) => ({
			chain_id: Number(chainId),
			spenders: list.map(fromSpenderEntry),
		})),
	};
}

export async function executePersistCustomData(op: PersistOp): Promise<RevokeShellResult> {
	const tokens: Record<number, TokenEntry[]> = {};
	for (const { chain_id, tokens: list } of op.tokens) tokens[chain_id] = list.map(toTokenEntry);

	const spenders: Record<number, SpenderEntry[]> = {};
	for (const { chain_id, spenders: list } of op.spenders) {
		spenders[chain_id] = list.map(toSpenderEntry);
	}

	await Promise.all([
		replaceAllCustomNetworks(op.networks.map(toRevokeNetwork)),
		replaceAllCustomTokens(tokens),
		replaceAllCustomSpenders(spenders),
	]);

	return { type: 'persist_completed', operation_id: op.operation_id, ok: true };
}
