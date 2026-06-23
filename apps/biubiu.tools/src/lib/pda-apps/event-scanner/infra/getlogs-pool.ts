/**
 * A vendor pool specialized for `eth_getLogs`.
 *
 * Reality of public RPCs (esp. BSC): many simply don't serve getLogs for active
 * contracts — they return "limit exceeded" (-32005), "not supported", "too many
 * requests", or empty — *regardless of range*. Others work fine. So the only
 * robust strategy is **fail over aggressively**: when an RPC can't serve a call,
 * the Pool tries the next one and briefly freezes the bad one (so it stops being
 * picked). We deliberately do NOT mark size errors as non-retryable LOGIC_ERRORs
 * — that would prevent failover and strand us on a dead RPC. The adaptive-chunk
 * layer independently shrinks the block range on any failure, which covers the
 * genuinely-too-large case. Bad RPCs get frozen out; good RPCs serve the logs.
 */
import type { Chain } from 'viem';
import { Pool } from '@shelchin/vendor-pool';
import { EVMVendor, type EVMCall } from '$lib/evm/evm-vendor';

/** Phrases that mean "you're being rate-limited". */
const RATE_LIMIT_PHRASES = ['rate limit', 'too many request', '429'];

/** Phrases that mean "this getLogs block range / result set is too big". */
const OVERFLOW_PHRASES = [
	'query returned more than',
	'returned more than',
	'more than 10000',
	'too many results',
	'range too large',
	'too wide',
	'block range',
	'blocks range',
	'is limited to',
	'limited to',
	'exceed maximum block range',
	'response size exceeded',
	'response size too large',
	'log response size',
	'limit exceeded',
	'request entity too large',
];

function errorText(error: unknown): string {
	if (!(error instanceof Error)) return String(error).toLowerCase();
	const parts = [error.message];
	const e = error as Error & { details?: string; shortMessage?: string; cause?: unknown };
	if (e.details) parts.push(e.details);
	if (e.shortMessage) parts.push(e.shortMessage);
	if (e.cause instanceof Error) parts.push(e.cause.message);
	else if (typeof e.cause === 'string') parts.push(e.cause);
	return parts.join(' ').toLowerCase();
}

/** Walk a viem error chain for the underlying JSON-RPC numeric code. */
function rpcCode(error: unknown): number | undefined {
	let e: unknown = error;
	for (let i = 0; i < 8 && e && typeof e === 'object'; i++) {
		const code = (e as { code?: unknown }).code;
		if (typeof code === 'number') return code;
		e = (e as { cause?: unknown }).cause;
	}
	return undefined;
}

export function isRateLimit(error: unknown): boolean {
	if (rpcCode(error) === 429) return true;
	const text = errorText(error);
	return RATE_LIMIT_PHRASES.some((p) => text.includes(p));
}

/** Whether an error means the getLogs range/result set was too big. */
export function isRangeOverflow(error: unknown): boolean {
	if (isRateLimit(error)) return false;
	if (rpcCode(error) === -32005) return true;
	const text = errorText(error);
	return OVERFLOW_PHRASES.some((p) => text.includes(p));
}

/**
 * getLogs pool: equal-weighted vendors (so one bad RPC at index 0 doesn't get
 * picked 3×), aggressive failover, and SHORT freezes so a good RPC that hiccuped
 * on a too-large range recovers within a few seconds.
 */
export function createGetLogsPools<TResult>(
	networks: Record<string, { chainId: number; rpcs: string[] }>,
	chainMap: Record<number, Chain>,
): Map<string, Pool<EVMCall<TResult>, TResult>> {
	const pools = new Map<string, Pool<EVMCall<TResult>, TResult>>();

	for (const [networkName, config] of Object.entries(networks)) {
		const chain = chainMap[config.chainId];
		if (!chain) continue;

		const vendors = config.rpcs.map(
			(rpc, idx) => new EVMVendor<TResult>(`${networkName}-getlogs-${idx}`, rpc, chain, 1),
		);

		pools.set(
			networkName,
			new Pool<EVMCall<TResult>, TResult>(vendors, {
				maxRetries: Math.max(10, vendors.length * 3),
				maxConsecutiveFailures: Math.max(10, vendors.length * 3),
				timeout: 25000,
				// Short freezes: a good-but-range-limited RPC that errored on a too-big
				// range must recover fast enough to serve the smaller split-retry.
				softFreezeDuration: [800, 1500],
				hardFreezeDuration: [1500, 3000],
			}),
		);
	}

	return pools;
}
