# Forever / Capsule — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/capsule/TESTING.md`，用 chrome-devtools MCP 把 **Capsule / Forever 时光胶囊** (`/apps/capsule`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard‑won quirks of *this* app so the agent doesn't re‑discover them.

- App URL: `http://localhost:5173/apps/capsule`
- Route file: `src/routes/apps/capsule/+page.svelte`; store: `src/lib/pda-apps/capsule/store.svelte.ts`; onboarding: `src/lib/pda-apps/capsule/CapsuleOnboard.svelte`; date picker: `src/lib/pda-apps/capsule/CapsuleDatePicker.svelte`; networks: `src/lib/pda-apps/capsule/networks.ts`; i18n: `src/messages/en/apps/capsule.json` (key prefix **`capsule.`**). The route, code dirs and i18n files are all `capsule` now; the app was renamed from its original `forever` slug. The on-chain protocol contract is still named **Forever**, and the crypto salts / `forever.*` localStorage keys are deliberately frozen under the old name (changing them would orphan existing capsules) — see the FROZEN comments in `crypto/envelope.ts`, `crypto/prf.ts` and `store.svelte.ts`.
- What it does: write a letter "to your future self", **AES‑GCM encrypted client‑side**, then **sealed on‑chain** through a passkey Safe (ERC‑4337). Optionally **time‑locked** (drand quicknet / `tlock-js`): the ciphertext is wrapped so that *not even the author* can open it until a chosen future day. A per‑write fee of **0.001 native** is charged; one letter per chain, per day. Past letters are read back from chain and decrypted in the timeline ("The past").

