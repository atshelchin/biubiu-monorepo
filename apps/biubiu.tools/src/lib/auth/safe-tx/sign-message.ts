/**
 * Safe ERC-1271 off-chain message signing for the passkey (P-256) Safe.
 *
 * Reuses the exact passkey path as UserOp signing — only the hash differs:
 *   1. compute the Safe SafeMessage EIP-712 hash (domain = Safe address + chainId)
 *   2. sign that 32-byte hash with the passkey (`signSafeOpWithPasskey`)
 *   3. wrap the WebAuthn assertion into a Safe contract signature
 *      (`buildContractSignatureWebAuthn`)
 *
 * The returned bytes are a Safe owner signature blob that `Safe.checkSignatures`
 * validates against the SafeMessage hash (ERC-1271 semantics). Note: these Safes
 * use the Safe4337Module as fallback handler, so on-chain `isValidSignature` is not
 * guaranteed — the signature is still a valid Safe ERC-1271 signature.
 */
import {
	type Address,
	type Hex,
	encodeAbiParameters,
	decodeAbiParameters,
	keccak256,
	concat,
	toHex,
	hexToBytes,
	stringToHex,
	hashTypedData,
	type TypedDataDomain
} from 'viem';
import { DOMAIN_SEPARATOR_TYPEHASH } from './constants.js';
import { signSafeOpWithPasskey } from './webauthn-sign.js';
import { buildContractSignatureWebAuthn } from './build-userop.js';
import { parseP256PublicKey } from '../compute-safe-address.js';

/** EIP-712 typehash for `SafeMessage(bytes message)`. */
const SAFE_MSG_TYPEHASH = keccak256(toHex('SafeMessage(bytes message)'));

/** Domain separator for a Safe's message signing (verifyingContract = the Safe itself). */
function safeMessageDomainSeparator(safeAddress: Address, chainId: bigint): Hex {
	return keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
			[DOMAIN_SEPARATOR_TYPEHASH, chainId, safeAddress]
		)
	);
}

/**
 * Safe SafeMessage hash (the digest the passkey actually signs).
 *
 * `message` is the raw bytes to be signed (hex). For typed data, pass the EIP-712
 * digest (32 bytes); for a plain string, pass its UTF-8 hex.
 */
export function calculateSafeMessageHash(
	safeAddress: Address,
	message: Hex,
	chainId: bigint
): Hex {
	const structHash = keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'bytes32' }],
			[SAFE_MSG_TYPEHASH, keccak256(message)]
		)
	);
	const domainSeparator = safeMessageDomainSeparator(safeAddress, chainId);
	return keccak256(concat(['0x1901', domainSeparator, structHash]));
}

interface SignSafeMessageParams {
	safeAddress: Address;
	credentialId: string;
	rpId: string;
	chainId: number;
	/** Raw bytes to sign (hex). */
	message: Hex;
}

/** Sign arbitrary bytes as a Safe ERC-1271 contract signature using the passkey. */
async function signSafeBytesWithPasskey(
	params: SignSafeMessageParams
): Promise<{ ok: true; signature: Hex } | { ok: false; error: string }> {
	const safeMessageHash = calculateSafeMessageHash(
		params.safeAddress,
		params.message,
		BigInt(params.chainId)
	);
	const sig = await signSafeOpWithPasskey(safeMessageHash, params.credentialId, params.rpId);
	if (!sig.ok) return { ok: false, error: sig.error };
	const { authenticatorData, clientDataFields, r, s } = sig.result;
	const signature = buildContractSignatureWebAuthn(authenticatorData, clientDataFields, r, s);
	return { ok: true, signature };
}

/** Sign a UTF-8 string message (personal_sign analogue) as a Safe ERC-1271 signature. */
export function signSafeMessageWithPasskey(
	params: Omit<SignSafeMessageParams, 'message'> & { message: string }
): Promise<{ ok: true; signature: Hex } | { ok: false; error: string }> {
	return signSafeBytesWithPasskey({ ...params, message: stringToHex(params.message) });
}

