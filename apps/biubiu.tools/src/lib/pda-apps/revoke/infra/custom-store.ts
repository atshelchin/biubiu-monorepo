/**
 * User-added custom tokens, spenders, and networks (IndexedDB). Scoped by chainId
 * for tokens/spenders. SSR-safe (no-ops without IndexedDB). Independent DB so it
 * can't clash with other apps' stores.
 */
import type { Address } from 'viem';
import type { RevokeNetwork, SpenderEntry, TokenEntry } from '../types.js';

const DB_NAME = 'biubiu-revoke-config';
const DB_VERSION = 1;
const TOKEN_STORE = 'tokens';
const SPENDER_STORE = 'spenders';
const NET_STORE = 'networks';

interface TokenRecord {
	id: string; // `${chainId}:${addressLower}`
	chainId: number;
	entry: TokenEntry;
}
interface SpenderRecord {
	id: string; // `${chainId}:${addressLower}`
	chainId: number;
	entry: SpenderEntry;
}

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(TOKEN_STORE)) db.createObjectStore(TOKEN_STORE, { keyPath: 'id' });
			if (!db.objectStoreNames.contains(SPENDER_STORE)) db.createObjectStore(SPENDER_STORE, { keyPath: 'id' });
			if (!db.objectStoreNames.contains(NET_STORE)) db.createObjectStore(NET_STORE, { keyPath: 'slug' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function getAll<T>(store: string): Promise<T[]> {
	if (!hasIDB()) return Promise.resolve([]);
	return openDB().then(
		(db) =>
			new Promise<T[]>((resolve, reject) => {
				const req = db.transaction(store, 'readonly').objectStore(store).getAll();
				req.onsuccess = () => resolve(req.result as T[]);
				req.onerror = () => reject(req.error);
			}),
	);
}

function put(store: string, value: unknown): Promise<void> {
	if (!hasIDB()) return Promise.resolve();
	return openDB().then(
		(db) =>
			new Promise<void>((resolve, reject) => {
				const tx = db.transaction(store, 'readwrite');
				tx.objectStore(store).put(value);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			}),
	);
}

function del(store: string, key: string): Promise<void> {
	if (!hasIDB()) return Promise.resolve();
	return openDB().then(
		(db) =>
			new Promise<void>((resolve, reject) => {
				const tx = db.transaction(store, 'readwrite');
				tx.objectStore(store).delete(key);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			}),
	);
}

const tokenId = (chainId: number, address: Address) => `${chainId}:${address.toLowerCase()}`;

// ── Custom tokens ─────────────────────────────────────────────────────────
export async function getCustomTokens(): Promise<Record<number, TokenEntry[]>> {
	const recs = await getAll<TokenRecord>(TOKEN_STORE);
	const out: Record<number, TokenEntry[]> = {};
	for (const r of recs) (out[r.chainId] ??= []).push(r.entry);
	return out;
}
export async function saveCustomToken(chainId: number, entry: TokenEntry): Promise<void> {
	await put(TOKEN_STORE, { id: tokenId(chainId, entry.address), chainId, entry } satisfies TokenRecord);
}
export async function deleteCustomToken(chainId: number, address: Address): Promise<void> {
	await del(TOKEN_STORE, tokenId(chainId, address));
}

// ── Custom spenders ───────────────────────────────────────────────────────
export async function getCustomSpenders(): Promise<Record<number, SpenderEntry[]>> {
	const recs = await getAll<SpenderRecord>(SPENDER_STORE);
	const out: Record<number, SpenderEntry[]> = {};
	for (const r of recs) (out[r.chainId] ??= []).push(r.entry);
	return out;
}
export async function saveCustomSpender(chainId: number, entry: SpenderEntry): Promise<void> {
	await put(SPENDER_STORE, { id: tokenId(chainId, entry.address), chainId, entry } satisfies SpenderRecord);
}
export async function deleteCustomSpender(chainId: number, address: Address): Promise<void> {
	await del(SPENDER_STORE, tokenId(chainId, address));
}

// ── Custom networks ───────────────────────────────────────────────────────
export async function getCustomNetworks(): Promise<RevokeNetwork[]> {
	return getAll<RevokeNetwork>(NET_STORE);
}
export async function saveCustomNetwork(net: RevokeNetwork): Promise<void> {
	await put(NET_STORE, net);
}
export async function deleteCustomNetwork(slug: string): Promise<void> {
	await del(NET_STORE, slug);
}
