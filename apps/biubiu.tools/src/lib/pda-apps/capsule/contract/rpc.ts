/** Thin JSON-RPC read helper — direct via the shared infra RPC pool (no proxy). */
import { rpcCall as infraRpcCall } from '$lib/wallet/infra/rpc-client.js';
import { chainInfoBySlug } from '$lib/wallet/infra/chains.js';

export async function rpcCall<T = unknown>(network: string, method: string, params: unknown[]): Promise<T> {
	const info = chainInfoBySlug(network);
	if (!info) throw new Error(`Unknown network: ${network}`);
	return infraRpcCall<T>(method, params, info.chainId);
}
