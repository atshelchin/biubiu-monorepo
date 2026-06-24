import { describe, it, expect } from 'vitest';
import {
	buildChallenge,
	buildTranscript,
	computeAvatar,
	computeSafetyCode,
	deriveTrafficKeys,
	fromB64url,
	generateEphemeralKeyPair,
	open,
	seal,
	toB64url
} from './crypto.js';

const ROOM = 'room_Abc123_-xyz';

/** Two fresh peers + their independently-derived directional keys. */
async function pair(room = ROOM) {
	const a = await generateEphemeralKeyPair();
	const b = await generateEphemeralKeyPair();
	const aKeys = await deriveTrafficKeys(a.privateKey, b.publicKeyB64, room);
	const bKeys = await deriveTrafficKeys(b.privateKey, a.publicKeyB64, room);
	return { a, b, aKeys, bKeys };
}

describe('base64url', () => {
	it('round-trips arbitrary bytes', () => {
		const bytes = crypto.getRandomValues(new Uint8Array(64));
		expect(Array.from(fromB64url(toB64url(bytes)))).toEqual(Array.from(bytes));
	});

	it('emits a URL-safe alphabet (no +, /, =)', () => {
		const s = toB64url(crypto.getRandomValues(new Uint8Array(48)));
		expect(s).not.toMatch(/[+/=]/);
	});
});

describe('key agreement', () => {
	it('both peers derive matching directional keys (ECDH is symmetric)', async () => {
		const { aKeys, bKeys } = await pair();
		const ab = await seal(aKeys.a2b, ROOM, 'a2b', 0, 'from A');
		expect(await open(bKeys.a2b, ROOM, 'a2b', 0, ab)).toBe('from A');
		const ba = await seal(bKeys.b2a, ROOM, 'b2a', 0, 'from B');
		expect(await open(aKeys.b2a, ROOM, 'b2a', 0, ba)).toBe('from B');
	});

	it('a different room yields non-interoperable keys', async () => {
		const a = await generateEphemeralKeyPair();
		const b = await generateEphemeralKeyPair();
		const aKeys = await deriveTrafficKeys(a.privateKey, b.publicKeyB64, ROOM);
		const bKeys = await deriveTrafficKeys(b.privateKey, a.publicKeyB64, 'other-room');
		const ct = await seal(aKeys.a2b, ROOM, 'a2b', 0, 'x');
		await expect(open(bKeys.a2b, ROOM, 'a2b', 0, ct)).rejects.toThrow();
	});
});

describe('message sealing (AES-GCM)', () => {
	it('round-trips unicode + multiline text', async () => {
		const { aKeys, bKeys } = await pair();
		const msg = 'héllo 🔒\nsecond line\t— end';
		const ct = await seal(aKeys.a2b, ROOM, 'a2b', 3, msg);
		expect(await open(bKeys.a2b, ROOM, 'a2b', 3, ct)).toBe(msg);
	});

	it('rejects a ciphertext opened at the wrong sequence (AEAD)', async () => {
		const { aKeys, bKeys } = await pair();
		const ct = await seal(aKeys.a2b, ROOM, 'a2b', 5, 'hi');
		await expect(open(bKeys.a2b, ROOM, 'a2b', 6, ct)).rejects.toThrow();
	});

	it('rejects a ciphertext opened with the wrong direction', async () => {
		const { aKeys, bKeys } = await pair();
		const ct = await seal(aKeys.a2b, ROOM, 'a2b', 0, 'hi');
		await expect(open(bKeys.b2a, ROOM, 'b2a', 0, ct)).rejects.toThrow();
	});

	it('an eavesdropper with a different keypair cannot decrypt', async () => {
		const { a, aKeys } = await pair();
		const evil = await generateEphemeralKeyPair();
		const evilKeys = await deriveTrafficKeys(evil.privateKey, a.publicKeyB64, ROOM);
		const ct = await seal(aKeys.a2b, ROOM, 'a2b', 0, 'secret');
		await expect(open(evilKeys.a2b, ROOM, 'a2b', 0, ct)).rejects.toThrow();
	});

	it('produces distinct ciphertext per sequence (nonce uniqueness)', async () => {
		const { aKeys } = await pair();
		const c0 = await seal(aKeys.a2b, ROOM, 'a2b', 0, 'same');
		const c1 = await seal(aKeys.a2b, ROOM, 'a2b', 1, 'same');
		expect(c0).not.toBe(c1);
	});
});

describe('safety code (SAS)', () => {
	const A = { address: '0xAAa0000000000000000000000000000000000001', pub: 'PUBA', sig: 'SIGA' };
	const B = { address: '0xBBb0000000000000000000000000000000000002', pub: 'PUBB', sig: 'SIGB' };

	it('is deterministic for identical transcripts', async () => {
		const t = buildTranscript(ROOM, A, B);
		const x = await computeSafetyCode(t);
		const y = await computeSafetyCode(t);
		expect(x).toEqual(y);
	});

	it('matches the documented shape (6 digits + 3 emoji)', async () => {
		const code = await computeSafetyCode(buildTranscript(ROOM, A, B));
		expect(code.digits).toMatch(/^\d{3} \d{3}$/);
		expect([...code.emoji]).toHaveLength(3);
	});

	it('changes if any party detail changes (tamper-evident)', async () => {
		const base = await computeSafetyCode(buildTranscript(ROOM, A, B));
		const swappedKey = await computeSafetyCode(buildTranscript(ROOM, { ...A, pub: 'EVIL' }, B));
		const swappedRoom = await computeSafetyCode(buildTranscript('other', A, B));
		expect(swappedKey.digits).not.toBe(base.digits);
		expect(swappedRoom.digits).not.toBe(base.digits);
	});

	it('is address-case-insensitive (same identity → same code)', async () => {
		const lower = await computeSafetyCode(buildTranscript(ROOM, A, B));
		const upper = await computeSafetyCode(
			buildTranscript(ROOM, { ...A, address: A.address.toUpperCase() }, B)
		);
		expect(upper.digits).toBe(lower.digits);
	});
});

describe('challenge', () => {
	it('binds room, role and ephemeral key', () => {
		const c = buildChallenge(ROOM, 'a', 'PUBKEY123');
		expect(c).toContain(ROOM);
		expect(c).toContain('role: a');
		expect(c).toContain('PUBKEY123');
	});

	it('differs by role for the same key', () => {
		expect(buildChallenge(ROOM, 'a', 'K')).not.toBe(buildChallenge(ROOM, 'b', 'K'));
	});
});
