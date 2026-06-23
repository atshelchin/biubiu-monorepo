/**
 * 发送历史（IndexedDB）。
 * 单 object store 'sends'，按 createdAt 倒序展示。SSR 安全（无 indexedDB 时降级为 no-op）。
 */
import type { SendRecord } from '../types.js';

const DB_NAME = 'biubiu-token-sender';
const DB_VERSION = 1;
const STORE = 'sends';

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

/** 新增或更新一条发送记录 */
export async function putSend(record: SendRecord): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(record);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/** 列出历史，按时间倒序，可限制条数 */
export async function listSends(limit = 50): Promise<SendRecord[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).getAll();
		req.onsuccess = () => {
			const all = (req.result as SendRecord[]).sort((a, b) => b.createdAt - a.createdAt);
			resolve(all.slice(0, limit));
		};
		req.onerror = () => reject(req.error);
	});
}

export async function getSend(id: string): Promise<SendRecord | undefined> {
	if (!hasIDB()) return undefined;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(id);
		req.onsuccess = () => resolve(req.result as SendRecord | undefined);
		req.onerror = () => reject(req.error);
	});
}

export async function deleteSend(id: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
