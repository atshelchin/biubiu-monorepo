/**
 * Capsule client store — encrypted letters sealed on-chain, optionally time-locked.
 *
 * The content key is derived DETERMINISTICALLY from the wallet passkey's PRF (one passkey is both
 * identity and encryption root). The same passkey yields the same key on every browser/device, so
 * a letter sealed anywhere decrypts everywhere — no random key, no on-chain envelope, no second
 * passkey. The key lives in memory for the session and is re-derived (one Touch ID) when needed.
 * Nothing on-chain is required to start: the Safe deploys lazily on the first seal.
 */
import { browser } from '$app/environment';
import type { Address } from 'viem';
import { t, formatRelativeTime } from '$lib/i18n';
import { authStore } from '$lib/auth/auth-store.svelte.js';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call.js';
import { FOREVER_ADDRESS } from './contract/address.js';
import { MODE_CAPSULE, MODE_PRIVATE } from './contract/abi.js';
import { encodeSeal } from './contract/encode.js';
import { cooldownRemaining, entryCount, fetchEntriesPage, type ForeverEntry } from './contract/reader.js';
import { rpcCall } from './contract/rpc.js';
import { WRITE_NETWORKS, networkBySlug } from './networks.js';
import { evaluatePrf, isWebAuthnAvailable, type EncryptionCredential } from './crypto/prf.js';
import { deriveContentKey, decryptContent, encryptContent } from './crypto/envelope.js';
import {
	QUICKNET_BEACON_SCHEME,
	roundForTime,
	timelockOpen,
	timelockSeal
} from './crypto/timelock.js';

/** A note as shown in the timeline (decrypted client-side). */
export interface TimelineEntry {
	/** Unique per author (24h cooldown) — used as the list key. */
	createdAt: number;
	mode: number;
	unlockAt: number;
	/** Decrypted text (present for readable notes). */
	text?: string;
	/** A capsule still time-locked (cannot be read until unlockAt). */
	locked?: boolean;
	/** Decryption failed (wrong key / corrupt). */
	failed?: boolean;
}

const LS_CRED = 'forever.enc.cred';

/** Per-write fee charged + displayed (0.001 native). Must be >= the contract's on-chain floor. */
export const FEE_WEI = 1_000_000_000_000_000n;
/** Contract-enforced max ciphertext bytes; reserve headroom for version + iv + GCM tag. */
const MAX_PAYLOAD = 4096;
const TEXT_BYTE_LIMIT = MAX_PAYLOAD - 29; // 1 version + 12 iv + 16 tag
const PAGE = 20; // timeline page size

type Status = 'idle' | 'setup' | 'unlocking' | 'sealing' | 'done' | 'error';

class ForeverStore {
	credential = $state<EncryptionCredential | null>(null);
	/** Deterministic content key (32 bytes). In-memory only (session) — never persisted. */
	rawDek: Uint8Array | null = null;
	unlocked = $state(false);

	networkSlug = $state('base-mainnet');
	/** Region-gate: you pick a chain before entering; it's fixed until you explicitly exit. */
	chainEntered = $state(false);
	/** Past-view sort: 'desc' = newest first, 'asc' = oldest first. */
	sortDir = $state<'desc' | 'asc'>('desc');
	text = $state('');
	/**
	 * One writing surface, one optional decision: lock or not.
	 * `false` → private (readable anytime by you); `true` → capsule (time-locked until unlockDate).
	 */
	locked = $state(false);
	/** datetime-local string for capsule unlock (local time). */
	unlockDate = $state('');

	status = $state<Status>('idle');
	message = $state('');
	lastTxHash = $state<string | null>(null);

	entries = $state<TimelineEntry[]>([]);
	entriesTotal = $state(0);
	loadingEntries = $state(false);

	constructor() {
		if (!browser) return;
		try {
			const c = localStorage.getItem(LS_CRED);
			if (c) this.credential = JSON.parse(c) as EncryptionCredential;
		} catch {
			/* ignore corrupt local state */
		}
	}

