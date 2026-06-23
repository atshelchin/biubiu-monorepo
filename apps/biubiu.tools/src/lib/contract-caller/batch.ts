/**
 * Batch helpers: Safe 1.4.1 MultiSend encoding + Safe{Wallet} Transaction
 * Builder JSON export.
 *
 * A batch is executed as a single Safe transaction: the Safe delegatecalls into
 * MultiSend, which performs each sub-call. Reuses the canonical MultiSend 1.4.1
 * address from the existing wallet code.
 */
import { type Address, type Hex, encodeFunctionData, concat } from 'viem';
import { CONTRACTS } from '$lib/auth/compute-safe-address.js';
import type { QueuedCall } from './types.js';

export const MULTISEND_ADDRESS = CONTRACTS.multiSend as Address;

const MULTISEND_ABI = [
	{
		type: 'function',
		name: 'multiSend',
		stateMutability: 'payable',
		inputs: [{ name: 'transactions', type: 'bytes' }],
		outputs: []
	}
] as const;

/**
 * Encode one sub-transaction in MultiSend packed form:
 * operation(1) ‖ to(20) ‖ value(32) ‖ dataLength(32) ‖ data.
 */
export function encodeMultiSendTx(to: Address, value: bigint, data: Hex, operation = 0): Hex {
	const op = operation.toString(16).padStart(2, '0');
	const toBytes = to.toLowerCase().replace(/^0x/, '').padStart(40, '0');
	const valueBytes = value.toString(16).padStart(64, '0');
	const dataBytes = data === '0x' ? '' : data.replace(/^0x/, '');
	const dataLength = (dataBytes.length / 2).toString(16).padStart(64, '0');
	return `0x${op}${toBytes}${valueBytes}${dataLength}${dataBytes}` as Hex;
}

/** Concatenate queued calls into the packed MultiSend `transactions` blob. */
export function packMultiSend(calls: QueuedCall[]): Hex {
	return concat(calls.map((c) => encodeMultiSendTx(c.to, c.value, c.data, 0)));
}

/** Encode the `multiSend(bytes)` call that the Safe will delegatecall into. */
export function encodeMultiSendCall(calls: QueuedCall[]): Hex {
	return encodeFunctionData({
		abi: MULTISEND_ABI,
		functionName: 'multiSend',
		args: [packMultiSend(calls)]
	});
}

/** Total native value across a batch (sent from the Safe's balance per sub-call). */
export function totalBatchValue(calls: QueuedCall[]): bigint {
	return calls.reduce((sum, c) => sum + c.value, 0n);
}

/**
 * Build a Safe{Wallet} Transaction Builder import file for the batch, so it can
 * be executed from any Safe (incl. on chains the in-app wallet doesn't support).
 */
export function buildSafeBatchJson(
	chainId: number,
	calls: QueuedCall[],
	createdAt: number
): Record<string, unknown> {
	return {
		version: '1.0',
		chainId: String(chainId),
		createdAt,
		meta: {
			name: 'Contract Caller batch',
			description: `${calls.length} transaction${calls.length === 1 ? '' : 's'}`,
			txBuilderVersion: '1.16.5'
		},
		transactions: calls.map((c) => ({
			to: c.to,
			value: c.value.toString(),
			data: c.data,
			contractMethod: null,
			contractInputsValues: null
		}))
	};
}
