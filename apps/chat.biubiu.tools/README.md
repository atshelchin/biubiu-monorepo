# chat.biubiu.tools

A **blind** WebSocket relay (Cloudflare Worker + Durable Object) for biubiu.tools'
end-to-end encrypted 1:1 chat.

## What it does (and doesn't)

- Routes opaque frames between the two peers in a room (`a` = creator, `b` = joiner).
- Buffers messages for a short grace window so a transient disconnect doesn't lose any.
- **Never** sees plaintext: handshake payloads and message ciphertext are forwarded
  verbatim. It holds no keys and writes nothing to storage — when both peers leave, the
  room (and any buffered frames) cease to exist.

All cryptography happens in the browser; see
`apps/biubiu.tools/src/lib/e2e-chat/`. The matching wire protocol lives in
[`src/protocol.ts`](src/protocol.ts) (kept in sync with the client's `protocol.ts`).

## Endpoints

| Method | Path                  | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/healthz`            | Liveness probe                           |
| GET    | `/v1/connect?room=ID` | WebSocket upgrade → routed to that room  |

## Develop

```sh
bun install            # from the monorepo root (installs wrangler for this app)
cd apps/chat.biubiu.tools
bun run dev            # wrangler dev → ws://localhost:8787/v1/connect
```

The biubiu.tools client auto-targets `ws://localhost:8787/v1/connect` in dev and
`wss://chat.biubiu.tools/v1/connect` in production (see
`apps/biubiu.tools/src/lib/e2e-chat/index.ts`).

## Deploy

```sh
cd apps/chat.biubiu.tools
bun run deploy         # wrangler deploy
```

Then bind the custom domain **chat.biubiu.tools** to the Worker in the Cloudflare
dashboard (Workers → Settings → Domains & Routes → Add Custom Domain), or uncomment the
`routes` entry in [`wrangler.jsonc`](wrangler.jsonc) before deploying.

## Test

Live integration test of the real `RoomDO` (routing, the 2-peer cap, reconnect +
buffered redelivery). Start the worker, then run the test against it:

```sh
bun run dev          # terminal 1 — wrangler dev on :8787
bun run test:relay   # terminal 2 — connects two WS clients + a rejected third
```

The client-side crypto and the full two-peer session flow are covered by Vitest in
`apps/biubiu.tools` (`src/lib/e2e-chat/*.test.ts`): `bun run test:unit`.

## Tuning (constants in `src/room.ts`)

- `GRACE_MS` — how long a slot is held after an unexpected drop (default 90s).
- `BUFFER_MAX_FRAMES` / `BUFFER_MAX_BYTES` — redelivery buffer caps; overflow drops the
  slow peer (session ends rather than growing memory unbounded).
