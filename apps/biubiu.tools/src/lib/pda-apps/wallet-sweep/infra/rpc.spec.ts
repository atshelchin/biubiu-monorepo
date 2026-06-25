/**
 * Regression test for the RPC per-attempt timeout (REVIEW-FINDINGS
 * pda-apps/wallet-sweep P2: "RPC per-attempt timeout does not cover the
 * response-body read").
 *
 * The bug: clearTimeout(timer) ran immediately after `await fetch(...)`, i.e.
 * once the HEADERS arrived but BEFORE `await res.json()`. A server that sends
 * headers then stalls the body would hang res.json() forever — the AbortController
 * had already been disarmed, so there was no timeout and no failover to the next
 * RPC. The fix keeps the abort signal armed across the body read (clearTimeout in
 * a finally), so a stalled body is aborted, res.json() throws, and the call falls
 * through to the next healthy RPC.
 *
 * Network-free: fetch is stubbed so the "stalled body" is a json() that only
 * settles when the AbortController fires.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rpcCall } from './rpc.js';

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

/** A Response whose body read (json()) NEVER resolves until the request is aborted. */
function stalledBodyResponse(signal: AbortSignal): Response {
	return {
		ok: true,
		status: 200,
		json: () =>
			new Promise((_resolve, reject) => {
				if (signal.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}
				signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
				// otherwise: never resolves — simulates a hung response body.
			}),
	} as unknown as Response;
}

function okResponse(result: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => ({ jsonrpc: '2.0', id: 1, result }),
	} as unknown as Response;
}

describe('rpcCall — body-read timeout coverage', () => {
	it('times out a stalled response BODY and fails over to the next RPC', async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const signal = init!.signal as AbortSignal;
			// First endpoint: headers arrive (fetch resolves) but the body stalls.
			if (fetchMock.mock.calls.length === 1) return stalledBodyResponse(signal);
			// Second endpoint: healthy.
			return okResponse('0xdead');
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await rpcCall(
			['https://stalled.example', 'https://healthy.example'],
			'eth_getBalance',
			['0x0000000000000000000000000000000000000001', 'latest'],
			20, // 20ms per-attempt timeout — the stalled body must abort and fall over
		);

		expect(result).toBe('0xdead');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('throws (does not hang) when the only RPC stalls its body', async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
			stalledBodyResponse(init!.signal as AbortSignal),
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			rpcCall(['https://stalled.example'], 'eth_chainId', [], 20),
		).rejects.toThrow(/timed out/i);
	});

	it('clears the timer on the happy path (no leaked abort after success)', async () => {
		const fetchMock = vi.fn(async () => okResponse('0x1'));
		vi.stubGlobal('fetch', fetchMock);
		const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

		const result = await rpcCall(['https://healthy.example'], 'eth_chainId', [], 5_000);

		expect(result).toBe('0x1');
		expect(clearSpy).toHaveBeenCalled();
	});
});
