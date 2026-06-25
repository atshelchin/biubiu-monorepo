/**
 * ChatStore — the session controller (Svelte 5 runes; same style as
 * pda-apps/token-sender/store.svelte.ts). This IS the session: it owns the
 * transport, the handshake, the in-memory keys, and the message list.
 *
 * Lifecycle:
 *   idle → (create|join) → waiting/handshaking → connected → ended | error
 *
 * Security invariants:
 *   - Ephemeral keys + plaintext live ONLY in these fields (never persisted).
 *   - On end()/reset() keys are dropped and messages cleared → past session gone.
 *   - The relay sees only ciphertext; the Safety Code lets users detect a MITM.
 */
import { recoverMessageAddress, type Hex } from 'viem';
import { walletStore } from '$lib/wallet';
import {
	buildChallenge,
	buildTranscript,
	computeAvatar,
	computeSafetyCode,
	deriveTrafficKeys,
	generateEphemeralKeyPair,
	open,
	seal,
	type EphemeralKeyPair,
	type SafetyCode,
	type TrafficKeys
} from './crypto.js';
import { ChatTransport, type ConnState } from './transport.js';
import type { Handshake, Role, ServerFrame } from './protocol.js';
import {
	buildInviteUrl,
	clearResumeContext,
	newRoomId,
	relayUrl,
	type ResumeContext
} from './relay.js';

/** Fixed domain separator for the wallet sign-in challenge (not an on-chain action). */
const CHALLENGE_CHAIN_ID = 1;

export type Phase =
	| 'idle'
	| 'preparing'
	| 'waiting'
	| 'handshaking'
	| 'connected'
	| 'ended'
	| 'error';
export type ErrorCode =
	| 'noWallet'
	| 'noSign'
	| 'signFailed'
	| 'roomFull'
	| 'tampered'
	| 'connectFailed';
export type EndReason = 'self' | 'peer' | 'overflow';

export interface ChatMessage {
	id: string;
	dir: 'in' | 'out';
	text: string;
	ts: number;
	status: 'sending' | 'sent';
}

export interface Peer {
	/** Wallet address, or '' for an anonymous (no-wallet) peer. */
	address: string;
	/** Wallet kind, or 'anon' for a no-wallet peer. */
	kind: string;
	/** True only if we could verify the peer's wallet signature locally (EOA). */
	verified: boolean;
	/** Stable emoji avatar derived from the peer's ephemeral key. */
	avatar: string;
}

interface QueuedFrame {
	seq: number;
	data: string;
	msgId: string;
}

export class ChatStore {
	// ── reactive UI state ───────────────────────────────────────────────────
	phase = $state<Phase>('idle');
	conn = $state<ConnState>('closed');
	errorCode = $state<ErrorCode | null>(null);
	endReason = $state<EndReason | null>(null);

	role = $state<Role | null>(null);
	roomId = $state<string | null>(null);
	inviteUrl = $state<string | null>(null);
	myAddress = $state<string | null>(null);
	peer = $state<Peer | null>(null);
	peerOnline = $state(true);
	safety = $state<SafetyCode | null>(null);
	messages = $state<ChatMessage[]>([]);
	/**
	 * Safety-Code gate. False until the local user confirms the code matches
	 * their peer out-of-band — outbound messages are blocked until then, and it
	 * resets to false on every re-handshake (key rotation) so a rekey is always
	 * re-verified. Inbound messages are NOT gated (the room still feels alive).
	 */
	verified = $state(false);
	/** Set after a wrong pick in the interactive verification → loud mismatch warning. */
	verifyMismatch = $state(false);

