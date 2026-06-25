/**
 * Relay endpoint + invite-link helpers (no framework, no circular deps).
 */
import type { Role } from './protocol.js';

/**
 * Relay endpoint. Dev points at a local `wrangler dev`; production at the
 * deployed Worker. Override with `VITE_CHAT_RELAY_URL` if needed.
 */
export function relayUrl(roomId: string): string {
	const override = import.meta.env.VITE_CHAT_RELAY_URL as string | undefined;
	const base = override
		? override
		: import.meta.env.DEV
			? 'ws://localhost:8787/v1/connect'
			: 'wss://chat.biubiu.tools/v1/connect';
	return `${base}?room=${encodeURIComponent(roomId)}`;
}

/** A fresh, URL-safe room id (~24 chars). */
export function newRoomId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Invite {
	roomId: string;
	creatorPub: string;
}

/** Parse a `#r=<room>&k=<pub>` invite fragment; null if absent/malformed. */
export function parseInvite(hash: string): Invite | null {
	const frag = hash.startsWith('#') ? hash.slice(1) : hash;
	if (!frag) return null;
	const params = new URLSearchParams(frag);
	const roomId = params.get('r');
	const creatorPub = params.get('k');
	if (!roomId || !creatorPub) return null;
	return { roomId, creatorPub };
}

/** Build the shareable invite link for a room. */
export function buildInviteUrl(basePath: string, roomId: string, creatorPub: string): string {
	const origin = typeof location !== 'undefined' ? location.origin : 'https://biubiu.tools';
	const params = new URLSearchParams({ r: roomId, k: creatorPub });
	return `${origin}${basePath}#${params.toString()}`;
}

// ── reload resume (tab-scoped, NON-secret context only) ──────────────────────
//
// To survive a full page reload we persist the MINIMUM needed to re-handshake:
// the room id, our role, the joiner's creator-key pin, and the relay slot token.
// We deliberately persist NO key material, NO message counters, and NO plaintext
// — a reload always re-handshakes with a FRESH ephemeral key (a key rotation),
// so AES-GCM counters legitimately restart under a never-used key (zero nonce
// reuse). sessionStorage is per-tab and cleared when the tab closes, which
// matches the ephemeral-session model; it is wiped on end / peer-gone / error.

const RESUME_KEY = 'biubiu-chat:v1:resume';
/** Slightly beyond the relay's 90s grace — a stale snapshot can't be reclaimed anyway. */
const RESUME_MAX_AGE_MS = 120_000;

export interface ResumeContext {
	v: 1;
	roomId: string;
	role: Role;
	/** The joiner's creator-key pin (#k=), or null for the creator. */
	expectedPeerPub: string | null;
	/** Server-issued slot token, used once to re-claim the held slot. */
	resumeToken: string;
	/** Our handshake epoch at save time; the resumed session uses epoch+1. */
	myEpoch: number;
	savedAt: number;
}

export function saveResumeContext(ctx: ResumeContext): void {
	try {
		sessionStorage.setItem(RESUME_KEY, JSON.stringify(ctx));
	} catch {
		/* storage unavailable / quota — resume is best-effort */
	}
}

export function loadResumeContext(): ResumeContext | null {
	try {
		const raw = sessionStorage.getItem(RESUME_KEY);
		if (!raw) return null;
		const ctx = JSON.parse(raw) as ResumeContext;
		if (ctx?.v !== 1 || !ctx.roomId || !ctx.resumeToken || (ctx.role !== 'a' && ctx.role !== 'b')) {
			clearResumeContext();
			return null;
		}
		if (Date.now() - ctx.savedAt > RESUME_MAX_AGE_MS) {
			clearResumeContext();
			return null;
		}
		return ctx;
	} catch {
		return null;
	}
}

export function clearResumeContext(): void {
	try {
		sessionStorage.removeItem(RESUME_KEY);
	} catch {
		/* noop */
	}
}
