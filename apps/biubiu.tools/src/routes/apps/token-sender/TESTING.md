# Token Sender — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/token-sender/TESTING.md`，用 chrome-devtools MCP 把 **Token Sender** (`/apps/token-sender`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 快照/非空截图）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state / flow / edge case below, and reports a `Area | Check | PASS/FAIL | Evidence` table. It also captures the hard‑won quirks of *this* app so the agent doesn't re‑discover them.

- App URL: `http://localhost:5173/apps/token-sender`
- What it does: **batch‑send a native coin or an ERC‑20 token to many recipients at once**, from the user's own self‑custodial **passkey Safe** (Safe 1.4.1 + MultiSend). Recipients are chunked into batches of **100**; each batch is **one wallet signature** and includes a **per‑batch service fee** (3‑tier: code‑fixed → $5‑equivalent → fallback 1 native coin; **waived for Pro members** after a passkey proof). The send is a 4‑step wizard (Token → Recipients → Review → Send), is **pausable & resumable**, and keeps a **History** of past sends.
- UI language is locale‑dependent; the **default reference locale is en**, so the English strings below are exactly what should render (the app also ships zh + 13 more).

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/token-sender` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`) or ask the user.
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. **Desktop viewport**: `resize_page` to `1280×900`. **Mobile**: `390×844`.

### 0.1 ⚠️ The single biggest scoping fact: **the wizard is behind a WalletGate**

`token-sender/+page.svelte` wraps Steps 1‑4 in `<WalletGate>`. Until a **smart‑contract wallet** is connected you see **only**:

- The hero (`h1` **Token Sender** + subtitle), the **safety card**, and
- A gate card: heading **"Connect a wallet to start"** (`ts.gate.title`), body **"You send from your own self‑custodial wallet…"** (`ts.gate.desc`), and a **"Connect wallet"** button (`auth.connect.button`).
- The Stepper, Step 1‑4 panels, fee, preflight, and Send are **NOT in the DOM** until connected.

Connecting requires a **passkey / browser wallet / WalletPair QR** and the actual send needs **on‑chain funds + per‑batch fingerprint signatures** — **none of that is automatable headless.** So:

