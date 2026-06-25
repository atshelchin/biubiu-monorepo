/**
 * Shared `X-Rpc-Url` header assembly for the vela bundler.
 *
 * Every bundler request (RPC POST in bundler-client.ts, account/sponsor REST in
 * bundler-account.ts) attaches a keyless public RPC URL via `X-Rpc-Url` so the
 * bundler can reach the chain. The selection rule is identical in all three call
 * sites: resolve `pickBundlerRpcUrl(chainId)` (swallowing failures to `undefined`)
 * and set the header only when a URL is available. The base headers differ per
 * request, so the caller supplies them and we merge the resolved URL in.
 */

import { pickBundlerRpcUrl } from './rpc-client.js';

/**
 * Merge `base` headers with an `X-Rpc-Url` of the chain's keyless public RPC.
 * The header is omitted when no public URL can be resolved — byte-identical to
 * the previous inline `if (chainRpc) headers['X-Rpc-Url'] = chainRpc` logic.
 */
export async function bundlerHeaders(
	chainId: number,
	base: Record<string, string>
): Promise<Record<string, string>> {
	const chainRpc = await pickBundlerRpcUrl(chainId).catch(() => undefined);
	const headers: Record<string, string> = { ...base };
	if (chainRpc) headers['X-Rpc-Url'] = chainRpc;
	return headers;
}
