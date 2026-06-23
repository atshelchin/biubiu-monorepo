/**
 * ABI parsing + method extraction.
 *
 * Accepts either a JSON ABI (array, or a Hardhat/Foundry artifact `{ abi: [...] }`)
 * or a newline-separated list of human-readable signatures (parsed by viem `parseAbi`).
 */
import {
	type Abi,
	type AbiFunction,
	parseAbi,
	toFunctionSelector,
	toFunctionSignature
} from 'viem';
import type { AbiParameter } from 'viem';
import type { ParsedMethod, StateMutability } from './types.js';

/** Safely read tuple `components` off an AbiParameter (only tuple variants have it). */
export function getComponents(p: AbiParameter): readonly AbiParameter[] | undefined {
	return (p as { components?: readonly AbiParameter[] }).components;
}

export interface ParseAbiResult {
	ok: boolean;
	abi?: Abi;
	methods?: ParsedMethod[];
	error?: string;
}

/** Parse raw ABI text into a viem Abi + enriched method list. */
export function parseAbiInput(input: string): ParseAbiResult {
	const trimmed = input.trim();
	if (!trimmed) return { ok: false, error: 'ABI is empty' };

	let abi: Abi;
	try {
		if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
			const json = JSON.parse(trimmed);
			// Support raw array, artifact { abi: [...] }, or { result: "..." } (etherscan)
			const candidate = Array.isArray(json)
				? json
				: Array.isArray(json.abi)
					? json.abi
					: typeof json.result === 'string'
						? JSON.parse(json.result)
						: null;
			if (!Array.isArray(candidate)) {
				return { ok: false, error: 'JSON does not contain an ABI array' };
			}
			abi = candidate as Abi;
		} else {
			const lines = trimmed
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l && !l.startsWith('//'));
			abi = parseAbi(lines) as Abi;
		}
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Failed to parse ABI' };
	}

	const methods = extractMethods(abi);
	if (methods.length === 0) {
		return { ok: false, error: 'No callable functions found in this ABI' };
	}
	return { ok: true, abi, methods };
}

/** Pull all `function` entries out of an ABI and enrich them. */
export function extractMethods(abi: Abi): ParsedMethod[] {
	// Keep only fully-formed functions. WhatsABI emits selector-only entries
	// (no `name`/`inputs`) for 4-byte selectors it couldn't resolve — those
	// aren't callable, so we drop them rather than crash on encoding.
	const fns = abi.filter(
		(item): item is AbiFunction =>
			item.type === 'function' &&
			typeof (item as { name?: unknown }).name === 'string' &&
			(item as { name: string }).name.length > 0 &&
			Array.isArray((item as { inputs?: unknown }).inputs)
	);

	const methods = fns.map((fn): ParsedMethod => {
		const stateMutability = (fn.stateMutability ?? 'nonpayable') as StateMutability;
		let signature = `${fn.name}(${fn.inputs.map((i) => i.type).join(',')})`;
		let selector = '0x';
		try {
			signature = toFunctionSignature(fn);
			selector = toFunctionSelector(fn);
		} catch {
			/* keep fallback signature */
		}
		const isRead = stateMutability === 'view' || stateMutability === 'pure';
		return {
			name: fn.name,
			signature,
			selector,
			stateMutability,
			isRead,
			payable: stateMutability === 'payable',
			inputs: fn.inputs,
			outputs: fn.outputs,
			abiItem: fn
		};
	});

	// Read methods first, then writes; alphabetical within each group.
	return methods.sort((a, b) => {
		if (a.isRead !== b.isRead) return a.isRead ? -1 : 1;
		return a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature);
	});
}

/**
 * Whether a type occupies a single static 32-byte word (so its value lives
 * directly in the calldata/returndata head). Only these can be chained on-chain
 * by ChainedMultiSend's word-splice mechanism.
 */
export function isStaticWordType(type: string): boolean {
	if (type.endsWith(']')) return false; // arrays (incl. fixed) — keep simple
	if (type.startsWith('tuple')) return false;
	if (type === 'bytes' || type === 'string') return false; // dynamic
	if (type.startsWith('uint') || type.startsWith('int')) return true;
	if (type === 'address' || type === 'bool') return true;
	if (/^bytes([1-9]|[12][0-9]|3[0-2])$/.test(type)) return true; // bytes1..32
	return false;
}

/** Static output words of a method, for choosing a chain reference source. */
export function staticOutputSlots(method: ParsedMethod): { slot: number; label: string }[] {
	return method.outputs
		.map((o, i) => ({ slot: i, type: o.type, name: o.name }))
		.filter((o) => isStaticWordType(o.type))
		.map((o) => ({ slot: o.slot, label: `out[${o.slot}] ${o.name || o.type}` }));
}

/** A short human label for a parameter type, e.g. `uint256` → "number", `address` → "address". */
export function typeCategory(
	type: string
): 'uint' | 'int' | 'address' | 'bool' | 'bytes' | 'string' | 'array' | 'tuple' | 'other' {
	if (type.endsWith(']')) return 'array';
	if (type.startsWith('tuple')) return 'tuple';
	if (type.startsWith('uint')) return 'uint';
	if (type.startsWith('int')) return 'int';
	if (type === 'address') return 'address';
	if (type === 'bool') return 'bool';
	if (type === 'bytes' || /^bytes\d+$/.test(type)) return 'bytes';
	if (type === 'string') return 'string';
	return 'other';
}
