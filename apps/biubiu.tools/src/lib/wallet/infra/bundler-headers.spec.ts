import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { numberToHex } from 'viem';
import { bundlerHeaders } from './bundler-headers.js';
import { __resetChainIdCacheForTest } from './rpc-client.js';
import { chainInfo } from './chains.js';

/**
 * Tests for the shared X-Rpc-Url header assembly (extracted from bundler-client +
 * bundler-account x2). bundlerHeaders merges caller base headers with an X-Rpc-Url
 * of the chain's keyless public RPC, and omits the header when none resolves.
 */

const BASE = 8453;

beforeEach(() => {
	__resetChainIdCacheForTest();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('bundlerHeaders', () => {
	it('sets X-Rpc-Url to the resolved public RPC and preserves base headers', async () => {
		// Healthy endpoint reporting the right chain → pickBundlerRpcUrl resolves a URL.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ jsonrpc: '2.0', id: 1, result: numberToHex(BASE) })
			}))
		);
		const headers = await bundlerHeaders(BASE, { 'Content-Type': 'application/json' });
		expect(headers['Content-Type']).toBe('application/json');
		expect(chainInfo(BASE)!.rpcUrls).toContain(headers['X-Rpc-Url']);
	});

	it('omits X-Rpc-Url when no public RPC can be resolved (unknown chain)', async () => {
		// 999999 not in CHAINS, no override → pickBundlerRpcUrl resolves undefined.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('no behavior');
			})
		);
		const headers = await bundlerHeaders(999999, { Accept: 'application/json' });
		expect(headers).toEqual({ Accept: 'application/json' });
		expect('X-Rpc-Url' in headers).toBe(false);
	});

	it('does not mutate the supplied base headers object', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ jsonrpc: '2.0', id: 1, result: numberToHex(BASE) })
			}))
		);
		const base = { Accept: 'application/json' };
		await bundlerHeaders(BASE, base);
		expect(base).toEqual({ Accept: 'application/json' });
	});
});
