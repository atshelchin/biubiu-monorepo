/**
 * Bundler RPC 客户端（多网络）。
 * 通过 /api/bundler 代理，前端传 network 参数。
 */
import { type Hex, pad, numberToHex, concat } from 'viem';
import { CONTRACTS } from './constants.js';
import type { UserOperation } from './build-userop.js';
import { formatUserOpForRpc } from './build-userop.js';

interface RpcResponse<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

async function rpc<T>(method: string, params: unknown[], network: string): Promise<T> {
	const res = await fetch('/api/bundler', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ method, params, network })
	});

	const json: RpcResponse<T> = await res.json();
	if (json.error) {
		throw new Error(json.error.message);
	}
	return json.result as T;
}

export async function estimateUserOperationGas(
	userOp: UserOperation,
	network: string
): Promise<{ preVerificationGas: Hex; verificationGasLimit: Hex; callGasLimit: Hex }> {
	return rpc('eth_estimateUserOperationGas', [formatUserOpForRpc(userOp), CONTRACTS.entryPoint], network);
}

export async function sendUserOperation(userOp: UserOperation, network: string): Promise<Hex> {
	return rpc<Hex>('eth_sendUserOperation', [formatUserOpForRpc(userOp), CONTRACTS.entryPoint], network);
}

export async function getUserOperationReceipt(
	userOpHash: Hex,
	network: string
): Promise<{
	userOpHash: Hex;
	success: boolean;
	receipt: { transactionHash: Hex; blockNumber: Hex };
} | null> {
	return rpc('eth_getUserOperationReceipt', [userOpHash], network);
}

export async function isDeployed(address: string, network: string): Promise<boolean> {
	const code = await rpc<Hex>('eth_getCode', [address, 'latest'], network);
	return code !== '0x' && code !== '0x0';
}

export async function getNonce(sender: string, network: string, key: bigint = 0n): Promise<bigint> {
	const result = await rpc<Hex>(
		'eth_call',
		[
			{
				to: CONTRACTS.entryPoint,
				data: concat([
					'0x35567e1a',
					pad(sender as Hex, { size: 32 }),
					pad(numberToHex(key), { size: 32 })
				])
			},
			'latest'
		],
		network
	);
	return BigInt(result);
}

export async function getGasPrices(network: string): Promise<{
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}> {
	// 优先用 Pimlico 的 gas price API
	try {
		const pimlicoGas = await rpc<{
			slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
			standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
			fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
		}>('pimlico_getUserOperationGasPrice', [], network);

		return {
			maxFeePerGas: BigInt(pimlicoGas.fast.maxFeePerGas),
			maxPriorityFeePerGas: BigInt(pimlicoGas.fast.maxPriorityFeePerGas)
		};
	} catch {
		// 回退到标准 RPC
		const [baseFee, priorityFee] = await Promise.all([
			rpc<Hex>('eth_gasPrice', [], network),
			rpc<Hex>('eth_maxPriorityFeePerGas', [], network).catch(() => '0x5f5e100' as Hex)
		]);

		return {
			maxFeePerGas: BigInt(baseFee) + BigInt(priorityFee),
			maxPriorityFeePerGas: BigInt(priorityFee)
		};
	}
}