	/** Whether this browser has already confirmed which passkey roots the encryption. */
	get hasKey(): boolean {
		return this.credential !== null;
	}
	get networks() {
		return WRITE_NETWORKS;
	}
	get network() {
		return networkBySlug(this.networkSlug);
	}
	/** Derived note type — kept for the contract/encryption paths that distinguish the two. */
	get mode(): 'private' | 'capsule' {
		return this.locked ? 'capsule' : 'private';
	}
	get byteLength(): number {
		return new TextEncoder().encode(this.text).length;
	}
	get overLimit(): boolean {
		// Capsule (tlock) encoding adds ~600B+ of armored overhead; tighten the soft limit for it.
		const limit = this.locked ? TEXT_BYTE_LIMIT - 1200 : TEXT_BYTE_LIMIT;
		return this.byteLength > limit;
	}
	/** Capsule unlock time as unix seconds (0 if unset/invalid). */
	get unlockUnix(): number {
		if (!this.unlockDate) return 0;
		const ms = new Date(this.unlockDate).getTime();
		return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
	}
	get explorerTxUrl(): string | null {
		return this.lastTxHash && this.network ? this.network.explorerUrl + this.lastTxHash : null;
	}
	get hasMore(): boolean {
		return this.entries.length < this.entriesTotal;
	}

	private persist(): void {
		if (!browser) return;
		if (this.credential) localStorage.setItem(LS_CRED, JSON.stringify(this.credential));
	}

	private fail(msg: string): false {
		this.status = 'error';
		this.message = msg;
		return false;
	}

	/** Map low-level bundler/RPC errors to a clear, friendly message (never raw hex selectors). */
	private friendlyError(raw: string): string {
		if (/AA21|prefund|insufficient funds|insufficient balance|exceeds balance/i.test(raw)) {
			const sym = this.network?.nativeSymbol ?? '';
			const addr = authStore.user?.safeAddress ?? '';
			return t('capsule.error.lowBalance', { symbol: sym, address: addr });
		}
		// Any other on-chain revert / simulation failure (incl. bare 0x… selectors) → neutral, friendly.
		if (/revert|simulation|execution reverted|user ?operation|0x[0-9a-fA-F]{8}/i.test(raw)) {
			return t('capsule.error.txReverted');
		}
		return raw;
	}

	/** True while a passkey/tx flow is in progress (used to prevent concurrent WebAuthn requests). */
	get busy(): boolean {
		return this.status === 'setup' || this.status === 'unlocking' || this.status === 'sealing';
	}

	/**
	 * Confirm the encryption key for this browser: derive it from the wallet passkey's PRF.
	 * No transaction, no funding, nothing published on-chain — just one passkey touch. The Safe
	 * deploys later, lazily, on the first seal.
	 */
	async setupKey(): Promise<boolean> {
		if (this.busy) return false; // re-entry guard: only one WebAuthn request at a time
		const user = authStore.user;
		if (!user) return this.fail(t('capsule.error.signIn'));
		if (!isWebAuthnAvailable()) return this.fail(t('capsule.error.noWebAuthn'));
		this.status = 'setup';
		this.message = t('capsule.status.preparingEnc');
		return this.deriveKey(this.credentialFor(user));
	}

	/** Coalesces concurrent unlocks so only ONE WebAuthn prompt is ever in flight at a time. */
	private unlockPromise: Promise<boolean> | null = null;

	/** Re-derive the in-memory content key from the wallet passkey (one passkey touch). */
	async unlock(): Promise<boolean> {
		// Share a single in-flight request: loadEntries + setSort + seal can all call this at once,
		// and a second navigator.credentials.get() while one is open would be rejected by the browser.
		if (this.unlockPromise) return this.unlockPromise;
		this.unlockPromise = this._unlock();
		try {
			return await this.unlockPromise;
		} finally {
			this.unlockPromise = null;
		}
	}

