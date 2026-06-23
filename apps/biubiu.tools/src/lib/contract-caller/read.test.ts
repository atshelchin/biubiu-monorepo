import { describe, it, expect } from 'vitest';
import { parseAbiInput } from './abi.js';
import { toOutputRows, stringifyValue, cleanError } from './read.js';
import type { ParsedMethod } from './types.js';

function method(sig: string): ParsedMethod {
	return parseAbiInput(sig).methods![0];
}

describe('toOutputRows', () => {
	it('wraps a single unnamed output', () => {
		const m = method('function balanceOf(address) view returns (uint256)');
		expect(toOutputRows(m, 123n)).toEqual([{ name: 'output 0', type: 'uint256', value: '123' }]);
	});

	it('uses output names when present', () => {
		const m = method(
			'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 ts)'
		);
		const rows = toOutputRows(m, [1n, 2n, 3n]);
		expect(rows.map((r) => r.name)).toEqual(['reserve0', 'reserve1', 'ts']);
		expect(rows.map((r) => r.value)).toEqual(['1', '2', '3']);
	});

	it('returns no rows for a method with no outputs', () => {
		const m = method('function setApprovalForAll(address operator, bool approved)');
		expect(toOutputRows(m, undefined)).toEqual([]);
	});
});

describe('stringifyValue', () => {
	it('stringifies scalars', () => {
		expect(stringifyValue(123n)).toBe('123');
		expect(stringifyValue(true)).toBe('true');
		expect(stringifyValue(false)).toBe('false');
		expect(stringifyValue('hello')).toBe('hello');
		expect(stringifyValue(null)).toBe('');
		expect(stringifyValue(undefined)).toBe('');
	});

	it('stringifies arrays recursively', () => {
		expect(stringifyValue([1n, 2n, 3n])).toBe('[1, 2, 3]');
	});

	it('stringifies tuple objects, dropping positional keys', () => {
		// viem returns both named and numeric-indexed keys for tuples.
		expect(stringifyValue({ '0': 1n, '1': true, a: 1n, b: true })).toBe('{ a: 1, b: true }');
	});
});

describe('cleanError', () => {
	it('prefers shortMessage, then details, then message', () => {
		expect(cleanError({ shortMessage: 'short', message: 'long' })).toBe('short');
		expect(cleanError({ details: 'detail', message: 'long' })).toBe('detail');
		expect(cleanError({ message: 'just message' })).toBe('just message');
	});

	it('falls back to a generic message for non-objects', () => {
		expect(cleanError('a string')).toBe('Call failed');
		expect(cleanError(undefined)).toBe('Call failed');
	});
});
