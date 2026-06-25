/**
 * Cross-peer integration ("E2E") test for the client stack: two real ChatStore
 * instances complete a real ECDH + AES-GCM handshake and exchange encrypted
 * messages through a faithful in-memory relay. Only the transport (WebSocket)
 * and the wallet are mocked, so crypto, the session state machine, the protocol,
 * and the relay forwarding semantics are all exercised end to end — no browser,
 * no network, fully deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { parseInvite } from './relay.js';
import { generateEphemeralKeyPair, toB64url } from './crypto.js';

// ── Mock the WebSocket transport with a faithful 2-peer relay simulator ──────
const H = vi.hoisted(() => {
	type Frame = Record<string, unknown> & { t: string };

	class FakeRelay {
		rooms = new Map<string, FakeTransport[]>();

		join(tr: FakeTransport) {
			const peers = this.rooms.get(tr.room) ?? [];
			if (peers.length >= 2) {
				tr.cb.onState('open');
				tr.deliver({ t: 'error', code: 'full', message: 'room is full' });
				return;
			}
			const other = peers[0];
			tr.role = peers.length === 0 ? 'a' : 'b';
			tr.token = `${tr.role}-token`;
			tr.open = true;
			peers.push(tr);
			this.rooms.set(tr.room, peers);
			tr.cb.onState('open');
			tr.deliver({ t: 'welcome', role: tr.role, token: tr.token, peerPresent: !!other?.open });
			if (other?.open) other.deliver({ t: 'peer-joined' });
		}

		send(tr: FakeTransport, frame: Frame): boolean {
			const other = (this.rooms.get(tr.room) ?? []).find((p) => p !== tr);
			if (frame.t === 'bye') {
				this.leave(tr);
				return true;
			}
			if (other?.open) other.deliver(frame);
			return true;
		}

		leave(tr: FakeTransport) {
			const peers = this.rooms.get(tr.room) ?? [];
			const other = peers.find((p) => p !== tr);
			tr.open = false;
			this.rooms.set(
				tr.room,
				peers.filter((p) => p !== tr)
			);
			if (other?.open) other.deliver({ t: 'peer-left', graceful: true });
		}

		reset() {
			this.rooms.clear();
		}
	}

	const relay = new FakeRelay();
	const transports: FakeTransport[] = [];

	class FakeTransport {
		room: string;
		cb: { onFrame: (f: Frame) => void; onState: (s: string) => void };
		resumeToken: string | null = null;
		open = false;
		role: string | null = null;
		token: string | null = null;

		constructor(url: string, cb: FakeTransport['cb']) {
			this.room = new URL(url).searchParams.get('room') ?? '';
			this.cb = cb;
			transports.push(this);
		}
		start() {
			relay.join(this);
		}
		send(frame: Frame): boolean {
			if (!this.open) return false;
			return relay.send(this, frame);
		}
		stop() {
			relay.leave(this);
			this.open = false;
			this.cb.onState('closed');
		}
		deliver(frame: Frame) {
			this.cb.onFrame(frame);
		}
		get isOpen() {
			return this.open;
		}
	}

	return { relay, transports, FakeTransport };
});

vi.mock('./transport.js', () => ({ ChatTransport: H.FakeTransport }));

// ── Mock the site wallet store (avoids pulling browser-only wallet backends) ──
const W = vi.hoisted(() => ({ wallet: null as unknown }));
vi.mock('$lib/wallet', () => ({
	walletStore: {
		get activeWallet() {
			return W.wallet;
		}
	}
}));

import { ChatStore } from './store.svelte.js';

// A real EOA wallet → its signature is locally verifiable (verified badge).
const account = privateKeyToAccount(
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
);
const eoaWallet = {
	kind: 'inject',
	address: account.address,
	accountType: 'smart-contract',
	signMessage: async (message: string) => ({
		ok: true,
		signature: await account.signMessage({ message })
	})
};
// A smart-contract wallet → signature can't be ecrecovered (unverified; SAS is authority).
const scWallet = {
	kind: 'biubiu',
	address: '0xBbBb000000000000000000000000000000000002',
	accountType: 'safe-passkey',
	signMessage: async () => ({ ok: true, signature: `0x${'ab'.repeat(65)}` })
};

/** Drive two stores through a full create→join→connected handshake. */
async function connectPair(wa: unknown = eoaWallet, wb: unknown = scWallet) {
	const A = new ChatStore();
	const B = new ChatStore();

	W.wallet = wa;
	await A.create('/apps/chat');
	const invite = parseInvite(A.inviteUrl!.slice(A.inviteUrl!.indexOf('#')))!;

	W.wallet = wb;
	await B.join(invite.roomId, invite.creatorPub);

	await vi.waitFor(() => {
		if (A.phase !== 'connected' || B.phase !== 'connected') throw new Error('not connected');
	});
	// Outbound messaging is gated behind the mandatory Safety-Code confirmation.
	// Both peers compute the same code, so each can confirm with its own emoji.
	A.confirmSafety(A.safety!.emoji);
	B.confirmSafety(B.safety!.emoji);
	return { A, B };
}