> **⚠️ Hard automation ceiling — read first.** Beyond the **chain gate**, *everything* sits behind a **biubiu passkey wallet** (`CapsuleOnboard`): you must (1) create/open a passkey identity (WebAuthn `navigator.credentials.create/get` + Touch ID/biometric) and (2) derive a **PRF** encryption key (another passkey touch). A headless/MCP Chrome has **no authenticator and no PRF**, so the writing sheet, archive, seal, time‑lock, funding modal, and toast are **not reachable without a real funded passkey wallet + a human biometric tap.** Scope those to **"UI + validation + error‑state only; full flow needs a funded passkey wallet + manual biometric"** (exactly like wallet‑generator scopes the camera). The **fully automatable surface** is: chain‑gate, masthead/SEO, onboarding step‑1/step‑2 UI, settings, i18n, theme, responsive, console hygiene. Items below are tagged **[AUTO]** (drive it) or **[GATED]** (verify UI/validation/error copy only, or do it manually with a real wallet).

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/capsule` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900`. Mobile: `390×844`.

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running … chrome-profile"* or *"Connection closed"*, the automation profile is stuck. Recover with:
  ```bash
  # cheap unlock first (Chrome still alive) — highest success rate
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck → hard reset
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1–2 MCP calls**, then it may relock. So batch work — don't chain a long `click` sequence.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` sometimes returns an all‑white frame, and after a burst of interactions the tab can navigate itself to `about:blank` (HMR / relay churn). **Before trusting a screenshot**, sanity‑check via
  ```js
  evaluate_script: () => ({ url: location.href, h1: document.querySelector('h1')?.textContent, h2: document.querySelector('h2')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null, **re‑navigate and redo**. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot`** for assertions; use screenshots only for visual spot‑checks (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round‑trip can reset the page.
- **Svelte 5 binding:** `el.value = …` does **not** trigger `bind:value`. Use the native setter + dispatch:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(el, 'xxx'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (The letter box is a real `<textarea class="paper">` with `bind:value={store.text}`; the onboarding name box is `<input class="field">`. Both are gated behind login, so you can only reach them with a real wallet.)
- **Theme:** force via `navigate_page` `initScript`:
  ```js
  localStorage.setItem('biubiu-settings', JSON.stringify({ theme: 'light' })); // or 'dark'
  ```
  Applies through `<html data-theme>`. Per‑field merge of defaults makes writing only `theme` safe.
- **i18n raw‑key caveat:** the message‑catalog JSON embedded in the page HTML **legitimately** contains raw keys (`capsule.*`) as hydration data. **Only judge VISIBLE rendered text.** A *visible* raw key on screen (e.g. you literally see `capsule.brand` instead of "Capsule") **IS a FAIL.**

### 0.2 This app's specific quirks (also bite)

- **Locale is a cookie + reload, not a runtime swap.** SettingsPanel writes `document.cookie = 'locale=<code>;…'` then the page reloads to re‑render SSR in that locale. So to test i18n deterministically, set the cookie yourself and re‑navigate:
  ```js
  // navigate_page initScript:
  document.cookie = 'locale=zh;path=/;max-age=31536000;SameSite=Lax';
  ```
  then navigate to `/apps/capsule` again. Valid codes: `de en es-MX fr id it ja ko pt-BR ru tr vi zh-HK zh-TW zh`.
- **Default chain = Base** (`networkSlug = 'base-mainnet'`), but the gate shows all chains and you must click one. The chain choice persists in `localStorage` (`forever.chain` + `forever.entered`). To **reset to the gate** between runs:
  ```js
  // navigate_page initScript:
  ['forever.chain','forever.entered','forever.enc.cred'].forEach(k => localStorage.removeItem(k));
  ```
- **`forever.enc.cred` in localStorage does NOT skip onboarding.** The page renders children only when `authStore.isLoggedIn && store.unlocked` are *both* true (see `CapsuleOnboard.svelte` line 78). `store.unlocked` is set only by an actual PRF derivation (a live Touch ID), and it is **in‑memory only** (never persisted). So a saved credential still drops you on the **step‑2 "Unlock your mailbox encryption"** card on every reload. You cannot fake past this in MCP.
- **Letter box is ruled‑paper styled** (`repeating-linear-gradient` baseline) and the time‑lock date input is the **custom `CapsuleDatePicker`** (a portaled paper calendar, *not* native `<input type=datetime-local>`). The picker emits `"YYYY-MM-DDT09:00"` (a capsule opens 09:00 local of the chosen day).
- **Time‑lock needs live `api.drand.sh`** (`tlock-js` is dynamically imported). If the box is offline, sealing a *locked* letter will fail at the time‑lock step. (Network request only fires on a real seal/open — gated.)

### 0.3 Test data (only usable with a REAL funded passkey wallet — for the manual GATED pass)

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — reference funded address (read-only)
```
- **Per‑write fee:** `0.001` native (`FEE_WEI = 1_000_000_000_000_000n`), so the seal needs the passkey Safe to hold ≥ 0.001 of the chain's native token **plus gas** (a first‑time Safe also deploys lazily on the first seal → needs more). Use a cheap chain (Base/Polygon) for a manual end‑to‑end.
- **Limits to probe in the letter box:** private letters cap at `TEXT_BYTE_LIMIT = 4096 − 29 = 4067` bytes; a **locked** capsule caps far lower at `CAPSULE_TEXT_LIMIT = 2500` bytes (tlock armor inflates the payload). The byte counter + `over` red styling + disabled Seal must reflect this.
- **Chains shown in the gate** (from `networks.ts`, ordered): Ethereum, Base, BNB Chain, Arbitrum, Polygon, Optimism, Avalanche, Gnosis (testnets omitted unless present in `CHAIN_CONFIG`).

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / SEO / masthead — [AUTO]
- [ ] Page returns 200 and renders; `<h1>` = **Capsule** (zh: **Capsule**, brand untranslated by design — the *tagline* translates).
- [ ] Masthead shows the wax‑seal SVG mark, an `<h1>` "Capsule", a thin gold rule, and the tagline **"A letter to your future self — encrypted on-chain, readable only by you."** (zh: **"写给未来的自己。加密上链，只有你能再次开启。"**).
- [ ] Topbar: a **"← biubiu.tools"** home link (left), a **Settings** ⚙ icon‑pill (right). The account chip is **absent** when logged out.
- [ ] `<title>` / meta description match `capsule.meta.title` / `capsule.meta.description` (check `document.title`).
- [ ] `list_console_messages` → no `error` entries on first load.

### B. Region gate (choose a chain) — [AUTO]
- [ ] On a clean state (clear `forever.*` localStorage, §0.2), the **gate** card shows: `<h2>` **"Choose a chain"** (zh **"选择落笔的链"**) + subtitle **"This is where your letters will live. You're fixed to it once you enter — exit to switch."**
- [ ] The gate grid lists the chains from `networks.ts`: **Ethereum, Base, BNB Chain, Arbitrum, Polygon, Optimism, Avalanche, Gnosis** (verify text via snapshot; count ≥ 6). Any testnet chip spans full width + shows a **"(testnet)"** tag.
- [ ] Clicking a chain (e.g. **Base**) hides the gate and reveals: a **chain bar** under the masthead reading **"Write on Base"** with a **"switch"** link, and the onboarding card (you are now logged out → onboarding step 1, see C).
- [ ] Reload the page → it **does not** bounce back to the gate (chain persisted via `forever.chain` + `forever.entered`). It re‑enters the same chain.
- [ ] Click **"switch"** → returns to the gate; `forever.entered` becomes `'0'`. (`store.exitChain()`.)
- [ ] **Disabled while busy:** the switch link is disabled during any passkey/seal flow (only observable in the gated path).

### C. Onboarding step 1 — identity (logged out) — [AUTO for UI, GATED for the WebAuthn action]
After entering a chain while logged out, `CapsuleOnboard` renders the **identity** card:
- [ ] Lock icon mark; `<h2>` **"Open your mailbox"** (zh **"开启你的信匣"**); prose **"First, an identity that is yours alone — a passkey on this device. No password, no seed phrase."**; step label **"Step 1 of 2 · Identity"**.
- [ ] Primary button **"Create a new mailbox"**; secondary quiet button **"I already have a mailbox"**.
- [ ] Click **"Create a new mailbox"** → switches to the **name** sub‑view: `<h2>` **"Name your mailbox"**, prose mentions the name is public + immutable, an `<input>` with placeholder **"e.g. satoshi"** (`maxlength=40`), a disabled‑until‑typed **"Create mailbox"** button, and a **"Back"** quiet button.
- [ ] Type a name → **"Create mailbox"** enables; clearing it disables again (validation: `disabled={busyId || !name.trim()}`).
- [ ] **[GATED]** Actually pressing "Create mailbox"/"I already have a mailbox" launches a **WebAuthn ceremony** (`registerPasskey` / `authStore.login`). In headless MCP this throws → an **inline red `.err`** must appear under the card (e.g. "Couldn't open — please try again." / "Creation failed — please try again." — `capsule.onboard.errOpen/errCreateFailed`). Confirm the error surfaces **in the UI**, not only console.
- [ ] **"Back"** returns to the choose sub‑view and clears the error.

### D. Onboarding step 2 — encryption key (logged in, not unlocked) — [GATED: needs a real account]
Reachable only with a real biubiu account that is logged in but whose PRF key isn't derived this session (e.g. after a reload). Verify the **key** card:
- [ ] KeyRound icon; `<h2>` **"Unlock your mailbox encryption"** (zh **"解锁你的信匣加密"**); prose (rendered via `@html`, contains a **bold** "no second passkey"); step label **"Step 2 of 2 · Encryption"** when no key yet.
- [ ] Primary button **"Enter the mailbox"**; while deriving it reads **"Preparing…"** and is disabled (`keyBusy`).
- [ ] **[GATED]** Pressing it calls `store.setupKey()` → a Touch ID PRF derivation. If PRF is unsupported the store fails with **"This device / account does not support PRF encryption."** (`capsule.error.noPrf`) shown inline as `.err`. If WebAuthn is entirely absent: **"WebAuthn is not available in this browser."** (`capsule.error.noWebAuthn`). Confirm inline surfacing.

### E. Writing sheet (the happy path) — [GATED: needs funded wallet + biometric]
Only after both passkey steps succeed does `{@render children()}` reveal the sheet. With a real unlocked wallet:
- [ ] A **view switch** (tablist) with two tabs: **"Now"** (active, gold underline) and **"The past"**; `aria-selected` flips correctly.
- [ ] The writing **`<textarea class="paper">`** with ruled‑paper baseline and placeholder **"Write this moment. Only you will ever read it again."** When the lock toggle is on, the placeholder becomes **"A letter to your future self… revealed only on the day you set."**
- [ ] A **lock toggle** (custom switch) **"Lock until a date"**; toggling it on reveals **"Open on"** + the **CapsuleDatePicker** trigger (placeholder **"Pick a day"**) and a hint **"Until that moment, not even you can open it."**
- [ ] A permanence note **"Once sealed, it can't be edited or deleted — your words live as long as this chain does."**
- [ ] Footer **meta**: **"On Base"** · **"N bytes"** (live count) · **"one letter per chain, per day"**.
- [ ] **Seal button** label is **"Seal"** (unlocked) / **"Seal · send to the future"** (locked); the price line reads **"Pay 0.001 BASE"** (or chain's `nativeSymbol`). During sealing the button reads **"Sealing…"**.
- [ ] **Seal disabled** when the textarea is empty/whitespace, when `overLimit`, or while busy (`disabled={busy || !store.text.trim() || store.overLimit}`).

### F. Byte‑limit validation — [GATED for the live counter; copy/threshold verifiable from code]
- [ ] Typing text increments the **"{count} bytes"** counter (multibyte chars count as their UTF‑8 length, e.g. a Chinese char = 3 bytes).
- [ ] Paste a **private** letter > **4067** bytes → the bytes meta turns **red** (`.over`, `--error`) and **Seal disables**.
- [ ] Turn on the lock and paste > **2500** bytes → it goes over even though it'd be fine as a private note (capsule limit is much tighter). The counter goes red + Seal disables. (Threshold from `CAPSULE_TEXT_LIMIT`.)
- [ ] A locked letter with **no date / a past date** → on Seal the store fails with **"Pick a future date to unlock."** (`capsule.error.pickFuture`) shown in the toast. (Picker only allows strictly‑future days, so the realistic trigger is leaving the date empty.)

### G. CapsuleDatePicker — [AUTO if you can mount it; otherwise GATED]
The picker is a child of the (gated) sheet, but its logic is self‑contained. With a real wallet, or via a focused unit of the component:
- [ ] Clicking the trigger opens a **portaled paper calendar** (`role="dialog"`), positioned under the trigger (it's portaled to `<body>` with inline `top/left` + injected `--seal/--paper/...` vars — confirm it's **not clipped** and **themed**, not a bare white box).
- [ ] **Past + today are disabled** (`mid <= today`); only strictly‑future days are selectable. "Today" shows an inset ring; the selected day is gold‑filled.
- [ ] Month nav **←/→** changes the month; weekday headers are **locale‑aware** (`Intl … weekday:'narrow'`) — switch locale and confirm they localize.
- [ ] Picking a day closes the popup and sets the trigger label to the **long localized date** (`formatDate … dateStyle:'long'`). Internally the value is `…T09:00`.
- [ ] **Escape** closes the popup; clicking outside (and outside the portal) closes it; clicking inside keeps it open.
- [ ] Picker is disabled when `disabled` (during busy).

### H. Seal happy path — [GATED: funded wallet + biometric + on‑chain]
Manual, on a cheap chain with a funded Safe:
- [ ] Status messages cycle through human copy as it works: **"Preparing…" → "Encrypting…"** → (locked also: **"Time-locking (even you can't read it until then)…"**) → **"Sealing on-chain — sign with your passkey"** → on success a **toast** **"Sealed forever."** with a **"View transaction"** external link to the chain explorer (`network.explorerUrl + txHash`).
- [ ] After success the textarea **clears** and the timeline reloads (`loadEntries()` fires).
- [ ] The toast has a **"Close"** affordance for `done`/`error` states (`store.clearStatus()`); success toast gets the gold `.ok` style, errors get red `.err` style.

### I. Cooldown + funding + low‑balance errors — [GATED: needs wallet]
These are the store's error branches; verify their copy + UI surfacing (toast/modal), not just console:
- [ ] **Cooldown:** sealing a 2nd letter the same UTC day on the same chain → toast **"You've already sealed a letter on this chain today — you can write again {relative time}."** (`capsule.error.cooldown`). The check runs **before** any passkey prompt.
- [ ] **Low balance / fresh Safe:** if the Safe can't cover fee+gas → toast **"Your wallet balance can't cover gas … Top up a little {symbol} … {address}"** (`capsule.error.lowBalance`). Verify it shows the **Safe address**, not a raw selector.
- [ ] **Empty bundler gas account:** if the relayer's gas account is empty → the **BundlerFundingModal** opens (sponsorship + self‑fund QR), **not** a dead‑end error. On fund success the seal retries (`retrySeal()`); dismiss closes it.
- [ ] **Reverts / unknown failures** map to neutral **"That didn't go through. Please try again in a moment."** (`capsule.error.txReverted`) — **never** a raw `0x…` selector. (Verify `friendlyError` masks hex.)

### J. The past (archive) — [GATED: needs wallet + sealed letters]
- [ ] Switching to **"The past"** lazily loads the timeline (`enterPast` → `loadEntries`). While loading the refresh button reads **"Fetching…"**.
- [ ] Empty state: **"No letters from you on this chain yet.\nWrite the first one."** (two lines — `white-space: pre-line`).
- [ ] With letters: a count header **"{count} letters"**, a sort toggle **"Newest first" / "Oldest first"** (`setSort` reloads), and a refresh button (**"Retrieve my letters"** first time / **"Refresh"** after).
- [ ] Each letter shows its **long created date**; readable (private/unlocked) letters render text with `pre-wrap`.
- [ ] A still‑**sealed** capsule shows a wax Lock badge, **"Not yet opened · a letter to the future"**, and **"Opens on {date} — {countdown}"** where the countdown ticks live (`{days}d {hours}h left` or `HH:MM:SS left`).
- [ ] **Auto‑open at maturity:** when a capsule's `unlockAt` passes while you watch, the timeline **re‑fetches itself** (throttled ~15s, allows for drand beacon lag) and the letter opens — no manual refresh. (Verify the `$effect` doesn't hot‑loop: at most one reload per 15s.)
- [ ] A letter that **fails to decrypt** shows **"This letter could not be decrypted"** with an alert‑triangle (`capsule.letter.failed`) — it must not crash the list.
- [ ] **Pagination:** with > 20 letters a **"Read older ({N} more)"** button appends the next page (`loadMore`); the remaining count stays accurate.

### K. Toast / status banner — [GATED]
- [ ] All errors surface as the bottom **toast** (`role="status"`), not just console. Error toast = red; done = gold; both dismissable via **"Close"**.

### L. Settings panel — [AUTO]
- [ ] Click the ⚙ icon‑pill → a **ResponsiveModal** titled by `settings.title` opens with the shared **SettingsPanel** (theme, language grid, number/date/currency presets). It's re‑tinted to the gold "seal" accent (`.capsule-settings { --accent: var(--seal) }`).
- [ ] Closing the modal works (overlay click / close button).

### M. i18n — [AUTO]
- [ ] Set `locale` cookie to a non‑zh (e.g. `ja`) and a zh variant (`zh`, `zh-HK`), re‑navigate, and read **visible** text on the **gate**, **masthead**, **onboarding step‑1** screens (the only states reachable without a wallet). Every visible string must translate; **no raw `capsule.*` key** may appear on screen.
- [ ] Spot‑check translations exist & differ: gate title (en "Choose a chain" / zh "选择落笔的链"), view tabs (en "Now"/"The past" / zh "此刻"/"往昔"), seal button (en "Seal" / zh "封缄"), lock toggle (en "Lock until a date" / zh "封存到某一天").
- [ ] **Brand intentionally untranslated:** `capsule.brand` is "Capsule" in all locales — that is **expected**, not a miss.
- [ ] Confirm all 15 locale files exist (`ls src/messages/*/apps/capsule.json` → 15). A missing one is a FAIL.
- [ ] Weekday/month names in the date picker localize via `Intl` (gated, but verify if you reach it).

### N. Theme correctness (light + dark) — [AUTO]
- [ ] **Light** (`theme:'light'`): the paper/leaf cards (`--paper = color-mix(bg-raised, gold)`) are clearly delineated from the page (border `--edge` + soft shadow) — **no white‑on‑white**; gate chips, gold seal accents, masthead rule all legible; the gold **seal‑btn** text is white on gold (readable).
- [ ] **Dark** (`theme:'dark'`): the parchment tint reads as a warm dark panel; gold accents and `--ink/--ink-soft` text stay legible; no muddy gold‑on‑gold.
- [ ] Error `.err` / toast `.err` red and the gold `.ok` are distinguishable in **both** themes.
- [ ] Check at least the **gate** + **onboarding step‑1** in both themes (the only no‑wallet states); spot the sheet/archive in both if you have a wallet.

### O. Responsive — [AUTO]
- [ ] **390px:** masthead centered, gate grid (2‑col) reflows without overflow; topbar (home link + ⚙ + account) doesn't wrap awkwardly; onboarding card padding sane. With a wallet: the sheet footer stacks (`@media max-width:560px` → `.sheet-foot` column, `.seal-btn` full‑width), date picker popup doesn't overflow the viewport (it clamps `left` to `innerWidth - 288`).
- [ ] **1280px:** content is capped at `max-width:600px` and centered; nothing stretches edge‑to‑edge.
- [ ] No horizontal scrollbar at either width (`document.documentElement.scrollWidth <= clientWidth`).

### P. Accessibility / keyboard — [AUTO where reachable]
- [ ] `Tab` reaches: home link, ⚙ settings (has `aria-label`), gate chips, onboarding buttons/input — each shows a visible focus ring.
- [ ] The lock toggle is a real checkbox with `:focus-visible` outline (gold) on the track; activatable by Space.
- [ ] View‑switch buttons have `role="tab"` + `aria-selected`; sort buttons live in a `role="group"`.
- [ ] Date‑picker trigger exposes `aria-haspopup="dialog"` + `aria-expanded`; the popup is `role="dialog"`; Escape closes it; nav buttons have `aria-label`.
- [ ] Toast is `role="status"` (announced). The wax‑seal mark and track are `aria-hidden`.

### Q. Console / network hygiene — [AUTO]
- [ ] `list_console_messages` after the full no‑wallet pass → **no unexpected `error`s**. (A failed WebAuthn attempt may log a benign rejection — note it but a thrown `NotAllowedError` surfaced as the inline `.err` is expected behavior, not a UI bug.)
- [ ] `list_network_requests` on the gate/onboarding states → no surprise third‑party calls. (`api.drand.sh` and RPC/bundler calls fire **only** on a real seal/open — gated.)

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL/BLOCKED | Evidence`. Use **BLOCKED** for any **[GATED]** item you couldn't run without a funded passkey wallet / biometric, and say so explicitly. For any FAIL include the actual observed value/text and a snapshot or (non‑blank) screenshot. End with counts: **# checks, # pass, # fail, # blocked**, and the top user‑impacting issues.

A correct no‑wallet run looks like: `h1 = "Capsule"`, gate offers Ethereum/Base/BNB Chain/Arbitrum/Polygon/Optimism/Avalanche/Gnosis, choosing Base shows "Write on Base" + the **"Open your mailbox"** identity card, "Create a new mailbox" → name input with "e.g. satoshi", a WebAuthn attempt surfaces a red inline error (not a crash), settings opens, light+dark both legible, `ja`/`zh` localize with no raw `capsule.*` on screen, and console is clean.

---

## 3. Known traps / notes specific to this tool

- **`forever` route, `capsule.*` strings.** Don't grep for `forever.*` i18n keys — they don't exist; the prefix is **`capsule.`**.
- **Everything past the gate needs a real passkey + (for seal) on‑chain funds.** No MCP/headless run can reach the writing sheet, archive, time‑lock, or seal. This is **by design** (passkey‑only mailbox) — report those as **BLOCKED**, not FAIL, unless you have a funded wallet to drive them manually.
- **`store.unlocked` is memory‑only.** Even with `forever.enc.cred` saved in localStorage, a reload lands on the **step‑2 "Enter the mailbox"** card and needs a fresh Touch ID. You cannot script past it.
- **Locale change forces a full reload** (cookie‑driven SSR). Don't expect a live in‑place text swap; navigate again after setting the cookie.
- **Time‑lock depends on live `api.drand.sh` + a heavy lazy `tlock-js` chunk.** First locked‑seal/first‑open will pull BLS pairing crypto; expect a one‑time load. If drand is unreachable, locked seal/open fails (inner AES still protects content). Verify the failure is a friendly message, not a stack trace, if you can reach it.
- **Capsule text limit (2500B) is much tighter than private (4067B)** — this is intentional (tlock base64+stanza overhead scales with length). If the byte counter/Seal‑disable used the *private* limit for a locked note, that'd be a bug (the on‑chain `MAX_PAYLOAD` check would then bounce it with "Message is too long for one letter."). Worth confirming with a real wallet near the 2500B boundary.
- **Auto‑reload `$effect` (page lines 73–80).** It reloads when a capsule matures, throttled to ≥15s. If you ever see it hammering the RPC every tick, that's a regression. The live countdown `$effect` (lines 65–69) only mounts its interval while a locked entry is on screen — confirm it tears the interval down when none remain.
- **Default chain is Base but the gate forces an explicit pick** — the persisted `forever.chain`/`forever.entered` can make the app skip the gate on reload; clear them to re‑test the gate (§0.2).
- **Brand "Capsule" is deliberately untranslated** across all 15 locales — not an i18n gap.
- **Fee text uses the chain's `nativeSymbol`** (e.g. "Pay 0.001 BASE"/"…ETH"/"…BNB"). A blank symbol (`network` undefined) would show "Pay 0.001 " — only happens if `networkSlug` doesn't resolve, which shouldn't occur for the gated chains.
