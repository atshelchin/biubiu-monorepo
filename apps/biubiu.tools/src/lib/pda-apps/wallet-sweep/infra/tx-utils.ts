/**
 * Small tx helpers shared by the upgrade / deploy / revoke layers.
 */
import { type Hex } from 'viem';
import { makePublicClient } from './viem-chain.js';
import type { SweepNetwork } from '../types.js';

export async function waitForReceipt(
	network: SweepNetwork,
	rpcs: string[],
	hash: Hex,
	timeoutMs = 120_000,
) {
	const client = makePublicClient(network, rpcs);
	return client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
}

/** Chunk an array into groups of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/**
 * Concurrency-limited map — runs `fn` over `items` with at most `limit` in
 * flight at once. Prevents firing 1000 per-account RPC calls (getCode, nonce)
 * simultaneously, which would trigger rate limits.
 */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const worker = async () => {
		while (cursor < items.length) {
			const i = cursor++;
			results[i] = await fn(items[i], i);
		}
	};
	const n = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: n }, () => worker()));
	return results;
}
