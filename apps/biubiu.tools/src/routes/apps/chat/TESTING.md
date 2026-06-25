# Private Chat (E2E) — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/chat/TESTING.md`，用 chrome-devtools MCP 把 **加密聊天 / Private Chat** (`/apps/chat`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。先确认 dev server 返回 200，再开始。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- **App URL:** `http://localhost:5173/apps/chat`
- **What it does:** End-to-end encrypted **1-to-1** chat. Two peers connect through a **blind Cloudflare-Worker relay** (a Durable Object that only forwards opaque frames). Each peer makes a **fresh ephemeral ECDH P-256** key, the two derive a shared key (ECDH → HKDF-SHA256 → two directional **AES-256-GCM** traffic keys), show a **Safety Code (SAS)** so a human can detect a MITM, then exchange encrypted messages. Keys + plaintext live **only in memory** (nothing persisted; a page reload ends the session for good). **Anonymous by default** — a wallet is *optional* and only upgrades you to a verified identity.
- UI language is locale-dependent; **default is English** here (strings quoted from `src/messages/en/apps/chat.json`). Other locales live under `src/messages/<locale>/apps/chat.json`.

> ⚠️ **Read §0.3 first — the full two-peer happy path needs the relay Worker running locally.** Without it, you can only test the single-peer surface (landing, validation, create→waiting, themes, i18n, a11y) and the relay-unreachable error path.

---

## 0. Setup & environment

