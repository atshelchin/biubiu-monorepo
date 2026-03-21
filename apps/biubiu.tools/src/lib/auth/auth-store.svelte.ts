/**
 * 全站 Passkey 认证状态管理。
 *
 * Svelte 5 响应式 store，持久化到 localStorage。
 * 账号名 = passkey name。
 */
import { browser } from '$app/environment';
import type { AuthUser } from './types.js';
import { loginWithPasskey } from './passkey-auth.js';

const STORAGE_KEY = 'biubiu-auth-user';

function loadUser(): AuthUser | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AuthUser;
	} catch {
		return null;
	}
}

function saveUser(user: AuthUser | null): void {
	if (!browser) return;
	try {
		if (user) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		// Non-critical
	}
}

class AuthStore {
	user = $state<AuthUser | null>(loadUser());
	loading = $state(false);
	error = $state<string | null>(null);

	get isLoggedIn(): boolean {
		return this.user !== null;
	}

	get displayName(): string {
		return this.user?.name ?? '';
	}

	/** 设置已登录用户（注册成功后由 AuthModal 调用） */
	setUser(user: AuthUser): void {
		this.user = user;
		saveUser(user);
	}

	/** 登录 */
	async login(): Promise<boolean> {
		this.loading = true;
		this.error = null;

		const result = await loginWithPasskey();

		if (result.ok) {
			this.user = result.user;
			saveUser(result.user);
			this.loading = false;
			return true;
		}

		this.error = result.error;
		this.loading = false;
		return false;
	}

	/** 登出 */
	logout(): void {
		this.user = null;
		this.error = null;
		saveUser(null);
	}

	clearError(): void {
		this.error = null;
	}
}

export const authStore = new AuthStore();