	// ── non-reactive internals ────────────────────────────────────────────────
	private transport: ChatTransport | null = null;
	private myEph: EphemeralKeyPair | null = null;
	private myHandshake: Handshake | null = null;
	private peerHandshake: Handshake | null = null;
	private expectedPeerPub: string | null = null; // joiner cross-checks creator key from link
	private keys: TrafficKeys | null = null;
	private sendSeq = 0;
	private lastRecvSeq = -1;
	private signalSent = false;
	private outQueue: QueuedFrame[] = [];
	/** Our handshake epoch; bumped on a reload-resume so the peer accepts the rekey. */
	private myEpoch = 0;
	/** Highest peer epoch seen; a strictly higher one is a rekey, not a duplicate. */
	private peerEpoch = -1;

	get isCreator(): boolean {
		return this.role === 'a';
	}

	// ── public actions ───────────────────────────────────────────────────────

	/** Create a room and wait for someone to open the invite link. */
	async create(basePath: string): Promise<void> {
		const room = newRoomId();
		if (!(await this.prepareIdentity('a', room))) return;
		this.inviteUrl = buildInviteUrl(basePath, room, this.myEph!.publicKeyB64);
		this.phase = 'waiting';
		this.connect(room);
	}

	/** Join an existing room from an invite link. */
	async join(roomId: string, creatorPub: string): Promise<void> {
		this.expectedPeerPub = creatorPub;
		if (!(await this.prepareIdentity('b', roomId))) return;
		this.phase = 'handshaking';
		this.connect(roomId);
	}

	/**
	 * Re-join a session after a full page reload. We re-claim the held relay slot
	 * with the saved token, then re-handshake with a FRESH ephemeral key under a
	 * higher epoch — a key rotation, so message counters restart safely and the
	 * Safety Code must be re-confirmed. No keys/counters/plaintext are restored.
	 */
	async resume(ctx: ResumeContext): Promise<void> {
		// A resume is NEVER a first contact — the channel was already established
		// and SAS-verified once. We deliberately do NOT re-apply the #k= pin: the
		// peer may have legitimately rotated its key on its own reload, which would
		// false-trip the pin. The mandatory Safety-Code re-verification (verified
		// stays false until the user re-confirms) is what guards the rekey instead.
		this.expectedPeerPub = null;
		this.myEpoch = ctx.myEpoch + 1;
		if (!(await this.prepareIdentity(ctx.role, ctx.roomId))) return;
		this.phase = 'handshaking';
		this.connect(ctx.roomId, ctx.resumeToken);
	}

	/**
	 * Snapshot the minimum needed to re-handshake after a reload — NO secrets
	 * (no keys, no seq, no plaintext). Returns null unless we're fully connected.
	 */
	snapshotForResume(): ResumeContext | null {
		if (this.phase !== 'connected' || !this.roomId || !this.role) return null;
		const resumeToken = this.transport?.resumeToken;
		if (!resumeToken) return null;
		return {
			v: 1,
			roomId: this.roomId,
			role: this.role,
			expectedPeerPub: this.expectedPeerPub,
			resumeToken,
			myEpoch: this.myEpoch,
			savedAt: Date.now()
		};
	}

	/** End the session: tell the peer, drop keys, clear history. */
	end(): void {
		this.transport?.stop(true);
		clearResumeContext();
		this.endReason = 'self';
		this.phase = 'ended';
		this.wipe();
	}

	/**
	 * Confirm the Safety Code via the interactive picker. The user taps the emoji
	 * set their peer read aloud; a match unlocks outbound messaging. A wrong pick
	 * (a wrong-peer / MITM split produces a different code) raises the warning.
	 */
	confirmSafety(pickedEmoji: string): void {
		if (this.phase !== 'connected' || !this.safety) return;
		if (pickedEmoji === this.safety.emoji) {
			this.verified = true;
			this.verifyMismatch = false;
			this.flushOut();
		} else {
			this.verifyMismatch = true;
		}
	}

