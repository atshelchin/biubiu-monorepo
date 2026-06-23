import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAddress } from 'viem';
import { parseMinimalProxy, detectProxy } from './proxy.js';

const EIP1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EIP1967_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const SELECTOR_IMPLEMENTATION = '0x5c60da1b';
const SELECTOR_MASTERCOPY = '0xa619486e';

const PROXY = '0x1111111111111111111111111111111111111111';
const IMPL = '0x2222222222222222222222222222222222222222';
const ZERO_WORD = `0x${'00'.repeat(32)}`;
const addrWord = (a: string) => `0x000000000000000000000000${a.slice(2).toLowerCase()}`;
const SOME_CODE = '0x6080604052348015600f57600080fd5b50'; // non-empty, not a minimal proxy

/**
 * Mock global fetch to answer JSON-RPC requests via `handler(method, params)`.
 * Returns a real Response so viem's HTTP transport accepts it (it inspects
 * Content-Type and won't parse a bare `{ json() }` stub).
 */
function mockRpc(handler: (method: string, params: unknown[]) => unknown) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, opts: { body: string }) => {
			const body = JSON.parse(opts.body);
			const one = (req: { id: number; method: string; params: unknown[] }) => ({
				jsonrpc: '2.0',
				id: req.id,
				result: handler(req.method, req.params)
			});
			const payload = Array.isArray(body) ? body.map(one) : one(body);
			return new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		})
	);
}

afterEach(() => vi.unstubAllGlobals());

describe('parseMinimalProxy', () => {
	it('extracts the target from a standard EIP-1167 runtime', () => {
		const code = `0x363d3d373d3d3d363d73${IMPL.slice(2)}5af43d82803e903d91602b57fd5bf3`;
		expect(parseMinimalProxy(code)).toBe(getAddress(IMPL));
	});

	it('extracts the target from the PUSH0 variant', () => {
		const code = `0x365f5f375f5f5f365f73${IMPL.slice(2)}5af43d5f5f3e5f3d91602a57fd5bf3`;
		expect(parseMinimalProxy(code)).toBe(getAddress(IMPL));
	});

	it('returns null for empty or non-proxy bytecode', () => {
		expect(parseMinimalProxy('0x')).toBeNull();
		expect(parseMinimalProxy(undefined)).toBeNull();
		expect(parseMinimalProxy(SOME_CODE)).toBeNull();
	});

	it('returns null when the embedded address is zero', () => {
		const code = `0x363d3d373d3d3d363d73${'00'.repeat(20)}5af43d82803e903d91602b57fd5bf3`;
		expect(parseMinimalProxy(code)).toBeNull();
	});
});

describe('detectProxy', () => {
	it('returns "none" when there is no contract code', async () => {
		mockRpc((method) => (method === 'eth_getCode' ? '0x' : ZERO_WORD));
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info).toEqual({ kind: 'none', implementation: null, label: '' });
	});

	it('detects an EIP-1167 minimal proxy from bytecode', async () => {
		const code = `0x363d3d373d3d3d363d73${IMPL.slice(2)}5af43d82803e903d91602b57fd5bf3`;
		mockRpc((method) => (method === 'eth_getCode' ? code : ZERO_WORD));
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('eip1167');
		expect(info.implementation).toBe(getAddress(IMPL));
	});

	it('detects EIP-1967 via the implementation storage slot', async () => {
		mockRpc((method, params) => {
			if (method === 'eth_getCode') return SOME_CODE;
			if (method === 'eth_getStorageAt') {
				return params[1] === EIP1967_IMPL ? addrWord(IMPL) : ZERO_WORD;
			}
			return '0x';
		});
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('eip1967');
		expect(info.implementation).toBe(getAddress(IMPL));
	});

	it('falls back to a beacon proxy and reads implementation() off the beacon', async () => {
		const BEACON = '0x3333333333333333333333333333333333333333';
		mockRpc((method, params) => {
			if (method === 'eth_getCode') return SOME_CODE;
			if (method === 'eth_getStorageAt') {
				return params[1] === EIP1967_BEACON ? addrWord(BEACON) : ZERO_WORD;
			}
			if (method === 'eth_call') return addrWord(IMPL); // beacon.implementation()
			return '0x';
		});
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('beacon');
		expect(info.beacon).toBe(getAddress(BEACON));
		expect(info.implementation).toBe(getAddress(IMPL));
	});

	it('falls back to an implementation() getter when no slots are set', async () => {
		mockRpc((method, params) => {
			if (method === 'eth_getCode') return SOME_CODE;
			if (method === 'eth_getStorageAt') return ZERO_WORD;
			if (method === 'eth_call') {
				const data = (params[0] as { data: string }).data;
				return data === SELECTOR_IMPLEMENTATION ? addrWord(IMPL) : '0x';
			}
			return '0x';
		});
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('getter');
		expect(info.implementation).toBe(getAddress(IMPL));
	});

	it('detects a Gnosis Safe via masterCopy()', async () => {
		mockRpc((method, params) => {
			if (method === 'eth_getCode') return SOME_CODE;
			if (method === 'eth_getStorageAt') return ZERO_WORD;
			if (method === 'eth_call') {
				const data = (params[0] as { data: string }).data;
				return data === SELECTOR_MASTERCOPY ? addrWord(IMPL) : '0x';
			}
			return '0x';
		});
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('gnosis-safe');
		expect(info.implementation).toBe(getAddress(IMPL));
	});

	it('returns "none" for a plain contract with no proxy markers', async () => {
		mockRpc((method) => {
			if (method === 'eth_getCode') return SOME_CODE;
			if (method === 'eth_getStorageAt') return ZERO_WORD;
			return '0x';
		});
		const info = await detectProxy('http://rpc.test', PROXY);
		expect(info.kind).toBe('none');
		expect(info.implementation).toBeNull();
	});
});