/**
 * Sign EIP-712 typed data as a Safe ERC-1271 signature. Computes the typed-data
 * digest with viem, then signs that digest as the SafeMessage payload.
 */
export function signSafeTypedDataWithPasskey(
	params: Omit<SignSafeMessageParams, 'message'> & {
		typedData: {
			domain?: TypedDataDomain;
			types: Record<string, readonly { name: string; type: string }[]>;
			primaryType: string;
			message: Record<string, unknown>;
		};
	}
): Promise<{ ok: true; signature: Hex } | { ok: false; error: string }> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const digest = hashTypedData(params.typedData as any);
	return signSafeBytesWithPasskey({
		safeAddress: params.safeAddress,
		credentialId: params.credentialId,
		rpId: params.rpId,
		chainId: params.chainId,
		message: digest
	});
}

// ─── Local verification (WebAuthn P-256) ───

function base64urlNoPad(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bigintTo32(n: bigint): Uint8Array {
	return hexToBytes(`0x${n.toString(16).padStart(64, '0')}` as Hex);
}

/**
 * Verify a Safe ERC-1271 passkey signature LOCALLY (no chain needed).
 *
 * Reconstructs the WebAuthn assertion the way the on-chain SharedSigner would, then
 * checks the P-256 signature against the account's public key via WebCrypto. This is
 * the authoritative check for biubiu, whose on-chain isValidSignature isn't exposed
 * (fallback handler = 4337 module). Returns false on any structural/crypto mismatch.
 */
async function verifyWebAuthnContractSig(
	publicKeyHex: string,
	safeMessageHash: Hex,
	signature: Hex
): Promise<boolean> {
	// Contract sig layout: r(32) ‖ s(32) ‖ v(1) ‖ len(32) ‖ abi(bytes,string,uint256,uint256)
	const dynamic = `0x${signature.slice(196)}` as Hex;
	let authenticatorData: Hex;
	let clientDataFields: string;
	let r: bigint;
	let s: bigint;
	try {
		[authenticatorData, clientDataFields, r, s] = decodeAbiParameters(
			[{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
			dynamic
		) as [Hex, string, bigint, bigint];
	} catch {
		return false;
	}

	const challenge = base64urlNoPad(hexToBytes(safeMessageHash));
	const clientDataJSON = `{"type":"webauthn.get","challenge":"${challenge}",${clientDataFields}}`;
	const clientDataHash = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON))
	);

	const authBytes = hexToBytes(authenticatorData);
	const signedData = new Uint8Array(authBytes.length + clientDataHash.length);
	signedData.set(authBytes, 0);
	signedData.set(clientDataHash, authBytes.length);

	const { x, y } = parseP256PublicKey(publicKeyHex);
	const rawKey = new Uint8Array(65);
	rawKey[0] = 0x04;
	rawKey.set(bigintTo32(x), 1);
	rawKey.set(bigintTo32(y), 33);

	const rawSig = new Uint8Array(64);
	rawSig.set(bigintTo32(r), 0);
	rawSig.set(bigintTo32(s), 32);

	try {
		const key = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawSig, signedData);
	} catch {
		return false;
	}
}

/** Verify a biubiu message signature locally. */
export function verifySafeMessageSignature(
	publicKeyHex: string,
	safeAddress: Address,
	chainId: number,
	message: string,
	signature: Hex
): Promise<boolean> {
	const hash = calculateSafeMessageHash(safeAddress, stringToHex(message), BigInt(chainId));
	return verifyWebAuthnContractSig(publicKeyHex, hash, signature);
}

/** Verify a biubiu typed-data signature locally. */
export function verifySafeTypedDataSignature(
	publicKeyHex: string,
	safeAddress: Address,
	chainId: number,
	typedDataJson: string,
	signature: Hex
): Promise<boolean> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const digest = hashTypedData(JSON.parse(typedDataJson) as any);
	const hash = calculateSafeMessageHash(safeAddress, digest, BigInt(chainId));
	return verifyWebAuthnContractSig(publicKeyHex, hash, signature);
}
