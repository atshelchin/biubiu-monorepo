import { describe, it, expect } from 'vitest';
import { linkify } from './linkify.js';

describe('linkify', () => {
	it('detects a single URL in the middle of text', () => {
		expect(linkify('see https://a.com now')).toEqual([
			{ chunk: 'see ', isLink: false },
			{ chunk: 'https://a.com', isLink: true },
			{ chunk: ' now', isLink: false }
		]);
	});

	it('detects MULTIPLE URLs (regression: stateful /g .test() mis-detected the 2nd)', () => {
		const parts = linkify('https://a.com https://b.com');
		const links = parts.filter((p) => p.isLink).map((p) => p.chunk);
		expect(links).toEqual(['https://a.com', 'https://b.com']);
	});

	it('treats plain text as non-link', () => {
		expect(linkify('just words here')).toEqual([{ chunk: 'just words here', isLink: false }]);
	});

	it('handles a string that is exactly a URL', () => {
		expect(linkify('http://x.io/p?q=1')).toEqual([{ chunk: 'http://x.io/p?q=1', isLink: true }]);
	});

	it('drops empty chunks (so the {#each} renders nothing spurious)', () => {
		// "https://a.com" alone splits to ['', 'https://a.com', ''] before filtering.
		expect(linkify('https://a.com')).toEqual([{ chunk: 'https://a.com', isLink: true }]);
	});

	it('does not linkify a bare word that merely contains "http"', () => {
		const parts = linkify('shorthttp not a link');
		expect(parts.every((p) => !p.isLink)).toBe(true);
	});
});
