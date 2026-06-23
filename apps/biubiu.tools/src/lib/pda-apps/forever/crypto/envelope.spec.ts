import { describe, expect, it } from 'vitest';
import { randomBytes } from './core.js';
import {
	createEnvelope,
	decryptContent,
	deriveKEK,
	encryptContent,
	openEnvelope,
	wrapDek
} from './envelope.js';

describe('forever envelope crypto', () => {
	it('round-trips the DEK across sessions and decrypts content', async () => {
		const prf = randomBytes(32); // stand-in for a stable WebAuthn PRF output
		const kek = await deriveKEK(prf);
		const { rawDek, envelope } = await createEnvelope(kek);

		// Later session: same PRF output → same KEK → recovers the same DEK from the envelope.
		const recovered = await openEnvelope(await deriveKEK(prf), envelope);
		expect([...recovered]).toEqual([...rawDek]);

		const payload = await encryptContent(recovered, '写给一年后的自己 🔒');
		expect(await decryptContent(recovered, payload)).toBe('写给一年后的自己 🔒');
	});

	it('rejects a wrong PRF output (different passkey → different KEK)', async () => {
		const kek = await deriveKEK(randomBytes(32));
		const { envelope } = await createEnvelope(kek);
		const wrongKek = await deriveKEK(randomBytes(32));
		await expect(openEnvelope(wrongKek, envelope)).rejects.toThrow();
	});

	it('multi-KEK backup: a second passkey unwraps the SAME DEK', async () => {
		const prfA = randomBytes(32);
		const prfB = randomBytes(32);
		const kekA = await deriveKEK(prfA);
		const kekB = await deriveKEK(prfB);

		const { rawDek, envelope: envA } = await createEnvelope(kekA);
		const envB = await wrapDek(kekB, rawDek); // backup passkey wraps the same DEK

		// Encrypt once; readable via either passkey's recovery path.
		const payload = await encryptContent(rawDek, 'gm onchain');
		const viaA = await openEnvelope(await deriveKEK(prfA), envA);
		const viaB = await openEnvelope(await deriveKEK(prfB), envB);
		expect([...viaA]).toEqual([...rawDek]);
		expect([...viaB]).toEqual([...rawDek]);
		expect(await decryptContent(viaB, payload)).toBe('gm onchain');
	});

	it('detects tampered ciphertext via the GCM auth tag', async () => {
		const dek = randomBytes(32);
		const payload = await encryptContent(dek, 'secret');
		payload[payload.length - 1] ^= 0xff; // flip the last byte of the tag
		await expect(decryptContent(dek, payload)).rejects.toThrow();
	});

	it('rejects an unknown envelope/content version', async () => {
		const dek = randomBytes(32);
		const payload = await encryptContent(dek, 'x');
		payload[0] = 0x09; // bogus version byte
		await expect(decryptContent(dek, payload)).rejects.toThrow(/version/);
	});
});
