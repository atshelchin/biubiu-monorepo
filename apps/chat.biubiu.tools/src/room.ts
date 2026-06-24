/**
 * RoomDO — one Durable Object per chat room.
 *
 * A blind 1:1 relay between two peers (creator = role `a`, joiner = role `b`).
 * It forwards opaque frames and, when a peer is briefly offline, buffers
 * messages for a short grace window so a network blip doesn't lose anything.
 *
 * State is in-memory only — nothing is ever written to DO storage. The DO stays
 * alive as long as at least one socket is connected; if both peers vanish the
 * room is evicted and its keys/buffers cease to exist (matches the "ended
 * session is unrecoverable" guarantee). No WebSocket hibernation: an active chat
 * isn't idle, and keeping state in memory makes the grace/buffer logic simple.
 */
import type { Role, ServerFrame } from "./protocol";
import type { ClientFrame } from "./protocol";

interface Env {
  ROOM: DurableObjectNamespace;
}

/** WebSocket.readyState OPEN (per the WHATWG spec). */
const WS_OPEN = 1;
/** How long a slot is held after an unexpected disconnect. */
const GRACE_MS = 90_000;
/** A peer that never says `hello` is closed after this. */
const HELLO_TIMEOUT_MS = 15_000;
/** Redelivery buffer caps — overflow means the peer can't catch up → drop it. */
const BUFFER_MAX_FRAMES = 2000;
const BUFFER_MAX_BYTES = 4_000_000;
/** Reject any single client frame larger than this (chat messages are tiny). */
const MAX_FRAME_BYTES = 128 * 1024;
/** Per-peer message rate limit (a flood beyond this drops the connection). */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 120;

interface Slot {
  role: Role;
  token: string;
  ws: WebSocket | null;
  buffer: string[];
  bufferBytes: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
  rateCount: number;
  rateWindowStart: number;
}

