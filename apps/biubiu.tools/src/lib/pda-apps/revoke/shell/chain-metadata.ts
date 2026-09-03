/**
 * 执行 `fetch_chain_metadata`：从 ethereum-data 索引取一条链的元数据。
 *
 * 取不到**不是错误**：核心会用 chainId 兜底命名，只在一条可用 RPC 都没有时才拒绝添加
 * （FR-019）。因此这里把「没找到」如实回报为 `found: false`，而不是抛异常。
 */
import type { RevokeOperation } from '$lib/generated/revoke/RevokeOperation';
import type { RevokeShellResult } from '$lib/generated/revoke/RevokeShellResult';
import { extractRpcUrls } from '$lib/contract-caller/networks.js';
import { getEthereumDataURL } from '$lib/wallet/infra/endpoints.js';

type MetadataOp = Extract<RevokeOperation, { type: 'fetch_chain_metadata' }>;

interface ChainMeta {
	name?: string;
	nativeCurrency?: { symbol?: string };
	explorers?: Array<{ url?: string }>;
	testnet?: boolean;
	rpc?: unknown;
}

export async function executeFetchChainMetadata(op: MetadataOp): Promise<RevokeShellResult> {
	let meta: ChainMeta | null = null;
	try {
		const res = await fetch(`${getEthereumDataURL()}/chains/eip155-${op.chain_id}.json`);
		if (res.ok) meta = (await res.json()) as ChainMeta;
	} catch {
		meta = null;
	}

	return {
		type: 'chain_metadata_fetched',
		operation_id: op.operation_id,
		found: meta !== null,
		name: meta?.name ?? null,
		symbol: meta?.nativeCurrency?.symbol ?? null,
		explorer_url: meta?.explorers?.[0]?.url ?? null,
		rpcs: meta ? extractRpcUrls(meta) : [],
		is_testnet: meta?.testnet === true,
	};
}
