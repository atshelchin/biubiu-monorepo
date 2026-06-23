/**
 * Small tx helpers shared by the upgrade / deploy / revoke layers.
 */
import { type Hex } from 'viem';
import { makePublicClient } from './viem-chain.js';
import type { SweepNetwork } from '../types.js';

export async function waitForReceipt(
	network: SweepNetwork,
	rpcUrl: string,
	hash: Hex,
	timeoutMs = 120_000,
) {
	const client = makePublicClient(network, rpcUrl);
	return client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
}

/** Chunk an array into groups of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
