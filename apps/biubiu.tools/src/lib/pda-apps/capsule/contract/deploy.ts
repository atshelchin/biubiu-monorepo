/**
 * First-user CREATE2 deployment of the Seal protocol.
 *
 * The Seal contract has no constructor args, so its creation bytecode is identical on every chain.
 * Deployed through the canonical deterministic-deployment proxy (Nick's factory, same address
 * everywhere) with a fixed salt, it lands at the SAME `FOREVER_ADDRESS` on every chain — so the
 * first person to seal on a given chain also publishes the protocol there, and everyone after
 * just uses it. No dev pre-deploy, no per-chain config.
 */
import { type Address, type Hex, concat } from 'viem';
import type { Call } from '$lib/wallet/types.js';
import { FOREVER_ADDRESS } from './address.js';
import { SEAL_CREATION_BYTECODE } from './bytecode.js';
import { rpcCall } from './rpc.js';

/** Canonical CREATE2 deterministic-deployment proxy (identical address on every EVM chain). */
export const CREATE2_PROXY: Address = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

/** Fixed salt → Seal deploys to the same FOREVER_ADDRESS everywhere. Matches script/Seal.s.sol. */
const CREATE2_SALT: Hex = `0x${'00'.repeat(32)}`;

/**
 * The sub-call that deploys Seal via the proxy. The proxy's calldata is `salt ‖ creationBytecode`;
 * it CREATE2-deploys and the resulting address is exactly FOREVER_ADDRESS.
 */
export function buildDeployCall(): Call {
	return { to: CREATE2_PROXY, value: 0n, data: concat([CREATE2_SALT, SEAL_CREATION_BYTECODE]) };
}

/**
 * Is Seal already deployed on this network? Authoritative `eth_getCode` at the canonical address.
 * Throws on RPC failure (the caller must NOT guess — a wrong guess either silently no-ops the seal
 * or reverts the CREATE2, so an unknown result should surface as a retryable error, not a default).
 */
export async function isSealDeployed(network: string): Promise<boolean> {
	const code = await rpcCall<Hex>(network, 'eth_getCode', [FOREVER_ADDRESS, 'latest']);
	return !!code && code !== '0x';
}
