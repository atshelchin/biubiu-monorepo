import { describe, it, expect } from 'vitest';
import { shortenAddress } from './format.js';

describe('shortenAddress', () => {
	it('truncates a full address to head…tail (>12 chars)', () => {
		// Real 42-char EVM address.
		const addr = '0x1234567890abcdef1234567890abcdef12345678';
		expect(shortenAddress(addr)).toBe('0x1234…5678');
	});

	it('returns short strings (≤12 chars) and the empty string unchanged', () => {
		expect(shortenAddress('')).toBe('');
		expect(shortenAddress('0x123456')).toBe('0x123456');
		// Exactly 12 chars: still under the >12 guard, returned as-is.
		expect(shortenAddress('0x1234567890')).toBe('0x1234567890');
	});
});
