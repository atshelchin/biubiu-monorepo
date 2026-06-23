/**
 * Adaptive block-range scanner for one job.
 *
 * Public RPCs cap getLogs differently and inconsistently (block span, result
 * count, archive depth, "is limited to 50 blocks", …) and some are just dead for
 * getLogs. Strategy:
 *   - On a too-large/failed range, halve the span and retry; the span ceiling
 *     only ratchets DOWN, so we don't thrash back into the same wall.
 *   - When every RPC is momentarily frozen (the pool failed them all over), WAIT
 *     briefly and retry the SAME range — shrinking helps nothing if nothing is
 *     available. Bounded so we never hang.
 *   - A single block no RPC will serve (after the pool's retries + failover) is
 *     skipped, not fatal. A job never dies on "all vendors exhausted".
 *   - Only a *genuine size overflow* (recognised even through the pool's
 *     EscalationError wrapper) lowers the shared ceiling, so a transient blip
 *     can't permanently shrink the span for every later job.
 */
import type { Pool } from '@shelchin/vendor-pool';
import { EscalationError, NoVendorAvailableError } from '@shelchin/vendor-pool';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { RawLog, ScanJob } from '../types.js';
import { createGetLogsCall } from './getlogs-call.js';
import { isRangeOverflow } from './getlogs-pool.js';

export interface AbortableCtx {
	signal: AbortSignal;
}

export interface AdaptiveOptions {
	onBlocksSkipped?: (fromBlock: number, toBlock: number) => void;
	onCeiling?: (span: number) => void;
}

function isAbort(err: unknown, ctx: AbortableCtx): boolean {
	return ctx.signal.aborted || (err instanceof Error && err.message === 'Aborted');
}

/** Range overflow — also unwrap the pool's EscalationError to find the real cause. */
function looksLikeOverflow(err: unknown): boolean {
	if (isRangeOverflow(err)) return true;
	if (err instanceof EscalationError) return isRangeOverflow(err.context?.lastError);
	return false;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const id = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(id);
			resolve();
		}, { once: true });
	});
}

export async function scanRangeAdaptive(
	pool: Pool<EVMCall<RawLog[]>, RawLog[]>,
	job: ScanJob,
	ctx: AbortableCtx,
	startSpan: number,
	opts: AdaptiveOptions = {},
): Promise<RawLog[]> {
	const out: RawLog[] = [];
	let cursor = job.fromBlock;
	let ceiling = Math.max(1, Math.min(startSpan, job.chunkSize));
	let span = ceiling;
	let frozenWaits = 0;

	while (cursor <= job.toBlock) {
		if (ctx.signal.aborted) throw new Error('Aborted');

		const end = Math.min(cursor + span - 1, job.toBlock);
		try {
			const { result } = await pool.do(
				createGetLogsCall({
					contract: job.contract,
					topics: job.topics,
					fromBlock: cursor,
					toBlock: end,
				}),
			);
			out.push(...result);
			cursor = end + 1;
			frozenWaits = 0;
			if (span < ceiling) span = Math.min(span * 2, ceiling);
		} catch (err) {
			if (isAbort(err, ctx)) throw err;

			// Every RPC is momentarily frozen — wait briefly and retry the SAME range.
			if (err instanceof NoVendorAvailableError && frozenWaits < 8) {
				frozenWaits++;
				await sleep(800, ctx.signal);
				continue;
			}
			frozenWaits = 0;

			const width = end - cursor + 1;
			if (width > 1) {
				ceiling = Math.max(1, Math.floor(width / 2));
				span = ceiling;
				// Only a genuine size limit teaches the shared ceiling.
				if (looksLikeOverflow(err)) opts.onCeiling?.(ceiling);
				continue;
			}
			// One block no RPC will serve → skip (don't fail the whole job).
			opts.onBlocksSkipped?.(cursor, cursor);
			cursor += 1;
			span = Math.max(1, ceiling);
		}
	}

	return out;
}
