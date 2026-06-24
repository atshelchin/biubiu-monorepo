/**
 * Read (eth_call) execution + decoded-output display helpers.
 */
import { type Address, type Hex } from 'viem';
import type { ParsedMethod } from './types.js';
import { encodeCall, decodeResult } from './encode.js';
import { makeClient, isRetryableRpcError } from './rpc-client.js';

export interface ReadExecResult {
	ok: boolean;
	decoded?: unknown;
	error?: string;
	/** Whether a different RPC might succeed (transport failure vs revert). */
	retryable?: boolean;
}

/** Execute a view/pure call against `address` over a single `rpcUrl`. */
export async function executeRead(
	rpcUrl: string,
	address: Address,
	method: ParsedMethod,
	args: readonly unknown[]
): Promise<ReadExecResult> {
	try {
		const client = makeClient(rpcUrl);
		const data = encodeCall(method, args);
		const res = await client.call({ to: address, data });
		if (method.outputs.length === 0) {
			return { ok: true, decoded: undefined };
		}
		if (!res.data || res.data === '0x') {
			return {
				ok: false,
				retryable: false,
				error: 'Empty response — the call reverted or no contract exists at this address.'
			};
		}
		const decoded = decodeResult(method, res.data as Hex);
		return { ok: true, decoded };
	} catch (e) {
		return { ok: false, error: cleanError(e), retryable: isRetryableRpcError(e) };
	}
}

/**
 * Execute a read across an ordered list of RPCs, returning the first success.
 * A flaky/slow endpoint no longer breaks the read — we fail over to the next
 * one. Deterministic outcomes (reverts) short-circuit instead of retrying.
 */
export async function executeReadWithFailover(
	rpcUrls: string[],
	address: Address,
	method: ParsedMethod,
	args: readonly unknown[]
): Promise<ReadExecResult> {
	const urls = [...new Set(rpcUrls.filter(Boolean))];
	if (urls.length === 0) return { ok: false, error: 'No reachable RPC endpoint.' };
	let last: ReadExecResult = { ok: false, error: 'No reachable RPC endpoint.' };
	for (const url of urls) {
		const res = await executeRead(url, address, method, args);
		if (res.ok || res.retryable === false) return res;
		last = res;
	}
	return last;
}

/** Pull a readable message out of a viem/RPC error. */
export function cleanError(e: unknown): string {
	if (e && typeof e === 'object') {
		const anyE = e as { shortMessage?: string; details?: string; message?: string };
		return anyE.shortMessage || anyE.details || anyE.message || 'Call failed';
	}
	return 'Call failed';
}

/** One displayable output row. */
export interface OutputRow {
	name: string;
	type: string;
	/** Canonical string value (bigints stringified). */
	value: string;
}

/** Normalize a decoded result into per-output rows for display. */
export function toOutputRows(method: ParsedMethod, decoded: unknown): OutputRow[] {
	const outs = method.outputs;
	if (outs.length === 0) return [];
	const values = outs.length === 1 ? [decoded] : (decoded as unknown[]);
	return outs.map((out, i) => ({
		name: out.name || `output ${i}`,
		type: out.type,
		value: stringifyValue(values[i])
	}));
}

/** Stringify any decoded value (handles bigint, arrays, tuples). */
export function stringifyValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		return `[${value.map(stringifyValue).join(', ')}]`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			// viem returns named + positional keys for tuples; keep named only
			.filter(([k]) => !/^\d+$/.test(k));
		return `{ ${entries.map(([k, v]) => `${k}: ${stringifyValue(v)}`).join(', ')} }`;
	}
	return String(value);
}
