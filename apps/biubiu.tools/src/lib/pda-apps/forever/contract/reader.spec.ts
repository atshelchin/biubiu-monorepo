import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { toEntry } from './reader.js';
import { decryptContent, encryptContent } from '../crypto/envelope.js';
import { randomBytes, toHex } from '../crypto/core.js';

const ZERO32 = ('0x' + '00'.repeat(32)) as Hex;

describe('forever reader: state entry → decrypt (offline)', () => {
	it('converts a decoded Entry tuple and decrypts its payload', async () => {
		const dek = randomBytes(32);
		const text = '写给三年后的我 ✨';
		const payload = await encryptContent(dek, text);

		const entry = toEntry({
			createdAt: 1_700_000_000n,
			unlockAt: 0n,
			drandRound: 0n,
			mode: 0,
			beaconScheme: ZERO32,
			payload: ('0x' + toHex(payload)) as Hex
		});

		expect(entry.mode).toBe(0);
		expect(entry.createdAt).toBe(1_700_000_000);
		expect(await decryptContent(dek, entry.payload)).toBe(text);
	});

	it('preserves capsule metadata (unlockAt, drandRound)', () => {
		const entry = toEntry({
			createdAt: 1_700_000_000n,
			unlockAt: 1_800_000_000n,
			drandRound: 12_345n,
			mode: 1,
			beaconScheme: ZERO32,
			payload: '0xdeadbeef'
		});
		expect(entry.mode).toBe(1);
		expect(entry.unlockAt).toBe(1_800_000_000);
		expect(entry.drandRound).toBe(12_345n);
		expect([...entry.payload]).toEqual([0xde, 0xad, 0xbe, 0xef]);
	});
});
