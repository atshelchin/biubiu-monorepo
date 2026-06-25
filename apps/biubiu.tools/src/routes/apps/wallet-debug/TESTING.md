# Wallet Lab — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/wallet-debug/TESTING.md`，用 chrome-devtools MCP 把 **Wallet Lab 钱包调试台** (`/apps/wallet-debug`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。需要连接钱包才能看到的面板，按文档说明 scope 成『仅 UI/校验/错误态』。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- App URL: `http://localhost:5173/apps/wallet-debug`
- What it does: a **Sequence-demo-style debugging console for biubiu's smart-contract wallets**. You connect a wallet — **biubiu passkey Safe** / **injected EIP-6963** / **walletpair (scan QR)** — then exercise it: read account state + native balance, verify on-chain code, switch / add networks, **signMessage** + **signTypedData** (with ERC-1271 / WebAuthn-P256 verify), probe **EIP-5792 getCapabilities**, and **build + send an atomic batch** (MultiSend `sendCalls`). Every action streams into a JSON **Output** console. **All wallets are gated to smart-contract accounts.**
- UI language is locale-dependent; both EN and zh strings are quoted below so you know what to look for.

### ⚠️ The single biggest scoping fact (read first)

The whole tool is wrapped in a **`WalletGate`** (`$lib/auth/WalletGate.svelte`). With **no wallet connected** the page renders **only the gate card** — *none* of the StatePanel / NetworkPanel / TxBuilder / SignPanel / Capabilities / Output panels exist in the DOM. `activeWallet` is derived from either a **passkey login** (`authStore.user`, real WebAuthn) or an **external EIP-1193 wallet** (EIP-6963 injection or a live walletpair scan). **None of these can be completed headless / by MCP** — passkey needs a platform authenticator, injection needs a real extension, walletpair needs a phone to scan.