1. **Dev server** must be up *and healthy*: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/chat` → expect **`200`**.
   - If you get **`500` / `{"message":"Internal Error"}`** on *every* route (home, balance-radar too), the dev server is in the broken `$i18n` state (a concurrent `bun run check` clobbers a live `vite dev`). **Restart it:** kill the stray `vite dev` processes, then `cd apps/biubiu.tools && bun run dev`, wait for "ready", re-curl until `200`. (At the time this doc was written the running server was returning 500 across all routes — do not start testing until it's a clean 200.)
   - If not running at all: `cd apps/biubiu.tools && bun run dev`.
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `new_page`, `wait_for`).
3. Desktop viewport: `resize_page` to **`1280×900`**. Mobile: **`390×844`**.

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*, the throwaway automation profile is stuck. Recover with:
  ```bash
  # cheap unlock (Chrome still alive — try this first, highest success rate)
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # hard reset (only if still stuck)
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*; sleep 2
  ```
  **Rule of thumb: one unlock buys ~1–2 MCP calls** before it may re-lock. So **don't** chain a long series of `click`s — batch "set state + act" into a single `evaluate_script` / `navigate_page(initScript)`, then assert in one more call.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab sometimes self-navigates to `about:blank` (HMR / relay churn). **Before trusting any screenshot**, sanity-check:
  ```js
  // evaluate_script
  ({ url: location.href, h1: document.querySelector('h1')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null → re-navigate and redo. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions**; use screenshots only for visual spot-checks (retake if blank).
- **Svelte 5 binding.** `el.value = '…'` does **NOT** trigger `bind:value`. Use the native setter + dispatch an input event:
  ```js
  const el = document.querySelector('input.link-input');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, 'https://…#r=…&k=…'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (Same trick with `HTMLTextAreaElement.prototype` for the message composer `textarea.input`.)
- **Theme.** `navigate_page` with `initScript`: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). It applies via `<html data-theme>`; per-field merge means writing only `theme` is safe.
- **i18n raw-key caveat.** The message-catalog JSON embedded in the page HTML legitimately contains raw keys like `chat.room.send` (hydration data). **Only judge VISIBLE rendered text.** A visible raw key on screen (e.g. literal `chat.landing.createBtn`) IS a FAIL.

### 0.2 The "two-peer" problem (this app's #1 structural trap)

The happy path needs **two independent peers in the same room**. One MCP page is one peer. To run the real flow, drive **two pages** of the same Chrome:
1. Page 1 (`new_page` / `navigate_page` to the app) → **Create room** → it goes to the **waiting** screen and shows an invite link/QR.
2. Read the invite URL out of page 1: `evaluate_script` → `document.querySelector('input.link')?.value` (the readonly link box).
3. Page 2 (`new_page`) → `navigate_page` to **that exact invite URL** (the `#r=…&k=…` fragment is what makes it a join). It shows the **"You've been invited"** screen → click **Join encrypted chat**.
4. Both pages should land in the **connected** room within a moment, showing the **same Safety Code** on both. (Avatars on the two screens are derived from the *peer's* key, so they will be the *opposite* emoji on each side — that's expected, not a bug.)

> If you only have one page available, scope all "connected"/messaging checks to **N/A — needs a second peer + the relay**, and still fully test landing/validation/waiting/themes/i18n/a11y/error.

### 0.3 The relay Worker must be running for any connected state

The transport opens a WebSocket to (dev) **`ws://localhost:8787/v1/connect?room=…`** (`src/lib/e2e-chat/relay.ts`; prod is `wss://chat.biubiu.tools`). Check it's up:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/v1/connect   # 400/426 = up (it wants a WS upgrade); 000/connection-refused = DOWN
```
- **Relay up:** create → **waiting**; join → both reach **connected**.
- **Relay DOWN:** the transport silently retries with backoff; the creator stays on **waiting** forever (no peer), and the joiner stays on **"Establishing a secure channel…"**. The store maps a hard relay `error` frame to **`connectFailed`**, but a *refused* socket just reconnects, so a down relay manifests as **"stuck waiting/securing"**, NOT as the error card. Treat "stuck on waiting/securing with relay down" as expected; document it.
- Start it (if the repo has the worker): `cd apps/chat.biubiu.tools && wrangler dev` (default port 8787). If you can't start the relay, scope connected-state checks to N/A.

### 0.4 Test data

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — valid EOA address (for "verified identity", needs a real wallet to sign)
```
- A **valid-looking invite link** (for the paste-link validation; the `k=` key is a real base64url ECDH raw pubkey so it parses):
  ```
  http://localhost:5173/apps/chat#r=Zm9vYmFyMTIzNDU2Nzg5MA&k=BHq1n3vQk9wXyZ0aBcDeFgHiJkLmNoPqRsTuVwXyZ0aBcDeFgHiJkLmNoPqRsTuVwXyZ0aBcDeFgHiJkLmNoPqRs
  ```
  > Pasting this and clicking **Join** will *parse* fine (so `invalidLink` should NOT show) and then try to connect to a room nobody created — it will sit on "Establishing a secure channel…". That's the correct behavior for the **parse-validation** check; it is not a full join.
- **Invalid** invite links for the negative test: `not-a-link`, `http://localhost:5173/apps/chat` (no fragment), `#r=onlyroom` (missing `k`), `#k=onlykey` (missing `r`).

---

## 1. Test checklist by area (execute each; report PASS/FAIL + evidence)

### A. First load / landing (single page, no relay needed)
- [ ] Route returns **200**; `<h1>` = **Private Chat**; subtitle = **"End-to-end encrypted, peer-to-peer. The relay only ever sees ciphertext, and nothing is stored."**
- [ ] A **3-step strip** is visible: **Create a room → Share the link → Chat privately** (numbered 1/2/3).
- [ ] Primary card: heading **"Start a chat"**, body **"Create a private room and get a one-time link to share with one person."**, button **"Create room"**.
- [ ] Secondary "join" area: label **"Join a chat"**, an input with placeholder **"Paste invite link…"**, and a **"Join"** button that is **disabled** while the input is empty.
- [ ] Identity footer (when **no wallet** connected): note **"No sign-up needed — you'll appear as Anonymous, kept private by the safety code."** + an underlined link button **"Connect a wallet for a verified identity (optional)"**.
- [ ] `list_console_messages` → no `error` entries.

### B. Join-link validation (single page, no relay needed)
- [ ] Type **`not-a-link`** into the paste box → click **Join** → input gets the **invalid** red border AND the hint **"That doesn't look like a valid invite link."** appears below. (This is an inline UI error, not console-only.)
- [ ] `#r=onlyroom` (no `k`) and `#k=onlykey` (no `r`) and a bare URL with no `#` fragment → all flagged invalid the same way.
- [ ] Typing again (oninput) **clears** the error state (red border + hint disappear).
- [ ] Pressing **Enter** in the input triggers Join (same as clicking the button).
- [ ] Paste a **well-formed** link (see §0.4 valid example) → **no** invalidLink hint; the app proceeds to **"Establishing a secure channel…"** (`chat.securing.title`) — it parsed correctly. (Full connect needs a live room; sitting on "securing" here is expected.)

### C. Create room → waiting screen (needs relay up for stability, but the screen renders regardless)
- [ ] Click **Create room** → screen switches to a card with a **spinner**, heading **"Waiting for your peer…"**, body **"Share this link with the one person you want to chat with. The channel opens as soon as they join."**
- [ ] A **QR code** (white background) renders, plus a **readonly link box** containing the invite URL and a **"Copy link"** button.
- [ ] The invite URL contains the fragment **`#r=<room>&k=<pubkey>`** (verify: `document.querySelector('input.link').value` includes `#r=` and `&k=`).
- [ ] A warning line is shown: **"Anyone with this link can join. Share it privately, with one person."**
- [ ] **"Copy link"** → clipboard gets the full URL; the button label flips to **"Copied"** for ~1.8s then reverts. (If clipboard is blocked headless, the label may not flip — note it; the link box is still selectable.)
- [ ] **"Cancel"** returns to the landing screen (back to "Start a chat").
- [ ] After clicking Create, the address-bar **hash is stripped** if you had arrived via an invite (history.replaceState) — verify `location.hash === ''` once captured.

### D. Happy path — two peers connect & verify (NEEDS relay + 2 pages — see §0.2/§0.3)
- [ ] Page 1 **Create room** → waiting. Page 2 `navigate_page` to the captured invite URL → shows **"You've been invited to a private chat"** card with body **"Tap below to sign in with your wallet and open the encrypted channel."** and button **"Join encrypted chat"**.
- [ ] Click **Join encrypted chat** → both pages reach the **connected room** (header + trust bar + message list + composer).
- [ ] **Safety Code matches on both pages:** the `Safety code` row shows **6 digits in two groups** (e.g. `428 913`) + **3 emoji** (e.g. `🦊🍀🚀`); assert the digits+emoji string is **identical** on page 1 and page 2.
- [ ] Each page shows the **peer's** avatar emoji in the header (the two sides show different avatars — each is derived from the *other* peer's key; that's correct).
- [ ] Anonymous peer header shows the name **"Anonymous"** (no wallet). The trust bar shows **no** verified/unverified badge for an anonymous peer (the badge only renders when `peer.address` is set).
- [ ] Empty room shows **"You're connected"** + **"Messages are end-to-end encrypted and never stored. Say hello."**

### E. Messaging (NEEDS connected state)
- [ ] Composer placeholder = **"Type a message…"**; **"Send"** button is **disabled** while the textarea is empty/whitespace-only.
- [ ] Type a message on page 1, click **Send** (or **Enter** — Enter sends, **Shift+Enter** inserts a newline) → bubble appears **right-aligned/accent-tinted** on page 1 and **left-aligned/raised** on page 2, with the **same plaintext**.
- [ ] An outgoing bubble briefly shows a tiny **"sending" dot** then settles to sent (a timestamp `HH:MM` is shown on every bubble).
- [ ] Send a message containing a URL (`see https://example.com here`) → the URL renders as a real `<a target="_blank" rel="noopener noreferrer nofollow">` link, the rest as plain text (no raw `@html`, no XSS — try `<img src=x onerror=alert(1)>` and confirm it renders as literal text, not an element).
- [ ] The textarea **auto-grows** as you type multiple lines and caps at ~140px (then scrolls).
- [ ] Message list **auto-scrolls** to newest only when you're already at the bottom; scroll up to re-read and new messages should NOT yank you down.

### F. Trust bar / Safety Code modal (NEEDS connected state)
- [ ] The trust bar is a button; clicking it opens a modal titled **"What is the safety code?"** with body **"This code is computed from both peers' keys. If it reads the same on both screens, no one is secretly in the middle. If the codes differ, stop — the connection may be compromised."** and a **"Got it"** close button, plus the code shown large.
- [ ] With a **wallet-signed (EOA) peer**, the trust bar shows **✓ Verified**; an EOA whose signature can't be recovered would show **⚠ Unverified — check the code** (hard to force headless — UI + string check only).

### G. Reconnect / degraded states (NEEDS connected state)
- [ ] Kill the relay socket mid-chat (or toggle network) → a banner shows **"Reconnecting…"** (`chat.room.reconnecting`) while `conn !== 'open'`; the composer stays usable and outgoing messages **queue** then flush on reconnect (within the relay's 90s grace).
- [ ] Have the peer's tab go idle/offline (not graceful) → the other side shows **"Your peer is reconnecting…"** (`chat.room.peerOffline`). Bringing the peer back resumes the same session (same Safety Code) — keys are memory-only and never re-derived.

### H. End / terminal states (mix of relay + single-page)
- [ ] Click **"End"** in the room header → a confirm modal: title **"End this chat?"**, message **"This closes the session for both of you and clears the conversation from this device. It can't be undone."**, destructive confirm **"End chat"**. Cancel keeps you in the room.
- [ ] Confirm **End chat** → your page shows **"Chat ended"** + **"The session is over. The keys are gone and the history was cleared from this device — it can't be recovered."** + **"Start a new chat"** button. The **peer's** page should show **"Your peer left"** (same body).
- [ ] **"Start a new chat"** returns to the landing screen with a fresh store (no leftover messages, no Safety Code).
- [ ] **Reload guard:** while in `waiting` or `connected`, attempting to reload/close triggers the browser's **beforeunload** confirm (the page registers `beforeunload`). Verify a `beforeunload` listener is present: `evaluate_script` → `(()=>{const e=new Event('beforeunload',{cancelable:true});const p=window.dispatchEvent(e);return e.defaultPrevented})()` should be **true** in waiting/connected, **false** on the idle landing.

### I. Error states (surface IN the UI, not just console)
- [ ] **Relay unreachable:** with the relay DOWN, Create → stays on **waiting** (no peer ever arrives); a pasted valid link → stays on **securing**. Document this as the real-world "relay down" behavior (see §0.3 — a *refused* socket reconnects rather than showing the error card).
- [ ] **Room full:** open the **same** invite URL in a **third** page after two peers are connected → that page should hit the error card: title **"Something went wrong"** + message **"This room already has two people in it."** + **"Try again"**. (Needs relay + 3 pages.)
- [ ] **Tampered link:** if a joiner's invite `k=` doesn't match the creator's actual key, the joiner fails with **"The peer's key didn't match the invite link. For your safety, the connection was stopped."** (Hard to force headless — string/branch check only; see Known traps.)
- [ ] The error card uses a red **`!`** mark (StatusView `tone="error"`) and is readable in both themes.

### J. Loading / spinner states
- [ ] Create or Join briefly shows the **preparing** card **"Preparing your secure session…"** / **"Confirm the signature in your wallet to prove your address."** (only when a wallet is connected and signing; anonymous flow blips past it fast — acceptable).
- [ ] The **securing** card **"Establishing a secure channel…"** / **"Exchanging keys with your peer. This only takes a moment."** shows for the joiner before connected.
- [ ] Spinners are real spinners (`Spinner.svelte`), not bare text; honor `prefers-reduced-motion` if set.

### K. Responsive
- [ ] **390×844:** landing card, join row, identity footer stack cleanly; the 3-step strip wraps without overlap; **no horizontal overflow**. The room (`height: min(72vh,720px)`, `max-width: 760px`) fits; the trust bar wraps the code + badge; the composer textarea + Send stay on one row; bubbles cap at `min(78%,560px)`.
- [ ] **1280×900:** landing centers within `max-width: 480px`; room centers within `760px`; QR/waiting card within `460px`. Layout intact, nothing clipped.

### L. Theme correctness (test BOTH — no white-on-white / unreadable contrast)
- [ ] **light** (`theme:'light'`): landing/waiting/room cards are clearly delineated by **border + shadow on the white page** (no white-on-white); inputs/recessed link box visible; Safety Code digits (mono) + emoji legible; accent buttons readable; the **warning** line (waiting) and **error** hint (invalid link) keep adequate contrast.
- [ ] **dark** (`theme:'dark'`): default look intact; the QR card keeps its **white** background (functional — a QR must be black-on-white; not a token violation); the chat input uses `--bg-base` and stays readable.
- [ ] Outgoing bubble (`--accent-muted`) vs incoming (`--bg-raised`) are distinguishable in **both** themes; verified (`--success`)/unverified (`--warning`) badges are legible in both.

### M. i18n (switch locale, no raw keys leak)
- [ ] Switch the app locale (⚙ settings panel or the app's locale switcher; locales: de, en, es-MX, fr, id, it, ja, ko, pt-BR, ru, tr, vi, zh, zh-HK, zh-TW) to **at least one non-en and one zh variant**.
- [ ] Every **visible** `chat.*` string translates: title/subtitle, the 3 steps, Create/Join cards, identity note, waiting screen, room header (**End**), trust bar (**Safety code** label, Verified/Unverified), composer (placeholder + **Send**), safety modal, end-confirm modal, ended/error cards.
- [ ] **No raw keys** render on screen (a visible literal like `chat.room.send` or `chat.landing.createBtn` = FAIL). Remember §0.1 — raw keys inside the embedded catalog JSON are fine; only judge rendered text.

### N. Accessibility / keyboard
- [ ] `Tab` through landing → the join input, **Join** button, **Connect a wallet…** link button, and **Create room** each show a visible **focus ring**; the join input has `aria-label` = "Join a chat".
- [ ] In the room: the trust bar button has `aria-label` "What is the safety code?"; the composer textarea has an `aria-label` "Type a message…"; the degraded banner uses `role="status"`.
- [ ] Keyboard send works: focus the composer, type, **Enter** sends, **Shift+Enter** newlines; **Send** is reachable and activatable via keyboard.
- [ ] Modals (Safety Code, End-confirm) trap focus / close on Escape (ResponsiveModal / ConfirmModal behavior); confirm they're operable by keyboard.

### O. Console / network hygiene & the no-persistence guarantee
- [ ] `list_console_messages` after a full pass → no unexpected `error`s. (A clipboard-blocked warning headless is acceptable.)
- [ ] `list_network_requests` → the only chat backend traffic is the **WebSocket** to the relay (`/v1/connect?room=…`); there are **no** HTTP POSTs of message content. The relay only ever sees `signal`/`relay` frames whose payloads are opaque (ciphertext / handshake) — you cannot read plaintext on the wire.
- [ ] **No persistence:** after ending a chat (or reloading), `evaluate_script` → inspect `localStorage`, `sessionStorage`, and (best-effort) IndexedDB for any chat message/key material → there must be **none** (keys + messages are memory-only). The invite `#…` fragment must already be stripped from the URL after capture.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. For checks that genuinely need the relay + a second/third peer or a funded signing wallet, mark **N/A (needs relay / 2nd peer / wallet)** and say so — don't guess PASS.

End with a short summary: **# checks total, # pass, # fail, # N/A**, and the top user-impacting issues.

---

## 3. Known traps / notes specific to THIS tool

- **Dev server was 500 at write-time.** Every route (incl. home + balance-radar) returned `{"message":"Internal Error"}` — the documented `$i18n`-clobber state from a concurrent `bun run check` on a live `vite dev`. There were even **two** `vite dev` processes running. **Always confirm a clean 200 and restart the dev server before testing**; otherwise you'll mis-report the whole app as broken.
- **Anonymous-by-default; the wallet gate is dead i18n.** Despite the project's "requires wallet sign-in" framing, the **actual UI never gates on a wallet** — `ChatLanding` lets you Create/Join immediately and you appear as **"Anonymous"**. The i18n keys **`chat.gate.title`** / **`chat.gate.desc`** ("Connect a wallet to start" / "Private Chat identifies each person by their wallet address…") exist in the catalog but are **never rendered**. If you see a wallet *gate* blocking chat, that's a regression; if you're verifying the catalog, those two keys are intentionally orphaned (note it, don't fail the flow over it).
- **Unreachable error/end branches.** The store defines but **never sets at runtime**: error codes **`noWallet`**, **`noSign`**, **`signFailed`** (the sign-in path silently falls back to anonymous on any failure — `prepareIdentity` swallows the exception), and end reason **`overflow`** (the **"Connection lost"** `chat.ended.overflowTitle` card). `fail()` is only ever called with `roomFull`/`tampered`/`connectFailed`; `endReason` is only ever `self`/`peer`. So you can verify their **strings** but you **cannot drive these states** through the UI. Don't burn time trying to trigger "Connection lost" or the no-wallet/sign errors — flag them as untestable-via-UI dead branches.
- **`connectFailed` rarely shows.** It only fires on an explicit relay **`error` frame**. A *refused/dropped* socket (relay down) just reconnects forever, so a down relay looks like **stuck on waiting/securing**, NOT the "Couldn't reach the chat relay" card. Don't expect the error card from simply not starting the relay.
- **Two-peer + relay required for the core flow** (§0.2/§0.3). One MCP page can only reach `waiting`/`securing`. Plan to drive **two pages** (and a **third** for the room-full test) against a local `wrangler dev` relay on `:8787`.
- **Avatars differ per side — not a bug.** Each header shows the *peer's* avatar (derived from the peer's key), so the two screens show **opposite** emoji. The **Safety Code**, by contrast, MUST be **identical** on both — that's the real equality assertion.
- **Tampered-link path is real but hard to force headless.** `onPeerSignal` rejects a joiner whose link `k=` ≠ the creator's actual ephemeral pub → `tampered`. To force it you'd have to MITM the `k` param of a *live* room; treat as string/branch verification unless you can script the relay.
- **Reload = session death by design.** The reconnect logic (`ChatTransport` resume token, relay 90s grace) survives a transient socket blip, but a **full page reload** drops the in-memory key/resume token → the session can't resume. The `beforeunload` guard exists specifically to warn the user. Don't reload mid-chat expecting to come back.
- **QR card hardcodes `#ffffff`.** `ChatWaiting` sets the QR wrapper background to white in both themes — that's **functional** (QR must be black-on-white), not a token violation.
- **Link linkification uses a stateful global regex.** `MessageBubble` reuses one `RegExp` with the `g` flag across `.test()` calls; double-check that messages with **multiple** URLs (or a URL followed by more text) still split correctly and don't drop/duplicate parts — worth a targeted check during §E.
- **Replay/forgery is dropped silently.** Incoming frames with `seq <= lastRecvSeq` or that fail AES-GCM auth are dropped with **no UI** (by design — a forged frame should be invisible). You won't see an error; just verify a normal message after a (hypothetical) bad one still arrives.
