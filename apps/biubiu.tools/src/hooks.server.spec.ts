import { describe, it, expect } from 'vitest';
import { applySecurityHeaders } from './hooks.server';

describe('applySecurityHeaders', () => {
	it('sets the classic hardening headers', () => {
		const h = applySecurityHeaders(new Headers());
		expect(h.get('X-Content-Type-Options')).toBe('nosniff');
		expect(h.get('X-Frame-Options')).toBe('DENY');
		expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('sets a CSP that blocks framing, plugins, and base-uri injection', () => {
		const csp = applySecurityHeaders(new Headers()).get('Content-Security-Policy') ?? '';
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("base-uri 'self'");
	});

	it('does NOT constrain script/style/connect/img sources (must not break the app)', () => {
		const csp = applySecurityHeaders(new Headers()).get('Content-Security-Policy') ?? '';
		// Deliberately permissive: no source allowlists that could block
		// scripts, WASM (OG generation), wallet connections or RPC fetches.
		expect(csp).not.toContain('script-src');
		expect(csp).not.toContain('connect-src');
		expect(csp).not.toContain('style-src');
		expect(csp).not.toContain('img-src');
		expect(csp).not.toContain("default-src");
	});

	it('does not overwrite headers a response already set', () => {
		const h = new Headers({
			'X-Frame-Options': 'SAMEORIGIN',
			'Content-Security-Policy': "default-src 'self'"
		});
		applySecurityHeaders(h);
		expect(h.get('X-Frame-Options')).toBe('SAMEORIGIN');
		expect(h.get('Content-Security-Policy')).toBe("default-src 'self'");
		// But still fills in the ones that were missing.
		expect(h.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('mutates and returns the same Headers instance', () => {
		const input = new Headers();
		const out = applySecurityHeaders(input);
		expect(out).toBe(input);
	});
});
