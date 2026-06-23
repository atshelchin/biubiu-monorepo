import { describe, it, expect } from 'vitest';
import { type Address, type Hex } from 'viem';
import { encodeMultiSend, networkKeyForChainId } from './biubiu.js';
import { encodeMultiSendCall } from '$lib/contract-caller/batch.js';
import type { QueuedCall } from '$lib/contract-caller/types.js';
import type { Call } from '../types.js';

/**
 * The wallet module re-implements the MultiSend packing (to avoid depending on
 * the contract-caller module). This locks it byte-for-byte against the original
 * `encodeMultiSendCall`, so the batched biubiu path stays identical to before.
 */

const A1 = '0x1111111111111111111111111111111111111111' as Address;
const A2 = '0x2222222222222222222222222222222222222222' as Address;
const DATA = '0xa9059cbb000000000000000000000000333333333333333333333333333333333333333300000000000000000000000000000000000000000000000000000000000003e8' as Hex;

function asQueued(calls: Call[]): QueuedCall[] {
	return calls.map((c, i) => ({ id: String(i), label: '', signature: '', ...c }));
}

describe('encodeMultiSend parity with contract-caller batch encoder', () => {
	const cases: Record<string, Call[]> = {
		'single call, empty data': [{ to: A1, value: 0n, data: '0x' }],
		'single call, with calldata + value': [{ to: A1, value: 12345n, data: DATA }],
		'two calls mixed': [
			{ to: A1, value: 0n, data: DATA },
			{ to: A2, value: 1n, data: '0x' }
		],
		'three calls': [
			{ to: A1, value: 0n, data: '0x' },
			{ to: A2, value: 999n, data: DATA },
			{ to: A1, value: 7n, data: '0xdeadbeef' }
		]
	};

	for (const [name, calls] of Object.entries(cases)) {
		it(name, () => {
			expect(encodeMultiSend(calls)).toBe(encodeMultiSendCall(asQueued(calls)));
		});
	}
});

describe('networkKeyForChainId', () => {
	it('maps supported chainIds to Alchemy network keys', () => {
		expect(networkKeyForChainId(1)).toBe('eth-mainnet');
		expect(networkKeyForChainId(8453)).toBe('base-mainnet');
		expect(networkKeyForChainId(42161)).toBe('arb-mainnet');
	});

	it('returns null for unsupported chains', () => {
		expect(networkKeyForChainId(999999)).toBeNull();
	});
});
