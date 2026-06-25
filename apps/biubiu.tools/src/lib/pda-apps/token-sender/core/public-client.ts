/**
 * 共享的只读 viem public client 构造器。
 *
 * core/wallet.ts（余额/元数据读取）与 core/price.ts（Chainlink 价格读取）原本各自
 * 重复 `createPublicClient({ transport: fallback(resolveRpcUrls(chainId, rpcs).map(http)) })`。
 * 抽到这里统一：两者都先尊重共享的 service-node 设置（用户 RPC 覆盖 / provider key），
 * 再落到本 app 自带的精选 RPC。行为与原内联实现逐字节一致。
 */
import { createPublicClient, http, fallback } from 'viem';
import { resolveRpcUrls } from '$lib/wallet/infra/rpc-client.js';
import type { TokenSenderNetwork } from '../types.js';

export function publicClientFor(network: TokenSenderNetwork) {
	// Honour shared service-node settings (user RPC override / provider key) first,
	// falling back to this app's curated RPCs.
	const urls = resolveRpcUrls(network.chainId, network.rpcs);
	return createPublicClient({ transport: fallback(urls.map((u) => http(u))) });
}