beforeEach(() => {
	H.relay.reset();
	H.transports.length = 0;
	W.wallet = null;
});

describe('ChatStore — two-peer handshake', () => {
	it('both peers reach "connected" and compute the SAME safety code', async () => {
		const { A, B } = await connectPair();
		expect(A.safety?.digits).toBeTruthy();
		expect(A.safety?.digits).toBe(B.safety?.digits);
		expect(A.safety?.emoji).toBe(B.safety?.emoji);
	});

	it('each side sees the other peer’s wallet address + a stable avatar', async () => {
		const { A, B } = await connectPair();
		expect(A.peer?.address).toBe(scWallet.address);
		expect(B.peer?.address.toLowerCase()).toBe(eoaWallet.address.toLowerCase());
		expect(A.peer?.avatar).toBeTruthy();
		expect(B.peer?.avatar).toBeTruthy();
	});

	it('offers 6 distinct emoji choices (incl. the real one), identical on both sides', async () => {
		const { A, B } = await connectPair();
		expect(A.safety?.choices).toHaveLength(6);
		expect(new Set(A.safety!.choices).size).toBe(6); // all distinct
		expect(A.safety!.choices).toContain(A.safety!.emoji); // the real code is an option
		expect(A.safety?.choices).toEqual(B.safety?.choices); // deterministic across peers
	});

	it('lets two anonymous peers (no wallet) connect and chat', async () => {
		const { A, B } = await connectPair(null, null);
		expect(A.peer?.address).toBe('');
		expect(A.peer?.kind).toBe('anon');
		expect(A.peer?.verified).toBe(false);
		expect(A.peer?.avatar).toBeTruthy();
		expect(A.safety?.digits).toBe(B.safety?.digits);
		await A.send('anon hello');
		await vi.waitFor(() => {
			if (!B.messages.some((m) => m.text === 'anon hello')) throw new Error('pending');
		});
		expect(B.messages.find((m) => m.dir === 'in')?.text).toBe('anon hello');
	});

	it('verifies an EOA signature but not a smart-contract one', async () => {
		const { A, B } = await connectPair();
		expect(B.peer?.verified).toBe(true); // B could ecrecover A's EOA signature
		expect(A.peer?.verified).toBe(false); // A cannot verify B's contract signature
	});
});

describe('ChatStore — encrypted messaging', () => {
	it('delivers and decrypts messages in both directions', async () => {
		const { A, B } = await connectPair();
		await A.send('hello from A 🔒');
		await B.send('hi back from B');
		await vi.waitFor(() => {
			if (B.messages.length < 1 || A.messages.length < 2) throw new Error('pending');
		});
		expect(B.messages.find((m) => m.dir === 'in')?.text).toBe('hello from A 🔒');
		expect(A.messages.find((m) => m.dir === 'in')?.text).toBe('hi back from B');
	});

	it('marks an outgoing message as sent once delivered', async () => {
		const { A } = await connectPair();
		await A.send('ping');
		const out = A.messages.find((m) => m.dir === 'out');
		expect(out?.status).toBe('sent');
	});
});

