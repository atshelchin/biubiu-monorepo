import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the WhatsABI module so the wrapper's mapping logic is tested without network.
const autoloadMock = vi.fn();
vi.mock('@shazow/whatsabi', () => ({
	whatsabi: {
		autoload: (...args: unknown[]) => autoloadMock(...args),
		loaders: {
			MultiABILoader: class {
				constructor(public loaders: unknown) {}
			},
			SourcifyABILoader: class {
				constructor(public config: { chainId?: number }) {}
			},
			EtherscanV2ABILoader: class {
				constructor(public config: unknown) {}
			},
			MultiSignatureLookup: class {
				constructor(public lookups: unknown) {}
			},
			OpenChainSignatureLookup: class {},
			FourByteSignatureLookup: class {}
		}
	}
}));

import { autoFetchAbi } from './autoload-abi.js';

const ADDR = '0x1111111111111111111111111111111111111111';
const IMPL = '0x2222222222222222222222222222222222222222';

beforeEach(() => autoloadMock.mockReset());

describe('autoFetchAbi', () => {
	it('returns the ABI and counts unresolved selectors', async () => {
		autoloadMock.mockResolvedValue({
			address: ADDR,
			abi: [
				{
					type: 'function',
					name: 'transfer',
					inputs: [{ type: 'address' }, { type: 'uint256' }],
					selector: '0xa9059cbb'
				},
				{ type: 'function', selector: '0x12345678' } // unresolved selector
			],
			abiLoadedFrom: undefined
		});
		const r = await autoFetchAbi('http://rpc.test', 8453, ADDR);
		expect(r.ok).toBe(true);
		expect(r.abi).toHaveLength(2);
		expect(r.unresolved).toBe(1);
		expect(r.followedProxy).toBe(false);
		expect(r.source).toBe('bytecode selectors');
	});

	it('flags a followed proxy and a verified source name', async () => {
		autoloadMock.mockResolvedValue({
			address: IMPL,
			abi: [
				{
					type: 'function',
					name: 'symbol',
					inputs: [],
					outputs: [{ type: 'string' }],
					stateMutability: 'view'
				}
			],
			abiLoadedFrom: { name: 'Sourcify' }
		});
		const r = await autoFetchAbi('http://rpc.test', 8453, ADDR);
		expect(r.followedProxy).toBe(true);
		expect(r.resolvedAddress).toBe(IMPL);
		expect(r.source).toBe('Sourcify');
		expect(r.unresolved).toBe(0);
	});

	it('errors when no ABI or selectors are found', async () => {
		autoloadMock.mockResolvedValue({ address: ADDR, abi: [] });
		const r = await autoFetchAbi('http://rpc.test', 8453, ADDR);
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/No ABI/);
	});

	it('uses Sourcify v2 (with chainId) + 4byte.sourcify.dev signatures and enables followProxies', async () => {
		autoloadMock.mockResolvedValue({
			address: ADDR,
			abi: [{ type: 'function', name: 'x', inputs: [] }]
		});
		await autoFetchAbi('http://rpc.test', 42161, ADDR);
		const opts = autoloadMock.mock.calls[0][1] as {
			followProxies: boolean;
			abiLoader: { chainId: number; name: string };
			signatureLookup: { lookups: Array<{ name?: string }> };
		};
		expect(opts.followProxies).toBe(true);
		expect(opts.abiLoader.name).toBe('Sourcify v2');
		expect(opts.abiLoader.chainId).toBe(42161);
		expect(opts.signatureLookup.lookups[0].name).toBe('api.4byte.sourcify.dev');
	});
});
