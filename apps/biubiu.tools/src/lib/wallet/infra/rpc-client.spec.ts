import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { numberToHex } from 'viem';
import { pickBundlerRpcUrl, __resetChainIdCacheForTest } from './rpc-client.js';
import { chainInfo } from './chains.js';

/**
 * Regression tests for the bundler-URL selection logic (P2).
 *
 * pickBundlerRpcUrl probes each built-in public endpoint with eth_chainId and must
 * pick a REACHABLE one that reports the right chainId — never a dead/unreachable URL
 * just because a sibling endpoint exists. Previously a DOWN endpoint (eth_chainId
 * throws) was treated as "chain matches" and could be forwarded to the bundler.
 *
 * We drive the pure selection logic by stubbing global.fetch per-URL.
 */

const BASE = 8453;
const baseUrls = chainInfo(BASE)!.rpcUrls;
const [URL_A, URL_B] = baseUrls; // mainnet.base.org, base-rpc.publicnode.com

type UrlBehavior =
	| { kind: 'reports'; chainId: number } // eth_chainId resolves to this id
	| { kind: 'dead' }; // transport failure (fetch rejects)

/** Build a fetch mock that answers eth_chainId per-URL. */
function stubFetch(behaviors: Record<string, UrlBehavior>) {
	const fetchMock = vi.fn(async (url: string) => {
		const b = behaviors[url];
		if (!b) throw new Error(`no behavior for ${url}`);
		if (b.kind === 'dead') throw new Error('ECONNREFUSED');
		return {
			ok: true,
			json: async () => ({ jsonrpc: '2.0', id: 1, result: numberToHex(b.chainId) })
		} as unknown as Response;
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

beforeEach(() => {
	__resetChainIdCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('pickBundlerRpcUrl — reachable selection', () => {
	it('picks the healthy sibling when the first public endpoint is DEAD', async () => {
		// URL_A is down; URL_B is healthy on the right chain. Must return URL_B, not URL_A.
		stubFetch({
			[URL_A]: { kind: 'dead' },
			[URL_B]: { kind: 'reports', chainId: BASE }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(picked).toBe(URL_B);
	});

	it('does NOT forward a dead URL even though it is publicUrls[0]', async () => {
		stubFetch({
			[URL_A]: { kind: 'dead' },
			[URL_B]: { kind: 'reports', chainId: BASE }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(picked).not.toBe(URL_A);
	});

	it('skips an endpoint that reports the WRONG chain and picks the correct sibling', async () => {
		stubFetch({
			[URL_A]: { kind: 'reports', chainId: 1 }, // wrong chain (ethereum)
			[URL_B]: { kind: 'reports', chainId: BASE }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(picked).toBe(URL_B);
	});

	it('returns a healthy endpoint when all report the right chain', async () => {
		stubFetch({
			[URL_A]: { kind: 'reports', chainId: BASE },
			[URL_B]: { kind: 'reports', chainId: BASE }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(baseUrls).toContain(picked);
	});

	it('falls back to publicUrls[0] only when EVERY probe fails (all dead)', async () => {
		stubFetch({
			[URL_A]: { kind: 'dead' },
			[URL_B]: { kind: 'dead' }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(picked).toBe(URL_A); // best-effort fallback to first public URL
	});

	it('falls back to publicUrls[0] when every endpoint reports the wrong chain', async () => {
		stubFetch({
			[URL_A]: { kind: 'reports', chainId: 1 },
			[URL_B]: { kind: 'reports', chainId: 10 }
		});
		const picked = await pickBundlerRpcUrl(BASE);
		expect(picked).toBe(URL_A);
	});

	it('returns undefined for a chain with no built-in public endpoints and no override', async () => {
		// 999999 is not in CHAINS; node env has no localStorage override.
		stubFetch({});
		const picked = await pickBundlerRpcUrl(999999);
		expect(picked).toBeUndefined();
	});
});
