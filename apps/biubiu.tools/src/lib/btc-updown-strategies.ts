// Strategy registry for BTC Up/Down Dashboard
// Manages built-in and custom strategy endpoints with localStorage persistence

const STORAGE_KEY = 'biubiu-btc-updown-strategies';
export const API_HOST = 'https://bitcoin-up-or-down-5mins-001.awesometools.dev';

// --- Types ---

export interface StrategyEndpoint {
	id: string;
	label: string;
	baseUrl: string;
	type: 'builtin' | 'custom' | 'discovered';
	addedAt: number;
}

export interface StrategyInfo {
	version: string;
	name: string;
	mode: 'simulation' | 'live';
	description: string[];
	summary: { label: string; value: string }[];
	params: Record<string, unknown>;
	article: { url: string; label: string } | null;
	basePath?: string;
}

export interface ValidationProgress {
	step: string;
	status: 'pending' | 'checking' | 'ok' | 'fail';
}

export interface PersistedState {
	customStrategies: StrategyEndpoint[];
	visibleDiscoveredIds: string[];
	hiddenStrategyIds: string[] | null;
	activeStrategyId: string;
	collapsedSections?: string[];
}

export interface DiscoveryResult {
	strategies: StrategyEndpoint[];
	raw: StrategyInfo[];
}

// --- Default visible builtins (hide others on first visit) ---

export const DEFAULT_VISIBLE_BUILTINS = new Set(['v1', 'v3', 'v7', 'v8', 'v14', 'v15', 'v16']);

// --- Fallback strategies (used when discovery fails) ---

export const FALLBACK_STRATEGIES: StrategyEndpoint[] = [
	{ id: 'builtin:v1', label: 'v1', baseUrl: `${API_HOST}/api/v1`, type: 'builtin', addedAt: 0 },
];

// --- ID generation ---

export function generateCustomId(): string {
	return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// --- URL normalization ---

export function normalizeStrategyUrl(url: string): string {
	let normalized = url.trim();
	// Remove trailing slashes
	while (normalized.endsWith('/')) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

// --- Discovery ---

/** Derive the /api/strategies URL from any strategy baseUrl */
export function getDiscoveryUrl(strategyBaseUrl: string): { origin: string; path: string } | null {
	try {
		const url = new URL(strategyBaseUrl);
		// Strip /vN suffix: /api/v3 → /api, /api → /api
		const apiBase = url.pathname.replace(/\/v\d+$/, '');
		return { origin: url.origin, path: `${apiBase}/strategies` };
	} catch {
		return null;
	}
}

/** Fetch /api/strategies from a server and convert to StrategyEndpoint[] */
export async function discoverStrategies(
	serverOrigin: string,
	discoveryPath: string,
	lang: string,
	fetchFn: (url: string) => Promise<Response> = fetch
): Promise<DiscoveryResult | null> {
	try {
		const res = await fetchFn(`${serverOrigin}${discoveryPath}?lang=${lang}`);
		if (!res.ok) return null;
		const data = (await res.json()) as StrategyInfo[];
		if (!Array.isArray(data)) return null;
		const host = new URL(serverOrigin).host;
		const strategies = data.map((s) => ({
			id: `discovered:${host}:${s.version}`,
			label: s.version,
			baseUrl: `${serverOrigin}${s.basePath ?? `/api/${s.version}`}`,
			type: 'discovered' as const,
			addedAt: 0
		}));
		return { strategies, raw: data };
	} catch {
		return null;
	}
}

// --- Persistence ---

const DEFAULT_STATE: PersistedState = {
	customStrategies: [],
	visibleDiscoveredIds: [],
	hiddenStrategyIds: null,
	activeStrategyId: 'builtin:v1'
};

export function loadPersistedState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_STATE;
		const parsed = JSON.parse(raw);
		return {
			customStrategies: Array.isArray(parsed.customStrategies) ? parsed.customStrategies : [],
			visibleDiscoveredIds: Array.isArray(parsed.visibleDiscoveredIds)
				? parsed.visibleDiscoveredIds
				: [],
			hiddenStrategyIds: Array.isArray(parsed.hiddenStrategyIds)
				? parsed.hiddenStrategyIds
				: null,
			activeStrategyId:
				typeof parsed.activeStrategyId === 'string'
					? parsed.activeStrategyId
					: DEFAULT_STATE.activeStrategyId,
			collapsedSections: Array.isArray(parsed.collapsedSections)
				? parsed.collapsedSections
				: []
		};
	} catch {
		return DEFAULT_STATE;
	}
}

