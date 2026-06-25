import { describe, it, expect } from 'vitest';
import { xmlEscape, isValidChainId, isValidAddress } from './sitemap-xml';

describe('xmlEscape', () => {
	it('escapes the five XML metacharacters', () => {
		expect(xmlEscape('&')).toBe('&amp;');
		expect(xmlEscape('<')).toBe('&lt;');
		expect(xmlEscape('>')).toBe('&gt;');
		expect(xmlEscape('"')).toBe('&quot;');
		expect(xmlEscape("'")).toBe('&apos;');
	});

	it('escapes & before other entities (no double-escaping)', () => {
		// Must produce &amp;lt; not &lt; — i.e. & is replaced first.
		expect(xmlEscape('a & b < c')).toBe('a &amp; b &lt; c');
		expect(xmlEscape('&amp;')).toBe('&amp;amp;');
	});

	it('neutralizes an injected sitemap entry that would break the XML', () => {
		// A malicious/corrupt feed value containing a closing tag + new element.
		const evil = '0xabc</loc></url><url><loc>https://evil.example';
		const escaped = xmlEscape(evil);
		expect(escaped).not.toContain('</loc>');
		expect(escaped).not.toContain('<url>');
		expect(escaped).not.toContain('<loc>');
		expect(escaped).toContain('&lt;/loc&gt;');
	});

	it('leaves safe strings untouched', () => {
		expect(xmlEscape('0x1234567890abcdef1234567890abcdef12345678')).toBe(
			'0x1234567890abcdef1234567890abcdef12345678'
		);
		expect(xmlEscape('en')).toBe('en');
	});
});

describe('isValidChainId', () => {
	it('accepts positive integers', () => {
		expect(isValidChainId(1)).toBe(true);
		expect(isValidChainId(137)).toBe(true);
	});

	it('rejects non-positive, non-integer, and non-number values', () => {
		expect(isValidChainId(0)).toBe(false);
		expect(isValidChainId(-1)).toBe(false);
		expect(isValidChainId(1.5)).toBe(false);
		expect(isValidChainId('1')).toBe(false);
		expect(isValidChainId(NaN)).toBe(false);
		expect(isValidChainId(undefined)).toBe(false);
		expect(isValidChainId(null)).toBe(false);
	});
});

describe('isValidAddress', () => {
	it('accepts 0x + 40 hex chars (any case)', () => {
		expect(isValidAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
		expect(isValidAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
	});

	it('rejects malformed / injection-bearing addresses', () => {
		expect(isValidAddress('0x123')).toBe(false); // too short
		expect(isValidAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false); // no 0x
		expect(isValidAddress('0x1234567890abcdef1234567890abcdef1234567g')).toBe(false); // non-hex
		expect(isValidAddress('0xabc</loc><url>')).toBe(false); // injection
		expect(isValidAddress(123 as unknown)).toBe(false);
		expect(isValidAddress(undefined)).toBe(false);
	});
});
