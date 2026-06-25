/**
 * ChatTransport — a self-healing WebSocket client.
 *
 * Holds the resume token in memory and re-attaches the room slot after a blip
 * (capped exponential backoff + jitter). Keys never leave memory, so a transient
 * network drop recovers transparently; a full page reload ends the session.
 */
import type { ClientFrame, ServerFrame } from './protocol';

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed';

export interface TransportCallbacks {
	onFrame: (frame: ServerFrame) => void;
	onState: (state: ConnState) => void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;
/**
 * How long to keep retrying an *initial* connection before giving up and
 * surfacing a terminal 'failed' state. Once a socket has opened at least once,
 * we never give up — transient blips reconnect indefinitely (keys are in
 * memory, so the session is worth recovering). This deadline only guards the
 * "relay never reachable" case so the UI doesn't spin forever.
 */
const CONNECT_DEADLINE_MS = 20_000;

export class ChatTransport {
	private ws: WebSocket | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private attempts = 0;
	private stopped = false;
	/** True once any socket has opened — disables the initial-connect deadline. */
	private everConnected = false;
	/** Timestamp (ms) of the very first connect attempt; gates CONNECT_DEADLINE_MS. */
	private firstAttemptAt = 0;

	/** Set from the server's `welcome`; replayed as `hello.resume` on reconnect. */
	resumeToken: string | null = null;

	constructor(
		private readonly url: string,
		private readonly cb: TransportCallbacks
	) {}

	start(): void {
		this.stopped = false;
		this.firstAttemptAt = Date.now();
		this.openSocket(false);
	}

	private openSocket(isRetry: boolean): void {
		if (this.stopped) return;
		this.cb.onState(isRetry ? 'reconnecting' : 'connecting');

		let ws: WebSocket;
		try {
			ws = new WebSocket(this.url);
		} catch {
			this.scheduleReconnect();
			return;
		}
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.attempts = 0;
			this.everConnected = true;
			this.cb.onState('open');
			this.send({ t: 'hello', resume: this.resumeToken ?? undefined });
		});

		ws.addEventListener('message', (event) => {
			if (typeof event.data !== 'string') return;
			let frame: ServerFrame;
			try {
				frame = JSON.parse(event.data) as ServerFrame;
			} catch {
				return;
			}
			this.cb.onFrame(frame);
		});

		ws.addEventListener('close', () => {
			if (this.ws === ws) this.ws = null;
			this.scheduleReconnect();
		});
		ws.addEventListener('error', () => {
			// `close` fires next and drives reconnect; nothing to do here.
		});
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.retryTimer) return;

		// Give up only on the INITIAL connect (relay unreachable). Once we have
		// opened at least once, retry forever — a session is worth recovering.
		if (!this.everConnected && Date.now() - this.firstAttemptAt >= CONNECT_DEADLINE_MS) {
			this.stopped = true;
			this.cb.onState('failed');
			return;
		}

		this.cb.onState('reconnecting');
		const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** this.attempts);
		const jitter = delay * 0.25 * Math.random();
		this.attempts++;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.openSocket(true);
		}, delay + jitter);
	}

	/** Send a frame if the socket is open. Returns whether it was handed off. */
	send(frame: ClientFrame): boolean {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(JSON.stringify(frame));
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}

	get isOpen(): boolean {
		return !!this.ws && this.ws.readyState === WebSocket.OPEN;
	}

	/** Best-effort graceful close, then stop reconnecting. */
	stop(sendBye: boolean): void {
		this.stopped = true;
		this.everConnected = false;
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		if (this.ws) {
			if (sendBye) this.send({ t: 'bye' });
			try {
				this.ws.close(1000, 'bye');
			} catch {
				/* already closing */
			}
			this.ws = null;
		}
		this.cb.onState('closed');
	}
}
