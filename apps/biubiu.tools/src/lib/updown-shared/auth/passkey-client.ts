/**
 * Passkey 客户端 SDK。
 *
 * 封装 WebAuthn API 调用，提供：
 * - Passkey 注册（创建 credential，发送公钥到端点服务器）
 * - 操作签名（获取 challenge → 签名 → 返回断言）
 *
 * 所有 WebAuthn credential 绑定 biubiu.tools 域。
 * 私钥永远不离开用户设备。
 */
import type {
	AuthChallenge,
	EndpointCapabilities,
	ManagedEndpoint,
	OperationSignature
} from './types.js';

const RP_NAME = 'BiuBiu Tools';

/** 获取当前环境的 RP ID（localhost 开发时必须用 localhost） */
function getRpId(): string {
	if (typeof window === 'undefined') return 'biubiu.tools';
	const host = window.location.hostname;
	if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
	return 'biubiu.tools';
}

/** 运行环境是否在 biubiu.tools 域下（localhost 开发也允许） */
function isValidOrigin(): boolean {
	if (typeof window === 'undefined') return false;
	const host = window.location.hostname;
	return host === 'biubiu.tools' || host === 'localhost' || host === '127.0.0.1';
}

/** 构建带认证头的 fetch 请求 */
function authFetch(
	endpoint: ManagedEndpoint,
	path: string,
	init?: RequestInit
): Promise<Response> {
	const url = `${endpoint.url}${path}`;
	return fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${endpoint.token}`,
			'X-Client-Id': endpoint.clientId,
			...(init?.headers ?? {})
		}
	});
}

// ─── 公共 API ───

/** 获取端点能力声明 */
export async function fetchCapabilities(
	endpoint: ManagedEndpoint
): Promise<EndpointCapabilities | null> {
	try {
		const res = await authFetch(endpoint, '/api/auth/capabilities');
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

/** 获取签名挑战 */
async function fetchChallenge(endpoint: ManagedEndpoint): Promise<AuthChallenge | null> {
	try {
		const res = await authFetch(endpoint, '/api/auth/challenge', { method: 'POST' });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

/** Base64url 编解码 */
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

/**
 * 注册 Passkey。
 *
 * 流程：
 * 1. 从端点服务器获取 challenge
 * 2. 调用 WebAuthn navigator.credentials.create()
 * 3. 发送公钥到端点服务器
 * 4. 返回 credentialId
 */
export async function registerPasskey(
	endpoint: ManagedEndpoint
): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
	if (!isValidOrigin()) {
		return { ok: false, error: 'Passkey registration requires biubiu.tools domain' };
	}

	if (!window.PublicKeyCredential) {
		return { ok: false, error: 'WebAuthn not supported in this browser' };
	}

	// 1. 获取 challenge
	const challengeData = await fetchChallenge(endpoint);
	if (!challengeData) {
		return { ok: false, error: 'Failed to get challenge from endpoint' };
	}

	// 2. 创建 credential
	let credential: PublicKeyCredential;
	try {
		const clientIdBytes = new TextEncoder().encode(endpoint.clientId);
		const result = await navigator.credentials.create({
			publicKey: {
				rp: { id: getRpId(), name: RP_NAME },
				user: {
					id: clientIdBytes,
					name: endpoint.clientId,
					displayName: endpoint.label || 'Trading Key'
				},
				challenge: fromBase64url(challengeData.challenge),
				pubKeyCredParams: [
					{ alg: -7, type: 'public-key' }, // ES256
					{ alg: -257, type: 'public-key' } // RS256 fallback
				],
				authenticatorSelection: {
					residentKey: 'preferred',
					userVerification: 'preferred'
				},
				timeout: 120_000
			}
		});

		if (!result || !(result instanceof PublicKeyCredential)) {
			return { ok: false, error: 'Credential creation failed' };
		}
		credential = result;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'User cancelled passkey registration' };
		}
		return { ok: false, error: `WebAuthn error: ${err instanceof Error ? err.message : String(err)}` };
	}

	// 3. 提取公钥并发送到端点服务器
	const attestationResponse = credential.response as AuthenticatorAttestationResponse;
	const publicKeyBytes = attestationResponse.getPublicKey();
	if (!publicKeyBytes) {
		return { ok: false, error: 'Failed to extract public key' };
	}

	const registerPayload = {
		credentialId: toBase64url(credential.rawId),
		publicKey: toBase64url(publicKeyBytes),
		attestationObject: toBase64url(attestationResponse.attestationObject),
		clientDataJSON: toBase64url(attestationResponse.clientDataJSON)
	};

	try {
		const res = await authFetch(endpoint, '/api/auth/register-passkey', {
			method: 'POST',
			body: JSON.stringify(registerPayload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			return { ok: false, error: (data as any).error ?? `Registration failed (${res.status})` };
		}
	} catch {
		return { ok: false, error: 'Failed to send public key to endpoint' };
	}

	return { ok: true, credentialId: toBase64url(credential.rawId) };
}

/**
 * 签名操作。
 *
 * 流程：
 * 1. 从端点服务器获取 challenge
 * 2. 调用 WebAuthn navigator.credentials.get() 签名
 * 3. 返回签名数据（供附加到 API 请求）
 */
export async function signOperation(
	endpoint: ManagedEndpoint
): Promise<
	| { ok: true; signature: OperationSignature; discoveredCredentialId?: string }
	| { ok: false; error: string }
> {
	// 1. 获取 challenge
	const challengeData = await fetchChallenge(endpoint);
	if (!challengeData) {
		return { ok: false, error: 'Failed to get challenge' };
	}

	// 2. 签名
	const publicKeyOptions: PublicKeyCredentialRequestOptions = {
		challenge: fromBase64url(challengeData.challenge),
		rpId: getRpId(),
		userVerification: 'preferred',
		timeout: 60_000
	};

	// If we know the credentialId, restrict to it; otherwise use discoverable credentials
	// (covers passkeys synced via iCloud Keychain / cross-browser)
	if (endpoint.credentialId) {
		publicKeyOptions.allowCredentials = [
			{ id: fromBase64url(endpoint.credentialId), type: 'public-key' }
		];
	}

	let assertion: PublicKeyCredential;
	try {
		const result = await navigator.credentials.get({ publicKey: publicKeyOptions });

		if (!result || !(result instanceof PublicKeyCredential)) {
			return { ok: false, error: 'Assertion failed' };
		}
		assertion = result;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'User cancelled signature' };
		}
		return {
			ok: false,
			error: `WebAuthn error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
	const credentialId = toBase64url(assertion.rawId);

	return {
		ok: true,
		signature: {
			credentialId,
			authenticatorData: toBase64url(assertionResponse.authenticatorData),
			clientDataJSON: toBase64url(assertionResponse.clientDataJSON),
			signature: toBase64url(assertionResponse.signature)
		},
		// If we didn't have the credentialId before, return it so caller can save
		discoveredCredentialId: endpoint.credentialId ? undefined : credentialId
	};
}

