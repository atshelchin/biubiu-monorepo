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
vi.mock('$lib/wallet', () => ({ walletStore: { get activeWallet() { return W.wallet; } } }));

import { ChatStore } from './store.svelte.js';

// A real EOA wallet → its signature is locally verifiable (verified badge).
const account = privateKeyToAccount(
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
);
const eoaWallet = {
	kind: 'inject',
	address: account.address,
	accountType: 'smart-contract',
	signMessage: async (message: string) => ({ ok: true, signature: await account.signMessage({ message }) })
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
			if (!B.messages.some((m) => m.text === 'queued while offline')) throw new Error('not flushed');
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
