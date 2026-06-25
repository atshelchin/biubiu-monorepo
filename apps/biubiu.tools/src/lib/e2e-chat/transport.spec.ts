/**
 * ChatTransport reconnect / connect-deadline regression tests.
 *
 * Covers the "relay unreachable" finding: a transport that can never open must
 * NOT retry forever silently — after CONNECT_DEADLINE_MS it must emit a terminal
 * 'failed' state so the store can surface connectFailed instead of an endless
 * spinner. Conversely, once a socket has opened at least once, a later drop must
 * keep reconnecting (never 'failed') because the session is worth recovering.
 *
 * The browser WebSocket is replaced with a controllable fake; timers are faked
 * so the 20s deadline runs instantly and deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatTransport, type ConnState } from './transport.js';

// ── Controllable fake WebSocket ──────────────────────────────────────────────
const sockets: FakeWS[] = [];

class FakeWS {
	static OPEN = 1;
	readyState = 0; // CONNECTING
	url: string;
	private listeners = new Map<string, Set<(e: unknown) => void>>();

	constructor(url: string) {
		this.url = url;
		sockets.push(this);
	}
	addEventListener(type: string, fn: (e: unknown) => void) {
		const set = this.listeners.get(type) ?? new Set();
		set.add(fn);
		this.listeners.set(type, set);
	}
	send() {}
	close() {
		this.emit('close', {});
	}
	emit(type: string, e: unknown) {
		this.listeners.get(type)?.forEach((fn) => fn(e));
	}
	/** Test helper: drive the socket to OPEN. */
	openIt() {
		this.readyState = FakeWS.OPEN;
		this.emit('open', {});
	}
	/** Test helper: drive the socket to CLOSED (relay refused / dropped). */
	dropIt() {
		this.readyState = 3; // CLOSED
		this.emit('close', {});
	}
}

beforeEach(() => {
	vi.useFakeTimers();
	sockets.length = 0;
	vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** Collect the ordered ConnState transitions a transport emits. */
function track() {
	const states: ConnState[] = [];
	const tr = new ChatTransport('wss://relay.test/v1/connect?room=r1', {
		onFrame: () => {},
		onState: (s) => states.push(s)
	});
	return { tr, states };
}

describe('ChatTransport — connect deadline (relay unreachable)', () => {
	it('emits a terminal "failed" state when the relay never opens', async () => {
		const { tr, states } = track();
		tr.start();

		// Every connect attempt drops immediately (relay refusing / unreachable).
		// Advance well past CONNECT_DEADLINE_MS (20s) so retries are exhausted.
		for (let i = 0; i < 30; i++) {
			sockets[sockets.length - 1]?.dropIt();
			await vi.advanceTimersByTimeAsync(2_000);
		}

		expect(states).toContain('failed');
		// 'failed' is terminal: it must be the LAST state we ever see.
		expect(states[states.length - 1]).toBe('failed');
		// And it must never have reported a (false) 'open'.
		expect(states).not.toContain('open');
	});

	it('stops scheduling further reconnects after "failed"', async () => {
		const { tr, states } = track();
		tr.start();
		for (let i = 0; i < 30; i++) {
			sockets[sockets.length - 1]?.dropIt();
			await vi.advanceTimersByTimeAsync(2_000);
		}
		expect(states).toContain('failed');

		const socketsAtFail = sockets.length;
		// No new sockets should be created once we've given up.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(sockets.length).toBe(socketsAtFail);
	});
});

describe('ChatTransport — reconnect after a successful open', () => {
	it('never emits "failed" once a socket has opened (retries forever)', async () => {
		const { tr, states } = track();
		tr.start();

		// First socket opens successfully.
		sockets[0].openIt();
		expect(states).toContain('open');

		// Now drop and keep dropping for far longer than the connect deadline.
		for (let i = 0; i < 30; i++) {
			sockets[sockets.length - 1]?.dropIt();
			await vi.advanceTimersByTimeAsync(20_000);
		}

		// A session that has connected once is worth recovering → keep reconnecting.
		expect(states).not.toContain('failed');
		expect(states).toContain('reconnecting');
	});
});
