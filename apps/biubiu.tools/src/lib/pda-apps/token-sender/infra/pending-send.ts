/**
 * 未完成发送记录的持久化（IndexedDB）。
 *
 * **同时只保留一份**，键固定（spec 003 research.md D27）。多份记录会立刻带出一串产品问题：
 * 列表怎么排、哪一份该被恢复、两份计划的收件人重叠怎么办 —— 而「同时只有一次发送在进行」
 * 也符合当前的串行语义。
 *
 * 与 `send-history` **分开**：历史是已完成发送的汇总，混在一起会让「哪些能恢复」从一次读取
 * 变成一次筛选。
 *
 * SSR 安全（无 IndexedDB 时全部退化为空操作）。
 *
 * **每次操作后关闭连接。** 留着打开的连接会阻塞 `deleteDatabase` 与版本升级 ——
 * 前者在测试里表现为「落盘永不返回，于是一批都发不出去」，后者会在将来改 schema 时
 * 让页面卡住。这个 store 每次只读写一条记录，连接复用省不下什么。
 */
import type { SendSnapshot } from '$lib/generated/sender/SendSnapshot';

const DB_NAME = 'biubiu-token-sender-pending';
const DB_VERSION = 1;
const STORE = 'pending';
/** 固定键 —— 同时只一份记录。 */
const KEY = 'current';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function readPendingSend(): Promise<SendSnapshot | null> {
	if (!hasIDB()) return null;
	const db = await openDB();
	try {
		return await new Promise<SendSnapshot | null>((resolve, reject) => {
			const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
			req.onsuccess = () => resolve((req.result as SendSnapshot | undefined) ?? null);
			req.onerror = () => reject(req.error);
		});
	} finally {
		db.close();
	}
}

/**
 * 写入。**失败必须抛出** —— 核心据此决定不发送那一批（spec 003 FR-004）。
 * 在这里吞掉异常，就等于让一批交易发出去而没有任何记录。
 */
export async function writePendingSend(snapshot: SendSnapshot): Promise<void> {
	if (!hasIDB()) throw new Error('no-indexeddb');
	const db = await openDB();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(snapshot, KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

export async function clearPendingSend(): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
