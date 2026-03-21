/**
 * WebAuthn 签名 → Safe 合约签名格式。
 *
 * 将 safeOpHash 作为 WebAuthn challenge，用户通过生物验证签名，
 * 然后提取 authenticatorData、clientDataFields、r、s。
 */
import { type Hex } from 'viem';
import { fromBase64url, derToRawSignature, bufToHex } from '../crypto-utils.js';

export interface WebAuthnSignatureResult {
	authenticatorData: Hex;
	clientDataFields: string;
	r: bigint;
	s: bigint;
}

/**
 * 从 clientDataJSON 提取 clientDataFields。
 *
 * clientDataJSON 格式:
 * {"type":"webauthn.get","challenge":"<b64url>","origin":"https://...","crossOrigin":false}
 *
 * clientDataFields = challenge 字段闭合引号后到最终 } 之前的内容（含前导逗号）
 * 例如: ,"origin":"https://biubiu.tools","crossOrigin":false
 */
function extractClientDataFields(clientDataJSON: ArrayBuffer): string {
	const json = new TextDecoder().decode(clientDataJSON);

	// 找到 "challenge":"..." 的闭合引号
	const challengeKey = '"challenge":"';
	const challengeStart = json.indexOf(challengeKey);
	if (challengeStart === -1) throw new Error('challenge not found in clientDataJSON');

	const valueStart = challengeStart + challengeKey.length;
	// 找到 challenge 值的闭合引号（跳过转义）
	let valueEnd = valueStart;
	while (valueEnd < json.length) {
		if (json[valueEnd] === '"' && json[valueEnd - 1] !== '\\') break;
		valueEnd++;
	}

	// clientDataFields = challenge 闭合引号后，跳过 ", 分隔符，到 } 之前
	// 合约模板已包含 ", — 我们只需要后续字段内容，不含前导逗号
	// 浏览器: ..."challenge":"xxx","origin":"..."...}
	//                              ^ valueEnd
	// 跳过 ",(两个字符) → 从 valueEnd+2 开始
	const afterChallenge = json.slice(valueEnd + 2, json.length - 1);
	return afterChallenge;
}

/**
 * 用 passkey 签名 SafeOp hash。
 *
 * @param safeOpHash - 32 字节 EIP-712 hash (hex)
 * @param credentialId - WebAuthn credential ID (base64url)
 * @param rpId - WebAuthn RP ID
 */
export async function signSafeOpWithPasskey(
	safeOpHash: Hex,
	credentialId: string,
	rpId: string
): Promise<{ ok: true; result: WebAuthnSignatureResult } | { ok: false; error: string }> {
	// 1. safeOpHash → challenge bytes
	const hashBytes = new Uint8Array(
		safeOpHash
			.slice(2)
			.match(/.{2}/g)!
			.map((b) => parseInt(b, 16))
	);

	// 2. WebAuthn assertion
	let assertion: PublicKeyCredential;
	try {
		const credentialRawId = fromBase64url(credentialId);
		const result = await navigator.credentials.get({
			publicKey: {
				challenge: hashBytes,
				rpId,
				allowCredentials: [{ id: credentialRawId, type: 'public-key' }],
				userVerification: 'required',
				timeout: 60_000
			}
		});

		if (!result || !(result instanceof PublicKeyCredential)) {
			return { ok: false, error: 'Failed to sign' };
		}
		assertion = result;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			return { ok: false, error: 'Signing was cancelled' };
		}
		return {
			ok: false,
			error: `WebAuthn error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	// 3. 提取数据
	const response = assertion.response as AuthenticatorAssertionResponse;

	// authenticatorData → hex
	const authenticatorData = ('0x' + bufToHex(response.authenticatorData)) as Hex;

	// clientDataFields
	const clientDataFields = extractClientDataFields(response.clientDataJSON);

	// DER → raw (r, s)
	const rawSig = derToRawSignature(response.signature);
	let r = BigInt('0x' + bufToHex(rawSig.slice(0, 32)));
	let s = BigInt('0x' + bufToHex(rawSig.slice(32)));

	return {
		ok: true,
		result: { authenticatorData, clientDataFields, r, s }
	};
}
