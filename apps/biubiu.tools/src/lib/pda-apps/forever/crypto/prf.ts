/**
 * WebAuthn PRF for 《致未来 · Forever》 — derives the encryption key material.
 *
 * Uses a DEDICATED encryption passkey (separate from the wallet/login passkey), created WITH
 * the `prf` extension. The wallet passkey signs UserOps; this one only ever produces the PRF
 * secret used to wrap/unwrap the data-encryption key. Verified working (prf.enabled=true,
 * 32-byte stable output) via the PRF probe page.
 */
import { browser } from '$app/environment';
import { fromBase64url, toBase64url } from '$lib/auth/crypto-utils.js';

const RP_NAME = 'BiuBiu Forever';

export interface EncryptionCredential {
	/** base64url credential id of the dedicated encryption passkey. */
	credentialId: string;
	rpId: string;
	createdAt: number;
}

export function isWebAuthnAvailable(): boolean {
	return browser && typeof PublicKeyCredential !== 'undefined';
}

/** Create the dedicated encryption passkey with the prf extension enabled. */
export async function createEncryptionPasskey(
	rpId: string,
	name = 'Forever Encryption Key'
): Promise<{ credential: EncryptionCredential; prfEnabled: boolean }> {
	const cred = (await navigator.credentials.create({
		publicKey: {
			rp: { id: rpId, name: RP_NAME },
			user: { id: crypto.getRandomValues(new Uint8Array(32)), name, displayName: name },
			challenge: crypto.getRandomValues(new Uint8Array(32)),
			pubKeyCredParams: [
				{ alg: -7, type: 'public-key' },
				{ alg: -257, type: 'public-key' }
			],
			authenticatorSelection: {
				residentKey: 'required',
				requireResidentKey: true,
				userVerification: 'required'
			},
			extensions: { prf: {} },
			timeout: 120_000
		} as PublicKeyCredentialCreationOptions
	})) as PublicKeyCredential | null;

	if (!cred) throw new Error('Failed to create encryption passkey');
	const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
	return {
		credential: { credentialId: toBase64url(cred.rawId), rpId, createdAt: Date.now() },
		prfEnabled: ext.prf?.enabled ?? false
	};
}

/**
 * Evaluate PRF → 32-byte key material + the credential id used.
 * Pass a credential to target it; omit it for a DISCOVERABLE prompt (lets the user pick an
 * existing Forever passkey — "sign in" rather than create).
 */
export async function evaluatePrf(
	cred?: EncryptionCredential
): Promise<{ prf: Uint8Array; credentialId: string }> {
	// Fresh Uint8Arrays at the call site (a fresh Uint8Array is unambiguously an ArrayBufferView).
	const salt = new Uint8Array(new TextEncoder().encode('forever.biubiu.tools/prf/v1'));
	const challenge = crypto.getRandomValues(new Uint8Array(32));
	const allowCredentials = cred
		? [{ type: 'public-key' as const, id: new Uint8Array(fromBase64url(cred.credentialId)) }]
		: [];

	// Diagnostic marker — confirms THIS (fresh) code is running, not a stale build.
	console.info('[forever-prf] evaluatePrf', {
		salt: Object.prototype.toString.call(salt),
		isUint8Array: salt instanceof Uint8Array,
		len: salt.byteLength,
		discoverable: !cred
	});

	const assertion = (await navigator.credentials.get({
		publicKey: {
			challenge,
			allowCredentials,
			userVerification: 'required',
			extensions: { prf: { eval: { first: salt } } },
			timeout: 120_000
		} as PublicKeyCredentialRequestOptions
	})) as PublicKeyCredential | null;

	if (!assertion) throw new Error('PRF evaluation was cancelled');
	const first = (
		assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
	).prf?.results?.first;
	if (!first) throw new Error('This authenticator/browser does not support PRF.');
	const out = new Uint8Array(first);
	if (out.length !== 32) throw new Error(`Unexpected PRF length: ${out.length}`);
	return { prf: out, credentialId: toBase64url(assertion.rawId) };
}
