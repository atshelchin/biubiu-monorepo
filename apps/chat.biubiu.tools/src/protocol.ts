/**
 * Wire protocol for the chat relay (outer envelope only).
 *
 * The relay is BLIND: it never inspects `signal.data` (handshake) or `relay.data`
 * (AES-GCM ciphertext) — it only routes frames between the two peers in a room.
 *
 * ⚠️ Keep in sync with the client mirror at
 *    apps/biubiu.tools/src/lib/e2e-chat/protocol.ts
 * The frames are tiny; a shared workspace package isn't worth it.
 */

export type Role = 'a' | 'b';

// ── Client → Server ────────────────────────────────────────────────────────

/** First frame on every (re)connect. `resume` re-claims a slot after a blip. */
export interface ClientHello {
	t: 'hello';
	resume?: string;
}
/** Handshake payload (ephemeral pubkey + wallet sig). Relayed verbatim. */
export interface ClientSignal {
	t: 'signal';
	data: unknown;
}
/** Encrypted chat message. Relayed verbatim + buffered while peer is away. */
export interface ClientRelay {
	t: 'relay';
	seq: number;
	data: string;
}
/** Graceful end — tears the room down immediately (no grace window). */
export interface ClientBye {
	t: 'bye';
}

export type ClientFrame = ClientHello | ClientSignal | ClientRelay | ClientBye;

// ── Server → Client ────────────────────────────────────────────────────────

/** Sent right after `hello`; carries the role + a resume token. */
export interface ServerWelcome {
	t: 'welcome';
	role: Role;
	token: string;
	peerPresent: boolean;
}
/** The other peer (re)connected. */
export interface ServerPeerJoined {
	t: 'peer-joined';
}
/** The other peer dropped. `graceful:false` = transient (may reconnect). */
export interface ServerPeerLeft {
	t: 'peer-left';
	graceful: boolean;
}
export interface ServerSignal {
	t: 'signal';
	data: unknown;
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
