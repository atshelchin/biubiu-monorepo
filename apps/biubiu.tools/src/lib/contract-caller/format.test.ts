import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import {
	coerceValue,
	validateValue,
	amountToBase,
	baseToAmount,
	durationToSeconds,
	secondsToHuman,
	dateToUnix,
	unixToDate,
	unixToDatetimeLocal,
	textToHex,
	hexToText,
	groupDigits,
	shortenAddress
} from './format.js';

const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

describe('coerceValue — scalars', () => {
	it('parses uint/int from decimal strings', () => {
		expect(coerceValue('uint256', undefined, '123')).toBe(123n);
		expect(coerceValue('uint8', undefined, '0')).toBe(0n);
		expect(coerceValue('int256', undefined, '-5')).toBe(-5n);
	});

	it('trims surrounding whitespace for numbers', () => {
		expect(coerceValue('uint256', undefined, '  42  ')).toBe(42n);
	});

	it('throws on an empty number', () => {
		expect(() => coerceValue('uint256', undefined, '')).toThrow(/Empty number/);
	});

	it('throws on a non-numeric number', () => {
		expect(() => coerceValue('uint256', undefined, 'abc')).toThrow();
	});

	it('coerces bool from string and boolean forms', () => {
		expect(coerceValue('bool', undefined, 'true')).toBe(true);
		expect(coerceValue('bool', undefined, '1')).toBe(true);
		expect(coerceValue('bool', undefined, true)).toBe(true);
		expect(coerceValue('bool', undefined, 'false')).toBe(false);
		expect(coerceValue('bool', undefined, '0')).toBe(false);
	});

	it('checksums a valid address', () => {
		expect(coerceValue('address', undefined, DAI)).toBe(getAddress(DAI));
	});

	it('throws on an invalid address', () => {
		expect(() => coerceValue('address', undefined, '0x1234')).toThrow(/Invalid address/);
	});

	it('returns string values unchanged', () => {
		expect(coerceValue('string', undefined, 'hello world')).toBe('hello world');
	});

	it('accepts 0x-prefixed hex for bytes / bytesN', () => {
		expect(coerceValue('bytes', undefined, '0x1234')).toBe('0x1234');
		expect(coerceValue('bytes32', undefined, `0x${'00'.repeat(32)}`)).toBe(`0x${'00'.repeat(32)}`);
	});

	it('throws on non-hex bytes', () => {
		expect(() => coerceValue('bytes', undefined, 'nothex')).toThrow(/hex/);
	});
});

describe('coerceValue — arrays & tuples', () => {
	it('parses a uint256[] from a JSON string', () => {
		expect(coerceValue('uint256[]', undefined, '[1, 2, 3]')).toEqual([1n, 2n, 3n]);
	});

	it('parses an address[] and checksums each', () => {
		const out = coerceValue('address[]', undefined, `["${DAI}", "${DAI}"]`);
		expect(out).toEqual([getAddress(DAI), getAddress(DAI)]);
	});

	it('treats an empty array string as []', () => {
		expect(coerceValue('uint256[]', undefined, '')).toEqual([]);
	});

	it('throws if an array value is not a JSON array', () => {
		expect(() => coerceValue('uint256[]', undefined, '123')).toThrow(/Expected a JSON array/);
	});

	it('parses a tuple from a positional JSON array using components', () => {
		const components = [
			{ name: 'a', type: 'uint256' },
			{ name: 'b', type: 'address' }
		];
		const out = coerceValue('tuple', components, `[5, "${DAI}"]`);
		expect(out).toEqual([5n, getAddress(DAI)]);
	});

	it('parses a tuple from a keyed JSON object using components', () => {
		const components = [
			{ name: 'a', type: 'uint256' },
			{ name: 'b', type: 'bool' }
		];
		const out = coerceValue('tuple', components, '{"a": 7, "b": "true"}');
		expect(out).toEqual({ a: 7n, b: true });
	});

	it('throws on a tuple without components', () => {
		expect(() => coerceValue('tuple', undefined, '[1]')).toThrow(/components/);
	});
});

