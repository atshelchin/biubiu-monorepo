import { describe, it, expect } from 'vitest';
import {
	type Address,
	type Hex,
	hexToBytes,
	bytesToHex,
	stringToHex,
	hashTypedData
} from 'viem';
import {
	calculateSafeMessageHash,
	verifySafeMessageSignature,
	verifySafeTypedDataSignature
} from './sign-message.js';
import { buildContractSignatureWebAuthn } from './build-userop.js';
import { P256_N } from '../crypto-utils.js';

const SAFE = '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 8453;

function base64urlNoPad(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bigintFrom(bytes: Uint8Array): bigint {
	return BigInt(bytesToHex(bytes));
}

/**
 * Forge a Safe ERC-1271 WebAuthn contract signature the way the browser + on-chain
 * SharedSigner would, signing with a freshly generated P-256 key. Returns the
 * signature bytes + the public key (uncompressed hex) the verifier expects.
 */
async function forgeRaw(safeMessageHash: Hex): Promise<{
	publicKeyHex: string;
	authDataHex: Hex;
	clientDataFields: string;
	r: bigint;
	s: bigint;
}> {
	const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)); // 0x04 || x || y
	const publicKeyHex = bytesToHex(rawPub);

	const challenge = base64urlNoPad(hexToBytes(safeMessageHash));
	const clientDataFields = '"origin":"https://biubiu.tools","crossOrigin":false';
	const clientDataJSON = `{"type":"webauthn.get","challenge":"${challenge}",${clientDataFields}}`;
	const clientDataHash = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON))
	);

	// authenticatorData: 32-byte rpIdHash + 1-byte flags + 4-byte counter = 37 bytes.
	const authData = new Uint8Array(37);
	authData.fill(0xab, 0, 32);
	authData[32] = 0x05;
	const authDataHex = bytesToHex(authData);

	const signedData = new Uint8Array(authData.length + clientDataHash.length);
	signedData.set(authData, 0);
	signedData.set(clientDataHash, authData.length);

	const rawSig = new Uint8Array(
		await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signedData)
	);
	const r = bigintFrom(rawSig.slice(0, 32));
	const s = bigintFrom(rawSig.slice(32));

	return { publicKeyHex, authDataHex, clientDataFields, r, s };
}

async function forgeSignature(safeMessageHash: Hex): Promise<{ publicKeyHex: string; signature: Hex }> {
	const { publicKeyHex, authDataHex, clientDataFields, r, s } = await forgeRaw(safeMessageHash);
	// Normalize to low-S so the canonical forge always reflects what the signer emits.
	const lowS = s > P256_N / 2n ? P256_N - s : s;
	const signature = buildContractSignatureWebAuthn(authDataHex, clientDataFields, r, lowS);
	return { publicKeyHex, signature };
}

describe('calculateSafeMessageHash', () => {
	it('matches viem hashTypedData (SafeMessage EIP-712 reference)', () => {
		const messageHex = stringToHex('Hello from biubiu.tools');
		const expected = hashTypedData({
			domain: { chainId: CHAIN_ID, verifyingContract: SAFE },
			types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
			primaryType: 'SafeMessage',
			message: { message: messageHex }
		});
		expect(calculateSafeMessageHash(SAFE, messageHex, BigInt(CHAIN_ID))).toBe(expected);
	});

	it('is chain-specific', () => {
		const m = stringToHex('x');
		expect(calculateSafeMessageHash(SAFE, m, 1n)).not.toBe(calculateSafeMessageHash(SAFE, m, 8453n));
	});
});

describe('verifySafeMessageSignature (local WebAuthn P-256)', () => {
	it('accepts a correctly forged signature', async () => {
		const message = 'Hello from biubiu.tools 👋';
		const hash = calculateSafeMessageHash(SAFE, stringToHex(message), BigInt(CHAIN_ID));
		const { publicKeyHex, signature } = await forgeSignature(hash);
		const ok = await verifySafeMessageSignature(publicKeyHex, SAFE, CHAIN_ID, message, signature);
		expect(ok).toBe(true);
	});

	it('rejects a tampered message', async () => {
		const message = 'pay alice 1 ETH';
		const hash = calculateSafeMessageHash(SAFE, stringToHex(message), BigInt(CHAIN_ID));
		const { publicKeyHex, signature } = await forgeSignature(hash);
		const ok = await verifySafeMessageSignature(
			publicKeyHex,
			SAFE,
			CHAIN_ID,
			'pay bob 1 ETH', // different message → different hash → must fail
			signature
		);
		expect(ok).toBe(false);
	});

	it('rejects a signature from a different key', async () => {
		const message = 'hi';
		const hash = calculateSafeMessageHash(SAFE, stringToHex(message), BigInt(CHAIN_ID));
		const { signature } = await forgeSignature(hash);
		const { publicKeyHex: otherKey } = await forgeSignature(hash);
		const ok = await verifySafeMessageSignature(otherKey, SAFE, CHAIN_ID, message, signature);
		expect(ok).toBe(false);
	});

	it('rejects the malleated high-S counterpart of an otherwise-valid signature', async () => {
		const message = 'authorize: pay 5 ETH';
		const hash = calculateSafeMessageHash(SAFE, stringToHex(message), BigInt(CHAIN_ID));
		const { publicKeyHex, authDataHex, clientDataFields, r, s } = await forgeRaw(hash);

		// Low-S form (what the signer emits) must verify true.
		const lowS = s > P256_N / 2n ? P256_N - s : s;
		const lowSig = buildContractSignatureWebAuthn(authDataHex, clientDataFields, r, lowS);
		expect(
			await verifySafeMessageSignature(publicKeyHex, SAFE, CHAIN_ID, message, lowSig)
		).toBe(true);

		// The malleated high-S counterpart (r, n-s) is mathematically a valid ECDSA
		// signature for the SAME message + key — WebCrypto.verify would accept it — but
		// on-chain RIP-7212 (verifiers=0x100) rejects high-S. The local verifier must
		// agree with on-chain and reject it.
		const highS = P256_N - lowS;
		expect(highS > P256_N / 2n).toBe(true); // sanity: it really is high-S
		const highSig = buildContractSignatureWebAuthn(authDataHex, clientDataFields, r, highS);
		expect(
			await verifySafeMessageSignature(publicKeyHex, SAFE, CHAIN_ID, message, highSig)
		).toBe(false);
	});

	it('returns false on malformed signature instead of throwing', async () => {
		const ok = await verifySafeMessageSignature(
			'0x04' + '11'.repeat(64),
			SAFE,
			CHAIN_ID,
			'hi',
			'0xdeadbeef' as Hex
		);
		expect(ok).toBe(false);
	});
});

describe('verifySafeTypedDataSignature (local WebAuthn P-256)', () => {
	const typed = JSON.stringify({
		domain: { name: 'biubiu', version: '1', chainId: CHAIN_ID },
		types: { Mail: [{ name: 'contents', type: 'string' }] },
		primaryType: 'Mail',
		message: { contents: 'gm' }
	});

	it('accepts a correctly forged typed-data signature', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const digest = hashTypedData(JSON.parse(typed) as any);
		const hash = calculateSafeMessageHash(SAFE, digest, BigInt(CHAIN_ID));
		const { publicKeyHex, signature } = await forgeSignature(hash);
		const ok = await verifySafeTypedDataSignature(publicKeyHex, SAFE, CHAIN_ID, typed, signature);
		expect(ok).toBe(true);
	});
});