➡️ **Therefore: the connected-state panels (§D–§J) are testable as "UI + validation + error-state only" *only if* a wallet is connected by a human first.** If you cannot get a wallet connected, those sections are **BLOCKED — needs a funded/real wallet (manual step)**, and you fully test the gate (§B), responsive/theme/i18n of the gate, the AuthModal picker UI (§C), and console hygiene. Mark blocked items `BLOCKED` (not FAIL) with the reason. See §3 for the one supported way to *inspect* the connected layout if a human connects for you.

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/wallet-debug` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to **1280×900**. Mobile: **390×844**. (Layout switches to the 2-column grid at `min-width:1024px`; below that everything stacks.)

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*, the dedicated automation profile is stuck. Recover with:
  ```bash
  # cheap unlock first (Chrome still alive) — highest success rate
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck → hard reset
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  then `navigate_page` again. **Rule of thumb: one unlock buys ~1–2 MCP calls** before it may relock — so batch your work.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions / HMR the tab sometimes navigates itself to `about:blank`. Before trusting a screenshot, sanity-check with `evaluate_script`:
  ```js
  () => ({ url: location.href, h1: document.querySelector('h1')?.textContent })
  ```
  Expect `url` ending `/apps/wallet-debug` and `h1` = **Wallet Lab** (zh: **Wallet Lab 钱包调试台**). If `url` is `about:blank` or `h1` is null → re-navigate and redo setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions**; use screenshots for visual spot-checks only (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip can reset the page.
- **Svelte 5 binding.** `el.value=...` does **not** trigger `bind:value` (used by the search box, sign textareas, and every TxBuilder input). Use the native setter + an input event:
  ```js
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'xxx');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (Or just `type_text` after focusing the field — simpler and reliable.)
- **Theme.** `navigate_page` `initScript`:
  ```js
  try { localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' })); } catch(e){}
  ```
  (or `'dark'`). Applies via `<html data-theme>`. Per-field merge with defaults, so writing only `theme` is safe.
- **i18n raw-key caveat.** The message-catalog JSON is embedded in the HTML as hydration data and **legitimately contains raw keys** (e.g. `wd.tx.send`). Only judge **VISIBLE rendered text**. A visible raw key on screen (e.g. you literally see the text `wd.sign.signMessage`) **IS a FAIL**.

### 0.2 Driving the connect flow (and why you usually can't finish it)

Clicking the gate button **"Connect wallet"** (zh **连接钱包**) opens the **AuthModal** picker. You can fully assert the picker UI but **cannot complete any path headless**:

- **BiuBiu Built-in** (recommended) → "Sign in" → calls `authStore.login()` → real **WebAuthn passkey assertion** prompt. No platform authenticator in MCP Chrome ⇒ cannot complete. (You *could* register first via "Create new wallet" → name → risk-confirm → `navigator.credentials.create` — also blocked headless.)
- **Browser wallets** (EIP-6963) → list is empty in clean MCP Chrome ("No browser wallet detected." / zh **未找到浏览器钱包。** via `auth.connect.noInjected`). Connecting needs a real extension *and* the address must be a smart-contract account (plain EOAs are rejected with `auth.connect.notSmartAccount`).
- **WalletPair (scan QR)** → shows a QR + verification code; requires a phone to scan. Cannot complete headless.

So: **assert the modal renders all three options + correct copy, then close.** Do not expect a connected state from automation alone.

### 0.3 Test data (well-funded mainnet addresses & contracts)

For when a wallet *is* connected (manual) and you fill the TxBuilder / read balances:

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — always has ETH (valid "To" address)
0xab5801a7d398351b8be11c439e05c5b3259aec9b   # has ETH on multiple chains
```
- ERC-20 token for the preset (mainnet USDC, 6 decimals): `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`.
- ERC-20 token (Base USDC, 6 decimals): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Invalid-address test data: `0x123` (too short), `not-an-address`, empty.
- Invalid calldata test: `0xZZ` / `0x1` (odd length) → should be rejected by the row-data regex.

### 0.4 Built-in (curated) networks — exact names + chainIds

The Networks quick-pick renders **12 chips** in this order (from `$lib/wallet/infra/chains.ts`). The chip **label is the display name**; default target chain is **Base (8453)**:

```
Ethereum 1 · BNB Chain 56 · Polygon 137 · Arbitrum 42161 · Optimism 10 · Base 8453
Avalanche 43114 · Gnosis 100 · Unichain 130 · Tempo 4217 · Monad 143 · World Chain 480
```

---

## 1. Test checklist (execute each; report PASS/FAIL/BLOCKED + evidence)

### A. First load (gate) — unconnected default state
- [ ] Page returns 200 and renders; `<h1>` = **Wallet Lab** (zh: **Wallet Lab 钱包调试台**); subtitle (`wd.subtitle`) mentions **debugging playground … connect, inspect, sign, and send atomic batches** (zh: 调试台……连接、查看、签名……原子批量交易).
- [ ] With no wallet, the body is **only the gate card** (`section.wallet-gate`): heading = **Connect a smart-contract wallet** (zh: **连接一个智能合约钱包**, from `wd.gate.title`); description = `wd.gate.desc` ("…built-in biubiu passkey wallet, an injected EIP-6963 wallet, or a scan-paired wallet. All must be smart-contract accounts." / zh equivalent).
- [ ] A single primary button **Connect wallet** (zh **连接钱包**, `auth.connect.button`) is visible; **no** StatePanel/Networks/TxBuilder/Sign/Capabilities/Output panels exist (`document.querySelectorAll('section.panel').length === 0`).
- [ ] `list_console_messages` → no `error` entries (a chain-logo 404 is **not** here yet because Networks only renders post-connect).

> Assertion helper:
> ```js
> () => ({
>   h1: document.querySelector('h1')?.textContent,
>   gate: document.querySelector('.wallet-gate h2')?.textContent,
>   gateBtn: document.querySelector('.wallet-gate .gate-btn')?.textContent?.trim(),
>   panels: document.querySelectorAll('section.panel').length
> })
> ```

### B. Gate card — responsive / theme / i18n / a11y
- [ ] **Click** the gate button → **AuthModal** opens (a `ResponsiveModal`, title **Connect Wallet** / zh **连接钱包**).
- [ ] **light** theme: gate card is clearly delineated (border + `--shadow-md`) on the white page — **no white-on-white**, button uses accent green and is legible.
- [ ] **dark** theme: card on dark panel, text legible, accent button visible.
- [ ] **390px**: card centered, padding sane, button reachable, no horizontal overflow. **1280px**: card centered with the page `max-width:1180px`.
- [ ] i18n: switch locale (settings ⚙ or `localStorage`), gate heading/desc/button all translate; **no raw keys** (`wd.gate.*`, `auth.connect.button`) visible.
- [ ] a11y: `Tab` reaches the gate button; it shows a focus indicator and activates on **Enter**.

### C. AuthModal picker (UI only — cannot complete a connection)
- [ ] Modal shows the **recommended biubiu** option: name **BiuBiu Built-in** (zh **BiuBiu 内置钱包**, `auth.connect.biubiu`) + a **Recommended** badge (zh **推荐**).
- [ ] Section label **Browser wallets** (zh **浏览器钱包**); since MCP Chrome has no extension, it shows either **Looking for wallets…** briefly (`auth.connect.discovering`) then **No browser wallet detected.** (zh **未找到浏览器钱包。**, `auth.connect.noInjected`).
- [ ] **WalletPair (scan QR)** option present (zh **WalletPair（扫码）**, `auth.connect.walletpair`).
- [ ] Click **biubiu** → switches to "Sign in" view (`auth.login.*`); clicking the sign-in button triggers a **WebAuthn prompt** (expected; **cannot complete headless** → record BLOCKED, then `handle_dialog`/cancel or close modal).
- [ ] Click **WalletPair** → a QR (`.qr-wrap svg`) + verification code (`.fingerprint-code`) render; cannot scan headless → **Back** (`auth.connect.back`) returns to picker.
- [ ] Modal copy is **localized** in all tested locales; **no raw `auth.*` keys** visible.
- [ ] Close the modal (Esc / overlay / ×) → returns to the gate without console errors.

> **Everything below (§D–§J) requires a connected smart-contract wallet.** If none is connected, mark them **BLOCKED — needs real/funded wallet**. If a human connects one (e.g. biubiu passkey on Base), proceed and assert UI + validation + error-states; only the *on-chain success* of `sendCalls` needs gas/funds.

### D. WalletBar + Account state (post-connect)
- [ ] A sticky **WalletBar** appears above the panels: kind chip (**biubiu** / **Injected** / **WalletPair**, from `wd.kind.*`), truncated address `0x1234…abcd` with a **copy** button (tick on click), an **account-type** pill (**Passkey Safe** / **Smart contract** / **EIP-7702**, `wd.acct.*`), the current chain name pill, plus **Switch** (zh **切换**) and **Disconnect** (zh **断开**) ghost buttons.
- [ ] **Account state** panel (`wd.state.title` = "Account state" / zh **账户状态**): rows **Address** (full, copyable), **Account type**, optionally **Wallet chain** (only if the wallet reports a `chainId`), and **Target chain** showing `<name> · <id>` (e.g. `Base · 8453`).
- [ ] **Get balance** (zh **查询余额**) → reads `eth_getBalance` for the target chain → shows e.g. `0.0123 ETH`; an entry `eth_getBalance ✓` lands in Output. On RPC failure an **inline alert** (`.wd-alert.error`) shows the message (not console-only) and Output logs `eth_getBalance ✕`.
- [ ] **Verify smart contract** (zh **验证智能合约**) → reads `eth_getCode`; deployed → green **Deployed contract** (`wd.state.verified`); no code → amber **No code on this chain** (`wd.state.notDeployed`). (A passkey Safe may be counterfactual/undeployed on a fresh chain — amber is **correct**, not a bug.)

### E. Networks panel
- [ ] Eyebrow **Built-in networks** (zh **内置网络**) + hint **Used for reading balances and sending transactions.** (`wd.net.quickPickHint`); **12 chips** in the §0.4 order, each with a logo (or colored letter fallback) + name.
- [ ] The chip matching the target chain has `aria-pressed="true"` and the active accent style; clicking another chip moves selection, updates the WalletBar + State "Target chain", and (for external wallets) attempts `ensureChain` → logs `wallet_switchEthereumChain` in Output.
- [ ] **Add any network** search (`wd.net.searchHeading` / zh **添加任意网络**): typing shows **Searching…** (zh **搜索中…**) then results from ethereum-data; e.g. search `arbitrum` → results list with name + `chainId · SYMBOL`. Empty/garbage query → **No chains found.** (zh **未找到匹配的链。**) after debounce.
  - Drive the input (it's `bind:value` — use the §0.1 native-setter recipe or `type_text` after focusing `input[name="wd-chain-search"]`).
- [ ] Each result has **Add to wallet** (zh **添加到钱包**). Clicking it calls `wallet_switchEthereumChain` → `wallet_addEthereumChain`; on success shows a transient **Added** ✓ (`wd.net.added`, ~1.5s). With no real injected provider it logs `{reason:'no-wallet'}` and does nothing visible — **acceptable**; assert the UI affordance + the Output log rather than a real chain add.

### F. Sign panel (signMessage / signTypedData)
- [ ] Panel **Sign** (zh **签名**). **Message** textarea prefilled `Hello from biubiu.tools 👋`; **Typed data** textarea prefilled with valid EIP-712 JSON (domain `biubiu`, primaryType `Mail`).
- [ ] **Sign message** (zh **签名消息**) → for a real wallet, triggers the wallet's sign UI; on success a truncated **signature** `0x12345678…abcd1234` with copy + **Verify** (zh **验证**) appears, and Output logs `signMessage ✓`.
- [ ] **Verify** → shows `wd.alert.success` **Signature valid · <method>** where method is **local WebAuthn P-256** (biubiu) or **on-chain ERC-1271** (external); a failed verify shows amber **Could not verify signature** (`wd.sign.invalid`); a verify *error* shows red alert.
- [ ] Editing the message **clears** the prior signature + verify result (the `oninput` resets them) — re-sign required. Same for typed data.
- [ ] **Sign typed data** (zh **签名 typed data**): paste **invalid JSON** into the typed textarea then sign → the wallet/lib surfaces an error in the red `.wd-alert.error` (not console-only).
- [ ] For **biubiu** (built-in) an **info** alert is shown explaining the Safe ERC-1271 / 4337-fallback-handler caveat (`wd.sign.erc1271Note`). **Known trap:** on-chain `isValidSignature` may be unavailable for biubiu Safes — a failed *on-chain* ERC-1271 verify here is **expected**, not a regression (see MEMORY `project_wallet_lab`).

### G. Capabilities panel (EIP-5792)
- [ ] Panel **Capabilities** (zh **能力**). Before probing: hint **Probe the account to see its EIP-5792 capabilities.** (`wd.caps.idle`). For biubiu also an info alert **The built-in wallet always supports atomic batches via MultiSend…** (`wd.caps.builtin`).
- [ ] **Probe** (zh **探测**) → renders a JSON `CodeBlock` of capabilities (copyable), or, if empty, **This wallet reported no capabilities for the selected chain.** (`wd.caps.empty`). Output logs `wallet_getCapabilities ✓/✕`.

### H. Transaction builder (atomic batch / MultiSend)
- [ ] Panel **Transaction builder** (zh **交易构造器**); header badge **{n} call(s)** (zh **{n} 条调用**) reflects the call count (starts at **1**).
- [ ] Call card #1 has: **To address (0x…)** input, **Value (native)** + **0x** data inputs, and a **trash** remove button that is **disabled while only one call exists** (`calls.length===1`).
- [ ] **Add call** (zh **添加调用**) → appends an empty call (count→2, remove enabled). **Native transfer** (zh **原生转账**) → appends a call prefilled `value=0.001`. **ERC-20 transfer** (zh **ERC-20 转账**) → reveals a preset sub-form.
- [ ] ERC-20 preset validation (inline red `.wd-alert.error`):
  - empty/invalid **Token address** → **Enter a valid token address.** (`wd.tx.errToken`)
  - invalid **Recipient** → **Enter a valid recipient address.** (`wd.tx.errRecipient`)
  - valid token (USDC `0xA0b8…eB48`) + recipient (vitalik) + amount `1` + decimals `6` → **Add transfer call** (`wd.tx.erc20Add`) appends an encoded `transfer(...)` call (data starts `0xa9059cbb`), sub-form closes.
- [ ] **Gas overrides** disclosure (zh **Gas 覆盖（可选）**) toggles **callGasLimit** + **maxFeePerGas (gwei)** inputs; chevron rotates.
- [ ] **Preview MultiSend** (zh **预览 MultiSend**): with a row missing a valid To-address → inline error **Call #1: invalid to-address.** (`wd.tx.errRowAddress`); with non-hex data (`0x1`) → **Call #1: data must be 0x-prefixed hex.** (`wd.tx.errRowData`). With a valid call (To = vitalik, value blank, data `0x`) → a `CodeBlock` of MultiSend calldata + note **MultiSend calldata the Safe will delegatecall.** (`wd.tx.previewNote`). Clicking Preview again hides it (toggle).
- [ ] **Estimate gas** (zh **预估 Gas**) → with a valid call, sums per-call `eth_estimateGas` and shows **≈ N gas (per-call sum, approximate)** (`wd.tx.estimateResult`); Output logs `eth_estimateGas ✓`. Invalid rows → inline error, no estimate.
- [ ] **Send batch** (zh **发送批量**, primary): disabled when no wallet. With a wallet + valid call, clicking shows a **phase line with spinner** cycling Checking…/Building…/Sign in your wallet…/Submitting…/Waiting for confirmation… (`wd.phase.*`); **on success** a green **Batch sent** + **View transaction** link (only if explorer URL); **on failure** the red `.wd-alert.error` shows the reason. Either way Output logs `sendCalls ✓/✕`. *(On-chain success needs gas/funds — scope to "submits + surfaces result"; a revert/insufficient-funds error that appears IN THE UI is a PASS for the error-handling requirement.)*

### I. Output console
- [ ] Panel **Output** (zh **输出**). Empty state: **// actions you run will appear here** (zh **// 你执行的操作会显示在这里**).
- [ ] After any action, newest-first entries appear: a **✓/✕** badge (green/red), the action name (e.g. `eth_getBalance`), a relative time, a per-entry **copy**, and a pretty-printed JSON `<pre>` (bigints rendered as decimal strings via `safeJson`, **never** `[object Object]` or `12n`).
- [ ] Header shows **Copy all** (zh **复制全部**) + **Clear** (zh **清空**) only when ≥1 entry; **Clear** empties the log.
- [ ] Log is capped (newest 100) — not a likely manual finding, but spamming actions should not grow unbounded.

### J. Responsive + theme (connected layout)
- [ ] **1280px**: 2-column grid — panels column + a **sticky** Output console on the right (`position:sticky` at `top: space-3 + 64px`).
- [ ] **390px**: single column, panels stack, WalletBar wraps (its right-side switch/disconnect wrap; the spacer is hidden ≤640px), TxBuilder call-grid collapses to one column ≤520px, code blocks scroll horizontally — **no overflow/clipping**.
- [ ] **light + dark** for State / Networks / Sign / TxBuilder / Output: cards = `--bg-elevated` + border + `--shadow-sm`; inputs are recessed (`--bg-sunken`) and visible; alerts use semantic tints (error/warn/success/info) legible in both; active network chip uses accent tint — **no white-on-white / grey-on-grey**.

### K. i18n (connected, if reachable)
- [ ] Switch to ≥1 non-en and ≥1 zh variant → every visible `wd.*` string translates (panel titles/descriptions, buttons, hints, placeholders, alerts, phase labels). **No raw keys** (e.g. `wd.tx.send`, `wd.phase.signing`) visible on screen. Note the embedded catalog JSON legitimately contains the keys — judge **rendered** text only.

### L. Accessibility / keyboard
- [ ] `Tab` through: gate button → (post-connect) WalletBar buttons, network chips (`button.chip.wd-focusable`), search input, sign textareas + buttons, TxBuilder inputs/buttons → each shows a **focus ring** (custom controls use `.wd-focusable:focus-visible` = `0 0 0 3px var(--accent-ring)`; inputs get accent border + ring on `:focus`).
- [ ] Network chips expose `aria-pressed`; the quick-pick group has `role="group"` + `aria-label`. Remove buttons have `aria-label` **Remove** (`wd.tx.remove`).
- [ ] Buttons activate on **Enter/Space**; copy buttons have `aria-label`.
- [ ] `prefers-reduced-motion`: spinners slow to 1.2s and button hover-translate is disabled — no violation.

### M. Console / network hygiene
- [ ] `list_console_messages` after the full pass → **no unexpected `error`s**. (Acceptable noise: chain-logo image 404s → fall back to colored letter; ethereum-data search fetches.)
- [ ] `list_network_requests`: balance/code/estimate reads hit the configured RPC for the selected chain; chain search hits ethereum-data; **no surprise third-party calls**. The gate/unconnected page should make **no** RPC calls at all.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL/BLOCKED | Evidence`. For any **FAIL** include the actual observed value/text and a snapshot or (non-blank) screenshot. For **BLOCKED**, state the blocker (e.g. "needs passkey/real wallet — gate not passable headless"). End with a short summary: **# checks, # pass, # fail, # blocked**, and the top user-impacting issues.

| Area | Check | Result | Evidence |
|------|-------|--------|----------|
| A | h1 = "Wallet Lab", gate-only body | | |
| … | … | | |

---

## 3. Known traps / notes specific to THIS tool

- **The gate is the wall.** Everything interesting is behind a connected **smart-contract** wallet, and connection (passkey / EIP-6963 / walletpair) **cannot be completed headless**. Don't FAIL the panel checks for being absent when unconnected — that's by design. If you want to *see* the connected layout without a real wallet, the **only** honest option is to have a human connect (biubiu passkey on this machine), then drive the live page; there is **no** mock/`localStorage` connect shortcut (`activeWallet` derives from `authStore.user` or a live external wallet, not a flag you can set). Do not fabricate a connected state.
- **biubiu ERC-1271 caveat (documented).** biubiu Safes use the 4337 module as their fallback handler, so **on-chain `isValidSignature` may be unavailable** → a failed *on-chain* ERC-1271 verify in §F is **expected**, not a bug. The Sign panel surfaces this in an info alert and falls back to local WebAuthn P-256 verify for biubiu. (See MEMORY `project_wallet_lab`.)
- **Default target chain is Base (8453), not Ethereum.** The State "Target chain" and the active Networks chip should read **Base** on first load post-connect — don't flag that as wrong.
- **Counterfactual Safe = "No code on this chain" is correct.** A passkey Safe that hasn't been deployed on the selected chain will (correctly) show amber **No code on this chain** from "Verify smart contract". That's accurate, not a failure.
- **"Add to wallet" needs a real injected provider.** Without one it logs `{reason:'no-wallet'}` and the chip never flips to "Added". Assert the affordance + the Output log, not a real chain addition.
- **`#fff` in the WalletPair QR backdrop** (`.qr-wrap { background:#fff }`) is functional (QR must be black-on-white) — not a hardcoded-color violation.
- **Logo 404 → letter fallback is intended.** Network chips and search results fall back to a colored letter avatar (`logoFailed`/`hasLogo`); 404 console noise from `chainLogoUrl` is acceptable.
- **All actions log to Output.** Use the Output console (and per-entry JSON / Copy all) as your primary evidence source for the RPC/sign/send checks — it's deterministic and survives screenshot flakiness. `safeJson` must render bigints as decimal strings (e.g. `"wei":"123…"`) — a literal `12n` or `[object Object]` in the log **is a FAIL**.
- **Send/Estimate/Balance all use the *target* (selected) chain, not the wallet's connected chain.** If they diverge, a balance/estimate may read a chain the Safe isn't deployed on — surfaced as an inline error, which is correct behavior to verify.