describe('validateValue', () => {
	it('returns null for a valid value', () => {
		expect(validateValue('uint256', undefined, '10')).toBeNull();
	});

	it('returns an error message for an invalid value', () => {
		expect(validateValue('address', undefined, '0x123')).toMatch(/Invalid address/);
	});
});

describe('amountToBase / baseToAmount', () => {
	it('scales a decimal amount by 18 decimals', () => {
		expect(amountToBase('1.5', 18)).toBe('1500000000000000000');
	});

	it('scales by 6 decimals (USDC)', () => {
		expect(amountToBase('100', 6)).toBe('100000000');
	});

	it('treats empty input as 0', () => {
		expect(amountToBase('', 18)).toBe('0');
	});

	it('round-trips base → decimal', () => {
		expect(baseToAmount('1500000000000000000', 18)).toBe('1.5');
		expect(baseToAmount('100000000', 6)).toBe('100');
	});

	it('baseToAmount returns "0" on invalid input', () => {
		expect(baseToAmount('not-a-number', 18)).toBe('0');
	});
});

describe('durationToSeconds / secondsToHuman', () => {
	it('converts whole-unit durations', () => {
		expect(durationToSeconds('7', 'days')).toBe('604800');
		expect(durationToSeconds('24', 'hours')).toBe('86400');
		expect(durationToSeconds('1', 'weeks')).toBe('604800');
	});

	it('converts fractional durations by rounding', () => {
		expect(durationToSeconds('1.5', 'hours')).toBe('5400');
	});

	it('defaults unknown units to seconds and empty to 0', () => {
		expect(durationToSeconds('30', 'unknownUnit')).toBe('30');
		expect(durationToSeconds('', 'days')).toBe('0');
	});

	it('formats seconds as a human duration', () => {
		expect(secondsToHuman('90061')).toBe('1d 1h 1m 1s');
		expect(secondsToHuman('3600')).toBe('1h');
		expect(secondsToHuman(0n)).toBe('0s');
	});

	it('returns "" for an unparseable duration', () => {
		expect(secondsToHuman('xx')).toBe('');
	});
});

describe('dateToUnix / unixToDate', () => {
	it('converts an ISO UTC string to unix seconds', () => {
		expect(dateToUnix('2021-01-01T00:00:00.000Z')).toBe('1609459200');
	});

	it('returns "0" for empty or invalid dates', () => {
		expect(dateToUnix('')).toBe('0');
		expect(dateToUnix('not a date')).toBe('0');
	});

	it('formats unix seconds back to a UTC string', () => {
		expect(unixToDate('1609459200')).toBe('2021-01-01T00:00:00Z');
	});

	it('returns "" for non-positive or invalid unix values', () => {
		expect(unixToDate('0')).toBe('');
		expect(unixToDate('')).toBe('');
	});

	it('unixToDatetimeLocal returns "" for 0 / invalid', () => {
		expect(unixToDatetimeLocal('0')).toBe('');
		expect(unixToDatetimeLocal('')).toBe('');
	});
});

describe('textToHex / hexToText', () => {
	it('encodes UTF-8 text to hex and back', () => {
		expect(textToHex('abc')).toBe('0x616263');
		expect(hexToText('0x616263')).toBe('abc');
	});

	it('hexToText returns "" for non-hex input', () => {
		expect(hexToText('nothex')).toBe('');
	});
});

describe('groupDigits', () => {
	it('groups thousands', () => {
		expect(groupDigits('1000000')).toBe('1,000,000');
		expect(groupDigits('1234')).toBe('1,234');
	});

	it('preserves a leading minus sign', () => {
		expect(groupDigits('-1234567')).toBe('-1,234,567');
	});

	it('leaves short numbers untouched and empty as empty', () => {
		expect(groupDigits('12')).toBe('12');
		expect(groupDigits('')).toBe('');
	});
});

describe('shortenAddress', () => {
	it('shortens a full address with an ellipsis', () => {
		expect(shortenAddress(getAddress(DAI))).toBe('0x6B17…1d0F');
	});

	it('returns short strings unchanged', () => {
		expect(shortenAddress('0x1234')).toBe('0x1234');
	});
});
