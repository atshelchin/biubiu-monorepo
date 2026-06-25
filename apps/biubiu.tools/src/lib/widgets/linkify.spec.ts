import { describe, it, expect } from 'vitest';
import { linkify } from './linkify.js';

describe('widgets/linkify (DeployerActivityLog)', () => {
	it('detects a single URL in the middle of text', () => {
		expect(linkify('see https://a.com now')).toEqual([
			{ chunk: 'see ', isLink: false },
			{ chunk: 'https://a.com', isLink: true },
			{ chunk: ' now', isLink: false }
		]);
	});

	it('detects MULTIPLE URLs (stateful /g .test() must not mis-detect the 2nd)', () => {
		const links = linkify('https://a.com https://b.com')
			.filter((p) => p.isLink)
			.map((p) => p.chunk);
		expect(links).toEqual(['https://a.com', 'https://b.com']);
	});

	it('returns structured parts, NOT a generated <a href> HTML string (no {@html})', () => {
		// Regression: the old linkify() RETURNED a string containing a freshly
		// built `<a href="$1" …>` that was then rendered via {@html}. The fix
		// returns data parts. A real URL chunk must be the bare URL — linkify must
		// never wrap it in anchor markup itself.
		const parts = linkify('open https://ok.com please');
		const link = parts.find((p) => p.isLink);
		expect(link?.chunk).toBe('https://ok.com');
		expect(link?.chunk).not.toMatch(/<a\b|href=/i);

		// Literal markup the user/RPC put in the text is preserved VERBATIM as a
		// non-link chunk (it is data; the component renders it as text, not DOM).
		const literal = linkify('built <a href="x">link</a> done');
		expect(literal).toEqual([{ chunk: 'built <a href="x">link</a> done', isLink: false }]);
	});

	it('SECURITY: a URL with an embedded double-quote stays ONE chunk (no attribute breakout)', () => {
		// Attacker-controlled error text from a hostile RPC. With the old
		// `<a href="$1">` template the embedded `"` closed the href and injected
		// `onmouseover` → DOM XSS. The quote must remain *inside* the link chunk
		// (bound to href by Svelte, which escapes it) and must NOT spawn an
		// `onmouseover="alert(1)"` attribute fragment.
		const parts = linkify('Verify failed: https://evil/" onmouseover="alert(1)');
		const link = parts.find((p) => p.isLink);
		expect(link).toBeDefined();
		// The quote is carried as a literal character of the URL chunk…
		expect(link!.chunk).toBe('https://evil/"');
		// …and the dangling handler text is a NON-link plain-text chunk, so it is
		// rendered as text, not as an attribute.
		const handlerPart = parts.find((p) => p.chunk.includes('onmouseover'));
		expect(handlerPart?.isLink).toBe(false);
	});

	it('SECURITY: does not linkify javascript: / data: pseudo-URLs', () => {
		const parts = linkify('click javascript:alert(1) or data:text/html,<script>1</script>');
		expect(parts.every((p) => !p.isLink)).toBe(true);
	});

	it('does not linkify a bare word that merely contains "http"', () => {
		expect(linkify('shorthttp not a link').every((p) => !p.isLink)).toBe(true);
	});

	it('drops empty chunks (so the {#each} renders nothing spurious)', () => {
		expect(linkify('https://a.com')).toEqual([{ chunk: 'https://a.com', isLink: true }]);
	});
});