describe('ChatStore — recovery & limits', () => {
	it('rejects a third participant (2-peer cap → error)', async () => {
		await connectPair();
		const C = new ChatStore();
		const room = H.transports[0].room;
		W.wallet = eoaWallet;
		// Join the now-full room directly.
		await C.join(room, 'somepubkey');
		await vi.waitFor(() => {
			if (C.phase !== 'error') throw new Error('not error yet');
		});
		expect(C.errorCode).toBe('roomFull');
	});

	it('queues a message sent while offline and flushes it on reconnect', async () => {
		const { A, B } = await connectPair();
		const ta = H.transports[0];

		ta.open = false; // simulate a network blip on A's side
		ta.cb.onState('reconnecting');
		await A.send('queued while offline');
		expect(A.messages.find((m) => m.dir === 'out')?.status).toBe('sending');

		ta.open = true; // reconnected
		ta.cb.onState('open');
		await vi.waitFor(() => {
			if (!B.messages.some((m) => m.text === 'queued while offline'))
				throw new Error('not flushed');
		});
		expect(A.messages.find((m) => m.dir === 'out')?.status).toBe('sent');
	});

	it('ending the chat clears history and notifies the peer', async () => {
		const { A, B } = await connectPair();
		await A.send('secret');
		A.end();
		expect(A.phase).toBe('ended');
		expect(A.endReason).toBe('self');
		expect(A.messages).toHaveLength(0); // history wiped
		await vi.waitFor(() => {
			if (B.phase !== 'ended') throw new Error('peer not notified');
		});
		expect(B.endReason).toBe('peer');
	});
});

describe('ChatStore — Safety-Code gate (MITM defense)', () => {
	/** Connect a pair but do NOT confirm the code, to exercise the gate. */
	async function connectUnverified() {
		const A = new ChatStore();
		const B = new ChatStore();
		W.wallet = null;
		await A.create('/apps/chat');
		const invite = parseInvite(A.inviteUrl!.slice(A.inviteUrl!.indexOf('#')))!;
		await B.join(invite.roomId, invite.creatorPub);
		await vi.waitFor(() => {
			if (A.phase !== 'connected' || B.phase !== 'connected') throw new Error('not connected');
		});
		return { A, B };
	}

	it('blocks outbound messages until the code is confirmed', async () => {
		const { A } = await connectUnverified();
		expect(A.verified).toBe(false);
		await A.send('must not leave before verification');
		expect(A.messages.some((m) => m.dir === 'out')).toBe(false); // gated, nothing queued
	});

	it('a wrong pick raises the mismatch warning and keeps the gate shut', async () => {
		const { A } = await connectUnverified();
		A.confirmSafety('definitely-not-the-code');
		expect(A.verified).toBe(false);
		expect(A.verifyMismatch).toBe(true);
	});

	it('the correct pick unlocks sending', async () => {
		const { A, B } = await connectUnverified();
		A.confirmSafety(A.safety!.emoji);
		B.confirmSafety(B.safety!.emoji);
		expect(A.verified).toBe(true);
		await A.send('now allowed');
		await vi.waitFor(() => {
			if (!B.messages.some((m) => m.text === 'now allowed')) throw new Error('not delivered');
		});
	});
});

