/**
 * 策略引擎 API 客户端。
 *
 * 封装所有与 /api/engine/* 端点的交互。
 * 读操作使用 token 认证，写操作自动 passkey 签名。
 */
import type { ManagedEndpoint } from './types.js';
import { signedFetch } from './passkey-client.js';

function authHeaders(endpoint: ManagedEndpoint): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${endpoint.token}`,
		'X-Client-Id': endpoint.clientId
	};
}

async function authGet(endpoint: ManagedEndpoint, path: string): Promise<unknown> {
	const res = await fetch(`${endpoint.url}${path}`, {
		headers: authHeaders(endpoint)
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

// ─── 类型 ───

export interface InstanceOverrides {
	entryAmount?: number;
	priceMin?: number;
	priceMax?: number;
	hedgingEnabled?: boolean;
	[key: string]: unknown;
}

export interface ScheduleRule {
	days: number[];
	startTime: string;
	endTime: string;
	timezone: string;
}

export interface StrategyInstance {
	id: string;
	baseStrategyId: string;
	label: string;
	overrides: InstanceOverrides;
	status: 'stopped' | 'running' | 'paused' | 'error';
	schedule: ScheduleRule[] | null;
	errorMessage: string | null;
	stats: {
		totalRounds: number;
		profit: number;
		winRate: number;
		lastActiveAt: string | null;
	};
	createdAt: string;
	updatedAt: string;
}

export interface BaseStrategy {
	id: string;
	label: string;
}

// ─── API ───

/** 获取所有实例状态 */
export async function fetchEngineStatus(
	endpoint: ManagedEndpoint
): Promise<{ instances: StrategyInstance[] }> {
	return (await authGet(endpoint, '/api/engine/status')) as {
		instances: StrategyInstance[];
	};
}

/** 获取可用的基础策略 */
export async function fetchBaseStrategies(
	endpoint: ManagedEndpoint
): Promise<{ strategies: BaseStrategy[] }> {
	return (await authGet(endpoint, '/api/engine/strategies')) as {
		strategies: BaseStrategy[];
	};
}

/** 获取单个实例详情 */
export async function fetchInstanceStatus(
	endpoint: ManagedEndpoint,
	instanceId: string
): Promise<StrategyInstance> {
	return (await authGet(endpoint, `/api/engine/${instanceId}/status`)) as StrategyInstance;
}

/** 创建实例（需签名） */
export async function createInstance(
	endpoint: ManagedEndpoint,
	payload: { baseStrategyId: string; label: string; overrides?: InstanceOverrides; schedule?: ScheduleRule[] }
): Promise<StrategyInstance> {
	const res = await signedFetch(endpoint, '/api/engine/instances', 'POST', payload);
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error((data as any).error ?? `Create failed (${res.status})`);
	}
	return res.json();
}

/** 启动实例（需签名） */
export async function startInstance(
	endpoint: ManagedEndpoint,
	instanceId: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}/start`, 'POST');
	return res.json();
}

/** 停止实例（需签名） */
export async function stopInstance(
	endpoint: ManagedEndpoint,
	instanceId: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}/stop`, 'POST');
	return res.json();
}

/** 暂停实例（需签名） */
export async function pauseInstance(
	endpoint: ManagedEndpoint,
	instanceId: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}/pause`, 'POST');
	return res.json();
}

/** 更新实例配置（需签名） */
export async function updateInstanceConfig(
	endpoint: ManagedEndpoint,
	instanceId: string,
	payload: { label?: string; overrides?: InstanceOverrides }
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}/config`, 'PUT', payload);
	return res.json();
}

/** 更新定时规则（需签名） */
export async function updateInstanceSchedule(
	endpoint: ManagedEndpoint,
	instanceId: string,
	rules: ScheduleRule[] | null
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}/schedule`, 'PUT', { rules });
	return res.json();
}

/** 删除实例（需签名） */
export async function deleteInstance(
	endpoint: ManagedEndpoint,
	instanceId: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await signedFetch(endpoint, `/api/engine/${instanceId}`, 'DELETE');
	return res.json();
}
