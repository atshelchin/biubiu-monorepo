import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { toEntry } from './reader.js';
import { decryptContent, encryptContent } from '../crypto/envelope.js';
import { randomBytes, toHex } from '../crypto/core.js';

describe('seal reader: state entry → decrypt (offline)', () => {
	it('converts a decoded Entry tuple and decrypts its payload', async () => {
		const dek = randomBytes(32);
		const text = '写给三年后的我 ✨';
		const payload = await encryptContent(dek, text);

		const entry = toEntry({
			createdAt: 1_700_000_000n,
			payload: ('0x' + toHex(payload)) as Hex
		});

		expect(entry.createdAt).toBe(1_700_000_000);
		expect(await decryptContent(dek, entry.payload)).toBe(text);
	});

	it('decodes raw payload bytes', () => {
		const entry = toEntry({ createdAt: 1_700_000_000n, payload: '0xdeadbeef' });
		expect(entry.createdAt).toBe(1_700_000_000);
		expect([...entry.payload]).toEqual([0xde, 0xad, 0xbe, 0xef]);
	});
});
