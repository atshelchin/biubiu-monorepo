/**
 * Relay endpoint + invite-link helpers (no framework, no circular deps).
 */

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
