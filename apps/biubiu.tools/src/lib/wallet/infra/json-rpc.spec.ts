import { describe, it, expect, vi, afterEach } from 'vitest';
import { jsonRpcPost } from './json-rpc.js';

/**
 * Tests for the shared JSON-RPC POST helper extracted from rpc-client.tryEndpoint
 * and bundler-client.bundlerCall. Verifies the default (chain-RPC) error semantics
 * and the caller-overridable error mappers that keep both call sites byte-identical.
 */

const URL = 'https://rpc.example.test';

function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
	const fetchMock = vi.fn(impl);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('jsonRpcPost', () => {
	it('posts a JSON-RPC 2.0 body and returns result on success', async () => {
		const fetchMock = stubFetch(async () => ({
			ok: true,
			json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x2105' })
		}));
		const result = await jsonRpcPost<string>(URL, 'eth_chainId', []);
		expect(result).toBe('0x2105');
		const [calledUrl, init] = fetchMock.mock.calls[0];
		expect(calledUrl).toBe(URL);
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(JSON.parse(init.body as string)).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_chainId',
			params: []
		});
	});

	it('throws default "HTTP <status>" Error when res.ok is false', async () => {
		stubFetch(async () => ({ ok: false, status: 503 }));
		await expect(jsonRpcPost(URL, 'eth_chainId', [])).rejects.toThrow('HTTP 503');
	});

	it('throws default plain Error(message) on a JSON-RPC error envelope', async () => {
		stubFetch(async () => ({
			ok: true,
			json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'reverted' } })
		}));
		await expect(jsonRpcPost(URL, 'eth_call', [])).rejects.toThrow('reverted');
	});

	it('uses caller httpError mapper (bundler-style) when res.ok is false', async () => {
		stubFetch(async () => ({
			ok: false,
			status: 500,
			text: async () => 'boom details'
		}));
		await expect(
			jsonRpcPost(URL, 'eth_sendUserOperation', [], {
				httpError: async (res) => {
					const text = await res.text().catch(() => '');
					return new Error(`Bundler HTTP ${res.status}${text ? `: ${text}` : ''}`);
				}
			})
		).rejects.toThrow('Bundler HTTP 500: boom details');
	});

	it('uses caller rpcError mapper to throw a typed error', async () => {
		class MyErr extends Error {
			constructor(
				msg: string,
				readonly code?: number
			) {
				super(msg);
			}
		}
		stubFetch(async () => ({
			ok: true,
			json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad params' } })
		}));
		const err: unknown = await jsonRpcPost(URL, 'eth_call', [], {
			rpcError: (e) => new MyErr(e.message, e.code)
		}).then(
			() => undefined,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(MyErr);
		expect((err as MyErr).code).toBe(-32602);
		expect((err as MyErr).message).toBe('bad params');
	});

	it('runs caller validate before reading result (rejects non-object)', async () => {
		stubFetch(async () => ({ ok: true, json: async () => null }));
		await expect(
			jsonRpcPost(URL, 'eth_chainId', [], {
				validate: (json) =>
					!json || typeof json !== 'object' ? new Error('Invalid response') : undefined
			})
		).rejects.toThrow('Invalid response');
	});

	it('forwards caller headers and signal to fetch', async () => {
		const fetchMock = stubFetch(async () => ({
			ok: true,
			json: async () => ({ jsonrpc: '2.0', id: 1, result: 'ok' })
		}));
		const controller = new AbortController();
		await jsonRpcPost(URL, 'm', [], {
			headers: { 'Content-Type': 'application/json', 'X-Rpc-Url': 'https://x.test' },
			signal: controller.signal
		});
		const [, init] = fetchMock.mock.calls[0];
		expect(init.headers).toEqual({
			'Content-Type': 'application/json',
			'X-Rpc-Url': 'https://x.test'
		});
		expect(init.signal).toBe(controller.signal);
	});
});