	/** Return to the landing screen for a brand-new session. */
	reset(): void {
		this.transport?.stop(false);
		this.transport = null;
		this.phase = 'idle';
		this.conn = 'closed';
		this.errorCode = null;
		this.endReason = null;
		this.role = null;
		this.roomId = null;
		this.inviteUrl = null;
		this.myAddress = null;
		this.peer = null;
		this.peerOnline = true;
		this.safety = null;
		this.messages = [];
		// reset() is for an explicit return to the landing screen AND for the
		// onDestroy teardown that runs on a reload. It must NOT clear the resume
		// context — that would defeat the reload-resume. Only the terminal paths
		// (end / peer-gone / error) clear it.
		this.wipe();
	}

	/** Encrypt and send a text message. */
	async send(text: string): Promise<void> {
		const body = text.trim();
		if (!body || this.phase !== 'connected' || !this.verified) return;
		if (!this.keys || !this.roomId || !this.role) return;

		const seq = this.sendSeq++;
		const dir = this.role === 'a' ? 'a2b' : 'b2a';
		const key = this.role === 'a' ? this.keys.a2b : this.keys.b2a;
		const data = await seal(key, this.roomId, dir, seq, body);

		const msg: ChatMessage = {
			id: crypto.randomUUID(),
			dir: 'out',
			text: body,
			ts: Date.now(),
			status: 'sending'
		};
		this.messages.push(msg);

		if (this.transport?.send({ t: 'relay', seq, data })) {
			msg.status = 'sent';
		} else {
			this.outQueue.push({ seq, data, msgId: msg.id });
		}
	}

	// ── setup helpers ─────────────────────────────────────────────────────────

	/**
	 * Generate the ephemeral key and build my handshake. Anonymous by default;
	 * if a wallet is connected we add a verifiable identity by signing the
	 * challenge. Declining the signature falls back to anonymous — we never block
	 * the user from chatting.
	 */
	private async prepareIdentity(role: Role, room: string): Promise<boolean> {
		this.errorCode = null;
		this.phase = 'preparing';
		this.role = role;
		this.roomId = room;

		const eph = await generateEphemeralKeyPair();
		this.myEph = eph;

		let addr = '';
		let sig = '';
		let kind = 'anon';
		const wallet = walletStore.activeWallet;
		if (wallet?.signMessage) {
			try {
				const challenge = buildChallenge(room, role, eph.publicKeyB64);
				const res = await wallet.signMessage(challenge, { chainId: CHALLENGE_CHAIN_ID });
				if (res.ok && res.signature) {
					addr = wallet.address;
					sig = res.signature;
					kind = wallet.kind;
				}
			} catch {
				// Signature declined → remain anonymous.
			}
		}

		this.myAddress = addr;
		this.myHandshake = {
			addr,
			pub: eph.publicKeyB64,
			sig,
			kind,
			chainId: CHALLENGE_CHAIN_ID,
			epoch: this.myEpoch
		};
		return true;
	}

	private connect(roomId: string, resumeToken?: string): void {
		this.transport = new ChatTransport(relayUrl(roomId), {
			onFrame: (f) => this.onFrame(f),
			onState: (s) => this.onState(s)
		});
		// On a reload-resume we present the saved token to re-claim the held slot.
		if (resumeToken) this.transport.resumeToken = resumeToken;
		this.transport.start();
	}

	// ── transport callbacks ─────────────────────────────────────────────────

	private onState(state: ConnState): void {
		this.conn = state;
		if (state === 'open') this.flushOut();
		// Relay unreachable: the transport exhausted its initial-connect deadline.
		// Surface a terminal error (instead of an endless spinner) — but only while
		// we're still trying to establish the session; an already-connected/ended
		// session is unaffected (the transport never emits 'failed' once opened).
		else if (state === 'failed' && (this.phase === 'waiting' || this.phase === 'handshaking')) {
			this.fail('connectFailed');
		}
	}

