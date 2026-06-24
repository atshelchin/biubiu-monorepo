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
import { buildInviteUrl, newRoomId, relayUrl } from './relay.js';

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

	/** End the session: tell the peer, drop keys, clear history. */
	end(): void {
		this.transport?.stop(true);
		this.endReason = 'self';
		this.phase = 'ended';
		this.wipe();
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
		this.wipe();
	}

	/** Encrypt and send a text message. */
	async send(text: string): Promise<void> {
		const body = text.trim();
		if (!body || this.phase !== 'connected' || !this.keys || !this.roomId || !this.role) return;

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
		this.myHandshake = { addr, pub: eph.publicKeyB64, sig, kind, chainId: CHALLENGE_CHAIN_ID };
		return true;
	}

	private connect(roomId: string): void {
		this.transport = new ChatTransport(relayUrl(roomId), {
			onFrame: (f) => this.onFrame(f),
			onState: (s) => this.onState(s)
		});
		this.transport.start();
	}

	// ── transport callbacks ─────────────────────────────────────────────────

	private onState(state: ConnState): void {
		this.conn = state;
		if (state === 'open') this.flushOut();
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
		if (this.peerHandshake || !this.myEph || !this.myHandshake || !this.roomId || !this.role)
			return;

		// Anti-tamper: the joiner knows the creator's key from the invite link.
		if (this.expectedPeerPub && hs.pub !== this.expectedPeerPub) {
			this.fail('tampered');
			return;
		}
		this.peerHandshake = hs;

		this.keys = await deriveTrafficKeys(this.myEph.privateKey, hs.pub, this.roomId);

		// Role-ordered transcript (creator first) → identical Safety Code on both sides.
		const mine = {
			address: this.myHandshake.addr,
			pub: this.myHandshake.pub,
			sig: this.myHandshake.sig
		};
		const theirs = { address: hs.addr, pub: hs.pub, sig: hs.sig };
		const [a, b] = this.role === 'a' ? [mine, theirs] : [theirs, mine];
		this.safety = await computeSafetyCode(buildTranscript(this.roomId, a, b));

		const peerRole: Role = this.role === 'a' ? 'b' : 'a';
		this.peer = {
			address: hs.addr,
			kind: hs.kind,
			verified: hs.addr ? await this.verifyPeer(hs, peerRole) : false,
			avatar: await computeAvatar(hs.pub)
		};

		this.phase = 'connected';
		this.flushOut();
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
		if (!this.transport?.isOpen || this.outQueue.length === 0) return;
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
		if (this.phase !== 'ended') {
			this.endReason = 'peer';
			this.phase = 'ended';
		}
		this.wipe();
	}

	private fail(code: ErrorCode): void {
		this.errorCode = code;
		this.phase = 'error';
		this.transport?.stop(false);
		this.wipe();
	}

	/** Drop all key material + queued ciphertext (messages cleared separately). */
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
		if (this.phase === 'ended' || this.phase === 'error') this.messages = [];
	}
}
