/**
 * 会员控制权证明（纯客户端 passkey 断言）。
 *
 * 享受 Pro 服务费豁免前，登录用户必须**当场**用 passkey 做一次 WebAuthn 断言，
 * 证明此刻真正持有该 Safe 的 credential —— 仅凭「已登录」状态、复制的 localStorage
 * session、或观察钱包(watch-only)连接都无法通过：拿不到 credential 就过不了生物识别，
 * 也通不过下面的 P-256 签名校验。这正是防止「别人用观察钱包绕过收费」的关口。
 *
 * 验证级别：**纯客户端**（用户既定）。
 *  - 断言用 `allowCredentials` 绑定到登录用户的 credentialId（只有那把 passkey 能满足）。
 *  - 用 `crypto.subtle` 对返回的 P-256 签名做完整校验：
 *      verify(pubkey, sig, authenticatorData ‖ SHA256(clientDataJSON))
 *  - 校验 clientDataJSON 里的 challenge/type，防重放。
 *
 * 局限（已与产品对齐）：豁免最终由客户端把 feeWei 设 0，链上不强制；签名关口能挡住
 * 复制 session / 观察钱包这类普通绕过，但改源码的本地客户端无法在链上阻止 —— 这对任何
 * 客户端收费都一样。会员只解锁 UI 付费墙，碰不到协议层（gas / bundler / capsule 上链费照旧）。
 */
import { browser } from '$app/environment';
import type { Address } from 'viem';
import { authStore } from '$lib/auth';
import { fromBase64url, toBase64url, derToRawSignature } from '$lib/auth/crypto-utils.js';
import { subscriptionStore } from './subscription-store.svelte.js';

export type ProofFailure =
	| 'not-logged-in'
	| 'not-member'
	| 'unsupported'
	| 'cancelled'
	| 'wrong-credential'
	| 'bad-signature';

export interface ProofResult {
	ok: boolean;
	reason?: ProofFailure;
}

