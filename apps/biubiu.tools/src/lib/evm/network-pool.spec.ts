import { describe, it, expect, vi } from 'vitest';
import type { Chain } from 'viem';

// Record every EVMVendor constructed so we can assert how createEVMPools wires
// each network's vendors (id, rpc url, chain, weight) without touching viem/RPC.
const evmCtorCalls: Array<{ id: string; rpc: string; chain: Chain; weight: number }> = [];

vi.mock('./evm-vendor', () => ({
	EVMVendor: class {
		id: string;
		rpc: string;
		chain: Chain;
		weight: number;
		constructor(id: string, rpc: string, chain: Chain, weight: number) {
			this.id = id;
			this.rpc = rpc;
			this.chain = chain;
			this.weight = weight;
			evmCtorCalls.push({ id, rpc, chain, weight });
		}
	}
}));

// rpc-vendor is imported at module top-level but unused by createEVMPools; stub it
// so the import graph never constructs a real viem-backed vendor.
vi.mock('./rpc-vendor', () => ({
	RPCVendor: class {}
}));

import { createEVMPools } from './network-pool.js';

const chain = (id: number): Chain => ({ id, name: `chain-${id}` }) as Chain;

const ETH = chain(1);
const POLY = chain(137);
const chainMap: Record<number, Chain> = { 1: ETH, 137: POLY };

describe('createEVMPools', () => {
	it('keys the returned map by network name', () => {
		const pools = createEVMPools(
			{
				ethereum: { chainId: 1, rpcs: ['https://eth.example'] },
				polygon: { chainId: 137, rpcs: ['https://poly.example'] }
			},
			chainMap
		);
		expect([...pools.keys()].sort()).toEqual(['ethereum', 'polygon']);
		expect(pools.size).toBe(2);
	});

	it('skips networks whose chainId is absent from chainMap', () => {
		evmCtorCalls.length = 0;
		const pools = createEVMPools(
			{
				ethereum: { chainId: 1, rpcs: ['https://eth.example'] },
				ghostchain: { chainId: 99999, rpcs: ['https://ghost.example'] }
			},
			chainMap
		);
		expect([...pools.keys()]).toEqual(['ethereum']);
		// no vendor was constructed for the unmapped chain
		expect(evmCtorCalls.some((c) => c.rpc === 'https://ghost.example')).toBe(false);
	});

	it('returns an empty map for no networks', () => {
		const pools = createEVMPools({}, chainMap);
		expect(pools.size).toBe(0);
	});

	it('creates one vendor per rpc with deterministic ids and the network chain', () => {
		evmCtorCalls.length = 0;
		createEVMPools(
			{ ethereum: { chainId: 1, rpcs: ['https://a.example', 'https://b.example'] } },
			chainMap
		);
		const eth = evmCtorCalls.filter((c) => c.id.startsWith('ethereum-evm-'));
		expect(eth.map((c) => c.id)).toEqual(['ethereum-evm-0', 'ethereum-evm-1']);
		expect(eth.map((c) => c.rpc)).toEqual(['https://a.example', 'https://b.example']);
		expect(eth.every((c) => c.chain === ETH)).toBe(true);
	});

	it('weights the first rpc at 3 and the rest at 1', () => {
		evmCtorCalls.length = 0;
		createEVMPools(
			{
				ethereum: {
					chainId: 1,
					rpcs: ['https://primary', 'https://backup-1', 'https://backup-2']
				}
			},
			chainMap
		);
		expect(evmCtorCalls.map((c) => c.weight)).toEqual([3, 1, 1]);
	});

	it('throws when a mapped network has no rpcs (Pool needs ≥1 vendor)', () => {
		evmCtorCalls.length = 0;
		// chain exists so the network is not skipped, but an empty vendor list
		// makes the underlying Pool constructor reject — no pool is produced.
		expect(() => createEVMPools({ ethereum: { chainId: 1, rpcs: [] } }, chainMap)).toThrow(
			/at least one vendor/
		);
		expect(evmCtorCalls.length).toBe(0);
	});
});