/**
 * 发送带签名的写请求。
 *
 * 自动获取 challenge → 签名 → 附加到请求体。
 */
export async function signedFetch(
	endpoint: ManagedEndpoint,
	path: string,
	method: 'POST' | 'PUT' | 'DELETE',
	payload?: unknown
): Promise<Response> {
	const sigResult = await signOperation(endpoint);
	if (!sigResult.ok) {
		return new Response(JSON.stringify({ error: sigResult.error }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Auto-save discovered credentialId (passkey synced from another browser)
	if (sigResult.discoveredCredentialId) {
		saveDiscoveredCredentialId(
			endpoint.url,
			endpoint.clientId,
			sigResult.discoveredCredentialId
		);
		// Update the in-memory endpoint too so subsequent calls don't re-discover
		endpoint.credentialId = sigResult.discoveredCredentialId;
	}

	return authFetch(endpoint, path, {
		method,
		body: JSON.stringify({
			payload: payload ?? {},
			signature: sigResult.signature
		})
	});
}

/**
 * Save a discovered credentialId back to localStorage.
 * Called when a passkey synced via iCloud Keychain is used for the first time in this browser.
 */
function saveDiscoveredCredentialId(url: string, clientId: string, credentialId: string): void {
	const STORAGE_KEY = 'biubiu-updown-managed-endpoints';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const endpoints = JSON.parse(raw) as ManagedEndpoint[];
		const updated = endpoints.map((e) =>
			e.url === url && e.clientId === clientId ? { ...e, credentialId } : e
		);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
	} catch {
		// Non-critical
	}
}
