/**
 * WebAuthn 签名 → Safe 合约签名格式。
 *
 * 将 safeOpHash 作为 WebAuthn challenge，用户通过生物验证签名，
 * 然后提取 authenticatorData、clientDataFields、r、s。
 */
import { type Hex } from 'viem';
import { fromBase64url, derToRawSignature, bufToHex, P256_N } from '../crypto-utils.js';

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
export function extractClientDataFields(clientDataJSON: ArrayBuffer): string {
	const json = new TextDecoder().decode(clientDataJSON);

	// 链上 Safe WebAuthn 校验器硬编码前缀 `{"type":"webauthn.get","challenge":"`，
	// 即 challenge 必须紧跟在 type 之后、且无空白。若浏览器把字段重排（如 origin 在
	// challenge 之前）或在 type/challenge 间插入空白，按字节重建必然失败 →
	// 显式拒绝，绝不静默产出链上无法验证的签名。
	const CANONICAL_PREFIX = '{"type":"webauthn.get","challenge":"';
	if (!json.startsWith(CANONICAL_PREFIX)) {
		throw new Error(
			'Non-canonical clientDataJSON: expected it to start with {"type":"webauthn.get","challenge":"'
		);
	}

	const valueStart = CANONICAL_PREFIX.length;
	// 找到 challenge 值的闭合引号（跳过转义）
	let valueEnd = valueStart;
	while (valueEnd < json.length) {
		if (json[valueEnd] === '"' && json[valueEnd - 1] !== '\\') break;
		valueEnd++;
	}
	if (valueEnd >= json.length) throw new Error('Unterminated challenge value in clientDataJSON');

	// 找到整个 JSON 对象的闭合 }（应为最后一个非空白字符）
	let objEnd = json.length - 1;
	while (objEnd > valueEnd && json[objEnd] !== '}') objEnd--;
	if (json[objEnd] !== '}') throw new Error('Malformed clientDataJSON: no closing brace');

	// clientDataFields = challenge 闭合引号后的剩余字段，到 } 之前。
	//
	// 链上 Safe WebAuthn 校验器（SharedSigner verifiers=0x100）按字节重建：
	//   {"type":"webauthn.get","challenge":"<c>",<clientDataFields>}
	// 即在 challenge 值后硬编码一个 `,`，再拼接 clientDataFields。因此
	// clientDataFields 必须是 challenge 闭合引号 **紧随的逗号之后**、`}` 之前的
	// 原始字节，且不含任何前导逗号/空白。
	//
	// 关键正确性约束（否则会静默产出链上无法验证的签名）：
	//  1. challenge 不能是最后一个字段（否则后面是 `}` 而非 `,`，重建会少一个 `,`）。
	//  2. challenge 值闭合引号与 `,` 之间不能有空白（非规范 clientDataJSON）。
	//  3. `,` 与下一个字段之间的空白会被原样保留（链上拼接亦如此），这是允许的，
	//     因为它已包含在 clientDataFields 内并被一并签名/重建。
	// 1、2 任一不满足都无法字节级重建 → 显式抛错，绝不返回错误的字段串。
	const sep = json[valueEnd + 1];
	if (sep !== ',') {
		throw new Error(
			'Cannot extract clientDataFields: challenge must be followed by `,` with no whitespace (non-canonical clientDataJSON)'
		);
	}
	const afterChallenge = json.slice(valueEnd + 2, objEnd);
	if (afterChallenge.length === 0) {
		throw new Error('Cannot extract clientDataFields: no fields after challenge');
	}
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

	let clientDataFields: string;
	let rawSig: Uint8Array;
	try {
		// clientDataFields — 对非规范 clientDataJSON 会抛错（防止产出链上无法验证的签名）。
		clientDataFields = extractClientDataFields(response.clientDataJSON);
		// DER → raw (r, s) — 对畸形 DER 也会抛错。
		rawSig = derToRawSignature(response.signature);
	} catch (err) {
		// 转成结构化错误，由调用方在 UI 内联提示，绝不让其作为未捕获异常崩溃签名流程。
		return {
			ok: false,
			error: `Signature encoding error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	const r = BigInt('0x' + bufToHex(rawSig.slice(0, 32)));
	let s = BigInt('0x' + bufToHex(rawSig.slice(32)));

	// 规范化为 low-S：RIP-7212 P-256 预编译（SafeWebAuthnSharedSigner verifiers=0x100）
	// 拒绝 high-S 签名，否则约 50% 概率验签失败（含 Tempo 等依赖预编译的链）。
	// 只把可塑签名规范化，不改变 SafeOp hash，也不改变 Safe 地址。
	if (s > P256_N / 2n) s = P256_N - s;

	return {
		ok: true,
		result: { authenticatorData, clientDataFields, r, s }
	};
}