describe('ChatStore — epoch rekey (reload re-handshake)', () => {
	it('a higher-epoch peer signal rotates keys, re-locks the gate, and recomputes the code', async () => {
		const { A } = await connectPair(null, null); // A is creator (role 'a', no key pin)
		expect(A.verified).toBe(true);
		const ta = H.transports[0]; // A's transport

		// The peer "reloads": a brand-new ephemeral key at a higher epoch.
		const eph = await generateEphemeralKeyPair();
		ta.deliver({
			t: 'signal',
			data: { addr: '', pub: eph.publicKeyB64, sig: '', kind: 'anon', epoch: 1 }
		});

		await vi.waitFor(() => {
			if (A.verified) throw new Error('still verified after rekey');
		});
		expect(A.phase).toBe('connected'); // stayed connected
		expect(A.verified).toBe(false); // must re-confirm the new code
		expect(A.safety?.digits).toBeTruthy(); // code recomputed against the new key
	});

	it('ignores a stale/duplicate signal at an already-seen epoch', async () => {
		const { A } = await connectPair(null, null);
		const digitsBefore = A.safety!.digits;
		const ta = H.transports[0];
		// epoch 0 was already accepted during the handshake → this must be a no-op.
		const eph = await generateEphemeralKeyPair();
		ta.deliver({
			t: 'signal',
			data: { addr: '', pub: eph.publicKeyB64, sig: '', kind: 'anon', epoch: 0 }
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(A.verified).toBe(true); // unchanged
		expect(A.safety!.digits).toBe(digitsBefore); // not recomputed
	});

	it('a rekey from a peer that CHANGED its key is not flagged as tampering (pin is first-contact only)', async () => {
		const { B } = await connectPair(); // B = joiner, holds the creator-key (#k=) pin
		expect(B.verified).toBe(true);
		const tb = H.transports[1]; // B's transport

		// The creator "reloads" → brand-new ephemeral key at a higher epoch. The pin
		// must NOT fire (peerEpoch >= 0); the mandatory SAS re-verify guards instead.
		const eph = await generateEphemeralKeyPair();
		tb.deliver({
			t: 'signal',
			data: { addr: '', pub: eph.publicKeyB64, sig: '', kind: 'anon', epoch: 1 }
		});

		await vi.waitFor(() => {
			if (B.verified) throw new Error('still verified after rekey');
		});
		expect(B.phase).toBe('connected');
		expect(B.errorCode).not.toBe('tampered'); // pin skipped on rekey
		expect(B.verified).toBe(false); // must re-confirm the new code
	});

	it('resume() does not re-apply the #k= pin (a rotated peer key must not false-trip tampered)', async () => {
		const store = new ChatStore();
		W.wallet = null;
		// Resume with a saved pin that will NOT match the peer's (rotated) key.
		await store.resume({
			v: 1,
			roomId: 'resume-room',
			role: 'b',
			expectedPeerPub: 'a-stale-creator-key-that-will-not-match',
			resumeToken: 'tok',
			myEpoch: 0,
			savedAt: Date.now()
		});
		await vi.waitFor(() => {
			if (store.conn !== 'open') throw new Error('not open');
		});
		const tr = H.transports[H.transports.length - 1];
		const eph = await generateEphemeralKeyPair();
		tr.deliver({
			t: 'signal',
			data: { addr: '', pub: eph.publicKeyB64, sig: '', kind: 'anon', epoch: 0 }
		});
		await vi.waitFor(() => {
			if (store.phase !== 'connected') throw new Error('not connected');
		});
		expect(store.errorCode).not.toBe('tampered'); // pin not enforced on resume
		expect(store.verified).toBe(false); // re-verification still mandatory
	});
});

describe('ChatStore — malformed peer signal (DoS regression)', () => {
	/** Stand up only the creator (role 'a') and return its FakeTransport. */
	async function createOnly() {
		const A = new ChatStore();
		W.wallet = null; // anonymous creator: no expectedPeerPub → bad key reaches crypto
		await A.create('/apps/chat');
		await vi.waitFor(() => {
			if (A.phase !== 'waiting') throw new Error('not waiting');
		});
		return { A, ta: H.transports[0] };
	}

	it('does NOT wedge the creator when a garbage (non-base64) peer key arrives', async () => {
		const { A, ta } = await createOnly();
		// A malicious relay/joiner pushes a handshake whose pub is not importable.
		ta.deliver({ t: 'signal', data: { addr: '', pub: '!!!not-base64!!!', sig: '', kind: 'anon' } });

		// Give the rejected importKey/deriveBits a few microtasks to settle.
		await Promise.resolve();
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));

		// The bad frame must be dropped, NOT commit the guard or advance the phase.
		expect(A.phase).toBe('waiting');
		expect(A.errorCode).toBeNull();
	});

	it('does NOT wedge the creator when an off-curve 65-byte point arrives', async () => {
		const { A, ta } = await createOnly();
		// 65 bytes, 0x04 (uncompressed) prefix, but coordinates that are not on P-256.
		const offCurve = new Uint8Array(65);
		offCurve[0] = 0x04;
		offCurve.fill(0x01, 1);
		const badPub = toB64url(offCurve);
		ta.deliver({ t: 'signal', data: { addr: '', pub: badPub, sig: '', kind: 'anon' } });

		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));

		expect(A.phase).toBe('waiting');
		expect(A.errorCode).toBeNull();
	});

	it('still reaches "connected" from a VALID signal after a malformed one', async () => {
		const { A, ta } = await createOnly();
		// First: the poison frame (would previously commit peerHandshake and block retries).
		ta.deliver({ t: 'signal', data: { addr: '', pub: '@@@', sig: '', kind: 'anon' } });
		await new Promise((r) => setTimeout(r, 0));
		expect(A.phase).toBe('waiting'); // not wedged, not connected

		// Then: a legitimate joiner's real ephemeral key must still connect the creator.
		const eph = await generateEphemeralKeyPair();
		ta.deliver({
			t: 'signal',
			data: { addr: '', pub: eph.publicKeyB64, sig: '', kind: 'anon' }
		});
		await vi.waitFor(() => {
			if (A.phase !== 'connected') throw new Error('valid signal did not connect after bad one');
		});
		expect(A.errorCode).toBeNull();
		expect(A.safety?.digits).toBeTruthy();
	});
});
