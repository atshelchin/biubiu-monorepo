/**
 * Direct-fetch ERC-4337 bundler client (vela bundler — replaces the Pimlico proxy).
 *
 * Base URL comes from wallet/infra/endpoints.ts (default https://vela-bundler.getvela.app),
 * chainId appended per request. Each bundler POST carries an `X-Rpc-Url` header with
 * the chain's fastest RPC so the bundler can reach the chain (vela convention, CORS
 * pre-approved). The vela bundler accepts a Tempo `feeToken` extension field on the
 * UserOp dict for `eth_sendUserOperation`.
 */

import type { Hex } from 'viem';
import { CONTRACTS } from '$lib/auth/compute-safe-address.js';
import { getBundlerServiceURL } from './endpoints.js';
import { pickBundlerRpcUrl } from './rpc-client.js';

interface RpcResponse<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

/** UserOp dict as produced by build-userop.ts `formatUserOpForRpc` (+ optional feeToken). */
export type UserOpDict = Record<string, unknown>;

const ENTRY_POINT = CONTRACTS.entryPoint;

function bundlerRpcUrl(chainId: number): string {
	return `${getBundlerServiceURL()}/${chainId}`;
}

async function bundlerCall<T>(method: string, params: unknown[], chainId: number): Promise<T> {
	// Keyless public RPC only — never leak a provider-key URL to the bundler.
	const chainRpc = await pickBundlerRpcUrl(chainId).catch(() => undefined);
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (chainRpc) headers['X-Rpc-Url'] = chainRpc;

	const res = await fetch(bundlerRpcUrl(chainId), {
		method: 'POST',
		headers,
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Bundler HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
	}
	const json = (await res.json()) as RpcResponse<T>;
	if (json.error) throw new Error(json.error.message);
	return json.result as T;
}

export interface GasEstimate {
	preVerificationGas: Hex;
	verificationGasLimit: Hex;
	callGasLimit: Hex;
}

export async function estimateUserOperationGas(op: UserOpDict, chainId: number): Promise<GasEstimate> {
	return bundlerCall('eth_estimateUserOperationGas', [op, ENTRY_POINT], chainId);
}

export async function sendUserOperation(op: UserOpDict, chainId: number): Promise<Hex> {
	return bundlerCall<Hex>('eth_sendUserOperation', [op, ENTRY_POINT], chainId);
}

export interface UserOpReceipt {
	userOpHash: Hex;
	success: boolean;
	receipt: { transactionHash: Hex; blockNumber: Hex };
}

export async function getUserOperationReceipt(userOpHash: Hex, chainId: number): Promise<UserOpReceipt | null> {
	return bundlerCall('eth_getUserOperationReceipt', [userOpHash], chainId);
}

export interface GasPriceTiers {
	slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
	standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
	fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
}

/** pimlico_getUserOperationGasPrice — supported by the vela bundler; null on failure. */
export async function getUserOperationGasPrice(chainId: number): Promise<GasPriceTiers | null> {
	return bundlerCall<GasPriceTiers>('pimlico_getUserOperationGasPrice', [], chainId).catch(() => null);
}
