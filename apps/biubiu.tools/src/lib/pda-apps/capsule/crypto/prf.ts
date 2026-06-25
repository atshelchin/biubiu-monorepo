/**
 * WebAuthn PRF for Capsule — derives the deterministic encryption key material.
 *
 * The WALLET passkey itself produces the PRF secret (one passkey = identity AND encryption root).
 * `evaluatePrf` is pinned to a specific credentialId so it always targets that one passkey; PRF is
 * a pure function of (credential, salt), giving a stable 32-byte output on every device/browser the
 * passkey is available on. `createEncryptionPasskey` (a separate passkey) is kept only as a legacy
 * helper and is not used by the live store path.
 */
import { browser } from '$app/environment';
import { fromBase64url, toBase64url } from '$lib/auth/crypto-utils.js';

const RP_NAME = 'BiuBiu Forever';
// FROZEN — this PRF salt derives the root encryption key for every existing user.
// The app was renamed forever → capsule, but changing this value would derive a
// different key and orphan all previously sealed capsules. Do not "fix" it.
const SALT_TEXT = 'forever.biubiu.tools/prf/v1';

/** The fixed PRF salt as a standalone ArrayBuffer (the least ambiguous BufferSource type). */
function prfSalt(): ArrayBuffer {
	return new Uint8Array(new TextEncoder().encode(SALT_TEXT)).buffer;
}

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
	name = 'Forever'
): Promise<{ credential: EncryptionCredential; prfEnabled: boolean; prf: Uint8Array | null }> {
	const cred = (await navigator.credentials.create({
		publicKey: {
			rp: { id: rpId, name: RP_NAME },
			user: { id: crypto.getRandomValues(new Uint8Array(32)).buffer, name, displayName: name },
			challenge: crypto.getRandomValues(new Uint8Array(32)).buffer,
			pubKeyCredParams: [
				{ alg: -7, type: 'public-key' },
				{ alg: -257, type: 'public-key' }
			],
			authenticatorSelection: {
				residentKey: 'required',
				requireResidentKey: true,
				userVerification: 'required'
			},
			// Enable PRF AND try to evaluate it in the same ceremony (one Touch ID when supported).
			extensions: { prf: { eval: { first: prfSalt() } } },
			timeout: 120_000
		} as PublicKeyCredentialCreationOptions
	})) as PublicKeyCredential | null;

	if (!cred) throw new Error('Failed to create encryption passkey');
	const ext = cred.getClientExtensionResults() as {
		prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
	};
	const first = ext.prf?.results?.first;
	return {
		credential: { credentialId: toBase64url(cred.rawId), rpId, createdAt: Date.now() },
		prfEnabled: ext.prf?.enabled ?? false,
		prf: first ? new Uint8Array(first) : null
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
	// Pass every BufferSource as a real ArrayBuffer (the least ambiguous WebIDL type).
	const salt = prfSalt();
	const challenge = crypto.getRandomValues(new Uint8Array(32)).buffer;
	const allowCredentials = cred
		? [{ type: 'public-key' as const, id: fromBase64url(cred.credentialId) }]
		: [];

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
