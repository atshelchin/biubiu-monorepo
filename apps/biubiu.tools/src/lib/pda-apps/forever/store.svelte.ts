/**
 * 《致未来 · Forever》 client store (Phase 1 — private mode write path).
 *
 * Coordinates the dedicated encryption passkey (PRF), the wrapped-DEK envelope, and the
 * passkey-Safe write path. The wallet passkey (authStore) signs/pays; the encryption passkey
 * only unlocks the data key. The raw DEK lives in memory for the session and is never persisted.
 */
import { browser } from '$app/environment';
import type { Address } from 'viem';
import { authStore } from '$lib/auth/auth-store.svelte.js';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call.js';
import { FOREVER_ADDRESS } from './contract/address.js';
import { MODE_CAPSULE, MODE_PRIVATE } from './contract/abi.js';
import { encodeSeal, encodeSetKey } from './contract/encode.js';
import { entryCount, fetchEntriesPage, fetchKeys, type ForeverEntry } from './contract/reader.js';
import { rpcCall } from './contract/rpc.js';
import { WRITE_NETWORKS, networkBySlug } from './networks.js';
import {
	createEncryptionPasskey,
	evaluatePrf,
	isWebAuthnAvailable,
	type EncryptionCredential
} from './crypto/prf.js';
import { createEnvelope, decryptContent, deriveKEK, encryptContent, openEnvelope } from './crypto/envelope.js';
import { fromHex, toHex } from './crypto/core.js';
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
const LS_ENVELOPE = 'forever.enc.envelope';

/** Per-write fee — matches the contract default (0.0001 native). */
export const FEE_WEI = 100_000_000_000_000n;
/** Contract-enforced max ciphertext bytes; reserve headroom for version + iv + GCM tag. */
const MAX_PAYLOAD = 4096;
const TEXT_BYTE_LIMIT = MAX_PAYLOAD - 29; // 1 version + 12 iv + 16 tag
const PAGE = 20; // timeline page size

type Status = 'idle' | 'setup' | 'unlocking' | 'sealing' | 'done' | 'error';

class ForeverStore {
	credential = $state<EncryptionCredential | null>(null);
	envelopeHex = $state<string | null>(null);
	/** In-memory only (session). Not reactive — never persisted. */
	rawDek: Uint8Array | null = null;
	unlocked = $state(false);

