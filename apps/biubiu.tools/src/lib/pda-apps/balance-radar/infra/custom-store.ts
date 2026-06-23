/**
 * IndexedDB store for user-defined networks and ERC20 tokens.
 * Two object stores: 'networks' (keyed by `key`) and 'tokens' (keyed by `id`).
 * All operations are window/indexedDB-guarded so importing this on the server
 * (SSR) is a no-op rather than a crash.
 */
import type { NetworkConfig, TokenSpec } from '../types.js';
import { customNetworkKey } from './networks.js';

const DB_NAME = 'biubiu-balance-radar';
const DB_VERSION = 1;
const NETWORK_STORE = 'networks';
const TOKEN_STORE = 'tokens';

/** A custom network as stored: NetworkConfig plus its stable registry key. */
export interface StoredCustomNetwork extends NetworkConfig {
	key: string;
}

/** A custom token as stored: TokenSpec plus the network it belongs to. */
export interface StoredCustomToken extends TokenSpec {
	/** `${network}:${address.toLowerCase()}` */
	id: string;
	network: string;
	kind: 'erc20';
	address: string;
}

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

export function customTokenId(network: string, address: string): string {
	return `${network}:${address.toLowerCase()}`;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(NETWORK_STORE)) {
				db.createObjectStore(NETWORK_STORE, { keyPath: 'key' });
			}
			if (!db.objectStoreNames.contains(TOKEN_STORE)) {
				const store = db.createObjectStore(TOKEN_STORE, { keyPath: 'id' });
				store.createIndex('network', 'network');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

// ── Networks ────────────────────────────────────────────────────────────────

export async function getCustomNetworks(): Promise<StoredCustomNetwork[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(NETWORK_STORE, 'readonly');
		const request = tx.objectStore(NETWORK_STORE).getAll();
		request.onsuccess = () => resolve(request.result as StoredCustomNetwork[]);
		request.onerror = () => reject(request.error);
	});
}

export async function saveCustomNetwork(config: NetworkConfig): Promise<StoredCustomNetwork> {
	const record: StoredCustomNetwork = {
		...config,
		isCustom: true,
		key: customNetworkKey(config.chainId),
	};
	if (!hasIDB()) return record;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(NETWORK_STORE, 'readwrite');
		tx.objectStore(NETWORK_STORE).put(record);
		tx.oncomplete = () => resolve(record);
		tx.onerror = () => reject(tx.error);
	});
}

export async function deleteCustomNetwork(key: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(NETWORK_STORE, 'readwrite');
		tx.objectStore(NETWORK_STORE).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export async function getCustomTokens(): Promise<StoredCustomToken[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(TOKEN_STORE, 'readonly');
		const request = tx.objectStore(TOKEN_STORE).getAll();
		request.onsuccess = () => resolve(request.result as StoredCustomToken[]);
		request.onerror = () => reject(request.error);
	});
}

export async function saveCustomToken(
	network: string,
	token: { address: string; symbol: string; decimals: number },
): Promise<StoredCustomToken> {
	const record: StoredCustomToken = {
		id: customTokenId(network, token.address),
		network,
		kind: 'erc20',
		address: token.address,
		symbol: token.symbol,
		decimals: token.decimals,
	};
	if (!hasIDB()) return record;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(TOKEN_STORE, 'readwrite');
		tx.objectStore(TOKEN_STORE).put(record);
		tx.oncomplete = () => resolve(record);
		tx.onerror = () => reject(tx.error);
	});
}

export async function deleteCustomToken(id: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(TOKEN_STORE, 'readwrite');
		tx.objectStore(TOKEN_STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
