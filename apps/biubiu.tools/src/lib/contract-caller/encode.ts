/**
 * Function-call encoding/decoding helpers (shared by reads, writes, batch, chain).
 */
import { type Hex, encodeFunctionData, decodeFunctionResult } from 'viem';
import type { ParsedMethod } from './types.js';
import { coerceValue } from './format.js';
import { getComponents } from './abi.js';

export interface BuildArgsResult {
	ok: boolean;
	args?: readonly unknown[];
	error?: string;
	/** Index of the param that failed (for inline highlighting). */
	failedIndex?: number;
}

/** Coerce every raw param string into the JS value viem expects. */
export function buildArgs(method: ParsedMethod, rawValues: string[]): BuildArgsResult {
	const args: unknown[] = [];
	for (let i = 0; i < method.inputs.length; i++) {
		const input = method.inputs[i];
		try {
			args.push(coerceValue(input.type, getComponents(input), rawValues[i] ?? ''));
		} catch (e) {
			return {
				ok: false,
				failedIndex: i,
				error: `${input.name || `arg ${i}`}: ${e instanceof Error ? e.message : 'invalid'}`
			};
		}
	}
	return { ok: true, args };
}

/** ABI-encode a call to `method` with already-coerced args. */
export function encodeCall(method: ParsedMethod, args: readonly unknown[]): Hex {
	return encodeFunctionData({
		abi: [method.abiItem],
		functionName: method.abiItem.name,
		args: args as never
	});
}

/** Decode the return data of a call to `method`. */
export function decodeResult(method: ParsedMethod, data: Hex): unknown {
	return decodeFunctionResult({
		abi: [method.abiItem],
		functionName: method.abiItem.name,
		data
	});
}
