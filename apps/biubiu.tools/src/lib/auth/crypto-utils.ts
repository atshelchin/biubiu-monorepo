/**
 * 共享加密工具函数。
 * 从 passkey-auth.ts 提取，供 WebAuthn 签名和 Safe 交易复用。
 */

export function toBase64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let str = '';
	for (const b of bytes) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(b64url: string): ArrayBuffer {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
	const binary = atob(b64 + pad);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export function bufToHex(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * 将 WebAuthn DER 编码的 ECDSA 签名转换为原始 r||s 格式（各 32 字节）。
 */
export function derToRawSignature(der: ArrayBuffer): Uint8Array {
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

/** P-256 曲线阶 */
export const P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
