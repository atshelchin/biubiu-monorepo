# Wallet Sweep — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/wallet-sweep/TESTING.md`，用 chrome-devtools MCP 把 **钱包归集 / Wallet Sweep** (`/apps/wallet-sweep`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state / flow / edge case below, and reports a PASS/FAIL table with evidence. It also captures the hard‑won quirks of *this* app so the agent doesn't re‑discover them.

- **App URL:** `http://localhost:5173/apps/wallet-sweep`
- **What it does:** an **EIP‑7702 multi‑EOA sweep**. You paste many EOA **private keys**, pick a chain, name ERC‑20s + a destination, then a **throwaway relay EOA** (generated in‑browser, stored only in `localStorage[wallet-sweep-relayer]`) deploys the sweeper contracts, **upgrades** each EOA (7702 delegation) and **sweeps** native + tokens into the destination in batches. You fund the relay with gas. Afterwards you **revoke** delegations and **recover** leftover relay gas. A **service fee (~$5 in the chain's coin)** is folded into the relay funding unless waived by a Pro passkey signature.
- UI language is locale‑dependent; the default **en** strings (prefix `ws.`) are quoted below so you know exactly what to look for.
- It is a **3‑phase wizard**: `config` → `run` → `done` (Stepper labels **Configure / Run / Done**).

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/wallet-sweep` → expect `200`. If not, start it: `cd apps/biubiu.tools && bun run dev` (or ask the user).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to **1280×900**. Mobile: **390×844**.

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running for …/chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*, the dedicated automation profile is stuck. Recover, least‑nuclear first:
  ```bash
  # 1) just clear the lock (Chrome still alive — highest success rate)
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # 2) if still stuck, full reset:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1–2 MCP calls.** Don't chain a long string of `click`s — batch work into a few `evaluate_script` / `navigate_page(initScript)` calls instead.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` sometimes returns an all‑white frame, and after a burst of interactions the tab can navigate itself to `about:blank` (HMR / MCP relay churn). Before trusting a screenshot, sanity‑check with `evaluate_script` → `{ url: location.href, h1: document.querySelector('h1')?.textContent }`. If `url` is `about:blank` or `h1` is null, **re‑navigate and redo** setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot`** for assertions; use screenshots for visual spot‑checks only (retake if blank).
- **Batch into few round‑trips.** Each call is a chance for the relay to reset the page. Do setup (theme + select network + fill keys) in one `navigate_page(initScript)` or `evaluate_script`, then assert in one more.
- **Svelte 5 binding.** `el.value=...` does **not** trigger `bind:value`. Use the native setter + dispatch input:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(el, '0x…'); el.dispatchEvent(new Event('input',{bubbles:true}));
  ```
  (For `<textarea>` use `HTMLTextAreaElement.prototype`.)
- **Theme.** `navigate_page` initScript: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`; per‑field merge of defaults makes writing only `theme` safe.
- **i18n raw‑key caveat.** The message‑catalog JSON embedded in the page HTML legitimately contains raw `ws.*` keys (hydration data) — that is **not** a bug. Only judge **visible rendered text**. A visible raw key (e.g. `ws.btn.continue` showing literally on a button) **IS a FAIL**.

### 0.2 Driving the private‑keys editor (the #1 trap)

The "Private keys" box is **not** a plain `<textarea>` — it is the shared `@shelchin/proeditor-sveltekit` **`LineEditor`** (the same component balance‑radar / token‑sender use): a hidden `textarea.pe-hidden-input` + a rendered overlay, with virtual scroll, per‑line validation and duplicate detection.

- ❌ `fill` on it does little. ❌ Setting `.value` programmatically gets **reset** by the editor. ❌ Synthetic paste leaves the count at "0 valid" until a real keystroke nudges it.
- ✅ **Reliable recipe — real keystrokes:**
  1. `evaluate_script`: `document.querySelector('main textarea.pe-hidden-input')?.focus()`
  2. `type_text` the private keys joined by `\n` (one per line)
  3. `press_key` `Enter` (commits the last line)
  4. `press_key` `Backspace` (removes the trailing empty line)
  5. Verify the stat chip reads **"N valid"** (`ws.keys.summary`).
- **Note on the import/clear labels:** this editor deliberately localizes its file button as **"Import"** (`ws.keys.import`) — **NOT "Upload"** — because keys never leave the browser and "Upload" would wrongly imply a server send. Its status‑bar clear control reads **"Clear"** (`ws.keys.clear`). Seeing the proeditor's built‑in **English** "Upload"/"Clear" here is a **FAIL** (i18n regression).
- **Validation regex:** a valid key is `^(0x)?[0-9a-fA-F]{64}$` (0x optional). Anything else → flagged as **"Invalid private key"** (`ws.keys.invalidLine`) and not counted. Duplicate keys (same derived address) are detected and shown as duplicates.

### 0.3 Test data (private keys + addresses)

⚠️ **These are throwaway / well‑known keys — never fund them.** Pasting a *private key* is required to exercise the parse/validate UI; **no real sweep happens without on‑chain funds.**

```
# Well-known Hardhat/Anvil test private keys (deterministic addresses) — for the editor:
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # → 0xf39F…2266
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # → 0x7099…79C8
0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   # → 0x3C44…93BC
# Duplicate of line 1 (to test dedupe → "1 duplicate"):
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Invalid (too short → "Invalid private key"):
0x123

# Destination address (well-funded, fine as a *destination* — never receives in test):
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth
# ERC-20 contract for "Add token → Fetch" on Ethereum:
0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48   # USDC (6 decimals)
0xdAC17F958D2ee523a2206206994597C13D831ec7   # USDT (6 decimals)
```
- **Bogus chain ID** for the duplicate/unreachable custom‑network test: use chainId `1` (duplicate of Ethereum) and an unreachable RPC `https://invalid.rpc.example`.

### 0.4 What CANNOT be automated headless (scope these to UI + validation + error‑state only)

The **happy path past "Continue" requires real on‑chain funds**: a funded relay EOA, gas on the chosen chain, EIP‑7702 broadcasts, and confirmations. An MCP/headless run **cannot** send transactions. Therefore:
- ✅ Fully testable headless: phase `config` (network/keys/tokens/destination/fee UI + all validation), the relay **download** + **verify‑upload** steps, the funding panel **layout** (QR + needed/balance), the gated state machine, error banners, history, activity log, responsive, themes, i18n, a11y, console hygiene.
- ⚠️ **Needs a funded wallet / manual step (UI + error‑state only here):** the actual deploy/sweep (`proceed`), `Sweep again`, `Revoke all`, `Recover relay gas`, the `done` phase, and the **relay auto‑wipe after recover** (you can still verify the *code path* and the *log message* by injecting state — see §G/§H).

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state (phase = config)
- [ ] Page returns 200 and renders; `<h1>` = **"Wallet Sweep"** (`ws.title`); subtitle (`ws.subtitle`) mentions **"no passkey, no login"** and **"EIP‑7702"**.
- [ ] **Stepper** shows three steps **Configure / Run / Done**; step 1 (Configure) is current/highlighted, steps 2–3 are inert (the stepper only allows the run→config back‑click, so no dead clicks here).
- [ ] A green **shield note card** (`ws.security.title` "Your keys stay in this browser" + body) is visible and **compact** (icon + one paragraph), not a giant alarming block.
- [ ] Five config cards in order: **Choose a network** (`ws.network.title`) · **Private keys** (`ws.keys.title`) · **Tokens to sweep** (`ws.tokens.title`) · **Destination** (`ws.dest.title`) · **Service fee** (`ws.fee.title`).
- [ ] Network grid lists the 7 mainnets: **Ethereum, Base, Optimism, Arbitrum, Polygon, BNB Chain, Gnosis** — each with a **"7702"** badge and a readiness badge that starts **"Checking…"** then flips to **"Ready"** (or **"Unavailable"** if its RPC is down). (`onMount` calls `probeAll()`.)
- [ ] A **"Show testnets"** toggle (`ws.network.testnets`) exists; turning it on reveals **Base Sepolia (Testnet)** + **Ethereum Sepolia (Testnet)**.
- [ ] Token row shows a single native chip "**ETH · Native**" form (`{symbol} · Native`) — but **symbol is blank/native until a network is selected**; **"+ Add token"** is **disabled** with title "an available network" until a network is chosen.
- [ ] Destination input is empty (placeholder `0x… destination wallet`); no valid/invalid message yet (only shown once touched).
- [ ] The primary button reads **"Continue"** (`ws.btn.continue`) and is **disabled**; a **"Still needed:"** hint (`ws.req.prefix`) lists the three blockers joined by " · ": **"an available network · at least one valid private key · the destination address"** (`ws.req.network` / `ws.req.keys` / `ws.req.dest`).
- [ ] `list_console_messages` → no `error` entries.

### B. Network selection + readiness probe
- [ ] Click **Ethereum** → it becomes selected; the native token chip updates to **"ETH · Native"**; **"+ Add token"** enables.
- [ ] After selecting, its readiness badge resolves to **"Ready"** (mainnet RPCs are public). If it stays **"Unavailable"**, note it (likely a network/RPC issue, not a UI bug) — the **"Still needed: an available network"** blocker then persists.
- [ ] Selecting a different network resets any in‑progress relay (the store calls `resetRelay()` on `selectNetwork`) — not directly visible at config, verify only that no stale state leaks into the Run phase later.

### C. Private‑keys input & validation (recipe §0.2)
- [ ] Enter the 3 valid keys → the stat chip reads **"3 valid"** (`ws.keys.summary`), green check icon.
- [ ] Add the **duplicate** of line 1 → a muted chip **"1 duplicate"** (`ws.keys.duplicates`) appears; valid stays **3** (dedupe by derived address).
- [ ] Add **`0x123`** (invalid) → a red chip **"1 invalid"** (`ws.keys.invalid`) appears; the line is flagged in‑editor as **"Invalid private key"**.
- [ ] Open the editor's **Issues** drawer (if surfaced) → labels are localized (**Issues / Line / Error / Duplicate / Close**), not raw `ws.keys.*`.
- [ ] The editor's import button reads **"Import"** (not "Upload"); the clear control reads **"Clear"** — both localized.
- [ ] **Import** opens a file‑upload modal with a single column **"Private Key"** (`ws.keys.colLabel`).
- [ ] Clearing all keys → the stat chips disappear; "Continue" re‑blocks with "at least one valid private key".

### D. Tokens to sweep
- [ ] With Ethereum selected, click **"+ Add token"** → modal **"Add ERC20 token"** (`ws.tokens.addTitle`) opens with input placeholder `0x… token contract`.
- [ ] Paste **USDC** (`0xA0b8…eB48`) → **"Fetch"** (`ws.tokens.fetch`, becomes "Fetching…") → on success the modal closes and a chip **"USDC"** appears in the token row with a remove **×** (`ws.tokens.remove`). *(Requires a reachable Ethereum RPC; if the read fails the modal shows the error inline — see §G.)*
- [ ] Paste the **same** USDC address again → inline error **"Token already added"**.
- [ ] Paste garbage (`0x123`) → inline error **"Invalid token address"** (`TriangleAlert` icon), modal stays open.
- [ ] Click a token chip's **×** → chip removed; native chip always remains (native is always swept — `ws.tokens.subtitle`).

### E. Destination validation
- [ ] Type `0x123` → input gets the invalid style and message **"That doesn't look like a valid address"** (`ws.dest.invalid`, X icon).
- [ ] Replace with vitalik.eth `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` → message flips to **"Valid address"** (`ws.dest.valid`, green check).
- [ ] With network **Ready** + ≥1 valid key + valid destination → the **"Still needed:"** hint disappears and **"Continue"** **enables**.

### F. Service fee / member waiver
- [ ] The **Service fee** card explains (`ws.fee.subtitle`) "about $5 in the network's coin … included in the relay funding".
- [ ] The `MemberFeeWaiver` control renders. For a **non‑member / observer** it should NOT silently waive — verify the fee is **not** marked free. (Full passkey‑signed waiver needs a real Pro passkey → **manual step**; here just confirm the control renders and doesn't throw.)

### G. Continue → Run phase (gated; deploy/sweep needs funds)
> Clicking **Continue** runs `preflight()`: it fetches balances, plans the sweep, quotes the fee, checks if the sweeper contracts are deployed, estimates funding, then switches to phase `run`. This makes **real RPC reads** (no writes). With public RPCs reachable it should succeed; the deploy/sweep itself does NOT run until the relay is funded.
- [ ] Click **Continue** → button shows **"Checking…"** (`ws.btn.checking`, spinner) → page advances to the **Run** phase; Stepper highlights **Run**.
- [ ] **If preflight fails** (e.g. RPC unreachable): an **inline alert** (`role="alert"`, `ws-alert`, TriangleAlert icon) appears at the top reading **"Preflight failed: …"** — surfaced **in the UI**, not just console. A dismiss **×** (`ws.alert.dismiss`) clears it.
- [ ] Run phase header **"Review & run"** (`ws.run.title`); a summary shows **Wallets** count (`ws.run.wallets`), **Total native ETH** (`ws.preview.totalNative`), **Fee** (`ws.fee.label`), and **Skipped (contracts)** if any address is a contract.
- [ ] **"Show per‑wallet balances"** (`ws.run.details`) `<details>` expands a table (Wallet + native + each token column).
- [ ] **Relay wallet** card (`ws.relay.title`): a 3‑step gated flow is shown.

### G2. Relay download → verify → fund (the security gate — fully testable headless)
- [ ] **Step 1 "Download the relay key"** (`ws.relay.step1`): primary button **"Download relayer key"** (`ws.btn.download`) + a ghost **"New relay"** (`ws.relay.rotate`). Step 2 is **hidden** until download.
- [ ] Click **Download** → a file `sweep-relay-<slug>-<0xshort>.txt` downloads and Step 1's bullet flips to a ✓. **Capture the file text** (wrap `URL.createObjectURL` before clicking, or read the Blob) and verify it **TELLS THE TRUTH** (recently fixed):
  - contains **"Relay Private Key"**, the **Network**, **Address**, **Private Key** lines;
  - contains the **!! SECURITY !!** warning that *"Anyone who holds this key can sweep ANY of your still‑delegated EOAs to ANY destination of their choosing"* (i.e. the destination is per‑transaction, NOT fixed);
  - tells the user to **DELETE IT** after revoking delegations and recovering gas ("this key is harmless: DELETE IT then").
  - **FAIL** if the file claims the relay "can only send to your destination" with no caveat, or omits the delete‑after‑revoke instruction.
  > Capture recipe:
  > ```js
  > const orig = URL.createObjectURL; let captured = '';
  > URL.createObjectURL = (b) => { b.text?.().then(t => captured = t); return orig(b); };
  > // click Download, then read `captured` (or read window.__relayFileText if you stash it)
  > ```
- [ ] **Step 2 "Confirm you saved it"** (`ws.relay.step2`): a file input labelled **"Upload key file to verify"** (`ws.btn.verifyUpload`). Step 3 is **hidden** until verified.
- [ ] **Verify mismatch:** upload a `.txt` whose `0x…64hex` doesn't match → inline error **"This file does not match your relay key"** (`store.verifyError`), Step 3 stays hidden.
- [ ] **Verify match:** upload the real downloaded file → Step 2 flips to **"Saved & verified"** (`ws.relay.verified`, green) and **Step 3 reveals**.
  > Headless upload: use `upload_file` on the hidden `input[type=file]`, OR call `store.verifyUpload(fileText)` via `evaluate_script` against the component (if the store isn't reachable, drive the file input directly).
- [ ] **Step 3 "Fund the relay with gas"** (`ws.relay.step3`): a **QR canvas** of the relay address + a copyable short address (click → **"Copied"** `ws.copied` for ~1.5s), **Needed** (`ws.relay.needed`) and **Balance** (`ws.relay.balance`) rows with amounts, a **"Refresh balance"** button (`ws.btn.refresh`), and a state pill **"Waiting for funds"** (`ws.relay.notFunded`, amber) → **"Funded — ready to sweep"** (`ws.relay.funded`, green) once funded.
- [ ] **"Start sweep"** (`ws.run.start`) is **disabled** until `relayerFunded` (balance ≥ needed AND needed > 0). With no funds it stays disabled — correct. **Actual sweep = manual / funded step.**
- [ ] **"New relay"** → confirm modal **"Generate a new relay?"** (`ws.relay.rotateTitle` + body warning that old‑address gas stays put). Confirm → a fresh relay address; Step 2/3 reset (download + verify cleared).
- [ ] **Back** button (`ws.btn.back`, ArrowLeft) returns to **config** with inputs preserved; it is **disabled while running**.

### H. Done phase + revoke + recover + **relay auto‑wipe** (mostly manual; verify code path + logs)
> These require a completed real sweep. **Headless: drive the store directly** via `evaluate_script` (the page constructs `new WalletSweepStore()`; if you can reach it, set `phase='done'` and inject `sweepRecords`/`sweptSet`), or at minimum verify the **strings** and the **localStorage wipe behavior** described below.
- [ ] Done header **"Sweep complete"** (`ws.done.title`) + subtitle (`ws.done.subtitle`); each batch row shows `#n`, **"N wallets"** (`ws.done.batchCount`), a status (**Completed**/**Failed**), and a **"View"** explorer link (`ws.done.viewTx`) when present.
- [ ] Actions: **"Sweep again"** (`ws.done.sweepAgain`) · **"Recover relay gas"** (`ws.btn.recoverGas`) · **"New sweep"** (`ws.btn.reset`).
- [ ] **Revoke delegations** card (`ws.revoke.title`): danger button **"Revoke all (N)"** (`ws.revoke.all` + count of swept addresses), **disabled** when count is 0. Click → confirm modal **"Revoke all delegations?"** (`ws.revoke.confirmTitle` + body "{count} wallets will be reset…").
- [ ] **Activity log message after a full revoke (recently fixed):** after revoking ALL delegations, the **Activity** log (`ws.logs.title`, a `Disclosure`) must contain **"All delegations revoked — recover gas to wipe the relay key"**. *(Source: `store.revoke()` logs this when `sweptSet.size === 0`.)* This is a string assertion you can force by injecting `sweptSet` empty post‑revoke.
- [ ] **Relay auto‑wipe after Recover gas — ONLY within the sweeping session (recently fixed twice):** the relay key is wiped from `localStorage['wallet-sweep-relayer']` (log: **"Relay key wiped — all delegations revoked, key is no longer needed"**) **only when this session delegated EOAs AND then revoked them all** (`didDelegateThisSession && sweptSet.size === 0`). Verify both directions:
  - ✅ Same session: sweep → revoke all → Recover gas → key wiped from localStorage.
  - 🚨 **CRITICAL regression check — after a RELOAD:** sweep (EOAs delegated) → **reload the page** (in‑memory `sweptSet` resets to empty, relay restored from localStorage) → click **Recover relay gas**. The relay key **MUST STILL BE PRESENT** in `localStorage['wallet-sweep-relayer']`.
  ```js
  // After reload + Recover gas: the relay key must NOT have been wiped
  evaluate_script: () => !!localStorage.getItem('wallet-sweep-relayer')  // expect true
  ```
  **FAIL** if a post‑reload Recover gas wipes the key — that would destroy the only key able to revoke / redirect still‑delegated EOAs (funds loss). The wipe is gated on `didDelegateThisSession`, which is false after a reload precisely to prevent this.
- [ ] **"New sweep"** resets everything (keys cleared, balances cleared, back to config).

### I. History (shared between config & done)
- [ ] After a sweep, a **History** card (`ws.history.title`) lists rows: network name, **"N wallets"** (`ws.history.summary`) · total native → short destination, a status badge (**Completed**/**Partial**/**Failed**, `ws.status.*`), and a **Delete** trash button (`ws.history.delete`).
- [ ] History persists across reload (IndexedDB via `sweep-history`). Delete removes the row.
- [ ] (Headless without a real sweep: history is empty — verify the card simply doesn't render, no error.)

### J. Error / failure states (must surface IN THE UI)
- [ ] **Add‑network duplicate:** Open **"Add network"** (`ws.network.addCustom`) → enter chainId **1** (Ethereum's) + a name/RPC → submit → inline error **"This network already exists"** style (`widgets.addNetwork.errorDuplicate`). *(The modal validates name/chainId/RPC/symbol with localized errors; empty/non‑http RPCs are filtered → "errorRpcs".)*
- [ ] **Add‑network unreachable RPC:** chainId 999999 + `https://invalid.rpc.example` → on submit the store's `verifyCustomRpc` fails → error **"RPC unreachable or chain ID mismatch"** surfaces inline in the modal (thrown back by `submitCustomNetwork`).
- [ ] **Add‑token read failure:** with a network whose RPC is down, "Fetch" surfaces the read error inline in the token modal (`store.addTokenError`), not only console.
- [ ] **Preflight failure** (§G): top‑level inline alert, dismissible.
- [ ] Any caught store error appears via the top **`ws-alert`** banner (`role="alert"`) — confirm none are console‑only.

### K. Loading / progress / skeleton states
- [ ] **Continue → "Checking…"** spinner while `preflight()` runs.
- [ ] During a real run: a centered card shows a **timeline** (Deploy → Sweep, `ws.run.deploying` / `ws.step.sweep`), a progress line **"Batch X of Y"** (`ws.run.batch`), and a spinner. *(Manual / funded step — verify only the markup exists if you can inject `runStage`.)*
- [ ] **Recover relay gas** button shows **"Checking…"** while `recovering`.

### L. Responsive
- [ ] **390px:** network grid chips wrap; the config cards stack; the **"Still needed"** hint + Continue stack (the `.ws-actions` becomes `column-reverse`, button full‑width); the Run phase **Back / Start sweep** split stacks; the relay funding panel (QR + info) wraps; per‑wallet table scrolls horizontally. No overflow / clipping / white gaps.
- [ ] **1280px:** the page is centered with `max-width: 760px`; cards aligned; nothing stretches edge‑to‑edge.

### M. Theme correctness (light + dark — no white‑on‑white)
- [ ] **Light** (`data-theme=light`): every `ws-card` is clearly delineated by border + shadow on the page (no white‑on‑white); inputs/recessed editor visible; the green shield note, the amber **"Waiting for funds"** pill, the green **"Funded"** pill, the red destination error, and danger **"Revoke all"** are all legible.
- [ ] **Dark** (`data-theme=dark`): default look intact; the same elements legible; the QR canvas renders on its own light backing (QR must be black/white — that's functional, not a token violation).
- [ ] No element uses hardcoded `rgba(255,255,255,x)` that disappears in light (spot‑check the note card + chips).

### N. i18n (switch locale, no raw keys)
- [ ] Switch locale (⚙ settings panel / locale switcher) to at least one **non‑en** locale and back. Every **visible** `ws.*` string translates; **no raw keys** leak on screen (a literal `ws.btn.continue` / `ws.req.prefix` visible on a control IS a FAIL).
- [ ] The keys editor's **Import / Clear / Issues** labels translate too (they come from `ws.keys.*`, not the proeditor defaults).
- [ ] The Add‑network modal labels (`widgets.addNetwork.*`) translate.
- [ ] Reminder: raw `ws.*` keys inside the embedded catalog JSON in page source are **expected** hydration data — judge only rendered text.

### O. Accessibility / keyboard
- [ ] `Tab` through network chips → Continue → relay buttons → each shows a visible **focus ring** (`:focus-visible` outlines are defined).
- [ ] The top alert has `role="alert"`; its dismiss has `aria-label` "Dismiss"; remove‑token/history‑delete buttons have aria‑labels.
- [ ] Confirm modals (rotate relay / revoke all) are reachable and the destructive confirm is keyboard‑activatable.
- [ ] The relay address copy button is keyboard‑activatable and flips to "Copied".

### P. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected `error`s. (Probing a down RPC may log a benign network error — note it but it should also surface a UI "Unavailable" badge, not crash.)
- [ ] `list_network_requests` → during config, only **RPC reads** (probe/balances/token metadata) hit the configured endpoints; **no private key or relay key is ever sent over the network** (keys stay in `localStorage`/memory only). Spot‑check request bodies contain no `0x…64hex` private key.

---

## 2. Reporting format

Produce a table:

| Area | Check | PASS/FAIL | Evidence |
|------|-------|-----------|----------|
| A | h1 = "Wallet Sweep" | PASS | `evaluate_script` h1 text |
| … | … | … | … |

End with counts: **# checks · # PASS · # FAIL · # blocked (needs funded wallet)** and a short list of the **top user‑impacting issues** (esp. anything where an error is console‑only, a raw i18n key is visible, a contrast failure in light mode, or the relay‑key file / auto‑wipe regressions below).

---

## 3. Known traps / notes specific to THIS tool

- **Funds gate:** nothing past **"Continue"** can be fully exercised headless — deploy/sweep/revoke/recover all need a funded relay + on‑chain confirmations. Scope those to **UI + validation + error‑state + state‑machine + log‑string** checks; mark the on‑chain execution **blocked / manual**. (Same posture as wallet‑generator's camera step.)
- **The relay key file MUST tell the truth (recently fixed).** §G2 — the downloaded file must warn that the holder can redirect **any still‑delegated EOA to any destination** until revoked, and must say to **DELETE after revoke**. Verify the literal text, not just that a file downloaded.
- **Relay auto‑wipe (recently fixed).** §H — after `recoverRelayGas()` with `sweptSet.size === 0`, `localStorage['wallet-sweep-relayer']` must drop the slug entry and log "Relay key wiped…". A standing relay key left in storage is a security FAIL.
- **Revoke‑complete log line (recently fixed).** §H — full revoke logs "All delegations revoked — recover gas to wipe the relay key". Check the Activity disclosure.
- **"Import" not "Upload".** §0.2 — the keys editor intentionally says **Import** (keys never leave the browser). English proeditor defaults ("Upload"/"Clear") leaking would be an i18n FAIL.
- **Relay is persisted per‑network in `localStorage['wallet-sweep-relayer']`** (a `{ slug: {privateKey,address} }` map) so a reload doesn't strand its gas. Custom networks persist in `localStorage['wallet-sweep-custom-networks']`. To get a clean slate between runs, clear both keys.
- **Readiness is reachability‑only.** The "Ready" badge just means an RPC answered with the right chainId; **7702 support is curated**, and the *definitive* check is the broadcast itself. A "Ready" badge does NOT prove the chain supports 7702.
- **Fee is folded into "Needed".** There is no separate fee payment — the ~$5 service fee is part of the relay funding amount. "Free (member)" only after a passkey‑signed waiver (`ws.fee.free`).
- **Possible bug to verify (not a test step):** the Gnosis Chainlink feed constant in `infra/networks.ts` (`0x678df341fc31947dA4324eC63212874be5a82f8`) is **39 hex chars, i.e. not a valid 20‑byte address** — if any USD‑value display uses it on Gnosis it may break. Out of scope for headless UI testing, but flag if you exercise Gnosis pricing.
- **Sweptset gating of Revoke:** "Revoke all (N)" uses `sweptAddresses` (addresses actually swept this session). After a page reload the in‑memory `sweptSet` is empty even if delegations exist on‑chain → the button shows `(0)` / disabled. Expected, but note it: revoke needs the keys + a same‑session sweep.

---

## 4. Known‑good reference (as of this writing)

A correct **config** pass: h1 "Wallet Sweep"; 7 mainnet chips each "7702" + "Ready"; pasting the 3 Anvil keys → "3 valid", adding the dup → "1 duplicate", adding `0x123` → "1 invalid"; destination `0x123` → "That doesn't look like a valid address", vitalik → "Valid address"; with all green the "Still needed:" hint vanishes and **Continue** enables. A correct **relay** pass: Download writes a file containing the **!! SECURITY !!** "any destination of their choosing" + "DELETE IT then" text; uploading a mismatched file → "This file does not match your relay key"; uploading the real file → "Saved & verified" and Step 3 (QR + Needed/Balance) reveals; "Start sweep" stays disabled with no funds. If you see English "Upload/Clear" in the keys editor, a visible raw `ws.*` key, a relay file that omits the redirect/delete warning, a relay key surviving in `localStorage` after recover‑with‑no‑delegations, or an error that only appears in the console — those are regressions of fixes already landed.