	networkSlug = $state('base-mainnet');
	text = $state('');
	/** 'private' = readable anytime by you; 'capsule' = time-locked until unlockDate. */
	mode = $state<'private' | 'capsule'>('private');
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
			const e = localStorage.getItem(LS_ENVELOPE);
			if (c) this.credential = JSON.parse(c) as EncryptionCredential;
			if (e) this.envelopeHex = e;
		} catch {
			/* ignore corrupt local state */
		}
	}

	get hasKey(): boolean {
		return this.credential !== null && this.envelopeHex !== null;
	}
	get networks() {
		return WRITE_NETWORKS;
	}
	get network() {
		return networkBySlug(this.networkSlug);
	}
	get byteLength(): number {
		return new TextEncoder().encode(this.text).length;
	}
	get overLimit(): boolean {
		// Capsule (tlock) encoding adds ~600B+ of armored overhead; tighten the soft limit for it.
		const limit = this.mode === 'capsule' ? TEXT_BYTE_LIMIT - 1200 : TEXT_BYTE_LIMIT;
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
		if (this.envelopeHex) localStorage.setItem(LS_ENVELOPE, this.envelopeHex);
	}

	private fail(msg: string): false {
		this.status = 'error';
		this.message = msg;
		return false;
	}

	/** One-time: create the encryption passkey, generate + publish the wrapped-DEK envelope. */
	async setupKey(): Promise<boolean> {
		const user = authStore.user;
		if (!user) return this.fail('Please sign in first.');
		if (!isWebAuthnAvailable()) return this.fail('WebAuthn is not available in this browser.');

		this.status = 'setup';
		this.message = 'Creating your encryption passkey…';
		try {
			const { credential, prfEnabled } = await createEncryptionPasskey(user.rpId);
			if (!prfEnabled) return this.fail('This authenticator does not support PRF encryption.');

			const { prf } = await evaluatePrf(credential);
			const kek = await deriveKEK(prf);
			const { rawDek, envelope } = await createEnvelope(kek);

			this.message = 'Publishing your encrypted key on-chain…';
			const res = await sendContractCall({
				safeAddress: user.safeAddress as Address,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: FOREVER_ADDRESS,
				value: 0n,
				data: encodeSetKey(envelope),
				network: this.networkSlug,
				onStatus: (s) => (this.message = `Key setup: ${s}…`)
			});
			if (!res.success) return this.fail(res.error ?? 'Key setup failed.');

			this.credential = credential;
			this.envelopeHex = toHex(envelope);
			this.rawDek = rawDek;
			this.unlocked = true;
			this.persist();
			this.status = 'idle';
			this.message = '';
			return true;
		} catch (e) {
			return this.fail((e as Error).message);
		}
	}

	/**
	 * Sign in with an EXISTING Forever passkey (discoverable prompt — no new passkey created).
	 * Recovers the data key by opening an on-chain envelope this passkey can unwrap.
	 */
	async useExistingKey(): Promise<boolean> {
		const user = authStore.user;
		if (!user) return this.fail('Please sign in first.');
		if (!isWebAuthnAvailable()) return this.fail('WebAuthn is not available in this browser.');

		this.status = 'unlocking';
		this.message = 'Choose your Forever passkey…';
		try {
			const { prf, credentialId } = await evaluatePrf(); // discoverable: user picks an existing passkey
			const kek = await deriveKEK(prf);
			const envelopes = await fetchKeys(this.networkSlug, user.safeAddress as Address);
			for (const env of envelopes) {
				try {
					this.rawDek = await openEnvelope(kek, env);
					this.credential = { credentialId, rpId: user.rpId, createdAt: Date.now() };
					this.envelopeHex = toHex(env);
					this.unlocked = true;
					this.persist();
					this.status = 'idle';
					this.message = '';
					return true;
				} catch {
					/* this passkey doesn't open that envelope — try the next */
				}
			}
			return this.fail(
				`No Forever key found on ${this.network?.name ?? 'this network'} for that passkey. Create one, or switch to the network where you set it up.`
			);
		} catch (e) {
			return this.fail((e as Error).message);
		}
	}

	/**
	 * Unlock the in-memory DEK: evaluate PRF, then open whichever envelope this passkey can.
	 * Tries the locally-cached envelope first, then any on-chain envelopes (multi-backup / recovery).
	 */
	async unlock(): Promise<boolean> {
		if (!this.credential) return this.fail('No encryption key set up yet.');
		this.status = 'unlocking';
		this.message = 'Unlocking with your passkey…';
		try {
			const { prf } = await evaluatePrf(this.credential);
			const kek = await deriveKEK(prf);

			const candidates: Uint8Array[] = [];
			if (this.envelopeHex) candidates.push(fromHex(this.envelopeHex));
			const user = authStore.user;
			if (user) {
				try {
					candidates.push(...(await fetchKeys(this.networkSlug, user.safeAddress as Address)));
				} catch {
					/* on-chain key fetch is best-effort */
				}
			}

			for (const env of candidates) {
				try {
					this.rawDek = await openEnvelope(kek, env);
					this.unlocked = true;
					if (!this.envelopeHex) {
						this.envelopeHex = toHex(env);
						this.persist();
					}
					this.status = 'idle';
					this.message = '';
					return true;
				} catch {
					/* this passkey doesn't open that envelope — try the next */
				}
			}
			return this.fail('Could not unlock with this passkey.');
		} catch (e) {
			return this.fail('Could not unlock — ' + (e as Error).message);
		}
	}

	/** Encrypt the current text and seal it on-chain (private mode), charging the fee. */
	async seal(): Promise<boolean> {
		const user = authStore.user;
		if (!user) return this.fail('Please sign in first.');
		const text = this.text.trim();
		if (!text) return this.fail('Write something first.');
		if (this.overLimit) return this.fail('Message is too long.');
		if (!this.rawDek && !(await this.unlock())) return false;

		// Preflight: a fresh/empty Safe can't pay the fee + gas. Catch the common case early
		// with a clear message; the bundler still surfaces precise errors for edge cases.
		try {
			const balHex = await rpcCall<string>(this.networkSlug, 'eth_getBalance', [user.safeAddress, 'latest']);
			if (BigInt(balHex) < FEE_WEI) {
				const sym = this.network?.nativeSymbol ?? 'funds';
				return this.fail(`Your wallet needs ${sym} on ${this.network?.name} to seal. Deposit a little and try again.`);
			}
		} catch {
			/* non-fatal: fall through and let the bundler report precise errors */
		}

		this.status = 'sealing';
		this.message = 'Encrypting…';
		try {
			// AES-GCM(DEK, text) — the inner layer. Always present.
			const aesBlob = await encryptContent(this.rawDek!, text);

			let payload = aesBlob;
			let mode = MODE_PRIVATE;
			let unlockAt = 0n;
			let drandRound = 0n;
			let beaconScheme: `0x${string}` | undefined;

			if (this.mode === 'capsule') {
				const unlockSec = this.unlockUnix;
				if (!unlockSec || unlockSec <= Math.floor(Date.now() / 1000) + 60) {
					return this.fail('Pick a future unlock date for the capsule.');
				}
				const round = roundForTime(unlockSec);
				this.message = 'Time-locking (even you can’t read it until then)…';
				// tlock OUTSIDE, AES INSIDE — locked until the drand round is published.
				payload = await timelockSeal(aesBlob, round);
				mode = MODE_CAPSULE;
				unlockAt = BigInt(unlockSec);
				drandRound = BigInt(round);
				beaconScheme = QUICKNET_BEACON_SCHEME;
			}

			if (payload.length > MAX_PAYLOAD) {
				return this.fail('Message is too long for one note.');
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
				onStatus: (s) => (this.message = `Sealing: ${s}…`)
			});
			if (!res.success) return this.fail(res.error ?? 'Seal failed.');

			this.lastTxHash = res.txHash ?? null;
			this.text = '';
			this.status = 'done';
			this.message = 'Sealed forever.';
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

	/** Load the first (newest) page of notes on the selected network, decrypting each. */
	async loadEntries(): Promise<void> {
		const user = authStore.user;
		if (!user) return;
		if (!this.rawDek && !(await this.unlock())) return;

		this.loadingEntries = true;
		try {
			const author = user.safeAddress as Address;
			this.entriesTotal = await entryCount(this.networkSlug, author);
			const raw = await fetchEntriesPage(this.networkSlug, author, 0, PAGE);
			this.entries = await this.toTimeline(raw);
		} catch (e) {
			this.message = 'Could not load notes — ' + (e as Error).message;
		} finally {
			this.loadingEntries = false;
		}
	}

	/** Append the next page of older notes (pagination). */
	async loadMore(): Promise<void> {
		const user = authStore.user;
		if (!user || !this.rawDek) return;
		this.loadingEntries = true;
		try {
			const raw = await fetchEntriesPage(this.networkSlug, user.safeAddress as Address, this.entries.length, PAGE);
			this.entries = [...this.entries, ...(await this.toTimeline(raw))];
		} catch (e) {
			this.message = 'Could not load more — ' + (e as Error).message;
		} finally {
			this.loadingEntries = false;
		}
	}

	clearStatus(): void {
		if (this.status === 'done' || this.status === 'error') {
			this.status = 'idle';
			this.message = '';
		}
	}
}

export const foreverStore = new ForeverStore();
