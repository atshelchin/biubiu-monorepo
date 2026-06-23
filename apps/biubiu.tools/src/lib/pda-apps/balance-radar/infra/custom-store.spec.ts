import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	customTokenId,
	getCustomNetworks,
	saveCustomNetwork,
	deleteCustomNetwork,
	getCustomTokens,
	saveCustomToken,
	deleteCustomToken,
} from './custom-store.js';
import type { NetworkConfig } from '../types.js';

const BSC: NetworkConfig = {
	name: 'BNB Chain',
	chainId: 56,
	rpcs: ['https://bsc-rpc.publicnode.com'],
	symbol: 'BNB',
	decimals: 18,
};
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ── pure helper ──────────────────────────────────────────────────────────────

describe('customTokenId', () => {
	it('builds a lowercased network:address id', () => {
		expect(customTokenId('ethereum', USDC)).toBe(`ethereum:${USDC.toLowerCase()}`);
		expect(customTokenId('custom-56', '0xABCDEF0000000000000000000000000000000001')).toBe(
			'custom-56:0xabcdef0000000000000000000000000000000001',
		);
	});
});

// ── SSR / no-IndexedDB guards (node has no indexedDB) ─────────────────────────

describe('custom-store without IndexedDB', () => {
	it('getters resolve to empty arrays', async () => {
		expect(typeof indexedDB).toBe('undefined'); // sanity: node env
		expect(await getCustomNetworks()).toEqual([]);
		expect(await getCustomTokens()).toEqual([]);
	});

	it('saveCustomNetwork still returns a well-formed record', async () => {
		const rec = await saveCustomNetwork(BSC);
		expect(rec).toMatchObject({ key: 'custom-56', chainId: 56, isCustom: true, symbol: 'BNB' });
	});

	it('saveCustomToken returns a record with a stable id', async () => {
		const rec = await saveCustomToken('ethereum', { address: USDC, symbol: 'USDC', decimals: 6 });
		expect(rec).toEqual({
			id: `ethereum:${USDC.toLowerCase()}`,
			network: 'ethereum',
			kind: 'erc20',
			address: USDC,
			symbol: 'USDC',
			decimals: 6,
		});
	});

	it('deletes resolve without throwing', async () => {
		await expect(deleteCustomNetwork('custom-56')).resolves.toBeUndefined();
		await expect(deleteCustomToken('ethereum:x')).resolves.toBeUndefined();
	});
});

// ── round-trip against a minimal in-memory IndexedDB ─────────────────────────

/** Tiny IDB fake supporting exactly the ops custom-store.ts uses. */
function createFakeIDB() {
	const stores = new Map<string, { keyPath: string; data: Map<unknown, unknown> }>();
	const storeNames = new Set<string>();

	const handle = (name: string) => {
		const s = stores.get(name)!;
		return {
			put(record: Record<string, unknown>) {
				s.data.set(record[s.keyPath], record);
			},
			delete(key: unknown) {
				s.data.delete(key);
			},
			getAll() {
				const req: { onsuccess: (() => void) | null; result: unknown } = {
					onsuccess: null,
					result: undefined,
				};
				setTimeout(() => {
					req.result = [...s.data.values()];
					req.onsuccess?.();
				}, 0);
				return req;
			},
			createIndex() {},
		};
	};

	const db = {
		objectStoreNames: { contains: (n: string) => storeNames.has(n) },
		createObjectStore(name: string, opts: { keyPath: string }) {
			stores.set(name, { keyPath: opts.keyPath, data: new Map() });
			storeNames.add(name);
			return handle(name);
		},
		transaction() {
			const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; objectStore: (n: string) => ReturnType<typeof handle> } = {
				oncomplete: null,
				onerror: null,
				objectStore: handle,
			};
			setTimeout(() => tx.oncomplete?.(), 0);
			return tx;
		},
	};

	let initialized = false;
	return {
		open() {
			const req: {
				onupgradeneeded: (() => void) | null;
				onsuccess: (() => void) | null;
				onerror: (() => void) | null;
				result: typeof db;
			} = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
			setTimeout(() => {
				if (!initialized) {
					initialized = true;
					req.onupgradeneeded?.();
				}
				req.onsuccess?.();
			}, 0);
			return req;
		},
	};
}

describe('custom-store with IndexedDB (round-trip)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('persists and reads back custom networks', async () => {
		vi.stubGlobal('indexedDB', createFakeIDB());
		expect(await getCustomNetworks()).toEqual([]);

		await saveCustomNetwork(BSC);
		const networks = await getCustomNetworks();
		expect(networks).toHaveLength(1);
		expect(networks[0]).toMatchObject({ key: 'custom-56', chainId: 56, isCustom: true });

		await deleteCustomNetwork('custom-56');
		expect(await getCustomNetworks()).toEqual([]);
	});

	it('persists and reads back custom tokens, keyed by id', async () => {
		vi.stubGlobal('indexedDB', createFakeIDB());
		const saved = await saveCustomToken('ethereum', { address: USDC, symbol: 'USDC', decimals: 6 });

		const tokens = await getCustomTokens();
		expect(tokens).toHaveLength(1);
		expect(tokens[0].id).toBe(saved.id);

		// put with the same id overwrites rather than duplicating
		await saveCustomToken('ethereum', { address: USDC, symbol: 'USD Coin', decimals: 6 });
		const after = await getCustomTokens();
		expect(after).toHaveLength(1);
		expect(after[0].symbol).toBe('USD Coin');

		await deleteCustomToken(saved.id);
		expect(await getCustomTokens()).toEqual([]);
	});
});
