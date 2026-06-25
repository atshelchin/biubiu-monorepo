import { describe, it, expect } from 'vitest';
import { extractClientDataFields } from './webauthn-sign.js';

/**
 * Regression tests for extractClientDataFields.
 *
 * The on-chain Safe WebAuthn verifier (SharedSigner, verifiers=0x100) reconstructs
 * clientDataJSON byte-for-byte as:
 *   {"type":"webauthn.get","challenge":"<challenge>",<clientDataFields>}
 * So clientDataFields MUST be exactly the bytes after the comma that follows the
 * challenge value, up to (but not including) the closing brace. If we ever return
 * a string that, re-spliced into that template, does not reproduce the bytes the
 * authenticator signed, the ERC-1271 / 4337 signature check fails silently on the
 * funds path. These tests pin both the canonical happy path and the previously
 * silent landmines (non-canonical field ordering / whitespace).
 */

function buf(s: string): ArrayBuffer {
	return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

const CHALLENGE = 'fmtABCDEF-_0123456789';

describe('extractClientDataFields', () => {
	it('extracts fields from canonical browser clientDataJSON', () => {
		const fields = '"origin":"https://biubiu.tools","crossOrigin":false';
		const json = `{"type":"webauthn.get","challenge":"${CHALLENGE}",${fields}}`;
		expect(extractClientDataFields(buf(json))).toBe(fields);
	});

	it('round-trips: reconstructing the template reproduces the original bytes', () => {
		const fields = '"origin":"https://biubiu.tools","crossOrigin":false,"extra":1';
		const json = `{"type":"webauthn.get","challenge":"${CHALLENGE}",${fields}}`;
		const extracted = extractClientDataFields(buf(json));
		const rebuilt = `{"type":"webauthn.get","challenge":"${CHALLENGE}",${extracted}}`;
		expect(rebuilt).toBe(json);
	});

	it('handles fields that themselves contain a closing brace (uses LAST brace)', () => {
		// An origin value with a literal "}" must not truncate extraction early.
		const fields = '"origin":"https://example.com/path%7D","crossOrigin":false';
		const json = `{"type":"webauthn.get","challenge":"${CHALLENGE}",${fields}}`;
		expect(extractClientDataFields(buf(json))).toBe(fields);
	});

	// ── Previously-silent landmines: must throw, never return wrong bytes ──

	it('throws on reordered JSON (origin before challenge — on-chain prefix is fixed)', () => {
		// The on-chain verifier hardcodes the prefix {"type":"webauthn.get","challenge":".
		// If origin appears before challenge, returning only the post-challenge fields
		// would drop origin and produce an unverifiable signature. Must fail loudly.
		const json = `{"type":"webauthn.get","origin":"https://biubiu.tools","challenge":"${CHALLENGE}","crossOrigin":false}`;
		expect(() => extractClientDataFields(buf(json))).toThrow();
	});

	it('throws when challenge is the LAST field (cannot reconstruct trailing comma)', () => {
		// Old code did slice(valueEnd+2, len-1) and returned '' here — an unverifiable sig.
		const json = `{"type":"webauthn.get","challenge":"${CHALLENGE}"}`;
		expect(() => extractClientDataFields(buf(json))).toThrow();
	});

	it('throws on whitespace between challenge value and the comma', () => {
		// Old code returned a malformed leading-space/comma string here. On-chain
		// reconstruction has no such whitespace, so the bytes would not match.
		const json = `{"type":"webauthn.get","challenge":"${CHALLENGE}" ,"origin":"https://biubiu.tools"}`;
		expect(() => extractClientDataFields(buf(json))).toThrow();
	});

	it('throws when the challenge key is absent', () => {
		const json = `{"type":"webauthn.get","origin":"https://biubiu.tools"}`;
		expect(() => extractClientDataFields(buf(json))).toThrow();
	});
});
