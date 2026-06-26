/**
 * Regression tests for the two capsule-store P2 findings (REVIEW-FINDINGS pda-apps/capsule):
 *
 *  1. unlock()/deriveKey() guard unification — when unlock() runs as a SUB-STEP of seal()
 *     it must restore the caller's status ('sealing') instead of hard-stamping 'idle'. Before
 *     the fix, deriveKey() set status='idle' on success, so the busy guard flapped
 *     idle→sealing mid-seal (and any failure between unlock resolving and the re-assert left
 *     the machine in 'idle' while a seal was conceptually in flight). After the fix there is a
 *     single owner of the top-level status and it never drops to a non-busy value during a seal.
 *
 *  2. seal() balance preflight conflated "can pay protocol fee" with "can pay fee + gas". The
 *     fee-floor check is now an isolated, pure helper feeShortfall() that deliberately does NOT
 *     add a gas reserve (gas may be sponsored), so it neither false-OKs a Safe below the fee
 *     floor nor false-rejects a sponsored Safe holding exactly the fee.
 *
 * Heavy collaborators (WebAuthn PRF, AES, on-chain read/write, i18n) are mocked so the test is
 * deterministic and exercises only the store's guard + preflight logic. Runs in the browser
 * project because the store uses Svelte 5 runes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Controllable PRF: each evaluatePrf() returns a promise we resolve by hand, so we can pause
//    execution INSIDE unlock() (which seal() awaits) and snapshot the store's status there. ──
const H = vi.hoisted(() => {
	const prfPending: Array<(v: { prf: Uint8Array; credentialId: string }) => void> = [];
	const evaluatePrf = vi.fn(
		() =>
			new Promise<{ prf: Uint8Array; credentialId: string }>((resolve) => {
				prfPending.push(resolve);
			})
	);
	// Controllable balance: tests set the next eth_getBalance result (hex).
	const balance = { hex: '0x0' };
	const rpcCall = vi.fn(async (_net: string, method: string) => {
		if (method === 'eth_getBalance') return balance.hex;
		return '0x0';
	});
	const sendPending: Array<(v: { success: boolean; txHash?: string; error?: string }) => void> = [];
	const sendContractCall = vi.fn(
		() =>
			new Promise<{ success: boolean; txHash?: string; error?: string }>((resolve) => {
				sendPending.push(resolve);
			})
	);
	return { prfPending, evaluatePrf, balance, rpcCall, sendContractCall, sendPending };
});

// i18n: identity-ish — return the key so assertions can match on it without the i18n runtime.
vi.mock('$lib/i18n', () => ({
	t: (k: string) => k,
	formatRelativeTime: () => 'soon',
	formatUnits: (v: bigint) => String(v)
}));

vi.mock('$lib/auth/auth-store.svelte.js', () => ({
	authStore: {
		user: {
			credentialId: 'cred-1',
			rpId: 'rp',
			createdAt: 1,
			publicKey: '0xpub',
			safeAddress: '0x000000000000000000000000000000000000dEaD'
		}
	}
}));

vi.mock('$lib/auth/safe-tx/send-contract-call.js', () => ({
	sendContractCall: H.sendContractCall
}));

vi.mock('./contract/rpc.js', () => ({ rpcCall: H.rpcCall }));

vi.mock('./contract/reader.js', () => ({
	cooldownRemaining: vi.fn(async () => 0),
	entryCount: vi.fn(async () => 0),
	fetchEntriesPage: vi.fn(async () => [])
}));

vi.mock('./crypto/prf.js', () => ({
	evaluatePrf: H.evaluatePrf,
	isWebAuthnAvailable: () => true
}));

vi.mock('./crypto/envelope.js', () => ({
	deriveContentKey: vi.fn(async () => new Uint8Array(32)),
	encryptContent: vi.fn(async () => new Uint8Array([1, 2, 3])),
	decryptContent: vi.fn(async () => 'plaintext')
}));

vi.mock('$lib/wallet/infra/bundler-account.js', () => ({
	fetchBundlerAccountInfo: vi.fn(async () => null)
}));

import { capsuleStore, FEE_WEI } from './store.svelte.js';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function resetStore() {
	capsuleStore.rawDek = null;
	capsuleStore.unlocked = false;
	capsuleStore.credential = null;
	capsuleStore.status = 'idle';
	capsuleStore.message = '';
	capsuleStore.text = '';
	capsuleStore.networkSlug = 'base-mainnet';
	capsuleStore.lastTxHash = null;
	capsuleStore.funding = null;
}

beforeEach(() => {
	H.prfPending.length = 0;
	H.sendPending.length = 0;
	H.evaluatePrf.mockClear();
	H.rpcCall.mockClear();
	H.sendContractCall.mockClear();
	H.balance.hex = '0x0';
	resetStore();
});

describe('capsule store — feeShortfall preflight (P2 #2: fee vs fee+gas)', () => {
	it('reports the wei shortfall when the Safe is below the protocol fee floor', async () => {
		H.balance.hex = '0x0'; // empty Safe
		const short = await capsuleStore.feeShortfall('0x000000000000000000000000000000000000dEaD');
		expect(short).toBe(FEE_WEI);
	});

	it('reports zero shortfall when the Safe holds EXACTLY the fee (gas may be sponsored)', async () => {
		// The crux of the finding: a Safe with exactly FEE_WEI must NOT be pre-rejected, because
		// 4337 gas can be paid by a bundler gas-account / sponsor. No gas reserve is added.
		H.balance.hex = '0x' + FEE_WEI.toString(16);
		const short = await capsuleStore.feeShortfall('0x000000000000000000000000000000000000dEaD');
		expect(short).toBe(0n);
	});

	it('reports the exact gap for a partially-funded Safe', async () => {
		const have = FEE_WEI - 1n;
		H.balance.hex = '0x' + have.toString(16);
		const short = await capsuleStore.feeShortfall('0x000000000000000000000000000000000000dEaD');
		expect(short).toBe(1n);
	});

	it('is non-fatal on RPC failure — returns 0 so the bundler reports precise errors', async () => {
		H.rpcCall.mockImplementationOnce(async () => {
			throw new Error('rpc down');
		});
		const short = await capsuleStore.feeShortfall('0x000000000000000000000000000000000000dEaD');
		expect(short).toBe(0n);
	});
});

describe('capsule store — unlock guard unification (P2 #1: status owned by one place)', () => {
	it('setupKey() leaves status idle after a successful key derivation', async () => {
		const p = capsuleStore.setupKey();
		await flush();
		expect(capsuleStore.status).toBe('setup'); // busy while PRF prompt is open
		expect(H.prfPending).toHaveLength(1);
		H.prfPending[0]({ prf: new Uint8Array(32), credentialId: 'cred-1' });
		await p;
		// Top-level entry point: when the key is confirmed the flow is over → idle.
		expect(capsuleStore.status).toBe('idle');
		expect(capsuleStore.unlocked).toBe(true);
	});

	it('unlock() invoked as a sub-step RESTORES the caller status instead of hard-stamping idle', async () => {
		// Directly model the sub-step context: a busy flow (seal) is mid-flight with status='sealing'
		// when it calls unlock() to lazily derive the key. Before the fix deriveKey() unconditionally
		// set status='idle' (the flap the finding describes, masked only by a fragile re-assert in
		// seal). After the fix the single status owner restores 'sealing'.
		capsuleStore.status = 'sealing';
		const p = capsuleStore.unlock();
		await flush();
		expect(capsuleStore.status).toBe('unlocking');
		H.prfPending[0]({ prf: new Uint8Array(32), credentialId: 'cred-1' });
		expect(await p).toBe(true);
		// THE REGRESSION ASSERTION: must be 'sealing' (restored), NOT 'idle' (old hard-stamp).
		expect(capsuleStore.status).toBe('sealing');
	});

	it('end-to-end seal() never drops out of a busy status across the lazy-unlock sub-step', async () => {
		capsuleStore.text = 'hello future';
		expect(capsuleStore.rawDek).toBeNull();
		H.balance.hex = '0x' + (FEE_WEI * 10n).toString(16); // well-funded so preflight passes

		const sealP = capsuleStore.seal();
		await flush();
		expect(capsuleStore.busy).toBe(true);
		expect(H.prfPending).toHaveLength(1);

		H.prfPending[0]({ prf: new Uint8Array(32), credentialId: 'cred-1' });
		await flush();
		expect(capsuleStore.status).toBe('sealing');
		expect(capsuleStore.busy).toBe(true);

		expect(H.sendPending).toHaveLength(1);
		H.sendPending[0]({ success: true, txHash: '0xabc' });
		const ok = await sealP;
		expect(ok).toBe(true);
		expect(capsuleStore.status).toBe('done');
	});

	it('a single coalesced unlock() restores idle (no busy caller)', async () => {
		const p = capsuleStore.unlock();
		await flush();
		expect(capsuleStore.status).toBe('unlocking');
		H.prfPending[0]({ prf: new Uint8Array(32), credentialId: 'cred-1' });
		await p;
		expect(capsuleStore.status).toBe('idle');
		expect(capsuleStore.rawDek).not.toBeNull();
	});

	it('concurrent unlock() calls share ONE WebAuthn prompt (coalescer)', async () => {
		const a = capsuleStore.unlock();
		const b = capsuleStore.unlock();
		await flush();
		expect(H.evaluatePrf).toHaveBeenCalledTimes(1); // coalesced
		H.prfPending[0]({ prf: new Uint8Array(32), credentialId: 'cred-1' });
		expect(await a).toBe(true);
		expect(await b).toBe(true);
	});
});
