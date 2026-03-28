/**
 * WebAuthn P256 签名辅助 — 用于策略控制（暂停/恢复）的前端签名。
 *
 * 流程：
 * 1. 构造 message（如 "pause:v61:1711612800"）
 * 2. 使用 passkey 签名 message（作为 WebAuthn challenge）
 * 3. 返回签名数据供 POST /api/vN/control 使用
 */
import { toBase64url, bufToHex, derToRawSignature } from '$lib/auth/crypto-utils.js';

export interface SignedControlPayload {
	message: string;
	signature: string;
	authenticatorData: string;
	clientDataJSON: string;
}

/**
 * 使用 WebAuthn passkey 签名一个控制动作。
 *
 * @param action — "pause" | "resume" | "set_params"
 * @param strategyId — 策略 ID，如 "v61"
 * @returns 签名数据，或 null 如果用户取消
 */
export async function signControlAction(
	action: string,
	strategyId: string
): Promise<SignedControlPayload | null> {
	if (!window.PublicKeyCredential) return null;

	const message = `${action}:${strategyId}:${Date.now()}`;
	const challenge = new TextEncoder().encode(message);

	const rpId = (() => {
		const host = window.location.hostname;
		if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
		return 'biubiu.tools';
	})();

	try {
		const assertion = await navigator.credentials.get({
			publicKey: {
				challenge,
				rpId,
				userVerification: 'required',
				timeout: 60_000
			}
		});

		if (!assertion || !(assertion instanceof PublicKeyCredential)) return null;

		const response = assertion.response as AuthenticatorAssertionResponse;
		const rawSig = derToRawSignature(response.signature);

		return {
			message,
			signature: bufToHex(rawSig),
			authenticatorData: toBase64url(response.authenticatorData),
			clientDataJSON: toBase64url(response.clientDataJSON)
		};
	} catch {
		return null;
	}
}
