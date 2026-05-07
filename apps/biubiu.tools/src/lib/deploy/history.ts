/**
 * IndexedDB store for deployment history records.
 * Uses a single object store 'deployments' keyed by id.
 */
import type { DeploymentRecord } from './types.js';

const DB_NAME = 'biubiu-contract-deployer';
const DB_VERSION = 1;
const STORE_NAME = 'deployments';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
				store.createIndex('timestamp', 'timestamp');
				store.createIndex('chainId', 'chainId');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Save a deployment record */
export async function saveDeployment(record: DeploymentRecord): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(record);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/** Get all deployment records, sorted by timestamp descending */
export async function getDeployments(): Promise<DeploymentRecord[]> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const request = tx.objectStore(STORE_NAME).index('timestamp').getAll();
		request.onsuccess = () => {
			const records = request.result as DeploymentRecord[];
			records.reverse(); // Most recent first
			resolve(records);
		};
		request.onerror = () => reject(request.error);
	});
}

/** Update the verified status of a deployment */
export async function markVerified(id: string): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const getReq = store.get(id);
		getReq.onsuccess = () => {
			const record = getReq.result as DeploymentRecord | undefined;
			if (record) {
				record.verified = true;
				record.verifiedAt = Date.now();
				store.put(record);
			}
		};
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/** Delete a single deployment record */
export async function deleteDeployment(id: string): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/** Clear all deployment records */
export async function clearDeployments(): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
