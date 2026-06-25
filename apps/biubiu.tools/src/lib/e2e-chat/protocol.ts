/**
 * Wire protocol — client mirror of the relay's envelope.
 *
 * ⚠️ Keep in sync with apps/chat.biubiu.tools/src/protocol.ts
 *
 * The relay only routes these frames; it never reads `signal.data` (the
 * handshake) or `relay.data` (AES-GCM ciphertext).
 */

export type Role = 'a' | 'b';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface ClientHello {
	t: 'hello';
	resume?: string;
}
export interface ClientSignal {
	t: 'signal';
	data: Handshake;
}
export interface ClientRelay {
	t: 'relay';
	seq: number;
	data: string;
}
export interface ClientBye {
	t: 'bye';
}
export type ClientFrame = ClientHello | ClientSignal | ClientRelay | ClientBye;

// ── Server → Client ──────────────────────────────────────────────────────────

export interface ServerWelcome {
	t: 'welcome';
	role: Role;
	token: string;
	peerPresent: boolean;
}
export interface ServerPeerJoined {
	t: 'peer-joined';
}
export interface ServerPeerLeft {
	t: 'peer-left';
	graceful: boolean;
}
export interface ServerSignal {
	t: 'signal';
	data: Handshake;
}
export interface ServerRelay {
	t: 'relay';
	seq: number;
	data: string;
}
export interface ServerError {
	t: 'error';
	code: string;
	message: string;
}
export type ServerFrame =
	| ServerWelcome
	| ServerPeerJoined
	| ServerPeerLeft
	| ServerSignal
	| ServerRelay
	| ServerError;

// ── Handshake payload (opaque to the relay) ──────────────────────────────────

/**
 * One peer's identity + ephemeral key + wallet signature over the challenge.
 *
 * `epoch` lets a peer that reloaded (and re-handshakes with a FRESH ephemeral
 * key) be accepted by the still-present peer: a strictly higher epoch triggers a
 * key rotation rather than being dropped as a duplicate. It lives inside the
 * opaque `signal.data`, so the relay never sees it and its mirror is unchanged.
 */
export interface Handshake {
	addr: string;
	pub: string;
	sig: string;
	kind: string;
	chainId: number;
	epoch: number;
}
