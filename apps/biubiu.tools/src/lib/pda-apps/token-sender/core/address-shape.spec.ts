import { describe, it, expect } from 'vitest';
import { isAddress } from 'viem';

/**
 * store.svelte.ts:loadTokenMeta previously validated the token address with the bare
 * shape regex /^0x[a-fA-F0-9]{40}$/. It now calls isAddress(addr, { strict: false }).
 *
 * This pins that the swap is byte-identical: { strict: false } is a pure shape check
 * (it does NOT run checksum validation), so it accepts exactly the same set of strings
 * the regex did. (viem's default strict:true would additionally reject non-checksummed
 * mixed-case addresses — which would be a behavior change, hence strict:false.)
 */
const LEGACY_REGEX = /^0x[a-fA-F0-9]{40}$/;
const shapeOk = (addr: string) => isAddress(addr, { strict: false });

describe('token address shape check (isAddress strict:false === legacy regex)', () => {
	const cases = [
		'0x0000000000000000000000000000000000000000', // valid all-zero
		'0xabcdef0123456789abcdef0123456789abcdef01', // valid lowercase
		'0xABCDEF0123456789ABCDEF0123456789ABCDEF01', // valid uppercase / non-checksum mixed shape
		'0xAbCdEf0123456789abcdef0123456789abcDEf01', // mixed-case, NOT a valid checksum
		'0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // real checksummed feed address
		'', // empty
		'0x', // prefix only
		'0x123', // too short
		'abcdef0123456789abcdef0123456789abcdef01', // missing 0x prefix
		'0xabcdef0123456789abcdef0123456789abcdef0', // 39 hex (too short)
		'0xabcdef0123456789abcdef0123456789abcdef012', // 41 hex (too long)
		'0xZZcdef0123456789abcdef0123456789abcdef01' // non-hex char
	];

	for (const addr of cases) {
		it(`agrees with the regex for ${JSON.stringify(addr)}`, () => {
			expect(shapeOk(addr)).toBe(LEGACY_REGEX.test(addr));
		});
	}

	it('accepts a non-checksummed mixed-case address (matches old regex, unlike strict)', () => {
		const mixed = '0xAbCdEf0123456789abcdef0123456789abcDEf01';
		expect(LEGACY_REGEX.test(mixed)).toBe(true);
		expect(shapeOk(mixed)).toBe(true);
	});
});
