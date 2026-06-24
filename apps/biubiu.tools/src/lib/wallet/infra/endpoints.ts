/**
 * Service-node settings — user-configurable infrastructure endpoints.
 *
 * Ported from vela-wallet `models/types.ts` (ServiceEndpoints / NetworkConfig) +
 * `services/storage.ts` (cache + sync getters). Persisted in localStorage; an
 * in-memory cache is hydrated lazily on first access so the sync getters work
 * during render. On the server the getters return defaults (no localStorage).
 *
 * Consumers: wallet/infra/{rpc-client,bundler-client,bundler-account,fiat-fx}.ts
 * and auth/passkey-auth.ts read the getters instead of hard-coding URLs, so the
 * Settings UI can override any of them.
 */

import { browser } from '$app/environment';
import type { RpcProviderKeys } from './providers.js';

/** Global service endpoints, shared across all chains. */
export interface ServiceEndpoints {
	/** Chain metadata + token/logo data API. */
	ethereumDataURL: string;
	/** WebAuthn P-256 public-key index (passkey discovery/recovery). */
	passkeyIndexURL: string;
	/** ERC-4337 bundler base URL; chainId is appended per request. */
	bundlerServiceURL: string;
	/** Fiat exchange-rate provider (USD base). */
	fiatRatesURL: string;
}

/** Per-network RPC / explorer override (keyed by chainId). */
export interface NetworkConfig {
	rpcURL?: string;
	explorerURL?: string;
}

export interface ServiceNodeSettings {
	endpoints: ServiceEndpoints;
	/** chainId -> override. Sparse: only chains the user customised. */
	networks: Record<number, NetworkConfig>;
	providerKeys: RpcProviderKeys;
}

/**
 * Defaults. biubiu keeps its OWN passkey index; the bundler is vela's (replacing
 * Pimlico); fiat + data API match vela.
 */
export const DEFAULT_SERVICE_ENDPOINTS: ServiceEndpoints = {
	ethereumDataURL: 'https://ethereum-data.awesometools.dev',
	passkeyIndexURL: 'https://webauthnp256-publickey-index.biubiu.tools',
	bundlerServiceURL: 'https://vela-bundler.getvela.app',
	fiatRatesURL: 'https://api.frankfurter.dev/v2/rates?base=USD'
};

const STORAGE_KEY = 'biubiu-service-nodes';
const CHANGE_EVENT = 'service-nodes-changed';

function defaults(): ServiceNodeSettings {
	return { endpoints: { ...DEFAULT_SERVICE_ENDPOINTS }, networks: {}, providerKeys: {} };
}

let _cache: ServiceNodeSettings = defaults();
let _loaded = false;

/** Hydrate the cache from localStorage once (no-op on server / after first call). */
function ensureLoaded(): void {
	if (_loaded || !browser) return;
	_loaded = true;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<ServiceNodeSettings>;
			_cache = {
				endpoints: { ...DEFAULT_SERVICE_ENDPOINTS, ...(parsed.endpoints ?? {}) },
				networks: parsed.networks ?? {},
				providerKeys: parsed.providerKeys ?? {}
			};
		}
	} catch {
		/* keep defaults on parse error */
	}
}

/** Full settings snapshot (cloned) — for the Settings UI. */
export function loadServiceNodeSettings(): ServiceNodeSettings {
	ensureLoaded();
	return {
		endpoints: { ..._cache.endpoints },
		networks: { ..._cache.networks },
		providerKeys: { ..._cache.providerKeys }
	};
}

/** Persist a full settings snapshot, update the cache, notify listeners. */
export function saveServiceNodeSettings(next: ServiceNodeSettings): void {
	_cache = {
		endpoints: { ...DEFAULT_SERVICE_ENDPOINTS, ...next.endpoints },
		networks: { ...next.networks },
		providerKeys: { ...next.providerKeys }
	};
	_loaded = true;
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
		window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: _cache }));
	} catch {
		/* storage full — non-critical */
	}
}

/** Subscribe to settings changes (same-tab). Returns an unsubscribe fn. */
export function subscribeServiceNodes(listener: () => void): () => void {
	if (!browser) return () => {};
	const handler = () => listener();
	window.addEventListener(CHANGE_EVENT, handler);
	return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// ─── Sync getters (render-safe) ───

export function getEthereumDataURL(): string {
	ensureLoaded();
	return _cache.endpoints.ethereumDataURL || DEFAULT_SERVICE_ENDPOINTS.ethereumDataURL;
}

export function getPasskeyIndexURL(): string {
	ensureLoaded();
	return _cache.endpoints.passkeyIndexURL || DEFAULT_SERVICE_ENDPOINTS.passkeyIndexURL;
}

export function getBundlerServiceURL(): string {
	ensureLoaded();
	return _cache.endpoints.bundlerServiceURL || DEFAULT_SERVICE_ENDPOINTS.bundlerServiceURL;
}

export function getFiatRatesURL(): string {
	ensureLoaded();
	return _cache.endpoints.fiatRatesURL || DEFAULT_SERVICE_ENDPOINTS.fiatRatesURL;
}

/** Per-chain RPC/explorer override, or undefined. */
export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
	ensureLoaded();
	return _cache.networks[chainId];
}

/** Stored third-party provider API keys. */
export function getProviderKeys(): RpcProviderKeys {
	ensureLoaded();
	return _cache.providerKeys;
}
