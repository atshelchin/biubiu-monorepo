/**
 * Bundler RPC 客户端。
 * 通过 /api/bundler 代理调用 Alchemy Bundler，不暴露 API key。
 */
import { type Hex, type Address, pad, numberToHex, concat } from 'viem';
import { CONTRACTS } from './constants.js';
import type { UserOperation, GasParams } from './build-userop.js';
import { formatUserOpForRpc } from './build-userop.js';

interface RpcResponse<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
	const res = await fetch('/api/bundler', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ method, params })
	});

	const json: RpcResponse<T> = await res.json();

	if (json.error) {
		throw new Error(json.error.message);
	}

	return json.result as T;
}

// ─── Bundler Methods ───

export async function estimateUserOperationGas(
	userOp: UserOperation
): Promise<{ preVerificationGas: Hex; verificationGasLimit: Hex; callGasLimit: Hex }> {
	return rpc('eth_estimateUserOperationGas', [
		formatUserOpForRpc(userOp),
		CONTRACTS.entryPoint
	]);
}

export async function sendUserOperation(userOp: UserOperation): Promise<Hex> {
	return rpc<Hex>('eth_sendUserOperation', [
		formatUserOpForRpc(userOp),
		CONTRACTS.entryPoint
	]);
}

export async function getUserOperationReceipt(userOpHash: Hex): Promise<{
	userOpHash: Hex;
	success: boolean;
	receipt: { transactionHash: Hex; blockNumber: Hex };
} | null> {
	return rpc('eth_getUserOperationReceipt', [userOpHash]);
}

// ─── Standard RPC Methods ───

export async function isDeployed(address: string): Promise<boolean> {
	const code = await rpc<Hex>('eth_getCode', [address, 'latest']);
	return code !== '0x' && code !== '0x0';
}

export async function getNonce(sender: string, key: bigint = 0n): Promise<bigint> {
	const result = await rpc<Hex>('eth_call', [
		{
			to: CONTRACTS.entryPoint,
			data: concat([
				'0x35567e1a', // getNonce(address,uint192)
				pad(sender as Hex, { size: 32 }),
				pad(numberToHex(key), { size: 32 })
			])
		},
		'latest'
	]);
	return BigInt(result);
}

export async function getGasPrices(): Promise<{
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}> {
	const [baseFee, priorityFee] = await Promise.all([
		rpc<Hex>('eth_gasPrice', []),
		rpc<Hex>('eth_maxPriorityFeePerGas', []).catch(() => '0x5f5e100' as Hex) // 0.1 gwei fallback
	]);

	const baseFeeNum = BigInt(baseFee);
	const priorityFeeNum = BigInt(priorityFee);

	return {
		maxFeePerGas: baseFeeNum + priorityFeeNum,
		maxPriorityFeePerGas: priorityFeeNum
	};
}
