/**
 * CREATE2 address prediction utilities.
 *
 * Uses the standard CREATE2 proxy at 0x4e59b44847b379578588920cA78FbF26c0B4956C.
 * predicted = keccak256(0xff || proxy || salt || keccak256(initcode))
 */
import {
	type Hex,
	keccak256,
	concat,
	encodeAbiParameters,
	getAddress
} from 'viem';
import type { AbiInput } from './types.js';

export const CREATE2_PROXY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const;

/**
 * Encode constructor arguments and append to bytecode to form initcode.
 * Returns null if encoding fails (invalid args).
 */
export function buildInitCode(
	bytecode: Hex,
	constructorInputs: readonly AbiInput[],
	argValues: string[]
): Hex | null {
	if (!constructorInputs.length) return bytecode;

	try {
		const types = constructorInputs.map((inp) => ({ type: inp.type }));
		const values = constructorInputs.map((inp, i) => {
			const raw = argValues[i] ?? '';
			return parseArgValue(inp.type, raw);
		});

		const encoded = encodeAbiParameters(types, values);
		return (bytecode + encoded.slice(2)) as Hex;
	} catch {
		return null;
	}
}

/**
 * Parse a string argument value into the correct JS type for ABI encoding.
 */
function parseArgValue(type: string, raw: string): unknown {
	if (type.startsWith('uint') || type.startsWith('int')) {
		return BigInt(raw);
	}
	if (type === 'bool') {
		return raw.toLowerCase() === 'true' || raw === '1';
	}
	if (type.endsWith('[]')) {
		// Array type: try JSON parse
		const parsed = JSON.parse(raw);
		const baseType = type.slice(0, -2);
		return (parsed as unknown[]).map((v) => parseArgValue(baseType, String(v)));
	}
	if (type === 'bytes' || type.startsWith('bytes')) {
		return raw as Hex;
	}
	// address, string, etc.
	return raw;
}

/**
 * Predict CREATE2 deployment address.
 * Returns checksummed address or null if inputs are invalid.
 */
export function predictCreate2Address(salt: Hex, initCode: Hex): string | null {
	if (salt.length !== 66) return null;
	if (!initCode || initCode === '0x') return null;

	try {
		const initCodeHash = keccak256(initCode);
		const hash = keccak256(concat(['0xff', CREATE2_PROXY, salt, initCodeHash]));
		const rawAddr = '0x' + hash.slice(26);
		return getAddress(rawAddr);
	} catch {
		return null;
	}
}