export class RoomDO {
  private a: Slot | null = null;
  private b: Slot | null = null;
  /** Accepted sockets that haven't sent `hello` yet. */
  private pending = new Map<WebSocket, ReturnType<typeof setTimeout>>();

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.wire(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── wiring ────────────────────────────────────────────────────────────

  private wire(ws: WebSocket): void {
    const timer = setTimeout(() => {
      if (this.pending.has(ws)) {
        this.pending.delete(ws);
        try {
          ws.close(1008, "no hello");
        } catch {
          /* already closing */
        }
      }
    }, HELLO_TIMEOUT_MS);
    this.pending.set(ws, timer);

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return; // text frames only
      this.onMessage(ws, event.data);
    });
    ws.addEventListener("close", () => this.onClose(ws));
    ws.addEventListener("error", () => this.onClose(ws));
  }

  private onMessage(ws: WebSocket, text: string): void {
    if (text.length > MAX_FRAME_BYTES) {
      this.send(ws, { t: "error", code: "too-large", message: "frame too large" });
      return;
    }

    let frame: ClientFrame;
    try {
      frame = JSON.parse(text) as ClientFrame;
    } catch {
      this.send(ws, { t: "error", code: "bad-json", message: "invalid frame" });
      return;
    }

    if (frame.t === "hello") {
      this.onHello(ws, frame.resume);
      return;
    }

    const role = this.slotOf(ws);
    if (role === null) {
      this.send(ws, {
        t: "error",
        code: "not-joined",
        message: "send hello first",
      });
      return;
    }

    // Flood protection — a peer that exceeds the rate is dropped.
    const slot = role === "a" ? this.a : this.b;
    if (slot && !this.rateOk(slot)) {
      this.dropSlot(role, "rate-limit");
      return;
    }

    switch (frame.t) {
      case "signal":
      case "relay":
        // Forwarded verbatim — the relay never reads the payload.
        this.forward(role, text);
        break;
      case "bye":
        this.dropSlot(role, "bye");
        break;
      default:
        this.send(ws, {
          t: "error",
          code: "bad-frame",
          message: "unknown frame",
        });
    }
  }

  // ── join / resume ───────────────────────────────────────────────────────

  private onHello(ws: WebSocket, resume?: string): void {
    this.clearPending(ws);

    // Resume an existing slot after a transient disconnect.
    if (resume) {
      const slot =
        this.a?.token === resume
          ? this.a
          : this.b?.token === resume
            ? this.b
            : null;
      if (slot) {
        if (slot.ws && slot.ws !== ws) {
          try {
            slot.ws.close(1000, "superseded");
          } catch {
            /* noop */
          }
        }
        if (slot.graceTimer) {
          clearTimeout(slot.graceTimer);
          slot.graceTimer = null;
        }
        slot.ws = ws;
        this.send(ws, {
          t: "welcome",
          role: slot.role,
          token: slot.token,
          peerPresent: this.peerLive(slot.role),
        });
        this.flush(slot);
        this.notifyPeer(slot.role, { t: "peer-joined" });
        return;
      }
      // Unknown/expired token → fall through to a fresh assignment.
    }

    // Fresh assignment: a, then b, else the room is full.
    let slot: Slot;
    if (!this.a) {
      this.a = this.makeSlot("a", ws);
      slot = this.a;
    } else if (!this.b) {
      this.b = this.makeSlot("b", ws);
      slot = this.b;
    } else {
      this.send(ws, { t: "error", code: "full", message: "room is full" });
      try {
        ws.close(1008, "full");
      } catch {
        /* noop */
      }
      return;
    }

    this.send(ws, {
      t: "welcome",
      role: slot.role,
      token: slot.token,
      peerPresent: this.peerLive(slot.role),
    });
    this.notifyPeer(slot.role, { t: "peer-joined" });
  }

  private makeSlot(role: Role, ws: WebSocket): Slot {
    return {
      role,
      token: crypto.randomUUID(),
      ws,
      buffer: [],
      bufferBytes: 0,
      graceTimer: null,
      rateCount: 0,
      rateWindowStart: 0,
    };
  }

  /** Sliding-window rate check; returns false once a peer exceeds the limit. */
  private rateOk(slot: Slot): boolean {
    const now = Date.now();
    if (now - slot.rateWindowStart > RATE_WINDOW_MS) {
      slot.rateWindowStart = now;
      slot.rateCount = 0;
    }
    slot.rateCount++;
    return slot.rateCount <= RATE_MAX;
  }

  // ── forwarding + buffering ───────────────────────────────────────────────

  private forward(fromRole: Role, text: string): void {
    const target = fromRole === "a" ? this.b : this.a;
    if (!target) return; // peer not present at all — sender waits for peer-joined

    if (target.ws && target.ws.readyState === WS_OPEN) {
      this.rawSend(target.ws, text);
      return;
    }

    // Peer is mid-reconnect: buffer until it returns (bounded).
    if (
      target.buffer.length >= BUFFER_MAX_FRAMES ||
      target.bufferBytes + text.length > BUFFER_MAX_BYTES
    ) {
      this.dropSlot(target.role, "buffer-overflow");
      return;
    }
    target.buffer.push(text);
    target.bufferBytes += text.length;
  }

  private flush(slot: Slot): void {
    if (!slot.ws) return;
    const pending = slot.buffer;
    slot.buffer = [];
    slot.bufferBytes = 0;
    for (const text of pending) this.rawSend(slot.ws, text);
  }

  // ── teardown ──────────────────────────────────────────────────────────

  private onClose(ws: WebSocket): void {
    this.clearPending(ws);
    const role = this.slotOf(ws);
    if (role === null) return;
    const slot = role === "a" ? this.a : this.b;
    if (!slot || slot.ws !== ws) return; // stale (already superseded)

    slot.ws = null;
    this.notifyPeer(role, { t: "peer-left", graceful: false });
    slot.graceTimer = setTimeout(
      () => this.dropSlot(role, "grace-expired"),
      GRACE_MS,
    );
  }

  /** Remove a slot for good and tell the other peer the session is over. */
  private dropSlot(role: Role, reason: string): void {
    const slot = role === "a" ? this.a : this.b;
    if (!slot) return;
    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    try {
      slot.ws?.close(1000, reason);
    } catch {
      /* noop */
    }
    if (role === "a") this.a = null;
    else this.b = null;
    this.notifyPeer(role, { t: "peer-left", graceful: true });
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private slotOf(ws: WebSocket): Role | null {
    if (this.a?.ws === ws) return "a";
    if (this.b?.ws === ws) return "b";
    return null;
  }

  private peerLive(role: Role): boolean {
    const peer = role === "a" ? this.b : this.a;
    return !!peer?.ws && peer.ws.readyState === WS_OPEN;
  }

  private notifyPeer(fromRole: Role, frame: ServerFrame): void {
    const peer = fromRole === "a" ? this.b : this.a;
    if (peer?.ws && peer.ws.readyState === WS_OPEN) this.send(peer.ws, frame);
  }

  private clearPending(ws: WebSocket): void {
    const timer = this.pending.get(ws);
    if (timer) clearTimeout(timer);
    this.pending.delete(ws);
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    this.rawSend(ws, JSON.stringify(frame));
  }

  private rawSend(ws: WebSocket, text: string): void {
    try {
      ws.send(text);
    } catch {
      /* peer socket is gone; close handler will clean up */
    }
  }
}