export function savePersistedState(state: PersistedState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage full or unavailable — non-critical
	}
}

// --- Proxy-aware fetch ---

export async function strategyFetch(url: string): Promise<Response> {
	try {
		const res = await fetch(url);
		return res;
	} catch {
		// CORS or network failure — fall back to proxy
		return fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
	}
}

// --- Validation ---

/** Required endpoints that must return 2xx for a strategy to be considered valid. */
const REQUIRED_ENDPOINTS = [
	{ key: 'strategy', path: (lang: string) => `/strategy?lang=${lang}` },
	{ key: 'stats', path: () => '/stats' },
	{ key: 'rounds', path: () => '/rounds?page=1&pageSize=1' },
	{ key: 'health', path: () => '/health' }
] as const;

export type ValidationStepKey = (typeof REQUIRED_ENDPOINTS)[number]['key'] | 'format';

async function checkEndpoint(
	fetchFn: (url: string) => Promise<Response>,
	baseUrl: string,
	path: string
): Promise<{ ok: boolean; data?: unknown }> {
	const res = await fetchFn(`${baseUrl}${path}`);
	if (!res.ok) return { ok: false };
	const data = await res.json();
	return { ok: true, data };
}

export async function validateStrategyUrl(
	baseUrl: string,
	lang: string,
	onProgress?: (steps: ValidationProgress[]) => void
): Promise<
	{ valid: true; info: StrategyInfo } | { valid: false; error: string; failedStep?: ValidationStepKey }
> {
	const steps: ValidationProgress[] = [
		...REQUIRED_ENDPOINTS.map((ep) => ({ step: ep.key, status: 'pending' as const })),
		{ step: 'format', status: 'pending' }
	];

	const emit = () => onProgress?.(steps.map((s) => ({ ...s })));
	emit();

	const fetchFn = strategyFetch;
	let strategyData: Record<string, unknown> | null = null;

	// Check each required endpoint sequentially
	for (const ep of REQUIRED_ENDPOINTS) {
		const idx = steps.findIndex((s) => s.step === ep.key);
		steps[idx].status = 'checking';
		emit();

		try {
			const result = await checkEndpoint(fetchFn, baseUrl, ep.path(lang));
			if (!result.ok) {
				steps[idx].status = 'fail';
				emit();
				return {
					valid: false,
					error: `${ep.key}: HTTP error`,
					failedStep: ep.key as ValidationStepKey
				};
			}
			if (ep.key === 'strategy') {
				strategyData = result.data as Record<string, unknown>;
			}
			steps[idx].status = 'ok';
			emit();
		} catch {
			steps[idx].status = 'fail';
			emit();
			return {
				valid: false,
				error: `${ep.key}: connection failed`,
				failedStep: ep.key as ValidationStepKey
			};
		}
	}

	// Validate /strategy response shape
	const fmtIdx = steps.findIndex((s) => s.step === 'format');
	steps[fmtIdx].status = 'checking';
	emit();

	if (
		!strategyData ||
		typeof strategyData.name !== 'string' ||
		!Array.isArray(strategyData.summary)
	) {
		steps[fmtIdx].status = 'fail';
		emit();
		return { valid: false, error: 'Invalid /strategy response format', failedStep: 'format' };
	}

	// Ensure mode is present and valid
	if (strategyData.mode !== 'simulation' && strategyData.mode !== 'live') {
		steps[fmtIdx].status = 'fail';
		emit();
		return { valid: false, error: 'Missing or invalid "mode" field', failedStep: 'format' };
	}

	steps[fmtIdx].status = 'ok';
	emit();

	return { valid: true, info: strategyData as unknown as StrategyInfo };
}