- **Fully testable headless (no wallet):** hero, safety card (collapsed/expanded), the gate copy + button, SEO/`<title>`, i18n, both themes, responsive, console hygiene, and the **Add‑custom‑network** + **RPC‑edit** modals are NOT reachable from the gated UI either (they're inside Step 1) — see §0.4 for how to exercise Step‑1+ logic via the store without a wallet.
- **UI + validation + state‑machine only, via the store (`window`‑exposed? no — see §0.4):** Step 1‑4 rendering, recipient parsing/validation, batch math, fee total math, **resume‑skip invariant**. These can be driven by forcing `s.step` and seeding `s.parsed` through an injected module import OR by faking a connected wallet — both are fiddly; the realistic plan is to **assert the gate + store logic** and scope the live send to "needs a funded passkey wallet / manual step."
- **Needs a funded wallet + passkey (manual / out of scope for headless):** real `Send now`, real batch signing, real preflight balance read, real fee charge, the Pro fee‑waiver passkey proof, and the **on‑chain resume**. Verify the **resume‑skip invariant at the unit level** (§1 §H) instead — there is a store/orchestrator test surface for it.

### 0.2 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock.** On *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1‑2 MCP calls**, then it may relock. So **don't chain long click sequences** — batch "set state + click" into one `navigate_page` `initScript` or one `evaluate_script`.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` sometimes returns an all‑white frame, and after a burst of interactions the tab can navigate itself to `about:blank` (HMR / relay churn). Before trusting a screenshot, sanity‑check:
  ```js
  evaluate_script: () => ({ url: location.href, h1: document.querySelector('h1')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null → re‑navigate and redo setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions.**
- **Batch work into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round‑trip can reset the page.
- **Svelte 5 binding.** `el.value = …` does NOT trigger `bind:value`. Use the native setter + dispatch:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '0x…'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (Use `HTMLTextAreaElement.prototype` for the RPC‑edit `<textarea>`.)
- **Theme.** `navigate_page` `initScript`: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`; the store deep‑merges defaults so writing only `theme` is safe.
- **i18n raw‑key caveat.** The message‑catalog JSON embedded in the HTML for hydration **legitimately contains raw keys** (e.g. `ts.step1.heading`). Only judge **visible rendered text**; a visibly rendered raw key (e.g. you SEE the literal `ts.step1.heading` on screen) **IS a FAIL**.

### 0.3 The recipients editor (the #1 interaction trap, same engine as Balance Radar)

The "Recipients" box is **not** a plain `<textarea>` — it's `@shelchin/proeditor-sveltekit`'s `LineEditor` (virtual‑scroll, hidden `textarea.pe-hidden-input` + rendered overlay). So:

- ❌ `fill` does nothing useful. ❌ Setting `.value` programmatically gets **reset** by the editor. ❌ Synthetic paste leaves the valid‑count at 0 until a real keystroke nudges it.
- ✅ **Reliable recipe — real keystrokes:**
  1. `evaluate_script`: `document.querySelector('main textarea.pe-hidden-input')?.focus()`
  2. `type_text` the lines joined by `\n`. **specified** mode = `address,amount` per line (e.g. `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01`). **equal** mode = `address` per line.
  3. `press_key` `Enter` (commits last line), then `press_key` `Backspace` (removes trailing empty line).
  4. Verify the status bar shows a **valid** count and the parse‑stats chips appear (e.g. **"2 recipients"**, **"Total: 0.02 ETH"**, **"1 batch(es) · 1 confirm(s)"**).
- Behaviour (not bugs): the line **under the cursor** renders amber and isn't counted until you move off it; a **trailing empty line** shows a ⚠ count → that's why steps 3 exist.
- **Upload** opens a `FileUploadModal` (1 column **Address** in equal mode, 2 columns **Address** + **Amount (SYM)** in specified mode). It's portalled to `<body>` (`.ts-upload-portal`) — assert it covers the viewport, not clipped inside the card.
- This editor only lives in **Step 2**, which is behind the WalletGate (§0.1). To reach it headless see §0.4.

### 0.4 Reaching Step 1‑4 without a real wallet (best‑effort, may not be possible)

There is **no `window`‑exposed store and no WebMCP relay** on this page (unlike Balance Radar). The wizard genuinely requires `walletStore.isConnected`. Options, in order of preference:

1. **Connect a wallet manually** (passkey on a machine with platform authenticator, or a funded browser wallet) and drive the real flow. This is the gold path; everything after the gate becomes testable.
2. **If you cannot connect:** scope Steps 1‑4 / send / resume to *"needs a funded wallet — manual"* and assert them at the **unit level** (`store.svelte.ts` getters `totalBatches`, `feeTotal`, `remainingBatches`, `canProceedFromRecipients`, and `core/parse.ts`, `core/orchestrator.ts` `runSend` with `completedBatchIndices`). Run `bun run test` (or the relevant vitest filter) and cite the assertions for §G/§H. **Do not mark the live send PASS off a unit test** — mark it "covered by unit test; live flow pending funded wallet."
3. Do **not** fake `isConnected` by monkey‑patching — `prepareReview`/`send` call `createConnectedWallet(walletStore.activeWallet)` and will throw; you'd be testing a broken stub, not the app.

### 0.5 Test data (well‑funded mainnet addresses + real tokens)

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — always has ETH
0xab5801a7d398351b8be11c439e05c5b3259aec9b   # has ETH on multiple chains
0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE   # SHIB — real ERC-20 on Ethereum (symbol SHIB, 18 decimals)
0xA0b86991c6218b936e08b020bC70Cad6c7DBc1D3 ... wait, use canonical USDC below
0xA0b86991c6218b936e08b020bC70Cad6c7DBc1d6   # USDC — Ethereum (symbol USDC, 6 decimals)  ← good for "decimals != 18" checks
```
- **For "Load token" decimals check** prefer **USDC** (6 decimals) so a wrong‑decimals regression is obvious vs. the default 18.
- **Bogus token for the error path:** `0x000000000000000000000000000000000000dEaD` (no ERC‑20 metadata → `token-read-failed`).
- **Malformed token (validation path, no network call):** `0x123` → `invalid-token-address`.
- **Bogus RPC for add‑network failure test:** `https://invalid.rpc.example`.
- **A real RPC for the add‑network "Check chain" success path:** `https://eth.llamarpc.com` (Ethereum, chainId 1 — has MultiSend 1.4.1).

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / gate (no wallet) — fully headless
- [ ] Page returns 200; `<h1>` = **Token Sender**; subtitle = **"Send a coin or token to many addresses at once — from your own wallet."**
- [ ] `document.title` contains **"Token Sender - BiuBiu Tools"** (`ts.meta.title`).
- [ ] **Safety card** shows heading **"Your keys, your coins"** + three chips: **"Key stays on your device"**, **"BiuBiu can't move funds"**, **"Open source"**, and a **"Why safe?"** link‑button.
- [ ] Click **"Why safe?"** → expands the detail paragraph mentioning **Vela Wallet** (link to `getvela.app`) + "(Safe 1.4.1 + passkey)"; the button label flips to **"Hide"**.
- [ ] **WalletGate** is visible: heading **"Connect a wallet to start"**, body starts **"You send from your own self‑custodial wallet…"**, button **"Connect wallet"**. The **Stepper and Step panels are NOT present** (`take_snapshot` → no "Choose network & token" text).
- [ ] `list_console_messages` → no `error` entries.

### B. Connect wallet (UI only, headless) — modal opens
- [ ] Click **"Connect wallet"** → an **AuthModal** opens (title **"Connect Wallet"** `auth.connect.title`), offering BiuBiu Built‑in / Browser wallets / WalletPair. (Actually completing connection needs a passkey/extension/QR — scope to "modal opens + options render"; full connect is manual.)
- [ ] Close the modal (backdrop / ✕) → returns to the gate without console errors.

> Everything below **C–H requires a connected wallet** (see §0.1/§0.4). If you connected manually, run them live. If not, run the **parsing/fee/resume logic at the unit level** and mark the live UI checks "pending funded wallet."

### C. Step 1 — Network & token (needs wallet)
- [ ] Stepper renders 4 steps: **Token / Recipients / Review / Send**; step 1 active.
- [ ] Heading **"Choose network & token"**. A **NetworkGrid** lists the built‑ins: **Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Avalanche, Gnosis**, plus **Polygon Amoy (Testnet)** (its symbol line ends **" · testnet"**), plus an **"Add network"** dashed chip (hint **"custom EVM chain"**). **Ethereum** is preselected.
- [ ] Below the grid: an **"RPC:"** line showing the first RPC (`https://eth.llamarpc.com`) + an **"Edit RPC"** link.
- [ ] Token toggle shows **"Native (ETH)"** (selected) and **"ERC20"**. Selecting **ERC20** reveals an address input (placeholder **"0x… token contract address"**) + a **"Load token"** button.
- [ ] **Continue** is **enabled** for native (always proceedable); for ERC20 it's **disabled until** a token is loaded.

### D. Step 1 — ERC20 token load + validation (needs wallet, hits RPC)
- [ ] ERC20 + paste **USDC** `0xA0b86991c6218b936e08b020bC70Cad6c7DBc1d6` → **Load token** → shows **"✓ USDC · 6 decimals"** (`ts.step1.tokenMetaOk`). Verify **6**, not 18 (decimals regression catcher).
- [ ] ERC20 + paste `0x123` → **Load token** → inline error **"Invalid token contract address"** (`ts.errors.invalidTokenAddress`) — surfaced in the UI, not console.
- [ ] ERC20 + paste `0x000…dEaD` → **Load token** → button shows **"Loading…"** then inline error **"Couldn't read the token — check the address and network"** (`ts.errors.tokenMetaFailed`).
- [ ] (No wallet edge) If somehow triggered without a wallet → error **"Connect your wallet first"** (`ts.errors.connectWallet`). Normally unreachable behind the gate.
- [ ] Switching the network **clears** a previously loaded token meta (`setNetwork` resets `tokenMeta`/`parsed`) → Continue goes back to disabled for ERC20.

### E. Step 2 — Recipients + parsing/validation (needs wallet)
- [ ] Heading **"Add recipients"**. Mode toggle: **"Amount per line"** (specified, default) and **"Split equally"**.
- [ ] **specified mode**, label hint is **`"address,amount" per line`**. Enter (recipe §0.3):
  ```
  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01
  0xab5801a7d398351b8be11c439e05c5b3259aec9b,0.01
  ```
  → parse‑stats chips: **"2 recipients"**, **"Total: 0.02 ETH"**, **"1 batch(es) · 1 confirm(s)"**.
- [ ] **Invalid address** line (e.g. `0x123,1`) → flagged in the editor's issues drawer (**"Invalid address"** `ts.editor.invalidAddress`), **not** counted.
- [ ] **Missing amount** in specified mode (`0xd8dA…A96045`) → **"Missing amount"** (`ts.editor.missingAmount`).
- [ ] **Invalid / zero amount** (`0xd8dA…A96045,0` or `,abc`) → **"Invalid amount"** (`ts.editor.invalidAmount`); zero is rejected (`amount <= 0n`).
- [ ] **Duplicate address** (same address twice) → counted as duplicate (**"Duplicate"** / **"Duplicate address"**), only first kept; validCount reflects de‑dup.
- [ ] **equal mode**: toggle → a **"Total amount to split (ETH)"** input appears (placeholder **"e.g. 100"**), and the recipients hint becomes **"one address per line"**. Enter 2 addresses + total `0.02` → **"2 recipients"**, **"Total: 0.02 ETH"**. (Dust goes to the first recipient — `per + dust` — verify total stays exact.)
- [ ] **Batch math:** enter **101** valid recipients → chip reads **"2 batch(es) · 2 confirm(s)"** (chunk size 100; `Math.ceil(101/100)=2`). At **>1000** recipients a warning note appears: **"That's about N wallet approvals…"** (`ts.step2.largeWarning`).
- [ ] **Continue** is disabled until `validCount > 0` AND `totalAmount > 0` (e.g. equal mode with addresses but empty total stays disabled).
- [ ] **Back** returns to Step 1 with selections preserved.

### F. Step 3 — Review, fee, preflight (needs wallet + funds)
- [ ] Review grid shows **Network / Token / Recipients / Total to send / Batches / Confirms** with correct values (Confirms == Batches).
- [ ] **Fee card**: shows **"Calculating fee…"** then a fee. For non‑member it's the 3‑tier quote with a source note — one of **"$5 equivalent"** (`ts.fee.usd`, may append `· ETH ≈ $NNNN`), **"Fixed (configured for this network)"** (`ts.fee.config`), or **"1 native coin (price unavailable)"** (`ts.fee.fallback`). When members waive, **"Free"** + **"Free (Premium member)"** (`ts.fee.memberFree`).
- [ ] **Per‑tx fee line** (when fee > 0): **"{fee} ETH per transaction × {count} batch(es)"** (`ts.step3.feePerTx`) — confirms the **fee is charged per batch**, and `feeTotal` (header total) = per‑batch × batches.
- [ ] **MemberFeeWaiver** control renders one of: **"Pro service fee waived"** (active), **"Waive fee with Pro"** button (Pro, unsigned), **"Upgrade to Pro to waive this service fee."** (logged‑in non‑Pro), or **"Log in with your Pro account…"** (logged out). The passkey proof (button) needs a real Pro passkey → manual.
- [ ] **Preflight**: **"Checking your balance…"** then either **"✓ Balance is sufficient"** (+ "(plus network gas, paid in ETH)") OR a **shortfall card** (**You have / Need(+ gas) / Short by**, monospace amounts) with a **"Deposit ETH to your wallet"** button (biubiu) or **"Top up your wallet…"** hint, plus **"I've deposited — re‑check balance"**.
- [ ] **Approvals note** (when batches>0 & send supported): info callout **"You'll approve {count} time(s) in your wallet — one per batch. Keep this tab open until it finishes."** (`ts.step3.approvalsNote`).
- [ ] **Review error** path: if `prepareReview()` throws (e.g. all RPCs unreachable) → an inline **`role="alert"`** banner **"Couldn't prepare the review — {error}"** (`ts.errors.reviewFailed`) with a dismiss ✕ (`ts.alert.dismiss`). Surfaced in UI, not console.
- [ ] **Send now** is **disabled** while fee/preflight loading, on unsupported (custom) networks, or when preflight `!ok`. Enabled only when `pre.ok === true`.

### G. Custom network + RPC modals (needs wallet to reach Step 1)
- [ ] **Add network** chip → modal **"Add custom network"** with fields Name / Chain ID / Native symbol / RPC URL / Explorer tx URL (optional).
- [ ] Submit with a blank required field → inline error **"Name, chain ID and RPC are required"** (`ts.addNetwork.errorRequired`).
- [ ] **"Check chain"** with a real RPC that has MultiSend (`https://eth.llamarpc.com`, chainId 1) → **"✓ Safe MultiSend 1.4.1 found…"** (`ts.addNetwork.multiSendOk`). With `https://invalid.rpc.example` → **"⚠ MultiSend 1.4.1 not found here…"** (`ts.addNetwork.multiSendMissing`). (`verifyMultiSend` does a raw `eth_getCode` POST; check `list_network_requests`.)
- [ ] **Add** a custom network → it appears in the grid with a **" · custom"** symbol suffix and a **×** remove button, and becomes selected.
- [ ] On a **custom** network Step 1 shows the warning note **"Custom network: reading balances & tokens works here, but sending needs Safe infra…"** (`ts.step1.customNetworkNote*`) with a **"Chain Setup"** link, and on Step 3 **Send now stays disabled** (`sendSupported === false`) with **"This is a custom network — sending isn't enabled yet…"** (`ts.step3.customNetworkNoteBefore`).
- [ ] Reload → custom network & RPC overrides **persist** (loaded via `hydrateCustom()` from IndexedDB on mount).
- [ ] **Edit RPC** (built‑in net) → modal **"RPC · Ethereum"**, textarea seeded with current RPCs; **Save** sets an override (a **"custom"** tag appears next to RPC line); **"Restore default"** clears it. For a custom net the modal shows **"Remove network"** (danger) instead.

### H. ★ Pause / Resume — the RECENTLY‑FIXED skip invariant (CRITICAL)
> The fix: `resume()` passes `completedBatchIndices` (a `Set` of already‑succeeded batch indices) into `runSend`, and `runSend` does `if (deps.completedBatchIndices?.has(i)) continue;`. **Already‑paid recipients must NOT be paid again, and the per‑batch fee must NOT be re‑charged.**

- [ ] **Step 4 progress UI** (live, needs wallet+funds): while running, shows **"Batch {current} / {total}"**, a phase label (one of **Starting… / Building transaction… / Checking… / Estimating gas… / Sign in your wallet… / Submitting… / Waiting for confirmation… / Confirmed / Failed** — `ts.phase.*`, never a raw `signing`), a progress bar, and a **"Pause (after current batch)"** button.
- [ ] **Pause**: click Pause mid‑run → after the current batch completes the run stops, status line **"Paused — {sent} batch(es) sent, {failed} failed/skipped. You can continue below."** (`ts.step4.aborted`), and a **"Continue — send remaining {count} batch(es)"** button appears (count == `remainingBatches` == totalBatches − successful results).
- [ ] **Resume does NOT re‑send batch 0** (the invariant). With e.g. 250 recipients (3 batches), pause after batch 0 succeeds, then Resume → only batches 1 & 2 are sent. **Evidence to capture:** the batch list keeps batch 1's original tx hash (no new tx for batch 1), and **only 2 new wallet signatures** are requested on resume (not 3). The completed batch's recipients receive **no second transfer** and the **fee is charged 3× total, not 4×**.
- [ ] **Headless substitute for the invariant** (no wallet): unit‑test `runSend` with `completedBatchIndices: new Set([0])` and a stub wallet whose `sendBatch` records calls → assert `sendBatch` is invoked for indices **1,2 only** and never for **0**; assert the returned `results` excludes index 0 (so it's not double‑counted) and `failures` is empty. Cite the test name/file. (See `core/orchestrator.ts` `runSend`.)
- [ ] **Completion states**: all good → **"✓ Done — {sent} batch(es) sent successfully."** (green); some failed → **"Completed with issues — {sent} sent, {failed} failed."** (amber, `.partial`). Failures render as red `err-row` rows (`Batch N` + error). **"New send"** resets the wizard.

### I. History
- [ ] After at least one send, a **"History"** card lists records (most recent first, up to 50). Each row: token symbol + network name + a status **badge** (`completed` green / `partial` amber / `failed` red) + **"{count} recipients · {date}"** meta.
- [ ] Click a row → expands per‑batch detail (**"Batch N"** + **"{count} sent"** or the error, + explorer tx links). Chevron rotates.
- [ ] History persists across reload (loaded via `loadHistory()` on mount from IndexedDB).
- [ ] **No history card** is shown when there are zero records (clean empty state — the whole section is `{#if s.history.length > 0}`).

### J. Loading / skeleton / error‑banner states
- [ ] Fee card shows **"Calculating fee…"** during the quote; preflight shows **"Checking your balance…"** / re‑check shows **"Checking…"**.
- [ ] Token load shows **"Loading…"** on the button while fetching.
- [ ] Send phase shows the animated progress bar (width tracks `results.length / totalBatches`).
- [ ] Any failure (review prepare, batch send, token read) **surfaces in the UI** (inline alert / err row / shortfall card) — **never console‑only**. Verify with `list_console_messages` that errors aren't *only* there.

### K. Responsive
- [ ] **390×844**: hero/safety/gate stack; the safety chips wrap; the NetworkGrid collapses to a single column (`minmax(150px,1fr)`); `.panel-actions` / `.modal-actions` become **column‑reverse full‑width** buttons (primary on top via reverse); the recipients editor and review grid don't overflow horizontally; the Add‑network modal `.two-col` collapses to 1 column. No clipping.
- [ ] **1280×900** (and ~768px): centered card, `max-width: 860px` respected, layout intact.

### L. Theme correctness (BOTH themes)
- [ ] **light** (`theme:'light'`): every card is delineated by border + `--shadow-sm` on the page (**no white‑on‑white**); inputs/toggles legible; selected network chip uses `--accent-subtle` tint + accent border; the **shortfall** card's red border/`Short by` and the **danger** "Remove network" button stay readable (danger text uses `--bg-elevated` on `--error` — verify it's not invisible). Status `alert` uses `--error-subtle`/`--error`.
- [ ] **dark**: default look intact; phase label accent‑colored; fee/info callouts readable on `--bg-sunken`.
- [ ] Screenshot A (gate) and, if connected, C/F/H in **both** themes; confirm no contrast failures.

### M. i18n (15 locales)
- [ ] Switch locale (settings panel / locale switcher) to at least one non‑en and one zh variant → all **visible** strings translate. **No raw `ts.*` keys visible on screen** (e.g. seeing literal `ts.step2.batches` = FAIL; the embedded hydration JSON having it is fine — §0.2).
- [ ] Spot‑check interpolated strings render their values, not placeholders: **"{count} recipients"**, **"{count} batch(es) · {count} confirm(s)"**, **"Native ({symbol})"**, **"✓ {symbol} · {decimals} decimals"**.
- [ ] The recipients editor's own UI (status "valid", Issues drawer, Upload modal column labels) is localized too.

### N. Accessibility / keyboard
- [ ] `Tab` through safety link, Connect button, toggles, network chips, link‑buttons, primary buttons → each shows a **visible focus ring** (`:focus-visible` outlines are defined for `.btn`, `.toggle button`, `.link-btn`, `.hist-head`, `.status-x`).
- [ ] The review‑error dismiss ✕ is a real `<button>` with `aria-label` (**"Dismiss"**), keyboard‑activatable; the alert container has `role="alert"`.
- [ ] History row toggles are `<button>`s (keyboard‑expandable).
- [ ] Network "remove custom" `×` has `aria-label="remove network"`.

### O. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected `error`s (a 4xx from a deliberately bogus RPC during the §G failure test is expected and should be *handled*, not an uncaught error).
- [ ] `list_network_requests` (when connected/loading): token‑meta and preflight reads hit the network's configured RPC (`eth.llamarpc.com` etc.); add‑network "Check chain" does a single `eth_getCode` POST to the entered RPC. No calls to unexpected origins.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non‑blank) screenshot. For checks you could not run headless, mark **`N/A (needs funded wallet)`** with a one‑line reason, and where applicable cite the unit‑test evidence (esp. §H resume invariant). End with: **# checks, # pass, # fail, # blocked**, and the top user‑impacting issues.

## 3. Known traps / notes specific to this tool

1. **Everything past the safety card is gated by a real wallet.** ~70% of the UI (Steps 1‑4, modals, send, history‑after‑send) is unreachable headless. Plan for it: assert the gate + logic, scope the rest. Don't fake `isConnected` — the send path constructs a real wallet and will throw.
2. **No `window` store, no WebMCP relay** here (unlike Balance Radar). You can't poke the wizard from the console the easy way; drive via a connected wallet or unit tests.
3. **Recipients editor is a virtual‑scroll `LineEditor`, not a textarea** — use the real‑keystroke recipe (§0.3); `.value=` is reset.
4. **Fee is per‑batch, charged on every transaction** (header total = per‑batch × batches). A 250‑recipient send = 3 batches = **3 fees + 3 signatures**. Members waive to 0 only after a passkey proof in‑session (observer‑wallet bypass is intentionally blocked).
5. **Resume must skip completed batches** (the fixed behavior). The risk class is double‑spend / double‑fee — verify batch 0 is NOT re‑sent on resume (§H). The orchestrator skips via `completedBatchIndices`; `resume()` rebuilds that Set from `this.results`. Note `persistHistory` on resume passes `this.results` (cumulative) — confirm History doesn't drop the pre‑pause batches.
6. **Custom networks can read but not send** (`sendSupported = !isCustom`). Sending is hard‑disabled with a Chain‑Setup pointer — that's intended, not a bug.
7. **Test data caveat in §0.5:** use the canonical 6‑decimal **USDC** `0xA0b86991c6218b936e08b020bC70Cad6c7DBc1d6` and 18‑decimal **SHIB** `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` (both Ethereum mainnet). The 6‑vs‑18 decimals is the best regression catcher for `loadTokenMeta`/amount parsing.
8. **`distributionMode` toggle re‑parses** with the new mode but keeps `recipientsText`; switching specified↔equal can flip lines valid/invalid (specified needs an amount column). Expect counts to change on toggle — verify it's coherent, not stale.
9. **Possible bug to verify (parse de‑dup vs. editor de‑dup):** the editor (`RecipientsEditor`) only forwards *its own* valid lines (with `detectDuplicates`), and `core/parse.ts` *also* de‑dups. With duplicate addresses, confirm the **parse‑stats count matches what the editor shows** (no off‑by‑one between the two de‑dup passes). If they disagree, that's a finding.
10. **Possible UX gap to verify:** `prepareReview()` early‑returns silently if `!walletStore.activeWallet` (comment says unreachable behind the gate). If you ever reach Step 3 with the wallet disconnected mid‑flow, the fee/preflight just won't populate and **no error shows** — note if reachable.
