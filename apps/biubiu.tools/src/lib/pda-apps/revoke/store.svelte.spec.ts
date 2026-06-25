/**
 * Regression tests for the two concurrent/stale-scan races in the revoke store
 * (REVIEW-FINDINGS pda-apps/revoke P2 #1 + #2):
 *
 *  1. Switching chains mid-scan must not let the in-flight scan's (chain-A)
 *     results land on the now-selected chain.
 *  2. Overlapping scan() calls (e.g. add then remove a custom token in quick
 *     succession) must not race on `rows` / `scanning` — only the latest scan
 *     may write results, and an earlier scan finishing must not clear the
 *     spinner while a later scan is still in flight.
 *
 * Heavy collaborators (wallet, on-chain discover, send path, IndexedDB) are
 * mocked so the test is deterministic and exercises only the store's scan
 * generation logic. Runs in the browser project because the store uses runes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address } from 'viem';
import type { DiscoverInput } from './core/discover.js';
import type { ApprovalRow } from './types.js';

// ── A controllable discover(): each call returns a promise we resolve by hand,
//    so we can interleave scans precisely. We record the chainId each call
//    targeted so we can prove which chain a scan was for. ──────────────────────
const H = vi.hoisted(() => {
	interface Pending {
		chainId: number;
		resolve: (rows: ApprovalRow[]) => void;
		reject: (e: unknown) => void;
	}
	const pending: Pending[] = [];
	const discover = vi.fn((input: { network: { chainId: number } }) => {
		return new Promise<ApprovalRow[]>((resolve, reject) => {
			pending.push({ chainId: input.network.chainId, resolve, reject });
		});
	});
	return { pending, discover };
});

vi.mock('./core/discover.js', () => ({ discover: H.discover }));
vi.mock('./core/revoke.js', () => ({ runRevoke: vi.fn() }));
vi.mock('./infra/custom-store.js', () => ({
	getCustomTokens: vi.fn(async () => ({})),
	saveCustomToken: vi.fn(async () => {}),
	deleteCustomToken: vi.fn(async () => {}),
	getCustomSpenders: vi.fn(async () => ({})),
	saveCustomSpender: vi.fn(async () => {}),
	deleteCustomSpender: vi.fn(async () => {}),
	getCustomNetworks: vi.fn(async () => []),
	saveCustomNetwork: vi.fn(async () => {}),
	deleteCustomNetwork: vi.fn(async () => {}),
}));

vi.mock('$lib/wallet', () => ({
	walletStore: {
		activeWallet: { address: '0x1111111111111111111111111111111111111111' },
		kind: 'inject',
	},
}));

import { revoke } from './store.svelte.js';

// A fake approval row tagged with the chain it "belongs" to, so a leaked
// cross-chain result is detectable.
function row(chainId: number, id = 'erc20:a:b'): ApprovalRow {
	return {
		id: `${id}:${chainId}`,
		standard: 'erc20',
		token: '0x00000000000000000000000000000000000000aa' as Address,
		tokenSymbol: `TKN${chainId}`,
		spender: '0x00000000000000000000000000000000000000bb' as Address,
		unlimited: false,
	};
}

// Wait a microtask turn so awaited continuations inside scan() run.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
	H.pending.length = 0;
	H.discover.mockClear();
	// Reset store to a known clean state on the default chain (eth-mainnet, id 1).
	revoke.setNetwork('eth-mainnet');
	revoke.rows = [];
	revoke.scanning = false;
	revoke.scanned = false;
	revoke.scanError = null;
	revoke.selectedIds = [];
});

describe('revoke store — chain switch mid-scan (P2 #1)', () => {
	it('discards a chain-A scan that resolves after switching to chain B', async () => {
		// Scan #1 starts on chain A (eth-mainnet, chainId 1).
		const scanA = revoke.scan();
		await flush();
		expect(H.pending).toHaveLength(1);
		expect(H.pending[0].chainId).toBe(1);
		expect(revoke.scanning).toBe(true);

		// User switches to chain B (base-mainnet, chainId 8453) mid-scan.
		revoke.setNetwork('base-mainnet');
		expect(revoke.network.chainId).toBe(8453);
		// Switch must clear the stale rows + spinner immediately.
		expect(revoke.rows).toEqual([]);
		expect(revoke.scanning).toBe(false);

		// Now scan #1 (chain A) finally resolves — its results must be dropped.
		H.pending[0].resolve([row(1)]);
		await scanA;
		await flush();

		expect(revoke.rows).toEqual([]); // NO chain-A rows leaked onto chain B
		expect(revoke.scanned).toBe(false);
	});

	it('lets the chain-B scan win even if the chain-A scan resolves last', async () => {
		const scanA = revoke.scan(); // chain A
		await flush();

		revoke.setNetwork('base-mainnet'); // chain B
		const scanB = revoke.scan(); // chain B scan
		await flush();

		expect(H.pending).toHaveLength(2);
		const a = H.pending.find((p) => p.chainId === 1)!;
		const b = H.pending.find((p) => p.chainId === 8453)!;

		// Chain-B result lands first.
		b.resolve([row(8453)]);
		await scanB;
		await flush();
		expect(revoke.rows).toEqual([row(8453)]);
		expect(revoke.scanning).toBe(false);

		// Chain-A result arrives LATE and must not clobber chain-B rows.
		a.resolve([row(1)]);
		await scanA;
		await flush();
		expect(revoke.rows).toEqual([row(8453)]);
		expect(revoke.scanned).toBe(true);
	});

	it('does not surface a chain-A scan error after switching chains', async () => {
		const scanA = revoke.scan(); // chain A
		await flush();
		revoke.setNetwork('base-mainnet'); // chain B

		H.pending[0].reject(new Error('chain-A RPC failure'));
		await scanA;
		await flush();

		expect(revoke.scanError).toBeNull(); // stale error suppressed
		expect(revoke.rows).toEqual([]);
	});
});

describe('revoke store — overlapping scans (P2 #2)', () => {
	it('only the latest of two overlapping same-chain scans writes rows', async () => {
		const scan1 = revoke.scan();
		await flush();
		const scan2 = revoke.scan(); // overlaps scan1 (e.g. add then remove custom token)
		await flush();

		expect(H.pending).toHaveLength(2);

		// The FIRST scan resolves last with a stale row set; it must not win.
		H.pending[1].resolve([row(1, 'latest')]);
		await scan2;
		await flush();
		expect(revoke.rows).toEqual([row(1, 'latest')]);

		H.pending[0].resolve([row(1, 'stale')]);
		await scan1;
		await flush();
		expect(revoke.rows).toEqual([row(1, 'latest')]); // stale scan discarded
	});

	it('an earlier scan finishing does not clear the spinner for a later in-flight scan', async () => {
		const scan1 = revoke.scan();
		await flush();
		const scan2 = revoke.scan();
		await flush();

		expect(revoke.scanning).toBe(true);

		// scan1 (earlier) resolves first — it must NOT flip scanning off, because
		// scan2 is still running.
		H.pending[0].resolve([row(1, 'first')]);
		await scan1;
		await flush();
		expect(revoke.scanning).toBe(true); // still loading: scan2 in flight

		// scan2 (latest) resolves — now the spinner clears and its rows win.
		H.pending[1].resolve([row(1, 'second')]);
		await scan2;
		await flush();
		expect(revoke.scanning).toBe(false);
		expect(revoke.rows).toEqual([row(1, 'second')]);
	});
});

// Ensure the test's mocked discover() type matches the real DiscoverInput shape,
// catching signature drift at compile time without affecting runtime behavior.
const _typeGuard: (i: DiscoverInput) => unknown = (i) => i.owner;
void _typeGuard;
