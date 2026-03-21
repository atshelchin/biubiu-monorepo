/**
 * Passkey 认证客户端。
 *
 * 注册流程：
 * 1. 创建 passkey → 提取公钥 → 立即存 localStorage（确保不丢）
 * 2. 获取 challenge → 签名 → 上传到远程
 * 3. 必须上传成功才算注册完成，失败则用户在界面上重试
 * 4. 重试会重新获取 challenge + 重新签名（challenge 会过期）
 */
import type { AuthUser, IndexChallenge, LocalKey, StoredKey } from './types.js';

const INDEX_BASE = 'https://webauthnp256-publickey-index.biubiu.tools';
const RP_NAME = 'BiuBiu Tools';
const LOCAL_KEYS_STORAGE = 'biubiu-auth-local-keys';

// ─── 工具函数 ───

function getRpId(): string {
	if (typeof window === 'undefined') return 'biubiu.tools';
	const host = window.location.hostname;
	if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
	return 'biubiu.tools';
}

function toBase64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let str = '';
	for (const b of bytes) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(b64url: string): ArrayBuffer {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
	const binary = atob(b64 + pad);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function bufToHex(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function extractRawP256Key(spki: ArrayBuffer): Uint8Array {
	const bytes = new Uint8Array(spki);
	return bytes.slice(bytes.length - 65);
}

function derToRawSignature(der: ArrayBuffer): Uint8Array {
	const bytes = new Uint8Array(der);
	let offset = 2;

	if (bytes[offset] !== 0x02) throw new Error('Invalid DER signature');
	offset++;
	const rLen = bytes[offset++];
	let r = bytes.slice(offset, offset + rLen);
	offset += rLen;

	if (bytes[offset] !== 0x02) throw new Error('Invalid DER signature');
	offset++;
	const sLen = bytes[offset++];
	let s = bytes.slice(offset, offset + sLen);

	if (r.length === 33 && r[0] === 0) r = r.slice(1);
	if (s.length === 33 && s[0] === 0) s = s.slice(1);

	const raw = new Uint8Array(64);
	raw.set(r.length <= 32 ? r : r.slice(r.length - 32), 32 - Math.min(r.length, 32));
	raw.set(s.length <= 32 ? s : s.slice(s.length - 32), 64 - Math.min(s.length, 32));
	return raw;
}

// ─── LocalKey 本地存储（通过 credentialId 索引） ───

function loadLocalKeys(): LocalKey[] {
	try {
		const raw = localStorage.getItem(LOCAL_KEYS_STORAGE);
		return raw ? (JSON.parse(raw) as LocalKey[]) : [];
	} catch {
		return [];
	}
}

function saveLocalKey(key: LocalKey): void {
	try {
		const keys = loadLocalKeys();
		if (!keys.some((k) => k.credentialId === key.credentialId)) {
			keys.push(key);
		}
		localStorage.setItem(LOCAL_KEYS_STORAGE, JSON.stringify(keys));
	} catch {
		// Non-critical — passkey 数据仍在设备上
	}
}

function findLocalKey(credentialId: string): LocalKey | undefined {
	return loadLocalKeys().find((k) => k.credentialId === credentialId);
}

// ─── 签名 + 上传（注册首次 + 重试复用） ───

/**
 * 获取 challenge → 用指定 passkey 签名 → 上传到远程。
 * 409（已存在）视为成功。
 * 需要用户生物验证。
 */
async function signAndUpload(
	localKey: LocalKey
): Promise<{ ok: true } | { ok: false; error: string }> {
	const rpId = localKey.rpId;

	// 1. 获取 challenge
	let challenge: string;
	try {
		const res = await fetch(`${INDEX_BASE}/api/challenge`);
		if (!res.ok) return { ok: false, error: 'Failed to get challenge from server' };
		const data: IndexChallenge = await res.json();
		challenge = data.challenge;
	} catch {
		return { ok: false, error: 'Cannot reach the key index server' };
	}

	// 2. 签名 challenge（需要用户生物验证）
	let signatureHex: string;
	let authenticatorDataB64url: string;
	let clientDataJSONB64url: string;
	try {
		const credentialRawId = fromBase64url(localKey.credentialId);
		const assertion = await navigator.credentials.get({
			publicKey: {
				challenge: new TextEncoder().encode(challenge),
				rpId,
				allowCredentials: [{ id: credentialRawId, type: 'public-key' }],
				userVerification: 'required',
				timeout: 60_000
			}
		});

		if (!assertion || !(assertion instanceof PublicKeyCredential)) {
			return { ok: false, error: 'Failed to sign challenge' };
		}

		const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
		const rawSig = derToRawSignature(assertionResponse.signature);
		signatureHex = bufToHex(rawSig);
		authenticatorDataB64url = toBase64url(assertionResponse.authenticatorData);
		clientDataJSONB64url = toBase64url(assertionResponse.clientDataJSON);
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'Signing was cancelled' };
		}
		return {
			ok: false,
			error: `Signing error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	// 3. 上传
	try {
		const res = await fetch(`${INDEX_BASE}/api/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				rpId: localKey.rpId,
				credentialId: localKey.credentialId,
				publicKey: localKey.publicKey,
				challenge,
				signature: signatureHex,
				authenticatorData: authenticatorDataB64url,
				clientDataJSON: clientDataJSONB64url,
				name: localKey.name
			})
		});

		if (res.ok || res.status === 409) {
			return { ok: true };
		}

		const data = await res.json().catch(() => ({}));
		return {
			ok: false,
			error: (data as Record<string, string>).error ?? `Upload failed (${res.status})`
		};
	} catch {
		return { ok: false, error: 'Failed to save key to server' };
	}
}

