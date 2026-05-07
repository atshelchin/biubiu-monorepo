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

/**
 * 模拟 handleOps 调用，用于调试签名错误。
 * 通过 eth_call 模拟，解析 revert 数据获取详细错误。
 */
export async function simulateHandleOps(userOp: UserOperation, network: string): Promise<void> {
	const formatted = formatUserOpForRpc(userOp);

	// 构建 handleOps calldata
	// handleOps(PackedUserOperation[] ops, address payable beneficiary)
	// 但 eth_call 不支持直接调 handleOps（需要 bundler context）
	// 改用 pimlico_sendUserOperation 的错误详情
	const result = await rpc<string>('eth_sendUserOperation', [formatted, CONTRACTS.entryPoint], network);
	console.log('[simulate] sendUserOperation result:', result);
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
	// Fetch both Pimlico gas price and chain RPC gas price in parallel
	const [pimlicoResult, rpcGasPrice] = await Promise.all([
		rpc<{
			slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
			standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
			fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
		}>('pimlico_getUserOperationGasPrice', [], network).catch(() => null),
		rpc<Hex>('eth_gasPrice', [], network).catch(() => null)
	]);

	if (pimlicoResult) {
		// Use Pimlico's fast tier — this is the bundler's required minimum
		// The deploy UI separately fetches cheaper prices for display,
		// but sendContractCall must respect bundler minimums
		return {
			maxFeePerGas: BigInt(pimlicoResult.fast.maxFeePerGas),
			maxPriorityFeePerGas: BigInt(pimlicoResult.fast.maxPriorityFeePerGas)
		};
	}

	// Fallback to RPC
	const priorityFee = await rpc<Hex>('eth_maxPriorityFeePerGas', [], network).catch(() => '0x5f5e100' as Hex);
	const baseFee = rpcGasPrice ? BigInt(rpcGasPrice) : 0n;

	return {
		maxFeePerGas: baseFee + BigInt(priorityFee),
		maxPriorityFeePerGas: BigInt(priorityFee)
	};
}

