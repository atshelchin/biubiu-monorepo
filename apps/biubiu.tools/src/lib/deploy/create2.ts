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

/** A CREATE2 salt must be exactly 0x + 64 hex chars (32 bytes). */
const SALT_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * True only for a well-formed 32-byte hex salt.
 *
 * NOTE: a length-only check (salt.length === 66) is NOT sufficient — viem's
 * keccak256/concat do NOT throw on invalid-hex input, so a salt like
 * `0xZZ00…00` (66 chars, non-hex) would yield a confident-but-WRONG predicted
 * CREATE2 address and corrupt the deploy calldata. Always gate on this.
 */
export function isValidSalt(s: string): s is Hex {
	return SALT_RE.test(s);
}

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
	if (type.endsWith('[]')) {
		// Array type: try JSON parse. Must be checked BEFORE the scalar
		// branches — `uint256[]`.startsWith('uint') is true, so otherwise a
		// numeric array would be sent to BigInt() and throw.
		const parsed = JSON.parse(raw);
		const baseType = type.slice(0, -2);
		return (parsed as unknown[]).map((v) => parseArgValue(baseType, String(v)));
	}
	if (type.startsWith('uint') || type.startsWith('int')) {
		return BigInt(raw);
	}
	if (type === 'bool') {
		return raw.toLowerCase() === 'true' || raw === '1';
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
	if (!isValidSalt(salt)) return null;
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