	private async _unlock(): Promise<boolean> {
		const user = authStore.user;
		if (!user) return this.fail(t('capsule.error.signIn'));
		this.status = 'unlocking';
		this.message = t('capsule.status.unlocking');
		// ALWAYS the wallet passkey — never a stored credential, which on accounts migrated from the
		// old scheme could be a dedicated encryption passkey and would derive a divergent key.
		return this.deriveKey(this.credentialFor(user));
	}

	/** The PRF credential to target — always the wallet passkey, pinned by its credentialId. */
	private credentialFor(user: NonNullable<typeof authStore.user>): EncryptionCredential {
		return { credentialId: user.credentialId, rpId: user.rpId, createdAt: user.createdAt };
	}

	/**
	 * Evaluate PRF on the pinned wallet credential → deterministic content key.
	 *
	 * PRF is a pure function of (credential, salt), so this yields the SAME key every time, in every
	 * browser/device the passkey is available on. If PRF is unavailable we fail loudly rather than
	 * silently mint a divergent key — that silent fork is what used to make letters undecryptable.
	 */
	private async deriveKey(cred: EncryptionCredential): Promise<boolean> {
		try {
			const { prf } = await evaluatePrf(cred);
			this.rawDek = await deriveContentKey(prf);
			this.credential = cred;
			this.unlocked = true;
			this.persist();
			this.status = 'idle';
			this.message = '';
			return true;
		} catch {
			return this.fail(t('capsule.error.noPrf'));
		}
	}

	/** Encrypt the current text and seal it on-chain (private mode), charging the fee. */
	async seal(): Promise<boolean> {
		if (this.busy) return false; // re-entry guard
		const user = authStore.user;
		if (!user) return this.fail(t('capsule.error.signIn'));
		const text = this.text.trim();
		if (!text) return this.fail(t('capsule.error.writeFirst'));
		if (this.overLimit) return this.fail(t('capsule.error.tooLong'));

		this.status = 'sealing'; // go busy before any await (disables buttons)
		this.message = t('capsule.status.preparing');

		// One letter per chain, per day — check up front so we never prompt a passkey only to revert.
		try {
			const left = await cooldownRemaining(this.networkSlug, user.safeAddress as Address);
			if (left > 0) {
				return this.fail(t('capsule.error.cooldown', { when: formatRelativeTime(Date.now() + left * 1000) }));
			}
		} catch {
			/* best-effort: contract absent → 0; on RPC error fall through to the real attempt */
		}

		if (!this.rawDek && !(await this.unlock())) return false;
		this.status = 'sealing'; // unlock() may have toggled status; re-assert busy

		// Preflight: a fresh/empty Safe can't pay the fee + gas.
		try {
			const balHex = await rpcCall<string>(this.networkSlug, 'eth_getBalance', [user.safeAddress, 'latest']);
			if (BigInt(balHex) < FEE_WEI) return this.fail(this.friendlyError('AA21'));
		} catch {
			/* non-fatal: fall through and let the bundler report precise errors */
		}

		this.message = t('capsule.status.encrypting');
		try {
			// AES-GCM(DEK, text) — the inner layer. Always present.
			const aesBlob = await encryptContent(this.rawDek!, text);

			let payload = aesBlob;
			let mode = MODE_PRIVATE;
			let unlockAt = 0n;
			let drandRound = 0n;
			let beaconScheme: `0x${string}` | undefined;

			if (this.locked) {
				const unlockSec = this.unlockUnix;
				if (!unlockSec || unlockSec <= Math.floor(Date.now() / 1000) + 60) {
					return this.fail(t('capsule.error.pickFuture'));
				}
				const round = roundForTime(unlockSec);
				this.message = t('capsule.status.timelocking');
				// tlock OUTSIDE, AES INSIDE — locked until the drand round is published.
				payload = await timelockSeal(aesBlob, round);
				mode = MODE_CAPSULE;
				unlockAt = BigInt(unlockSec);
				drandRound = BigInt(round);
				beaconScheme = QUICKNET_BEACON_SCHEME;
			}

			if (payload.length > MAX_PAYLOAD) {
				return this.fail(t('capsule.error.tooLongOne'));
			}

			const data = encodeSeal({ mode, unlockAt, drandRound, beaconScheme, payload });
			const res = await sendContractCall({
				safeAddress: user.safeAddress as Address,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: FOREVER_ADDRESS,
				value: FEE_WEI,
				data,
				network: this.networkSlug,
				onStatus: (s) => (this.message = t('capsule.status.sealing', { step: s }))
			});
			if (!res.success) return this.fail(this.friendlyError(res.error ?? t('capsule.error.sealFailed')));

			this.lastTxHash = res.txHash ?? null;
			this.text = '';
			this.status = 'done';
			this.message = t('capsule.status.sealed');
			void this.loadEntries();
			return true;
		} catch (e) {
			return this.fail((e as Error).message);
		}
	}