	private onFrame(frame: ServerFrame): void {
		switch (frame.t) {
			case 'welcome':
				this.role = frame.role;
				if (this.transport) this.transport.resumeToken = frame.token;
				if (frame.peerPresent) this.maybeSendSignal();
				break;
			case 'peer-joined':
				this.peerOnline = true;
				// The peer may have RELOADED (fresh keys). If we're already
				// connected, re-send our signal so they can re-derive. Harmless on a
				// transient blip: the dup carries the same epoch and is ignored.
				if (this.phase === 'connected') this.signalSent = false;
				this.maybeSendSignal();
				break;
			case 'peer-left':
				if (frame.graceful) this.handlePeerGone();
				else this.peerOnline = false;
				break;
			case 'signal':
				void this.onPeerSignal(frame.data);
				break;
			case 'relay':
				void this.onRelay(frame.seq, frame.data);
				break;
			case 'error':
				if (frame.code === 'full') this.fail('roomFull');
				else this.fail('connectFailed');
				break;
		}
	}

	private maybeSendSignal(): void {
		if (this.signalSent || !this.myHandshake || !this.transport) return;
		if (this.transport.send({ t: 'signal', data: this.myHandshake })) {
			this.signalSent = true;
			if (this.phase === 'waiting') this.phase = 'handshaking';
		}
	}

	private async onPeerSignal(hs: Handshake): Promise<void> {
		if (!this.myEph || !this.myHandshake || !this.roomId || !this.role) return;

		// Epoch guard REPLACES the old `peerHandshake` guard. A signal at an epoch
		// we've already accepted (or below) is a duplicate/stale frame → ignore.
		// A strictly higher epoch is a peer that reloaded and rotated keys → accept
		// it as a re-handshake. (Default missing epoch to 0 for the first contact.)
		const epoch = typeof hs.epoch === 'number' ? hs.epoch : 0;
		if (epoch <= this.peerEpoch) return;

		// Anti-tamper pin applies ONLY to the FIRST handshake: the joiner knows the
		// creator's key from the invite link. On a later rekey the pin no longer
		// holds (the creator legitimately rotated its key on reload) — the mandatory
		// Safety-Code re-verification below is what guards a rekey instead.
		if (this.peerEpoch < 0 && this.expectedPeerPub && hs.pub !== this.expectedPeerPub) {
			this.fail('tampered');
			return;
		}

		// Capture locals so a slow derive can't read mutated state mid-flight, and
		// so a rejecting derive (malformed peer key) leaves session fields intact.
		const { myEph, myHandshake, roomId, role } = this;

		// `hs` is fully peer/relay-controlled. The creator has no expectedPeerPub,
		// so a garbage `hs.pub` reaches the WebCrypto import/derive — which rejects.
		// We derive FIRST and commit only on success, dropping a bad frame silently
		// (mirrors onRelay) so a subsequent valid signal can still connect.
		let keys: TrafficKeys;
		let safety: SafetyCode;
		let avatar: string;
		let verified: boolean;
		try {
			keys = await deriveTrafficKeys(myEph.privateKey, hs.pub, roomId);

			// Role-ordered transcript (creator first) → identical Safety Code on both sides.
			const mine = {
				address: myHandshake.addr,
				pub: myHandshake.pub,
				sig: myHandshake.sig
			};
			const theirs = { address: hs.addr, pub: hs.pub, sig: hs.sig };
			const [a, b] = role === 'a' ? [mine, theirs] : [theirs, mine];
			safety = await computeSafetyCode(buildTranscript(roomId, a, b));

			const peerRole: Role = role === 'a' ? 'b' : 'a';
			verified = hs.addr ? await this.verifyPeer(hs, peerRole) : false;
			avatar = await computeAvatar(hs.pub);
		} catch {
			// Malformed / off-curve peer key (or garbage base64) — drop and stay open.
			return;
		}

		// Stale-state guard: discard if torn down or superseded by a newer epoch
		// while we were awaiting the derive.
		if (this.role !== role || this.roomId !== roomId || epoch <= this.peerEpoch) return;

		// True when we already had keys → this is a key ROTATION (peer reloaded),
		// not the first handshake.
		const isRekey = !!this.keys;

		this.peerEpoch = epoch;
		this.keys = keys;
		this.safety = safety;
		this.peer = { address: hs.addr, kind: hs.kind, verified, avatar };
		this.peerHandshake = hs;
		// Fresh/rotated key → restart counters under a never-used key (no nonce
		// reuse), drop any ciphertext queued under the old key, and force the
		// Safety Code to be (re)confirmed before anything leaves.
		this.sendSeq = 0;
		this.lastRecvSeq = -1;
		this.outQueue = [];
		this.verified = false;
		this.verifyMismatch = false;
		this.phase = 'connected';

		// On a rekey we (the still-present peer) must re-send our signal so the
		// reloaded peer can derive against our key too.
		if (isRekey) {
			this.signalSent = false;
			this.maybeSendSignal();
		}
	}