// ─── 公共 API ───

/** 注册产生的中间状态：passkey 已创建但还未上传到服务器 */
export interface RegistrationPending {
	ok: false;
	needsUpload: true;
	localKey: LocalKey;
	error: string;
}

type RegisterResult =
	| { ok: true; user: AuthUser }
	| { ok: false; needsUpload?: false; error: string }
	| RegistrationPending;

/**
 * 注册新 Passkey。
 *
 * 1. 创建 WebAuthn credential → 提取公钥 → 存 localStorage
 * 2. 签名 + 上传
 * 3. 上传成功 → 注册完成
 * 4. 上传失败 → 返回 needsUpload=true，UI 显示重试按钮
 */
export async function registerPasskey(name: string): Promise<RegisterResult> {
	if (!window.PublicKeyCredential) {
		return { ok: false, error: 'WebAuthn is not supported in this browser' };
	}

	const rpId = getRpId();
	const userId = crypto.getRandomValues(new Uint8Array(32));

	// 1. 创建 credential
	let credential: PublicKeyCredential;
	try {
		const result = await navigator.credentials.create({
			publicKey: {
				rp: { id: rpId, name: RP_NAME },
				user: {
					id: userId,
					name,
					displayName: name
				},
				challenge: crypto.getRandomValues(new Uint8Array(32)),
				pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
				authenticatorSelection: {
					residentKey: 'required',
					requireResidentKey: true,
					userVerification: 'required'
				},
				timeout: 120_000
			}
		});

		if (!result || !(result instanceof PublicKeyCredential)) {
			return { ok: false, error: 'Failed to create passkey' };
		}
		credential = result;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'Passkey creation was cancelled' };
		}
		return {
			ok: false,
			error: `WebAuthn error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	// 2. 提取公钥 → 立即存 localStorage
	const attestationResponse = credential.response as AuthenticatorAttestationResponse;
	const spkiKey = attestationResponse.getPublicKey();
	if (!spkiKey) {
		return { ok: false, error: 'Failed to extract public key from credential' };
	}
	const rawKey = extractRawP256Key(spkiKey);
	const publicKeyHex = bufToHex(rawKey);
	const credentialId = toBase64url(credential.rawId);

	const localKey: LocalKey = {
		rpId,
		credentialId,
		publicKey: publicKeyHex,
		name,
		createdAt: Date.now()
	};
	saveLocalKey(localKey);

	// 3. 签名 + 上传
	const uploadResult = await signAndUpload(localKey);

	if (uploadResult.ok) {
		return {
			ok: true,
			user: {
				name,
				credentialId,
				publicKey: publicKeyHex,
				rpId,
				createdAt: localKey.createdAt
			}
		};
	}

	// 上传失败 — passkey 已创建且本地已存，需要重试上传
	return {
		ok: false,
		needsUpload: true,
		localKey,
		error: uploadResult.error
	};
}

/**
 * 重试上传 — 重新获取 challenge + 重新签名 + 上传。
 * 在注册流程内调用（用户点重试按钮）。
 */
export async function retryUpload(
	localKey: LocalKey
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
	const result = await signAndUpload(localKey);

	if (result.ok) {
		return {
			ok: true,
			user: {
				name: localKey.name,
				credentialId: localKey.credentialId,
				publicKey: localKey.publicKey,
				rpId: localKey.rpId,
				createdAt: localKey.createdAt
			}
		};
	}

	return { ok: false, error: result.error };
}

/**
 * 使用已有 Passkey 登录。
 *
 * 1. discoverable credentials → 用户选择 passkey
 * 2. 先查本地 LocalKey（覆盖刚注册的场景）
 * 3. 否则查远程 index 服务
 */
export async function loginWithPasskey(): Promise<
	{ ok: true; user: AuthUser } | { ok: false; error: string }
> {
	if (!window.PublicKeyCredential) {
		return { ok: false, error: 'WebAuthn is not supported in this browser' };
	}

	const rpId = getRpId();

	let credentialId: string;
	try {
		const result = await navigator.credentials.get({
			publicKey: {
				challenge: crypto.getRandomValues(new Uint8Array(32)),
				rpId,
				userVerification: 'preferred',
				timeout: 60_000
			}
		});

		if (!result || !(result instanceof PublicKeyCredential)) {
			return { ok: false, error: 'No passkey selected' };
		}
		credentialId = toBase64url(result.rawId);
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'Login was cancelled' };
		}
		return {
			ok: false,
			error: `WebAuthn error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	// 先查本地
	const local = findLocalKey(credentialId);
	if (local) {
		return {
			ok: true,
			user: {
				name: local.name,
				credentialId: local.credentialId,
				publicKey: local.publicKey,
				rpId: local.rpId,
				createdAt: local.createdAt
			}
		};
	}

	// 查远程
	try {
		const params = new URLSearchParams({ rpId, credentialId });
		const res = await fetch(`${INDEX_BASE}/api/query?${params}`);

		if (!res.ok) {
			if (res.status === 404) {
				return {
					ok: false,
					error: 'This passkey is not registered. Please create an account first.'
				};
			}
			return { ok: false, error: `Server error (${res.status})` };
		}

		const stored: StoredKey = await res.json();
		return {
			ok: true,
			user: {
				name: stored.name,
				credentialId: stored.credentialId,
				publicKey: stored.publicKey,
				rpId: stored.rpId,
				createdAt: stored.createdAt
			}
		};
	} catch {
		return { ok: false, error: 'Cannot reach the key index server' };
	}
}