	/** Decrypt a page of raw entries into timeline rows (private + unlocked capsules). */
	private async toTimeline(raw: ForeverEntry[]): Promise<TimelineEntry[]> {
		const now = Math.floor(Date.now() / 1000);
		const out: TimelineEntry[] = [];
		for (const e of raw) {
			const base = { createdAt: e.createdAt, mode: e.mode, unlockAt: e.unlockAt };
			if (e.mode === MODE_CAPSULE) {
				if (e.unlockAt > now) {
					out.push({ ...base, locked: true });
					continue;
				}
				try {
					// Unlocked: open the tlock layer, then decrypt the inner AES with the DEK.
					const aesBlob = await timelockOpen(e.payload);
					out.push({ ...base, text: await decryptContent(this.rawDek!, aesBlob) });
				} catch {
					out.push({ ...base, locked: true }); // beacon not yet retrievable
				}
				continue;
			}
			try {
				out.push({ ...base, text: await decryptContent(this.rawDek!, e.payload) });
			} catch {
				out.push({ ...base, failed: true });
			}
		}
		return out;
	}

	/** Load the first page of notes on the selected network (respecting sort), decrypting each. */
	async loadEntries(): Promise<void> {
		const user = authStore.user;
		if (!user) return;
		if (!this.rawDek && !(await this.unlock())) return;

		this.loadingEntries = true;
		try {
			const author = user.safeAddress as Address;
			this.entriesTotal = await entryCount(this.networkSlug, author);
			const raw = await fetchEntriesPage(this.networkSlug, author, 0, PAGE, this.sortDir === 'desc');
			this.entries = await this.toTimeline(raw);
		} catch (e) {
			this.message = t('capsule.error.loadFailed', { error: (e as Error).message });
		} finally {
			this.loadingEntries = false;
		}
	}

	/** Append the next page of notes (pagination), continuing in the current sort direction. */
	async loadMore(): Promise<void> {
		const user = authStore.user;
		if (!user || !this.rawDek) return;
		this.loadingEntries = true;
		try {
			const raw = await fetchEntriesPage(
				this.networkSlug,
				user.safeAddress as Address,
				this.entries.length,
				PAGE,
				this.sortDir === 'desc'
			);
			this.entries = [...this.entries, ...(await this.toTimeline(raw))];
		} catch (e) {
			this.message = t('capsule.error.loadMoreFailed', { error: (e as Error).message });
		} finally {
			this.loadingEntries = false;
		}
	}

	/** Flip the timeline order (newest↔oldest) and reload from the top. */
	async setSort(dir: 'desc' | 'asc'): Promise<void> {
		if (this.sortDir === dir) return;
		this.sortDir = dir;
		this.entries = [];
		await this.loadEntries();
	}

	/** Enter a chain (the region gate). The content key is chain-independent, so only the
	 *  per-chain timeline is reset when the chain changes. */
	enterChain(slug: string): void {
		if (slug !== this.networkSlug) {
			this.networkSlug = slug;
			this.entries = [];
			this.entriesTotal = 0;
		}
		this.chainEntered = true;
	}

	/** Leave to the region gate to pick a different chain. */
	exitChain(): void {
		this.chainEntered = false;
	}

	clearStatus(): void {
		if (this.status === 'done' || this.status === 'error') {
			this.status = 'idle';
			this.message = '';
		}
	}
}

export const foreverStore = new ForeverStore();
