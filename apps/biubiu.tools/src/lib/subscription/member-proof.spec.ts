/**
 * Regression tests for the membership / fee-waiver gate.
 *
 * The bug: subscriptionStore latched `loaded=true` for whatever address it was
 * first loaded with (e.g. an external wallet loaded by PageHeader) and on RPC
 * error, and ensureMembershipLoaded skipped reload whenever loaded||loading — so
 *   (a) a NON-member safe could inherit isPremium=true cached from another addr
 *       → fee-waiver bypass, and
 *   (b) a real Pro safe was denied when a non-premium external wallet was loaded.
 *
 * These tests exercise load() + ensureMembershipLoaded() + the waiver getters
 * with the contract + auth mocked. proveMemberControl's WebAuthn path is
 * browser-only and out of scope here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const H = vi.hoisted(() => ({
	premiumByAddr: new Map<string, boolean>(),
	failNext: false,
	infoCalls: [] as string[]
}));

vi.mock('./subscription-contract.js', () => ({
	getSubscriptionInfo: vi.fn(async (addr: string) => {
		H.infoCalls.push(addr.toLowerCase());
		if (H.failNext) {
			H.failNext = false;
			throw new Error('RPC failure');
		}
		const isPremium = H.premiumByAddr.get(addr.toLowerCase()) ?? false;
		return {
			isPremium,
			expiryTime: isPremium ? 9_999_999_999n : 0n,
			remainingTime: isPremium ? 1000n : 0n
		};
	}),
	getActiveTokenId: vi.fn(async (addr: string) =>
		H.premiumByAddr.get(addr.toLowerCase()) ? 1n : 0n
	)
}));

const A = vi.hoisted(() => ({
	user: null as null | {
		name: string;
		credentialId: string;
		publicKey: string;
		rpId: string;
		safeAddress: string;
		createdAt: number;
	}
}));
vi.mock('$lib/auth', () => ({
	authStore: {
		get user() {
			return A.user;
		}
	}
}));

import { subscriptionStore } from './subscription-store.svelte.js';
import { memberWaiver, ensureMembershipLoaded } from './member-proof.svelte.js';

const SAFE_A = '0xAaAa000000000000000000000000000000000001';
const SAFE_B = '0xBbBb000000000000000000000000000000000002';

function loginAs(safeAddress: string) {
	A.user = {
		name: 'u',
		credentialId: 'cid',
		publicKey: '0x04',
		rpId: 'localhost',
		safeAddress,
		createdAt: 0
	};
}

beforeEach(() => {
	H.premiumByAddr.clear();
	H.failNext = false;
	H.infoCalls.length = 0;
	A.user = null;
	subscriptionStore.reset();
	memberWaiver.reset();
});

describe('subscriptionStore.load — address binding & fail-closed', () => {
	it('records loadedFor and only marks loaded on success', async () => {
		H.premiumByAddr.set(SAFE_A.toLowerCase(), true);
		await subscriptionStore.load(SAFE_A as `0x${string}`);
		expect(subscriptionStore.isPremium).toBe(true);
		expect(subscriptionStore.loaded).toBe(true);
		expect(subscriptionStore.loadedFor).toBe(SAFE_A.toLowerCase());
	});

	it('resets to fail-closed (non-premium, not loaded) when an RPC error occurs for a new address', async () => {
		H.premiumByAddr.set(SAFE_A.toLowerCase(), true);
		await subscriptionStore.load(SAFE_A as `0x${string}`); // premium A cached
		expect(subscriptionStore.isPremium).toBe(true);

		H.failNext = true; // next contract read throws
		await subscriptionStore.load(SAFE_B as `0x${string}`);
		expect(subscriptionStore.isPremium).toBe(false); // did NOT keep A's premium
		expect(subscriptionStore.loaded).toBe(false); // not latched → will retry
		expect(subscriptionStore.loadedFor).toBeNull();
	});
});

describe('ensureMembershipLoaded — reloads for the right address', () => {
	it('reloads when the store was loaded for a DIFFERENT address (closes bypass)', async () => {
		// External premium wallet B was loaded first (e.g. by PageHeader).
		H.premiumByAddr.set(SAFE_B.toLowerCase(), true);
		await subscriptionStore.load(SAFE_B as `0x${string}`);
		expect(subscriptionStore.isPremium).toBe(true);

		// User logs in as A, which is NOT premium.
		loginAs(SAFE_A);
		await ensureMembershipLoaded();

		expect(subscriptionStore.loadedFor).toBe(SAFE_A.toLowerCase());
		expect(subscriptionStore.isPremium).toBe(false);

		// Even with a (hypothetical) session proof for A, the waiver must stay off.
		memberWaiver.active = true;
		memberWaiver.provenSafe = SAFE_A;
		expect(memberWaiver.isWaiverActive).toBe(false);
		expect(memberWaiver.canProve).toBe(false);
	});

	it('recognizes a real Pro safe even when a non-premium external wallet was loaded (fixes false-negative)', async () => {
		// A is the real premium passkey safe; B (external, non-premium) loaded first.
		H.premiumByAddr.set(SAFE_A.toLowerCase(), true);
		await subscriptionStore.load(SAFE_B as `0x${string}`);
		expect(subscriptionStore.isPremium).toBe(false);

		loginAs(SAFE_A);
		await ensureMembershipLoaded();

		expect(subscriptionStore.loadedFor).toBe(SAFE_A.toLowerCase());
		expect(subscriptionStore.isPremium).toBe(true);
		expect(memberWaiver.canProve).toBe(true); // eligible to sign the proof
	});

	it('does NOT reload when already loaded for the same address', async () => {
		H.premiumByAddr.set(SAFE_A.toLowerCase(), true);
		loginAs(SAFE_A);
		await ensureMembershipLoaded(); // first load
		const callsAfterFirst = H.infoCalls.length;
		await ensureMembershipLoaded(); // should be a no-op
		expect(H.infoCalls.length).toBe(callsAfterFirst);
	});
});

describe('memberWaiver.syncToUser — drop waiver on logout / account switch', () => {
	it('keeps the waiver when the same safe is still active', () => {
		memberWaiver.active = true;
		memberWaiver.provenSafe = SAFE_A;
		memberWaiver.syncToUser(SAFE_A);
		expect(memberWaiver.active).toBe(true);
	});

	it('drops the waiver on logout (null) — no silent reactivation on re-login', () => {
		memberWaiver.active = true;
		memberWaiver.provenSafe = SAFE_A;
		memberWaiver.syncToUser(null);
		expect(memberWaiver.active).toBe(false);
		expect(memberWaiver.provenSafe).toBeNull();
	});

	it('drops the waiver when switching to a different safe', () => {
		memberWaiver.active = true;
		memberWaiver.provenSafe = SAFE_A;
		memberWaiver.syncToUser(SAFE_B);
		expect(memberWaiver.active).toBe(false);
	});
});

describe('memberWaiver.isWaiverActive — bound to the proven safe', () => {
	it('drops the waiver when the store is later loaded for a different address', async () => {
		H.premiumByAddr.set(SAFE_A.toLowerCase(), true);
		H.premiumByAddr.set(SAFE_B.toLowerCase(), true);
		loginAs(SAFE_A);
		await ensureMembershipLoaded();
		memberWaiver.active = true;
		memberWaiver.provenSafe = SAFE_A;
		expect(memberWaiver.isWaiverActive).toBe(true);

		// Store reloaded for B (premium too) — but it's not the logged-in safe.
		await subscriptionStore.load(SAFE_B as `0x${string}`);
		expect(memberWaiver.isWaiverActive).toBe(false);
	});
});
