/**
 * Direct-fetch chain RPC client with multi-endpoint failover.
 *
 * Replaces the server `/api/bundler` proxy's RPC half: the browser now calls chain
 * RPCs directly (every default endpoint in wallet/infra/chains.ts is CORS-open —
 * verified live). A lean port of vela-wallet `services/rpc-pool.ts`: per-chain
 * candidate list (user override > provider key > public default), in-memory latency
 * + failure scoring, failover to the next endpoint, one retry pass.
 */

import type { Hex } from 'viem';
import { chainInfo } from './chains.js';
import { getNetworkConfig, getProviderKeys } from './endpoints.js';
import { PROVIDER_ORDER, buildProviderRpcUrl } from './providers.js';

interface RpcResponse<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

/** A JSON-RPC error returned by a reachable node (revert / bad params / range limit).
 *  This is the node's authoritative answer, so it propagates — we do NOT failover. */
export class RpcError extends Error {
	constructor(
		message: string,
		readonly code?: number
	) {
		super(message);
		this.name = 'RpcError';
	}
}

type Source = 'user' | 'provider' | 'public';
const SOURCE_PRIORITY: Record<Source, number> = { user: 3000, provider: 2000, public: 1000 };

interface EndpointStat {
	avgLatencyMs: number;
	consecutiveFailures: number;
	lastFailureAt: number;
}
const stats = new Map<string, EndpointStat>();

function stat(url: string): EndpointStat {
	let s = stats.get(url);
	if (!s) {
		s = { avgLatencyMs: 0, consecutiveFailures: 0, lastFailureAt: 0 };
		stats.set(url, s);
	}
	return s;
}

function recordSuccess(url: string, ms: number): void {
	const s = stat(url);
	s.avgLatencyMs = s.avgLatencyMs === 0 ? ms : Math.round(s.avgLatencyMs * 0.7 + ms * 0.3);
	s.consecutiveFailures = 0;
}

function recordFailure(url: string): void {
	const s = stat(url);
	s.consecutiveFailures += 1;
	s.lastFailureAt = Date.now();
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Ordered, deduped RPC candidates for a chain: user override > provider keys > public. */
function collectRpcUrls(chainId: number): { url: string; source: Source }[] {
	const out: { url: string; source: Source }[] = [];
	const seen = new Set<string>();
	const add = (url: string | undefined, source: Source) => {
		if (!url || seen.has(url)) return;
		seen.add(url);
		out.push({ url, source });
	};

	add(getNetworkConfig(chainId)?.rpcURL, 'user');

	const keys = getProviderKeys();
	for (const id of PROVIDER_ORDER) {
		const key = keys[id];
		if (key) add(buildProviderRpcUrl(id, chainId, key), 'provider');
	}

	for (const url of chainInfo(chainId)?.rpcUrls ?? []) add(url, 'public');
	return out;
}

/** Score a candidate: higher is better. Source priority − latency − failure cooldown. */
function score(url: string, source: Source): number {
	const s = stat(url);
	let v = SOURCE_PRIORITY[source];
	if (s.avgLatencyMs > 200) v -= Math.min((s.avgLatencyMs - 200) / 10, 200);
	if (s.consecutiveFailures > 0) {
		const cooldown = Math.min(15_000 * 2 ** (s.consecutiveFailures - 1), 120_000);
		v -= Date.now() - s.lastFailureAt < cooldown ? 50_000 : s.consecutiveFailures * 200;
	}
	return v;
}

function sortedEndpoints(chainId: number): { url: string; source: Source }[] {
	return collectRpcUrls(chainId).sort((a, b) => score(b.url, b.source) - score(a.url, a.source));
}

/**
 * Resolve the ordered RPC URL list for a chain (user override > provider key >
 * built-in public), with caller-supplied `fallback` appended (deduped). Lets other
 * tools (token-sender / wallet-sweep) keep their viem clients while honouring the
 * shared service-node settings — and still works for chains not in the table
 * (returns just the fallback).
 */
export function resolveRpcUrls(chainId: number, fallback: string[] = []): string[] {
	const collected = collectRpcUrls(chainId).map((e) => e.url);
	return [...new Set([...collected, ...fallback])];
}

/** Single attempt. Throws RpcError on a JSON-RPC error, plain Error on transport failure. */
async function tryEndpoint<T>(url: string, method: string, params: unknown[]): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = (await res.json()) as RpcResponse<T>;
		if (!json || typeof json !== 'object') throw new Error('Invalid response');
		if (json.error) throw new RpcError(json.error.message, json.error.code);
		return json.result as T;
	} finally {
		clearTimeout(timer);
	}
}

/** url -> reported chainId (probed once via eth_chainId), to skip wrong-chain endpoints. */
const chainIdCache = new Map<string, number>();

/**
 * Does `url` actually serve `chainId`? Probes eth_chainId once and caches. Returns
 * true on a transport failure (can't determine — don't exclude on a network blip);
 * returns false only when the endpoint affirmatively reports a DIFFERENT chain.
 */
async function reportsChain(url: string, chainId: number): Promise<boolean> {
	const cached = chainIdCache.get(url);
	if (cached !== undefined) return cached === chainId;
	try {
		const hex = await tryEndpoint<Hex>(url, 'eth_chainId', []);
		const got = Number(BigInt(hex));
		chainIdCache.set(url, got);
		return got === chainId;
	} catch {
		return true;
	}
}

/** JSON-RPC call against a chain's best available endpoint, with transport failover. */
export async function rpcCall<T>(method: string, params: unknown[], chainId: number, retried = false): Promise<T> {
	const endpoints = sortedEndpoints(chainId);
	if (endpoints.length === 0) throw new Error(`No RPC endpoint configured for chain ${chainId}`);

	for (const ep of endpoints) {
		// A user-supplied RPC override is the only untrusted source that could point at
		// the WRONG chain (built-in public + provider URLs are chain-correct by
		// construction). Verify it once before trusting its data.
		if (ep.source === 'user' && !(await reportsChain(ep.url, chainId))) continue;

		const t0 = Date.now();
		try {
			const result = await tryEndpoint<T>(ep.url, method, params);
			recordSuccess(ep.url, Date.now() - t0);
			return result;
		} catch (err) {
			// A node-level JSON-RPC error is authoritative — surface it, don't failover.
			if (err instanceof RpcError) {
				recordSuccess(ep.url, Date.now() - t0);
				throw err;
			}
			recordFailure(ep.url);
		}
	}

	if (!retried) {
		await new Promise((r) => setTimeout(r, 800));
		return rpcCall<T>(method, params, chainId, true);
	}
	throw new Error(`All RPC endpoints failed for chain ${chainId}`);
}

/**
 * A KEYLESS public RPC URL safe to disclose to a third party (the bundler's
 * `X-Rpc-Url` header). Never returns a provider URL (which embeds the user's API
 * key) — only the built-in public endpoints. Falls back to a user override only for
 * custom chains with no public entry (where forwarding the user's own RPC is the
 * only option). This prevents leaking provider keys to the bundler and avoids
 * handing the bundler a user-controlled URL to fetch.
 */
export async function pickBundlerRpcUrl(chainId: number): Promise<string | undefined> {
	const publicUrls = chainInfo(chainId)?.rpcUrls ?? [];
	if (publicUrls.length === 0) return getNetworkConfig(chainId)?.rpcURL;
	// First public endpoint that responds AND reports the right chainId.
	return Promise.any(
		publicUrls.map(async (url) => {
			if (!(await reportsChain(url, chainId))) throw new Error('wrong chain');
			return url;
		})
	).catch(() => publicUrls[0]);
}
