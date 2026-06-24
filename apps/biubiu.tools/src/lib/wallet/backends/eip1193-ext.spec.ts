import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Address, type Hex, stringToHex } from 'viem';

// Mock the read-only RPC path so verify can run without a chain.
const { rpcCallMock } = vi.hoisted(() => ({ rpcCallMock: vi.fn() }));
vi.mock('../infra/rpc-client.js', () => {
	class RpcError extends Error {
		code?: number;
		constructor(message: string, code?: number) {
			super(message);
			this.name = 'RpcError';
			this.code = code;
		}
	}
	return { rpcCall: rpcCallMock, RpcError };
});

const { Eip1193Wallet } = await import('./eip1193-base.js');
import type { Eip1193Provider } from '../eip1193.js';

const ADDR = '0x1111111111111111111111111111111111111111' as Address;
const SIG = ('0x' + 'ab'.repeat(65)) as Hex;
const MAGIC = '0x1626ba7e';

function fakeProvider(handlers: Record<string, (params: unknown) => unknown>) {
	const calls: { method: string; params: unknown }[] = [];
	const provider: Eip1193Provider = {
		request: async ({ method, params }) => {
			calls.push({ method, params });
			const h = handlers[method];
			if (!h) throw new Error(`unexpected method ${method}`);
			return h(params);
		}
	};
	return { provider, calls };
}

class TestWallet extends Eip1193Wallet {
	readonly kind = 'inject' as const;
}

beforeEach(() => rpcCallMock.mockReset());

describe('Eip1193Wallet.signMessage', () => {
	it('calls personal_sign with the hex message + address and returns the signature', async () => {
		const { provider, calls } = fakeProvider({ personal_sign: () => SIG });
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.signMessage('gm', { chainId: 8453 });
		expect(res).toEqual({ ok: true, signature: SIG });
		const ps = calls.find((c) => c.method === 'personal_sign');
		expect(ps?.params).toEqual([stringToHex('gm'), ADDR]);
	});

	it('returns ok:false when the wallet rejects', async () => {
		const { provider } = fakeProvider({
			personal_sign: () => {
				throw new Error('User rejected');
			}
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.signMessage('gm', { chainId: 8453 });
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/rejected/i);
	});
});

describe('Eip1193Wallet.signTypedData', () => {
	it('signs valid typed-data JSON via eth_signTypedData_v4', async () => {
		const { provider, calls } = fakeProvider({ eth_signTypedData_v4: () => SIG });
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const json = '{"domain":{},"types":{},"primaryType":"X","message":{}}';
		const res = await wallet.signTypedData(json, { chainId: 8453 });
		expect(res).toEqual({ ok: true, signature: SIG });
		expect(calls.find((c) => c.method === 'eth_signTypedData_v4')?.params).toEqual([ADDR, json]);
	});

	it('rejects malformed JSON before touching the wallet', async () => {
		const { provider, calls } = fakeProvider({});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.signTypedData('{not json', { chainId: 8453 });
		expect(res.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
});

describe('Eip1193Wallet.getCapabilities', () => {
	it('returns the provider capabilities object', async () => {
		const caps = { '0x2105': { atomicBatch: { supported: true } } };
		const { provider } = fakeProvider({ wallet_getCapabilities: () => caps });
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		expect(await wallet.getCapabilities(8453)).toEqual(caps);
	});

	it('returns {} when the wallet does not support the method', async () => {
		const { provider } = fakeProvider({
			wallet_getCapabilities: () => {
				throw new Error('unsupported');
			}
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		expect(await wallet.getCapabilities(8453)).toEqual({});
	});
});

describe('Eip1193Wallet.verifyMessage (on-chain ERC-1271)', () => {
	it('valid when eth_call returns the ERC-1271 magic value', async () => {
		rpcCallMock.mockResolvedValue(MAGIC + '0'.repeat(56));
		const { provider } = fakeProvider({});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.verifyMessage('gm', SIG, { chainId: 8453 });
		expect(res.ok).toBe(true);
		expect(res.valid).toBe(true);
		expect(res.method).toBe('erc1271');
		expect(rpcCallMock).toHaveBeenCalledWith('eth_call', expect.anything(), 8453);
	});

	it('invalid when the account returns non-magic returndata', async () => {
		// What a smart account returns when the signature does not validate.
		rpcCallMock.mockResolvedValue('0xffffffff' + '0'.repeat(56));
		const { provider } = fakeProvider({});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.verifyMessage('gm', SIG, { chainId: 8453 });
		expect(res.ok).toBe(true);
		expect(res.valid).toBe(false);
	});

	it('verifyTypedData rejects malformed JSON without an RPC call', async () => {
		const { provider } = fakeProvider({});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.verifyTypedData('{bad', SIG, { chainId: 8453 });
		expect(res.ok).toBe(false);
		expect(rpcCallMock).not.toHaveBeenCalled();
	});
});
