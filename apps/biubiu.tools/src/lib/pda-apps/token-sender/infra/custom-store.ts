/**
 * 用户自定义网络 + 每网络 RPC 覆盖（IndexedDB）。
 * 独立 DB，避免与 history/send-history 的库版本冲突。SSR 安全。
 */
import type { TokenSenderNetwork } from '../types.js';

const DB_NAME = 'biubiu-token-sender-config';
const DB_VERSION = 1;
const NET_STORE = 'networks';
const RPC_STORE = 'rpcs';

interface RpcOverrideRecord {
	slug: string;
	rpcs: string[];
}

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(NET_STORE)) db.createObjectStore(NET_STORE, { keyPath: 'slug' });
			if (!db.objectStoreNames.contains(RPC_STORE)) db.createObjectStore(RPC_STORE, { keyPath: 'slug' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

// ── Custom networks ───────────────────────────────────────────────────────

export async function getCustomNetworks(): Promise<TokenSenderNetwork[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const req = db.transaction(NET_STORE, 'readonly').objectStore(NET_STORE).getAll();
		req.onsuccess = () => resolve(req.result as TokenSenderNetwork[]);
		req.onerror = () => reject(req.error);
	});
}

export async function saveCustomNetwork(net: TokenSenderNetwork): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(NET_STORE, 'readwrite');
		tx.objectStore(NET_STORE).put(net);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function deleteCustomNetwork(slug: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(NET_STORE, 'readwrite');
		tx.objectStore(NET_STORE).delete(slug);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// ── RPC overrides ─────────────────────────────────────────────────────────

export async function getRpcOverrides(): Promise<Record<string, string[]>> {
	if (!hasIDB()) return {};
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const req = db.transaction(RPC_STORE, 'readonly').objectStore(RPC_STORE).getAll();
		req.onsuccess = () => {
			const out: Record<string, string[]> = {};
			for (const r of req.result as RpcOverrideRecord[]) out[r.slug] = r.rpcs;
			resolve(out);
		};
		req.onerror = () => reject(req.error);
	});
}

export async function saveRpcOverride(slug: string, rpcs: string[]): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(RPC_STORE, 'readwrite');
		tx.objectStore(RPC_STORE).put({ slug, rpcs } satisfies RpcOverrideRecord);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function deleteRpcOverride(slug: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(RPC_STORE, 'readwrite');
		tx.objectStore(RPC_STORE).delete(slug);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
