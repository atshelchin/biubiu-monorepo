/**
 * 端点管理 Store（Svelte 5 reactive）。
 *
 * 管理已连接的端点列表：
 * - 添加/删除端点
 * - Passkey 注册状态
 * - 权限级别缓存
 * - localStorage 持久化
 */
import type { ManagedEndpoint, EndpointCapabilities } from './types.js';
import { fetchCapabilities, registerPasskey } from './passkey-client.js';

const STORAGE_KEY = 'biubiu-updown-managed-endpoints';

function loadEndpoints(): ManagedEndpoint[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as ManagedEndpoint[];
	} catch {
		return [];
	}
}

function saveEndpoints(endpoints: ManagedEndpoint[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
	} catch {
		// Storage full — non-critical
	}
}

export class EndpointStore {
	// ─── Reactive state ───
	endpoints = $state<ManagedEndpoint[]>(loadEndpoints());
	activeEndpointUrl = $state<string | null>(null);

	// Derived
	activeEndpoint = $derived(
		this.endpoints.find((e) => e.url === this.activeEndpointUrl) ?? null
	);

	constructor() {
		// Auto-persist on changes
		$effect(() => {
			saveEndpoints(this.endpoints);
		});
	}

	// ─── 查询 ───

	getEndpoint(url: string): ManagedEndpoint | undefined {
		return this.endpoints.find((e) => e.url === url);
	}

	// ─── 添加端点 ───

	async addEndpoint(
		url: string,
		token: string,
		clientId: string,
		label: string
	): Promise<
		| { ok: true; capabilities: EndpointCapabilities }
		| { ok: false; error: string }
	> {
		// 去重
		if (this.endpoints.some((e) => e.url === url && e.clientId === clientId)) {
			return { ok: false, error: 'Endpoint already added with this clientId' };
		}

		const tempEndpoint: ManagedEndpoint = {
			url: url.replace(/\/+$/, ''),
			token,
			clientId,
			label,
			credentialId: null,
			permissions: null,
			addedAt: Date.now()
		};

		// 验证连接并获取能力
		const capabilities = await fetchCapabilities(tempEndpoint);
		if (!capabilities) {
			return { ok: false, error: 'Failed to connect to endpoint. Check URL and token.' };
		}

		if (!capabilities.permissions.read) {
			return { ok: false, error: 'Token has no read permission' };
		}

		tempEndpoint.permissions = capabilities.permissions;
		this.endpoints = [...this.endpoints, tempEndpoint];
		return { ok: true, capabilities };
	}

	// ─── 删除端点 ───

	removeEndpoint(url: string, clientId: string): void {
		this.endpoints = this.endpoints.filter(
			(e) => !(e.url === url && e.clientId === clientId)
		);
		if (this.activeEndpointUrl === url) {
			this.activeEndpointUrl = null;
		}
	}

	// ─── Passkey 注册 ───

	async registerPasskey(
		url: string,
		clientId: string
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const endpoint = this.endpoints.find(
			(e) => e.url === url && e.clientId === clientId
		);
		if (!endpoint) return { ok: false, error: 'Endpoint not found' };

		const result = await registerPasskey(endpoint);
		if (!result.ok) return result;

		// 更新 credentialId
		this.endpoints = this.endpoints.map((e) =>
			e.url === url && e.clientId === clientId
				? { ...e, credentialId: result.credentialId }
				: e
		);

		return { ok: true };
	}

	// ─── 刷新能力 ───

	async refreshCapabilities(url: string, clientId: string): Promise<void> {
		const endpoint = this.endpoints.find(
			(e) => e.url === url && e.clientId === clientId
		);
		if (!endpoint) return;

		const capabilities = await fetchCapabilities(endpoint);
		if (!capabilities) return;

		this.endpoints = this.endpoints.map((e) =>
			e.url === url && e.clientId === clientId
				? {
						...e,
						permissions: capabilities.permissions,
						credentialId: capabilities.passkey.registered
							? e.credentialId // 保持本地存储的 credentialId
							: null
					}
				: e
		);
	}

	// ─── 选择活跃端点 ───

	setActive(url: string | null): void {
		this.activeEndpointUrl = url;
	}
}
