import { describe, expect, it } from 'vitest';
import { roundForTime, timelockOpen, timelockSeal } from './timelock.js';
import { decryptContent, encryptContent } from './envelope.js';
import { randomBytes } from './core.js';

// Live test: hits drand quicknet over the network. Verifies the full capsule path in-app:
// AES(DEK, text) inner → tlock outer → open → decrypt.
describe('forever capsule (live drand round-trip)', () => {
	it('seals to a past round and opens it, recovering the text', async () => {
		const dek = randomBytes(32);
		const text = '写给过去的我 — capsule round-trip';
		const aes = await encryptContent(dek, text);

		const pastRound = roundForTime(Math.floor(Date.now() / 1000) - 60); // already published
		const capsule = await timelockSeal(aes, pastRound);
		const opened = await timelockOpen(capsule);

		expect(await decryptContent(dek, opened)).toBe(text);
	}, 30_000);
});
