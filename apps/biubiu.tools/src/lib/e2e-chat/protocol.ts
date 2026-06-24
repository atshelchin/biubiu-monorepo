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

/** One peer's identity + ephemeral key + wallet signature over the challenge. */
export interface Handshake {
	addr: string;
	pub: string;
	sig: string;
	kind: string;
	chainId: number;
}
