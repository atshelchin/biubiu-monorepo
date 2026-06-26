/**
 * Capsule client store — encrypted notes sealed permanently on-chain, readable only by the author.
 *
 * The content key is derived DETERMINISTICALLY from the wallet passkey's PRF (one passkey is both
 * identity and encryption root). The same passkey yields the same key on every browser/device, so
 * a letter sealed anywhere decrypts everywhere — no random key, no on-chain envelope, no second
 * passkey. The key lives in memory for the session and is re-derived (one Touch ID) when needed.
 * Nothing on-chain is required to start: the Safe deploys lazily on the first seal.
 */
import { browser } from '$app/environment';
import { formatUnits, type Address } from 'viem';
import { t, formatRelativeTime } from '$lib/i18n';
import { authStore } from '$lib/auth/auth-store.svelte.js';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call.js';
import { FOREVER_ADDRESS } from './contract/address.js';
import { encodeSeal } from './contract/encode.js';
import { cooldownRemaining, entryCount, fetchEntriesPage, type ForeverEntry } from './contract/reader.js';
import { rpcCall } from './contract/rpc.js';
import { WRITE_NETWORKS, networkBySlug } from './networks.js';
import { fetchBundlerAccountInfo, type GasAccountFunding } from '$lib/wallet/infra/bundler-account.js';
import { evaluatePrf, isWebAuthnAvailable, type EncryptionCredential } from './crypto/prf.js';
import { deriveContentKey, decryptContent, encryptContent } from './crypto/envelope.js';

/** A note as shown in the timeline (decrypted client-side). */
export interface TimelineEntry {
	/** Unique per author (12h cooldown) — used as the list key. */
	createdAt: number;
	/** Decrypted text (present for readable notes). */
	text?: string;
	/** Decryption failed (wrong key / corrupt). */
	failed?: boolean;
}

// NOTE: these `forever.*` storage-key strings are FROZEN — they are the original
// keys existing users' saved credential/chain/gate state lives under. The app was
// renamed forever → capsule, but renaming these values would orphan that state
// (users would silently lose their saved capsule credential). Do not "fix" them.
const LS_CRED = 'forever.enc.cred';
const LS_CHAIN = 'forever.chain'; // remember the chosen chain
const LS_ENTERED = 'forever.entered'; // remember the gate was passed (skip it on reload)
const LS_DRAFT = 'forever.draft'; // unsaved note text — survives a failed seal, reload, or crash

/** Per-write fee charged + displayed (0.001 native). Must be >= the contract's on-chain floor. */
export const FEE_WEI = 1_000_000_000_000_000n;
/** Contract-enforced max ciphertext bytes; reserve headroom for version + iv + GCM tag. */
const MAX_PAYLOAD = 4096;
const TEXT_BYTE_LIMIT = MAX_PAYLOAD - 29; // 1 version + 12 iv + 16 tag
const PAGE = 20; // timeline page size

type Status = 'idle' | 'setup' | 'unlocking' | 'sealing' | 'done' | 'error';

class CapsuleStore {
	credential = $state<EncryptionCredential | null>(null);
	/** Deterministic content key (32 bytes). In-memory only (session) — never persisted. */
	rawDek: Uint8Array | null = null;
	unlocked = $state(false);

	networkSlug = $state('base-mainnet');
	/** Region-gate: you pick a chain before entering; it's fixed until you explicitly exit. */
	chainEntered = $state(false);
	/** Past-view sort: 'desc' = newest first, 'asc' = oldest first. */
	sortDir = $state<'desc' | 'asc'>('desc');

	/** The note being written. Backed by localStorage so a failed seal — or a reload / accidental
	 *  tab close / crash — never makes the user retype. Cleared only after a confirmed seal. */
	private _text = $state('');
	get text(): string {
		return this._text;
	}
	set text(v: string) {
		this._text = v;
		if (!browser) return;
		if (v) localStorage.setItem(LS_DRAFT, v);
		else localStorage.removeItem(LS_DRAFT);
	}

	status = $state<Status>('idle');
	message = $state('');
	lastTxHash = $state<string | null>(null);

	entries = $state<TimelineEntry[]>([]);
	entriesTotal = $state(0);
	loadingEntries = $state(false);

	/** When set, the seal hit an empty bundler gas account → show the funding modal
	 *  (BundlerFundingModal handles sponsorship + self-fund; we just retry on success). */
	funding = $state<GasAccountFunding | null>(null);

