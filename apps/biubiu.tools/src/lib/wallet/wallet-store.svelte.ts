/**
 * 全站「当前活动钱包」状态。
 *
 * - biubiu 内置钱包从 `authStore.user`（passkey 登录态）派生，始终是推荐首选。
 * - inject(EIP-6963) / walletpair 是外部 EIP-1193 钱包，连接成功后存到 `external`，
 *   并覆盖 biubiu 成为活动钱包。
 *
 * 功能页统一读 `walletStore.activeWallet`，不再直接碰 authStore + sendContractCall。
 */
import { authStore } from '$lib/auth';
import type { AuthUser } from '$lib/auth';
import { BiubiuWallet } from './backends/biubiu.js';
import { connectInjected, discoverInjectedProviders } from './backends/inject.js';
import { startWalletPair as startWalletPairBackend } from './backends/walletpair.js';
import { NotSmartAccountError } from './gate.js';
import type { Eip1193Provider, Eip6963ProviderDetail } from './eip1193.js';
import type { ConnectedWallet, WalletKind } from './types.js';

/** walletpair 配对的 UI 视图：二维码 + 指纹 + 取消 + 连接结果 promise。 */
export interface WalletPairView {
	uri: string;
	fingerprint: string;
	cancel(): void;
	/** 连接完成（含门禁）后 resolve 的判别式结果。 */
	done: Promise<ConnectResult>;
}

/** connectInject 结果；错误文案由 UI 本地化。 */
export type ConnectResult =
	| { ok: true }
	| { ok: false; reason: 'not-smart-account' | 'error'; message?: string };

/** 按 user 身份缓存 biubiu 钱包，避免每次访问 new 出新实例。 */
let biubiuCache: { user: AuthUser; wallet: BiubiuWallet } | null = null;
function biubiuWalletFor(user: AuthUser): BiubiuWallet {
	if (biubiuCache?.user === user) return biubiuCache.wallet;
	const wallet = new BiubiuWallet(user);
	biubiuCache = { user, wallet };
	return wallet;
}

class WalletStore {
	/** 外部 EIP-1193 钱包（inject / walletpair），未连接为 null。 */
	private external = $state<ConnectedWallet | null>(null);
	/** 外部钱包的事件清理函数（accountsChanged 监听等）。 */
	private externalCleanup: (() => void) | null = null;

	connecting = $state(false);
	error = $state<string | null>(null);

	/**
	 * 当前活动钱包：外部钱包优先，否则回落到 biubiu（若已 passkey 登录），都没有则 null。
	 * 读了 `external` 和 `authStore.user` 两个 $state，消费方在 $derived 中会正确重算。
	 */
	get activeWallet(): ConnectedWallet | null {
		if (this.external) return this.external;
		const user = authStore.user;
		return user ? biubiuWalletFor(user) : null;
	}

	get isConnected(): boolean {
		return this.activeWallet !== null;
	}

	get kind(): WalletKind | null {
		return this.activeWallet?.kind ?? null;
	}

	/**
	 * 连接指定方式的钱包。
	 * - biubiu：触发 passkey 登录。
	 * - inject：用 `discoverInject()` + `connectInject(detail)`（需先选具体钱包）。
	 * - walletpair：Phase 3 接入。
	 */
	async connect(kind: WalletKind): Promise<boolean> {
		this.error = null;
		if (kind === 'biubiu') {
			return authStore.login();
		}
		this.error = `${kind} 需先选择具体钱包再连接`;
		return false;
	}

	/** 发现可用的注入钱包（EIP-6963）。 */
	discoverInject(timeoutMs?: number): Promise<Eip6963ProviderDetail[]> {
		return discoverInjectedProviders(timeoutMs);
	}

	/**
	 * 连接选定的注入钱包。返回判别式结果，错误文案交给 UI 本地化
	 * （`not-smart-account` = 门禁拒绝纯 EOA）。
	 */
	async connectInject(detail: Eip6963ProviderDetail): Promise<ConnectResult> {
		this.connecting = true;
		this.error = null;
		try {
			const wallet = await connectInjected(detail);
			this.setExternal(wallet);
			return { ok: true };
		} catch (err) {
			if (err instanceof NotSmartAccountError) return { ok: false, reason: 'not-smart-account' };
			return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
		} finally {
			this.connecting = false;
		}
	}

	/**
	 * 启动一次 walletpair 扫码配对。立即返回二维码 URI/指纹给 UI；`done` 在钱包扫码、
	 * 接受、门禁通过后 resolve（错误文案交 UI 本地化）。
	 */
	async startWalletPair(relayUrl?: string): Promise<WalletPairView> {
		this.error = null;
		const pairing = await startWalletPairBackend(relayUrl);
		const done: Promise<ConnectResult> = pairing.connected
			.then((wallet) => {
				this.setExternal(wallet);
				return { ok: true } as ConnectResult;
			})
			.catch((err) => {
				if (err instanceof NotSmartAccountError) return { ok: false, reason: 'not-smart-account' };
				return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
			});
		return { uri: pairing.uri, fingerprint: pairing.fingerprint, cancel: pairing.cancel, done };
	}

	/** 设置外部钱包并挂上事件监听（inject/walletpair 连接成功后调用）。 */
	setExternal(wallet: ConnectedWallet): void {
		this.teardownExternal();
		this.external = wallet;
		this.error = null;
		this.watchExternal(wallet);
	}

	/** 账户切换 → 断开（身份已变，避免对错地址操作）；链切换正常，不处理。 */
	private watchExternal(wallet: ConnectedWallet): void {
		// inject / walletpair 都继承 Eip1193Wallet，带 public `provider`；biubiu 没有。
		const provider = (wallet as { provider?: Eip1193Provider }).provider;
		if (!provider?.on || !provider.removeListener) return;
		const onAccountsChanged = (...args: unknown[]) => {
			const accounts = (args[0] as string[]) ?? [];
			const next = accounts[0]?.toLowerCase();
			if (!next || next !== wallet.address.toLowerCase()) this.disconnect();
		};
		provider.on('accountsChanged', onAccountsChanged);
		this.externalCleanup = () => provider.removeListener?.('accountsChanged', onAccountsChanged);
	}

	private teardownExternal(): void {
		this.externalCleanup?.();
		this.externalCleanup = null;
	}

	disconnect(): void {
		if (this.external) {
			this.teardownExternal();
			this.external.disconnect();
			this.external = null;
		} else {
			authStore.logout();
		}
		this.error = null;
	}
}

export const walletStore = new WalletStore();
