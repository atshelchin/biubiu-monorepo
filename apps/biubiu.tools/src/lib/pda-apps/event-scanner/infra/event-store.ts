/**
 * IndexedDB persistence for scans + decoded events.
 *
 * Two stores in one DB (separate from TaskHub's own job-state DB):
 *   - 'scans'  keyPath 'scanId'  → ScanMeta
 *   - 'events' keyPath 'pk' (`${scanId}:${txHash}:${logIndex}`)
 *       index  'scanId'                → list / delete / count by scan
 *       index  'scanId_block' [scanId, blockNumber] → ordered pagination + max block
 *
 * `put` is an idempotent upsert on `pk`, giving free dedup across job retries,
 * resume, and live-tail overlap. All ops are SSR-guarded (no-op on the server).
 */
import type { DecodedEvent, ScanMeta } from '../types.js';

const DB_NAME = 'biubiu-event-scanner';
const DB_VERSION = 1;
const SCAN_STORE = 'scans';
const EVENT_STORE = 'events';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(SCAN_STORE)) {
				db.createObjectStore(SCAN_STORE, { keyPath: 'scanId' });
			}
			if (!db.objectStoreNames.contains(EVENT_STORE)) {
				const store = db.createObjectStore(EVENT_STORE, { keyPath: 'pk' });
				store.createIndex('scanId', 'scanId');
				store.createIndex('scanId_block', ['scanId', 'blockNumber']);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

// ── Scans ─────────────────────────────────────────────────────────────────────

export async function getScans(): Promise<ScanMeta[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(SCAN_STORE, 'readonly');
		const req = tx.objectStore(SCAN_STORE).getAll();
		req.onsuccess = () => {
			const all = req.result as ScanMeta[];
			all.sort((a, b) => b.updatedAt - a.updatedAt);
			resolve(all);
		};
		req.onerror = () => reject(req.error);
	});
}

export async function getScan(scanId: string): Promise<ScanMeta | null> {
	if (!hasIDB()) return null;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(SCAN_STORE, 'readonly');
		const req = tx.objectStore(SCAN_STORE).get(scanId);
		req.onsuccess = () => resolve((req.result as ScanMeta) ?? null);
		req.onerror = () => reject(req.error);
	});
}

export async function saveScan(meta: ScanMeta): Promise<void> {
	if (!hasIDB()) return;
	// Guarantee structured-clone safety: a pasted/loaded ABI can carry
	// non-cloneable objects (e.g. from WhatsABI). A JSON round-trip yields plain,
	// clone-safe data so `put` never throws "could not be cloned".
	const safe = JSON.parse(JSON.stringify(meta)) as ScanMeta;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(SCAN_STORE, 'readwrite');
		tx.objectStore(SCAN_STORE).put(safe);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function deleteScan(scanId: string): Promise<void> {
	if (!hasIDB()) return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([SCAN_STORE, EVENT_STORE], 'readwrite');
		tx.objectStore(SCAN_STORE).delete(scanId);
		const idx = tx.objectStore(EVENT_STORE).index('scanId');
		const cursorReq = idx.openCursor(IDBKeyRange.only(scanId));
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			}
		};
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// ── Events ──────────────────────────────────────────────────────────────────

// Serialize writes so concurrent job:complete handlers don't thrash the store.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function putEvents(events: DecodedEvent[]): Promise<void> {
	if (!hasIDB() || events.length === 0) return;
	const run = async () => {
		const db = await openDB();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(EVENT_STORE, 'readwrite');
			const store = tx.objectStore(EVENT_STORE);
			for (const ev of events) store.put(ev);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	};
	const task = writeQueue.then(run, run);
	writeQueue = task.catch(() => {});
	return task;
}

export async function getEventPks(scanId: string): Promise<string[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EVENT_STORE, 'readonly');
		const req = tx.objectStore(EVENT_STORE).index('scanId').getAllKeys(IDBKeyRange.only(scanId));
		req.onsuccess = () => resolve((req.result as string[]) ?? []);
		req.onerror = () => reject(req.error);
	});
}

export async function countEvents(scanId: string): Promise<number> {
	if (!hasIDB()) return 0;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EVENT_STORE, 'readonly');
		const req = tx.objectStore(EVENT_STORE).index('scanId').count(IDBKeyRange.only(scanId));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export interface GetEventsOpts {
	limit?: number;
	offset?: number;
	order?: 'asc' | 'desc';
}

/** Paginated, block-ordered read via the compound index. */
export async function getEvents(scanId: string, opts: GetEventsOpts = {}): Promise<DecodedEvent[]> {
	if (!hasIDB()) return [];
	const { limit = 200, offset = 0, order = 'asc' } = opts;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EVENT_STORE, 'readonly');
		const index = tx.objectStore(EVENT_STORE).index('scanId_block');
		const range = IDBKeyRange.bound([scanId, -Infinity], [scanId, Infinity]);
		const out: DecodedEvent[] = [];
		let skipped = 0;
		const cursorReq = index.openCursor(range, order === 'desc' ? 'prev' : 'next');
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (!cursor || out.length >= limit) return resolve(out);
			if (skipped < offset) {
				skipped++;
				cursor.continue();
				return;
			}
			out.push(cursor.value as DecodedEvent);
			cursor.continue();
		};
		cursorReq.onerror = () => reject(cursorReq.error);
	});
}

/** All events for a scan (for CSV/JSON export). */
export async function getAllEvents(scanId: string): Promise<DecodedEvent[]> {
	if (!hasIDB()) return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EVENT_STORE, 'readonly');
		const req = tx.objectStore(EVENT_STORE).index('scanId_block').getAll(
			IDBKeyRange.bound([scanId, -Infinity], [scanId, Infinity]),
		);
		req.onsuccess = () => resolve((req.result as DecodedEvent[]) ?? []);
		req.onerror = () => reject(req.error);
	});
}

/** Highest block stored for a scan (seeds live-tail safely). */
export async function getMaxScannedBlock(scanId: string): Promise<number | null> {
	if (!hasIDB()) return null;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EVENT_STORE, 'readonly');
		const index = tx.objectStore(EVENT_STORE).index('scanId_block');
		const range = IDBKeyRange.bound([scanId, -Infinity], [scanId, Infinity]);
		const cursorReq = index.openCursor(range, 'prev');
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			resolve(cursor ? (cursor.value as DecodedEvent).blockNumber : null);
		};
		cursorReq.onerror = () => reject(cursorReq.error);
	});
}
