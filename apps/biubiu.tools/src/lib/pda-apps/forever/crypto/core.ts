/**
 * Low-level WebCrypto helpers for 《致未来 · Forever》.
 *
 * Uses ONLY `crypto.subtle` / `crypto.getRandomValues`, which are universal across the
 * browser, Bun and Node — never Node-only APIs (per project crypto guidance).
 */

const IV_LEN = 12; // AES-GCM nonce length

export function randomBytes(n: number): Uint8Array {
	const a = new Uint8Array(n);
	crypto.getRandomValues(a);
	return a;
}

export function utf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

export function fromUtf8(b: Uint8Array): string {
	return new TextDecoder().decode(b);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
	const len = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(len);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

export function toHex(b: Uint8Array): string {
	let s = '';
	for (const x of b) s += x.toString(16).padStart(2, '0');
	return s;
}

export function fromHex(h: string): Uint8Array {
	const clean = h.startsWith('0x') ? h.slice(2) : h;
	const a = new Uint8Array(clean.length / 2);
	for (let i = 0; i < a.length; i++) a[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return a;
}

/** Derive a non-extractable AES-GCM-256 key from high-entropy input via HKDF-SHA256. */
export async function hkdfAesKey(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: utf8(info) as BufferSource },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** Import raw 32 bytes as a non-extractable AES-GCM key (used for the data-encryption key). */
export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** AES-GCM encrypt → `iv(12) || ciphertext+tag`. */
export async function aesSeal(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
	const iv = randomBytes(IV_LEN);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource)
	);
	return concat(iv, ct);
}

/** AES-GCM decrypt of `iv(12) || ciphertext+tag`. Throws on a bad tag (wrong key / tampering). */
export async function aesOpen(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
	const iv = blob.slice(0, IV_LEN);
	const ct = blob.slice(IV_LEN);
	return new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
	);
}