	/** Try to verify the peer's wallet signature locally (works for EOAs only). */
	private async verifyPeer(hs: Handshake, peerRole: Role): Promise<boolean> {
		if (!this.roomId) return false;
		try {
			const message = buildChallenge(this.roomId, peerRole, hs.pub);
			const recovered = await recoverMessageAddress({ message, signature: hs.sig as Hex });
			return recovered.toLowerCase() === hs.addr.toLowerCase();
		} catch {
			return false; // smart-contract wallet — Safety Code is the authority
		}
	}

	private async onRelay(seq: number, data: string): Promise<void> {
		if (!this.keys || !this.roomId || !this.role) return;
		if (seq <= this.lastRecvSeq) return; // replay / duplicate
		const dir = this.role === 'a' ? 'b2a' : 'a2b';
		const key = this.role === 'a' ? this.keys.b2a : this.keys.a2b;
		let text: string;
		try {
			text = await open(key, this.roomId, dir, seq, data);
		} catch {
			return; // forged or corrupt frame — drop silently
		}
		this.lastRecvSeq = seq;
		this.messages.push({
			id: crypto.randomUUID(),
			dir: 'in',
			text,
			ts: Date.now(),
			status: 'sent'
		});
	}

	private flushOut(): void {
		// Gated by the Safety-Code confirmation: nothing leaves until the user
		// has verified the code (so the first message can't reach a MITM).
		if (!this.verified || !this.transport?.isOpen || this.outQueue.length === 0) return;
		const remaining: QueuedFrame[] = [];
		for (const q of this.outQueue) {
			if (this.transport.send({ t: 'relay', seq: q.seq, data: q.data })) {
				const msg = this.messages.find((m) => m.id === q.msgId);
				if (msg) msg.status = 'sent';
			} else {
				remaining.push(q);
			}
		}
		this.outQueue = remaining;
	}

	private handlePeerGone(): void {
		this.transport?.stop(false);
		clearResumeContext(); // peer is gone for good — nothing to resume
		if (this.phase !== 'ended') {
			this.endReason = 'peer';
			this.phase = 'ended';
		}
		this.wipe();
	}

	private fail(code: ErrorCode): void {
		clearResumeContext(); // a terminal error is not resumable
		this.errorCode = code;
		this.phase = 'error';
		this.transport?.stop(false);
		this.wipe();
	}

	/**
	 * Drop all key material + queued ciphertext (messages cleared separately).
	 * Does NOT touch the resume context — that is cleared only by the terminal
	 * paths (end / peer-gone / error) so a reload-driven reset() can still resume.
	 */
	private wipe(): void {
		this.keys = null;
		this.myEph = null;
		this.myHandshake = null;
		this.peerHandshake = null;
		this.expectedPeerPub = null;
		this.outQueue = [];
		this.sendSeq = 0;
		this.lastRecvSeq = -1;
		this.signalSent = false;
		this.myEpoch = 0;
		this.peerEpoch = -1;
		this.verified = false;
		this.verifyMismatch = false;
		if (this.phase === 'ended' || this.phase === 'error') this.messages = [];
	}
}
