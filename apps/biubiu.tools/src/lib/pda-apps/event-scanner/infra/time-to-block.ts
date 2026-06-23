/**
 * Time → block resolution. Users think in dates ("last 7 days"); getLogs needs
 * block numbers.
 *
 * A full binary search over the whole chain height is ~log2(height) ≈ 27 RPC
 * calls per boundary. Instead we estimate the block from the chain's *average
 * block time* (2 anchor calls) and refine with a few Newton steps — ~5 calls for
 * "last N days", ~8 for a date range. A scan boundary doesn't need to be exact,
 * so we add a small safety margin so we never clip the very edge of the window.
 */
import type { Pool } from '@shelchin/vendor-pool';
import type { PublicClient } from 'viem';
import type { EVMCall } from '$lib/evm/evm-vendor';

interface BlockTs {
	number: number;
	timestamp: number;
}

const MAX_REFINE = 4;
const TOLERANCE = 3; // blocks — close enough for a scan boundary
const SAFETY_MARGIN = 75; // widen each side a little so we never miss the edge

function latestBlockCall(): EVMCall<BlockTs> {
	return {
		execute: async (client: PublicClient) => {
			const b = await client.getBlock({ blockTag: 'latest' });
			return { number: Number(b.number), timestamp: Number(b.timestamp) };
		},
	};
}

function blockTsCall(n: number): EVMCall<BlockTs> {
	return {
		execute: async (client: PublicClient) => {
			const b = await client.getBlock({ blockNumber: BigInt(n) });
			return { number: Number(b.number), timestamp: Number(b.timestamp) };
		},
	};
}

export type RangeSelection =
	| { kind: 'lastNDays'; days: number; nowMs: number }
	| { kind: 'dates'; fromMs: number; toMs: number; nowMs: number };

export interface ResolvedRange {
	fromBlock: number;
	toBlock: number;
	latest: number;
}

/** Resolve a human range selection into concrete block numbers (few RPC calls). */
export async function resolveBlockRange<T>(
	pool: Pool<EVMCall<T>, T>,
	sel: RangeSelection,
): Promise<ResolvedRange> {
	const lp = pool as unknown as Pool<EVMCall<BlockTs>, BlockTs>;
	const cache = new Map<number, number>();

	const tsAt = async (n: number): Promise<number> => {
		const cached = cache.get(n);
		if (cached !== undefined) return cached;
		const { result } = await lp.do(blockTsCall(n));
		cache.set(n, result.timestamp);
		return result.timestamp;
	};

	// 1 call: head. 1 call: an anchor ~100k blocks back → average block time.
	const latest = (await lp.do(latestBlockCall())).result;
	cache.set(latest.number, latest.timestamp);
	const anchorN = Math.max(0, latest.number - Math.min(latest.number, 100_000));
	const anchorTs = await tsAt(anchorN);
	const span = latest.number - anchorN;
	const avgBlock = span > 0 ? Math.max(0.05, (latest.timestamp - anchorTs) / span) : 12;

	/** Estimate the block at `targetSec` via avg block time + a few Newton probes. */
	const estimateBlock = async (targetSec: number): Promise<number> => {
		if (targetSec >= latest.timestamp) return latest.number;
		let guess = Math.min(
			latest.number,
			Math.max(0, Math.round(latest.number - (latest.timestamp - targetSec) / avgBlock)),
		);
		for (let k = 0; k < MAX_REFINE; k++) {
			const ts = await tsAt(guess);
			const diff = Math.round((targetSec - ts) / avgBlock);
			if (Math.abs(diff) <= TOLERANCE) break;
			const next = Math.min(latest.number, Math.max(0, guess + diff));
			if (next === guess) break;
			guess = next;
		}
		return guess;
	};

	if (sel.kind === 'lastNDays') {
		const targetSec = Math.floor(sel.nowMs / 1000) - sel.days * 86400;
		const est = await estimateBlock(targetSec);
		return { fromBlock: Math.max(0, est - SAFETY_MARGIN), toBlock: latest.number, latest: latest.number };
	}

	const fromSec = Math.floor(sel.fromMs / 1000);
	const toSec = Math.floor(sel.toMs / 1000);
	const fromEst = await estimateBlock(fromSec);
	const toEst = toSec >= latest.timestamp ? latest.number : await estimateBlock(toSec);
	const fromBlock = Math.max(0, fromEst - SAFETY_MARGIN);
	const toBlock = Math.min(latest.number, toEst + SAFETY_MARGIN);
	return { fromBlock: Math.min(fromBlock, toBlock), toBlock, latest: latest.number };
}

/** Read the current head block number (for live-tail). */
export async function getLatestBlock<T>(pool: Pool<EVMCall<T>, T>): Promise<number> {
	const lp = pool as unknown as Pool<EVMCall<BlockTs>, BlockTs>;
	return (await lp.do(latestBlockCall())).result.number;
}