	constructor() {
		if (!browser) return;
		try {
			const c = localStorage.getItem(LS_CRED);
			if (c) this.credential = JSON.parse(c) as EncryptionCredential;
			// Remember the last chosen chain so reloads don't bounce back to the gate (and never
			// land on a different chain showing an empty timeline). Only restore a still-valid slug.
			const savedChain = localStorage.getItem(LS_CHAIN);
			if (savedChain && WRITE_NETWORKS.some((n) => n.slug === savedChain)) {
				this.networkSlug = savedChain;
				this.chainEntered = localStorage.getItem(LS_ENTERED) === '1';
			}
			// Restore an unsaved draft (assign the backing field directly — no need to re-persist).
			const draft = localStorage.getItem(LS_DRAFT);
			if (draft) this._text = draft;
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
	get byteLength(): number {
		return new TextEncoder().encode(this.text).length;
	}
	get overLimit(): boolean {
		return this.byteLength > TEXT_BYTE_LIMIT;
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
		// The relayer's dedicated gas account is empty — tell the user exactly where + how much to deposit.
		const gas = raw.match(/bundler gas account[\s\S]*?required:\s*(\d+)[\s\S]*?Deposit to:\s*(0x[a-fA-F0-9]{40})/i);
		if (gas) {
			const amount = Math.ceil(Number(formatUnits(BigInt(gas[1]), 18)) * 1000) / 1000;
			return t('capsule.error.bundlerGas', {
				amount: String(amount),
				symbol: this.network?.nativeSymbol ?? '',
				address: gas[2]
			});
		}
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
		// Top-level entry point: when the key is confirmed the flow is over → go idle.
		return this.deriveKey(this.credentialFor(user), 'idle');
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
		// Remember the caller's status so a sub-step unlock (seal → 'sealing', loadEntries → 'idle')
		// restores it instead of the unlock hard-stamping 'idle'. One owner of the top-level status.
		const prior = this.status;
		this.status = 'unlocking';
		this.message = t('capsule.status.unlocking');
		// ALWAYS the wallet passkey — never a stored credential, which on accounts migrated from the
		// old scheme could be a dedicated encryption passkey and would derive a divergent key.
		return this.deriveKey(this.credentialFor(user), prior === 'unlocking' ? 'idle' : prior);
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
	private async deriveKey(cred: EncryptionCredential, restoreStatus: Status): Promise<boolean> {
		try {
			const { prf } = await evaluatePrf(cred);
			this.rawDek = await deriveContentKey(prf);
			this.credential = cred;
			this.unlocked = true;
			this.persist();
			// Hand the top-level status back to the caller's flow instead of hard-stamping 'idle'
			// (which made status flap idle→sealing when unlock ran as a sub-step of seal()).
			this.status = restoreStatus;
			this.message = '';
			return true;
		} catch {
			return this.fail(t('capsule.error.noPrf'));
		}
	}

	/**
	 * Best-effort balance preflight: how far the Safe is below the protocol fee floor it must pay
	 * as msg.value (FEE_WEI). Returns the wei shortfall (>0 ⇒ provably cannot even pay the fee),
	 * 0 if it can cover the fee, and 0 on any RPC failure (defer to the bundler's precise errors).
	 *
	 * NOTE: this deliberately does NOT add a gas reserve. 4337 gas may be paid by a bundler
	 * gas-account / sponsor, so a Safe holding exactly FEE_WEI can still seal — adding a reserve
	 * would false-reject that sponsored case. The fee itself, by contrast, is always paid by the
	 * Safe, so a balance below FEE_WEI is unspendable no matter who sponsors gas. Pure + testable.
	 */
	async feeShortfall(safeAddress: string): Promise<bigint> {
		try {
			const balHex = await rpcCall<string>(this.networkSlug, 'eth_getBalance', [safeAddress, 'latest']);
			const bal = BigInt(balHex);
			return bal < FEE_WEI ? FEE_WEI - bal : 0n;
		} catch {
			return 0n; // non-fatal: let the bundler report precise AA21 / gas-account errors
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

		// Preflight both reads IN PARALLEL and fail fast BEFORE prompting a passkey:
		//  - cooldown: one note per chain per 12h.
		//  - balance: only the *provably* unspendable case (below FEE_WEI, which the Safe always
		//    pays as msg.value); a gas sponsor can cover everything else, so we don't add a gas
		//    reserve here and defer richer AA21 / gas-account errors to the bundler.
		const author = user.safeAddress as Address;
		const [cooldownLeft, shortfall] = await Promise.all([
			cooldownRemaining(this.networkSlug, author).catch(() => 0),
			this.feeShortfall(user.safeAddress)
		]);
		if (cooldownLeft > 0) {
			return this.fail(t('capsule.error.cooldown', { when: formatRelativeTime(Date.now() + cooldownLeft * 1000) }));
		}
		if (shortfall > 0n) return this.fail(this.friendlyError('AA21'));

		// Now derive the key (one passkey touch). unlock() restores 'sealing' on success.
		if (!this.rawDek && !(await this.unlock())) return false;

		this.message = t('capsule.status.encrypting');
		try {
			// AES-GCM(DEK, text) — the only layer. Opened solely by the author's passkey-derived key.
			const payload = await encryptContent(this.rawDek!, text);
			if (payload.length > MAX_PAYLOAD) {
				return this.fail(t('capsule.error.tooLong'));
			}

			const data = encodeSeal(payload);
			const res = await sendContractCall({
				safeAddress: user.safeAddress as Address,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: FOREVER_ADDRESS,
				value: FEE_WEI,
				data,
				network: this.networkSlug,
				// Map low-level 4337 stages to clean, honest, reassuring copy (never leak raw stage names).
				onStatus: (s) => {
					this.message =
						s === 'signing'
							? t('capsule.status.signing')
							: s === 'submitting'
								? t('capsule.status.submitting')
								: s === 'waiting'
									? t('capsule.status.confirming')
									: t('capsule.status.preparing'); // checking / building / estimating
				}
			});
			if (!res.success) {
				const raw = res.error ?? t('capsule.error.sealFailed');
				// Empty bundler gas account → offer sponsorship or self-funding instead of a dead-end error.
				if (/bundler gas account|insufficient native balance on dedicated/i.test(raw)) {
					return this.openFunding(raw);
				}
				return this.fail(this.friendlyError(raw));
			}

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

	/** Decrypt a page of raw entries into timeline rows. */
	private async toTimeline(raw: ForeverEntry[]): Promise<TimelineEntry[]> {
		const out: TimelineEntry[] = [];
		for (const e of raw) {
			try {
				out.push({ createdAt: e.createdAt, text: await decryptContent(this.rawDek!, e.payload) });
			} catch {
				out.push({ createdAt: e.createdAt, failed: true });
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
			// Count + first page are independent reads — fetch them in parallel (one round-trip, not two).
			const [total, raw] = await Promise.all([
				entryCount(this.networkSlug, author),
				fetchEntriesPage(this.networkSlug, author, 0, PAGE, this.sortDir === 'desc')
			]);
			this.entriesTotal = total;
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
			const author = user.safeAddress as Address;
			// Next page + refreshed total are independent — fetch in parallel.
			const [raw, total] = await Promise.all([
				fetchEntriesPage(this.networkSlug, author, this.entries.length, PAGE, this.sortDir === 'desc'),
				entryCount(this.networkSlug, author)
			]);
			this.entries = [...this.entries, ...(await this.toTimeline(raw))];
			this.entriesTotal = total;
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
		if (browser) {
			localStorage.setItem(LS_CHAIN, slug);
			localStorage.setItem(LS_ENTERED, '1');
		}
	}

	/** Leave to the region gate to pick a different chain. */
	exitChain(): void {
		this.chainEntered = false;
		if (browser) localStorage.setItem(LS_ENTERED, '0');
	}

	/** Surface the gas-account funding modal — parse the relayer error for amount + address. */
	private async openFunding(rawError: string): Promise<false> {
		const user = authStore.user;
		const net = this.network;
		const rm = rawError.match(/required:\s*(\d+)/i);
		const required = rm ? BigInt(rm[1]) : 0n;
		let depositAddress = '';
		let currentWei = 0n;
		const dm = rawError.match(/Deposit to:\s*(0x[a-fA-F0-9]{40})/i);
		if (dm) depositAddress = dm[1];
		const sm = rawError.match(/Spendable:\s*(\d+)/i);
		if (sm) currentWei = BigInt(sm[1]);
		// Prefer fresh on-chain info (more accurate address + balance) when reachable.
		if (user && net) {
			const info = await fetchBundlerAccountInfo(net.chainId, user.safeAddress).catch(() => null);
			if (info?.depositAddress) {
				depositAddress = info.depositAddress;
				currentWei = info.spendableBalance;
			}
		}
		this.funding = {
			chainId: net?.chainId ?? 0,
			safeAddress: user?.safeAddress ?? '',
			depositAddress,
			nativeSym: net?.nativeSymbol ?? '',
			requiredWei: required,
			currentWei
		};
		this.status = 'idle';
		this.message = '';
		return false;
	}

	/** Retry the seal after the gas account has been funded (sponsored or self-funded). */
	async retrySeal(): Promise<void> {
		this.funding = null;
		this.status = 'idle';
		await this.seal();
	}

	/** Dismiss the funding modal without sealing. */
	dismissFunding(): void {
		this.funding = null;
	}

	clearStatus(): void {
		if (this.status === 'done' || this.status === 'error') {
			this.status = 'idle';
			this.message = '';
		}
	}
}

export const capsuleStore = new CapsuleStore();