/** "04"+x+y 无压缩 P-256 公钥 hex → 65 字节。 */
function publicKeyToBytes(hex: string): Uint8Array<ArrayBuffer> {
	const clean = hex.replace(/^0x/, '');
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

class MemberWaiver {
	/** 本会话是否已通过签名证明 */
	active = $state(false);
	/** 已证明的 Safe 地址（换号即失效） */
	provenSafe = $state<string | null>(null);
	/** 证明时间戳 */
	provenAt = $state(0);
	/** 正在签名中 */
	proving = $state(false);

	/**
	 * 当前是否可享受会员豁免：已登录 + 链上确为会员 + 本会话已签名证明，且证明的
	 * 正是当前登录的同一个 Safe。任何一项不满足都回退到收费。
	 */
	get isWaiverActive(): boolean {
		const user = authStore.user;
		if (!user) return false;
		const safe = user.safeAddress.toLowerCase();
		return (
			this.active &&
			// isPremium 必须是「为当前登录 Safe」加载的，否则可能读到别的地址的会员状态
			subscriptionStore.loadedFor === safe &&
			subscriptionStore.isPremium &&
			this.provenSafe?.toLowerCase() === safe
		);
	}

	/** 是否“有资格”签名豁免（已登录且链上是会员，但本会话尚未签名）。 */
	get canProve(): boolean {
		const user = authStore.user;
		if (!user) return false;
		return (
			subscriptionStore.loadedFor === user.safeAddress.toLowerCase() &&
			subscriptionStore.isPremium &&
			!this.isWaiverActive
		);
	}

	reset(): void {
		this.active = false;
		this.provenSafe = null;
		this.provenAt = 0;
		this.proving = false;
	}

	/**
	 * Drop the proven waiver if the active account no longer matches the one it was
	 * proven for (logout → null, or switch to another Safe). Prevents the waiver
	 * from silently reactivating on re-login / switch-back without a fresh passkey proof.
	 */
	syncToUser(safeAddress: string | null): void {
		if (this.active && safeAddress?.toLowerCase() !== this.provenSafe?.toLowerCase()) {
			this.reset();
		}
	}
}

export const memberWaiver = new MemberWaiver();

/** 确保已从链上读取会员状态（懒加载，已加载则跳过）。 */
export async function ensureMembershipLoaded(): Promise<void> {
	const user = authStore.user;
	if (!user) return;
	const target = user.safeAddress.toLowerCase();
	// 跳过条件：① 已为当前 Safe 成功加载；② 正有一个针对当前 Safe 的加载在途（并发去重，
	// 此时 loadedFor 可能仍为 null）。若 store 是为别的地址加载/在载的，必须重新拉取，
	// 避免读到错误的会员状态。
	if (subscriptionStore.loadingFor === target) return;
	if (subscriptionStore.loadedFor === target && subscriptionStore.loaded) return;
	await subscriptionStore.load(user.safeAddress as Address);
}

/**
 * 发起一次 passkey 控制权证明。成功后激活本会话的会员豁免。
 * 不弹任何 UI —— 只触发系统 passkey 提示；调用方负责展示结果文案。
 */
export async function proveMemberControl(): Promise<ProofResult> {
	if (!browser || typeof window.PublicKeyCredential === 'undefined') {
		return { ok: false, reason: 'unsupported' };
	}
	const user = authStore.user;
	if (!user) return { ok: false, reason: 'not-logged-in' };

	memberWaiver.proving = true;
	try {
		await ensureMembershipLoaded();
		// isPremium 必须是「为当前登录 Safe」加载的结果，否则按非会员处理（fail-closed），
		// 防止并发加载别的地址时把它的会员状态读进来。
		if (
			subscriptionStore.loadedFor !== user.safeAddress.toLowerCase() ||
			!subscriptionStore.isPremium
		) {
			return { ok: false, reason: 'not-member' };
		}

		const message = `biubiu-member:${user.safeAddress}:${Date.now()}`;
		const challenge = new TextEncoder().encode(message);

		let assertion: PublicKeyCredential | null;
		try {
			const cred = await navigator.credentials.get({
				publicKey: {
					challenge,
					rpId: user.rpId,
					allowCredentials: [
						{ type: 'public-key', id: new Uint8Array(fromBase64url(user.credentialId)) },
					],
					userVerification: 'required',
					timeout: 60_000,
				},
			});
			assertion = cred instanceof PublicKeyCredential ? cred : null;
		} catch {
			return { ok: false, reason: 'cancelled' };
		}
		if (!assertion) return { ok: false, reason: 'cancelled' };

		// 必须是登录用户那把 credential（allowCredentials 已约束，这里再核对一次）
		if (toBase64url(assertion.rawId) !== user.credentialId) {
			return { ok: false, reason: 'wrong-credential' };
		}

		const resp = assertion.response as AuthenticatorAssertionResponse;

		// 校验 challenge + type，防重放
		let clientData: { type?: string; challenge?: string };
		try {
			clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
		} catch {
			return { ok: false, reason: 'bad-signature' };
		}
		if (clientData.type !== 'webauthn.get') return { ok: false, reason: 'bad-signature' };
		if (clientData.challenge !== toBase64url(challenge.buffer as ArrayBuffer)) {
			return { ok: false, reason: 'bad-signature' };
		}

		// P-256 签名校验：verify(pubkey, sig, authenticatorData ‖ SHA256(clientDataJSON))
		const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', resp.clientDataJSON));
		const authData = new Uint8Array(resp.authenticatorData);
		const signedData = new Uint8Array(authData.length + clientHash.length);
		signedData.set(authData, 0);
		signedData.set(clientHash, authData.length);

		const key = await crypto.subtle.importKey(
			'raw',
			publicKeyToBytes(user.publicKey),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify'],
		);
		const valid = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			new Uint8Array(derToRawSignature(resp.signature)),
			signedData,
		);
		if (!valid) return { ok: false, reason: 'bad-signature' };

		memberWaiver.active = true;
		memberWaiver.provenSafe = user.safeAddress;
		memberWaiver.provenAt = Date.now();
		return { ok: true };
	} finally {
		memberWaiver.proving = false;
	}
}
