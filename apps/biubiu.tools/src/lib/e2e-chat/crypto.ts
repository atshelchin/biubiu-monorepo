/**
 * E2E chat cryptography — WebCrypto only (`crypto.subtle`), zero deps.
 *
 * Design (session-level forward secrecy, "一次会话一次性加密"):
 *   - Each session uses a FRESH ephemeral ECDH P-256 keypair per peer.
 *   - ECDH → HKDF-SHA256 → two directional AES-256-GCM traffic keys.
 *   - Keys live only in memory and are dropped when the session ends → past
 *     sessions can never be decrypted (nothing is persisted anywhere).
 *   - Per-message nonce is a deterministic counter (unique per key) — GCM only
 *     requires nonce uniqueness, not secrecy. AAD binds room|direction|seq.
 *
 * MITM defense is the Safety Code (SAS): a short hash over the full handshake
 * transcript (both addresses, both ephemeral keys, both wallet signatures). If a
 * relay tampered with any of it, the two peers' codes differ.
 */

const enc = new TextEncoder();

/** TextEncoder output, typed ArrayBuffer-backed so it satisfies WebCrypto's BufferSource. */
function utf8(s: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(enc.encode(s));
}

/** Stable string used for the wallet "sign-in" challenge of one peer. */
export function buildChallenge(roomId: string, role: 'a' | 'b', myPubKeyB64: string): string {
	return [
		'biubiu.tools — start an end-to-end encrypted chat session.',
		'Only sign this in the biubiu.tools chat tool.',
		`room: ${roomId}`,
		`role: ${role}`,
		`key: ${myPubKeyB64}`
	].join('\n');
}

// ── base64url ───────────────────────────────────────────────────────────────

export function toB64url(bytes: ArrayBuffer | Uint8Array): string {
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bin = '';
	for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

// ── ephemeral keys + key agreement ───────────────────────────────────────────

export interface EphemeralKeyPair {
	publicKeyB64: string;
	privateKey: CryptoKey;
}

/** Fresh per-session ECDH P-256 keypair; public key exported as raw (65 bytes). */
export async function generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
	const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	]);
	const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
	return { publicKeyB64: toB64url(raw), privateKey: kp.privateKey };
}

async function importPeerPublicKey(b64: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		fromB64url(b64),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
}

/** Directional AES-GCM keys derived from the shared secret. */
export interface TrafficKeys {
	a2b: CryptoKey; // creator → joiner
	b2a: CryptoKey; // joiner → creator
}

/**
 * ECDH(myPriv, peerPub) → HKDF-SHA256 → two AES-256-GCM keys.
 * Salt = roomId so the same key pair in a different room yields different keys.
 */
export async function deriveTrafficKeys(
	myPrivateKey: CryptoKey,
	peerPublicKeyB64: string,
	roomId: string
): Promise<TrafficKeys> {
	const peerPub = await importPeerPublicKey(peerPublicKeyB64);
	const sharedBits = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: peerPub },
		myPrivateKey,
		256
	);
	const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
	const salt = utf8(`biubiu-chat-v1|${roomId}`);
	const mk = (info: string) =>
		crypto.subtle.deriveKey(
			{ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
			hkdfKey,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	const [a2b, b2a] = await Promise.all([mk('dir:a2b'), mk('dir:b2a')]);
	return { a2b, b2a };
}

// ── message sealing ──────────────────────────────────────────────────────────

/** Deterministic 12-byte GCM nonce: dir tag (4B) + seq (8B big-endian). */
function nonceFor(direction: 'a2b' | 'b2a', seq: number): Uint8Array<ArrayBuffer> {
	const iv = new Uint8Array(12);
	if (direction === 'b2a') iv[0] = 1;
	const view = new DataView(iv.buffer);
	view.setBigUint64(4, BigInt(seq));
	return iv;
}

function aadFor(roomId: string, direction: 'a2b' | 'b2a', seq: number): Uint8Array<ArrayBuffer> {
	return utf8(`${roomId}|${direction}|${seq}`);
}

export async function seal(
	key: CryptoKey,
	roomId: string,
	direction: 'a2b' | 'b2a',
	seq: number,
	plaintext: string
): Promise<string> {
	const ct = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: nonceFor(direction, seq),
			additionalData: aadFor(roomId, direction, seq)
		},
		key,
		utf8(plaintext)
	);
	return toB64url(ct);
}

export async function open(
	key: CryptoKey,
	roomId: string,
	direction: 'a2b' | 'b2a',
	seq: number,
	ciphertextB64: string
): Promise<string> {
	const pt = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: nonceFor(direction, seq),
			additionalData: aadFor(roomId, direction, seq)
		},
		key,
		fromB64url(ciphertextB64)
	);
	return new TextDecoder().decode(pt);
}

// ── safety code (SAS) ────────────────────────────────────────────────────────

/** Emoji alphabet for the visual half of the safety code (memorable, no homoglyphs). */
const SAFETY_EMOJI = [
	'🐶',
	'🐱',
	'🦊',
	'🐼',
	'🐧',
	'🦉',
	'🐢',
	'🐬',
	'🌵',
	'🍀',
	'🌻',
	'🍎',
	'🍋',
	'🍇',
	'🌈',
	'⚡',
	'🔥',
	'💧',
	'⭐',
	'🌙',
	'🎵',
	'🎲',
	'🚀',
	'🔑',
	'🛡️',
	'🎯',
	'🧭',
	'🍩',
	'🥑',
	'🦋',
	'🐝',
	'🌸'
];

export interface SafetyCode {
	/** Six digits in two groups, e.g. "428 913". */
	digits: string;
	/** Three emoji, e.g. "🦊🍀🚀". */
	emoji: string;
}

/**
 * Derive the safety code from the full, role-ordered handshake transcript.
 * Both peers MUST feed identical inputs (creator's values first) → identical code.
 */
export async function computeSafetyCode(transcript: string): Promise<SafetyCode> {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(transcript)));
	const view = new DataView(hash.buffer);
	const n = view.getUint32(0) % 1_000_000;
	const digits = n.toString().padStart(6, '0');
	const emoji = [hash[4], hash[5], hash[6]]
		.map((b) => SAFETY_EMOJI[b % SAFETY_EMOJI.length])
		.join('');
	return { digits: `${digits.slice(0, 3)} ${digits.slice(3)}`, emoji };
}

/** A stable single-emoji avatar derived from a peer's ephemeral public key. */
export async function computeAvatar(pub: string): Promise<string> {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`avatar|${pub}`)));
	return SAFETY_EMOJI[hash[0] % SAFETY_EMOJI.length];
}

/** One peer's public handshake contribution. */
export interface HandshakeParty {
	address: string;
	pub: string;
	sig: string;
}

/** Role-ordered transcript string (creator = a, joiner = b). */
export function buildTranscript(roomId: string, a: HandshakeParty, b: HandshakeParty): string {
	return [
		'biubiu-chat-v1',
		roomId,
		`a:${a.address.toLowerCase()}:${a.pub}:${a.sig}`,
		`b:${b.address.toLowerCase()}:${b.pub}:${b.sig}`
	].join('|');
}
