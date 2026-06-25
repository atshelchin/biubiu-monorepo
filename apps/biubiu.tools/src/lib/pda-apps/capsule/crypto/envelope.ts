/**
 * Content-key derivation + AES-GCM for Capsule.
 *
 * LIVE PATH: the content key is derived DETERMINISTICALLY from the wallet passkey's PRF via
 * `deriveContentKey` — the same passkey yields the same key on every device/browser, so a letter
 * sealed anywhere decrypts everywhere with nothing published on-chain. Each note's ciphertext is
 * the only thing that goes on-chain (the `Sealed` event/state).
 *
 * LEGACY (tests only): the wrapped-DEK envelope helpers below (`createEnvelope`/`openEnvelope`/
 * `wrapDek`/`deriveKEK`) were a random-DEK + multi-KEK scheme. They are no longer used by the
 * store — kept solely so the existing spec tests keep exercising the AES/GCM primitives.
 */
import { aesOpen, aesSeal, concat, fromUtf8, hkdfAesKey, hkdfBytes, importAesKey, randomBytes, utf8 } from './core.js';

// FROZEN — these `forever.*` HKDF domain separators are part of the key-derivation
// path for every capsule ever sealed. The app was renamed forever → capsule, but
// changing any of these salts/info strings would make all existing capsules
// permanently undecryptable. They are deliberately NOT renamed. Do not "fix" them.
const KEK_SALT = utf8('forever.biubiu.tools/kek/v1'); // fixed application salt
const KEK_INFO = 'forever-kek-v1';
const CONTENT_KEY_SALT = utf8('forever.biubiu.tools/content-key/v1');
const CONTENT_KEY_INFO = 'forever-content-key-v1';
const ENVELOPE_VERSION = 1;
const CONTENT_VERSION = 1;
const DEK_LEN = 32;

/**
 * Derive the deterministic 32-byte content key directly from a 32-byte WebAuthn PRF output.
 *
 * PRF is a pseudo-random *function*: the same passkey + same salt always returns the same bytes,
 * so this key is identical on every browser and device the passkey is available on — a letter
 * sealed anywhere decrypts everywhere. No random DEK, no envelope, nothing published on-chain,
 * and no second passkey to drift out of sync. This is the whole encryption root.
 */
export function deriveContentKey(prfOutput: Uint8Array): Promise<Uint8Array> {
	return hkdfBytes(prfOutput, CONTENT_KEY_SALT, CONTENT_KEY_INFO, DEK_LEN);
}

/** Derive the key-encryption key (KEK) from a 32-byte WebAuthn PRF output. */
export function deriveKEK(prfOutput: Uint8Array): Promise<CryptoKey> {
	return hkdfAesKey(prfOutput, KEK_SALT, KEK_INFO);
}

export interface NewKey {
	/** The raw data-encryption key (kept in memory for the session, never persisted). */
	rawDek: Uint8Array;
	/** The wrapped-DEK envelope bytes to publish via `KeyInit`. */
	envelope: Uint8Array;
}

/** Create a fresh random DEK and wrap it under the KEK → `KeyInit` envelope bytes. */
export async function createEnvelope(kek: CryptoKey): Promise<NewKey> {
	const rawDek = randomBytes(DEK_LEN);
	return { rawDek, envelope: await wrapDek(kek, rawDek) };
}

/** Wrap an existing DEK under another KEK (used to add a backup passkey). */
export async function wrapDek(kek: CryptoKey, rawDek: Uint8Array): Promise<Uint8Array> {
	const sealed = await aesSeal(kek, rawDek); // iv || ct+tag
	return concat(new Uint8Array([ENVELOPE_VERSION]), sealed);
}

/** Recover the DEK from an envelope. Throws if the KEK is wrong (bad GCM tag) or version unknown. */
export async function openEnvelope(kek: CryptoKey, envelope: Uint8Array): Promise<Uint8Array> {
	if (envelope[0] !== ENVELOPE_VERSION) throw new Error(`unsupported envelope version ${envelope[0]}`);
	const raw = await aesOpen(kek, envelope.slice(1));
	if (raw.length !== DEK_LEN) throw new Error('bad DEK length');
	return raw;
}

/** Encrypt diary text under the DEK → `Sealed` payload bytes. */
export async function encryptContent(rawDek: Uint8Array, text: string): Promise<Uint8Array> {
	const key = await importAesKey(rawDek);
	const sealed = await aesSeal(key, utf8(text));
	return concat(new Uint8Array([CONTENT_VERSION]), sealed);
}

/** Decrypt a `Sealed` payload under the DEK. Throws on a bad tag (tampering / wrong key). */
export async function decryptContent(rawDek: Uint8Array, payload: Uint8Array): Promise<string> {
	if (payload[0] !== CONTENT_VERSION) throw new Error(`unsupported content version ${payload[0]}`);
	const key = await importAesKey(rawDek);
	return fromUtf8(await aesOpen(key, payload.slice(1)));
}
