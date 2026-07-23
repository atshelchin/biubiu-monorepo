import { describe, it, expect } from 'vitest';
import { sweepMethod, isRefuelMethod } from './sweep-executor.js';
import type { SweepNetwork } from '../types.js';

function net(supports7702: boolean): SweepNetwork {
	return {
		slug: 't',
		name: 'T',
		chainId: 1,
		symbol: 'ETH',
		decimals: 18,
		rpcs: [],
		writableRpcs: [],
		explorerTxUrl: '',
		explorerAddressUrl: '',
		multiSendAddress: '0x0000000000000000000000000000000000000000',
		multicall3: '0x0000000000000000000000000000000000000000',
		maxBatchUpgrade: 50,
		maxBatchSweep: 50,
		supports7702,
	};
}

describe('sweep-executor — path selection', () => {
	it('routes a 7702 chain to the fast delegate path', () => {
		expect(sweepMethod(net(true))).toBe('eip7702');
		expect(isRefuelMethod(net(true))).toBe(false);
	});
	it('routes a non-7702 chain to the universal refuel path', () => {
		expect(sweepMethod(net(false))).toBe('refuel');
		expect(isRefuelMethod(net(false))).toBe(true);
	});
});
