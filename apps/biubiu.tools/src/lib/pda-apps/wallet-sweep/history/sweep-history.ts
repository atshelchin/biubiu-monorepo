/**
 * Sweep history (IndexedDB). One record per sweep operation. SSR-safe (no-op
 * without indexedDB). Mirrors token-sender/history/send-history.ts.
 */
import type { SweepRecord } from '../types.js';

const DB_NAME = 'biubiu-wallet-sweep';
const DB_VERSION = 1;
const STORE = 'sweeps';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				const store = db.createObjectStore(STORE, { keyPath: 'id' });
				store.createIndex('createdAt', 'createdAt');
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function putSweep(record: SweepRecord): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(record);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function listSweeps(limit = 50): Promise<SweepRecord[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).getAll();
		req.onsuccess = () => {
			const all = (req.result as SweepRecord[]).sort((a, b) => b.createdAt - a.createdAt);
			resolve(all.slice(0, limit));
		};
		req.onerror = () => reject(req.error);
	});
}

export async function deleteSweep(id: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
