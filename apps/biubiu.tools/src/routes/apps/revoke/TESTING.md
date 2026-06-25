# Revoke Approvals — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/revoke/TESTING.md`，用 chrome-devtools MCP 把 **撤销授权 / Revoke Approvals** (`/apps/revoke`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- App URL: `http://localhost:5173/apps/revoke`
- What it does: a revoke.cash-style **token-approval revoker**. After you connect a smart-contract wallet, it auto fast-scans the selected chain — probing a **curated registry** of mainstream ERC-20 tokens + blue-chip NFTs (ERC-721/1155) against known spenders (Uniswap, OpenSea/Seaport, 1inch, 0x, Permit2, Aave, …) via **Multicall3** on public RPC — lists every *currently-active* allowance / operator approval / Permit2 sub-allowance, and lets you **revoke** them one-by-one or as **one atomic batch** through the connected wallet (`sendCalls`). You can add custom tokens, custom spenders, and custom EVM networks (searched from the ethereum-data chain index). It is **non-custodial**: your wallet only signs; the tool never holds keys or funds.
- UI language is locale-dependent. The default English strings are quoted below (with the zh equivalents for the hero) so you know what to look for.

### ⚠️ The single biggest scoping fact — READ FIRST

**Everything below the safety card is gated behind `<WalletGate>`.** Until a smart-contract wallet is connected, the page renders only: the hero (`<h1>` + subtitle), the "Why revoke?" safety card, and the **wallet-gate panel** (`Connect Wallet` / "Only smart contract wallets are supported…" / `Connect wallet` button). The network picker, scan results, custom-add buttons and revoke flow are **NOT in the DOM** until connected.

Connecting requires a **passkey (biubiu)**, an **injected EIP-6963 wallet**, or a **WalletPair QR** — none of which can be driven headless via chrome-devtools MCP. Therefore:

- **Unauthenticated scope (fully automatable):** §A first-load, §B safety card, §C wallet-gate, §J theme of the above, §K i18n of the above, §M console hygiene. **Do these for real.**
- **Authenticated scope (network picker, scan, results, custom-add modals, revoke):** **UI + validation + error-state only, and only if you can connect a wallet** (e.g. a real injected wallet in a non-headless Chrome the MCP attaches to, or a manual passkey step). The **revoke transaction itself needs on-chain approvals to exist + gas + a wallet signature** → that step is **manual / out of scope for headless**; verify everything up to "Sign in your wallet…".
- If you cannot connect, **report the authenticated checks as `N/A (needs connected wallet)`**, not FAIL — but you MUST still confirm the gate renders correctly (§C) and that the modals' code-paths are reachable by reading, since they only mount post-connect.

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/revoke` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900`. Mobile: `390×844`.

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool call errors with *"The browser is already running for .../chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*, the dedicated automation profile is stuck. Recover (try the cheap one first):
  ```bash
  # cheapest: just drop the lock (Chrome still alive)
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # if still stuck: hard reset
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Then `navigate_page` again. **Rule of thumb: one unlock buys ~1–2 MCP calls** before it may relock — so batch your work.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab sometimes navigates itself to `about:blank` (HMR / MCP relay churn). Before trusting a screenshot, sanity-check with `evaluate_script`:
  ```js
  ({ url: location.href, h1: document.querySelector('h1')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null, **re-navigate and redo** the setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions**; use screenshots only for visual spot-checks (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip can reset the page; do setup + assert in as few calls as possible.
- **Svelte 5 binding:** setting `el.value = '…'` does **NOT** trigger `bind:value`. Use the native setter + dispatch input:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(el, '0x…'); el.dispatchEvent(new Event('input',{bubbles:true}));
  ```
  (All custom-token / spender / network inputs on this page are plain `<input class="input">` with `bind:value` — no proeditor here, unlike balance-radar.)
- **Theme:** force via `navigate_page` `initScript`:
  ```js
  localStorage.setItem('biubiu-settings', JSON.stringify({ theme: 'light' })); // or 'dark'
  ```
  Applies through `<html data-theme>`. Per-field merge means writing only `theme` is safe.
- **i18n raw-key caveat:** the message-catalog JSON embedded in the page's HTML **legitimately** contains raw keys like `revoke.title` (hydration data). Only judge **VISIBLE rendered text**. A *visible* raw key on screen (e.g. the literal text `revoke.title` or `revoke.scan.coverage`) **IS a FAIL**.

### 0.2 Test data (well-funded mainnet addresses + real contracts)

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — has many live approvals on Ethereum, great scan target
0xab5801a7d398351b8be11c439e05c5b3259aec9b   # Vitalik #2 — active on multiple chains
```
- **Custom-token "Fetch" test (real ERC-20 on Ethereum, not in the built-in registry):**
  - SHIB `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` → expect symbol `SHIB`, decimals `18`.
  - MKR `0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2` → MKR returns `symbol()` as a `bytes32`, a known viem edge case; useful to see whether Fetch succeeds or shows `revoke.addToken.fetchFailed`.
- **Custom-spender test address (any contract):** Uniswap V2 Router `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`.
- **Custom-network search test:** type `Linea` (chainId 59144) or `Scroll` (534352) — both EVM, both expose public RPC in ethereum-data, both have Multicall3 at the canonical address.
- **Invalid inputs:** `0x123` (too short), `not-an-address`, `0xZZZ…` → must be rejected by `revoke.addToken.invalidAddress` / `revoke.addSpender.invalidAddress`.

### 0.3 Built-in networks (12, from the wallet `CHAINS` table — verify the grid shows these display names)

`Ethereum (1) · BNB Chain (56) · Polygon (137) · Arbitrum (42161) · Optimism (10) · Base (8453) · Avalanche (43114) · Gnosis (100) · Unichain (130) · Tempo (4217) · Monad (143) · World Chain (480)`. **Ethereum** (`eth-mainnet`) is the default selection. Each chip shows the chain logo + name + native symbol; custom chains get the `· custom` suffix and a × remove button.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / hero (unauthenticated — fully automatable)
- [ ] Page returns 200 and renders; `<h1>` = **Revoke Approvals** (zh: **撤销授权**).
- [ ] Subtitle reads **"See every contract that can still move your tokens and NFTs — and shut off the risky ones in one click."** (zh: **查看所有仍能转移你代币和 NFT 的合约，一键关闭存在风险的授权。**).
- [ ] `document.title` reflects `revoke.meta.title` ("Revoke Approvals — take back token access").
- [ ] `list_console_messages` → no `error` entries on a clean load (a missing chain-logo `404`/`onerror` is tolerated — it falls back to a letter badge; **JS exceptions are NOT**).

### B. Safety / "Why revoke?" card (unauthenticated)
- [ ] A card titled **"Why revoke?"** (zh: **为什么要撤销？**) is visible with three chips: **Public RPC**, **Non-custodial**, **Batch in one signature**.
- [ ] A **"Learn more"** link-button is on the right. Click it → it toggles to **"Hide"** and reveals the `revoke.safety.detail` paragraph ("When you use a DEX, marketplace or bridge, you approve a contract to spend your tokens…"). Click again → collapses, label back to **"Learn more"**.
- [ ] Detail text mentions it **never holds your keys or funds** (non-custodial claim is present).

### C. Wallet gate (unauthenticated — the default state for headless)
- [ ] Below the safety card, a gate panel shows heading **"Connect Wallet"**, body **"Only smart contract wallets are supported — including EOAs upgraded via EIP-7702."**, and a **"Connect wallet"** button.
- [ ] **No** network grid, scan results, "Add token/spender" toolbar, or coverage callout are present in the DOM yet (assert via `evaluate_script`: `!!document.querySelector('.net-grid')` should be `false`).
- [ ] Click **"Connect wallet"** → an **AuthModal** opens (offers BiuBiu Built-in / Browser wallets / WalletPair). Closing it returns to the gate. *(You can verify the modal opens/closes; completing connection is manual.)*

### D. Network picker (AUTHENTICATED — needs connected wallet)
> Scope: requires a connected wallet for the grid to mount. If you cannot connect, mark D–H as `N/A (needs connected wallet)`.
- [ ] After connect, a card with label **"Network"** shows the `NetworkGrid` of the 12 built-ins (§0.3), with **Ethereum** preselected (`.net-chip.selected`).
- [ ] An **"Add network"** dashed chip is at the end (`revoke.network.addCustom`) with hint **"Custom RPC"**.
- [ ] Selecting a different chain (e.g. **Base**) clears prior results and **auto-triggers a fresh scan** on the new chain (skeleton appears, then results or empty state). `setNetwork` resets `rows/scanned/selectedIds` — confirm the table empties before the new scan lands.

### E. Auto-scan happy path (AUTHENTICATED, owner with live approvals)
> Use vitalik.eth as the connected owner if possible; otherwise any owner that has granted approvals on the selected chain.
- [ ] On connect (or chain switch), a **loading skeleton** appears: a "Scanning approvals on Ethereum…" label (`revoke.scan.scanning`) + 5 shimmer rows (`.skel-row`). It must be a **skeleton**, not a bare spinner.
- [ ] A persistent **info callout** (`.info-callout`) shows the coverage disclosure (`revoke.scan.coverage`: "Fast scan of mainstream tokens, NFTs and known spenders — plus your custom additions. It doesn't crawl your whole history…"). This is **expected**, not an error.
- [ ] When the scan returns rows, an `ApprovalTable` renders with header columns: a select-all checkbox, **Asset**, **Approved spender**, **At risk**, and an action column.
- [ ] Each row shows: token **symbol** + a standard badge (`ERC-20` / `ERC-721` / `ERC-1155` / `Permit2`), the spender **label** (e.g. "Uniswap V2 Router", "OpenSea (Seaport 1.6)") or **"Unknown contract"** in warning color, the spender's short address `0x7a25…488D` with **Copy** + **explorer** icon buttons, and an **At risk** amount.
- [ ] **Unlimited** allowances render the amount as **"Unlimited"** (zh: 无限制) in **error/red** + bold (`.amt.danger`); NFT operator approvals render **"All items"**; finite ERC-20 allowances render a grouped decimal (≤6 dp, e.g. `1,000`); `null` allowance renders `—`.
- [ ] Rows are sorted **unlimited-first** (high-risk on top), then by symbol, then spender.

### F. Results interactions (AUTHENTICATED)
- [ ] **Filter tabs** appear when there are rows: **"All (N)"** and **"Unlimited (M)"** (counts come from `s.rows.length` / `s.unlimitedCount`). Click **Unlimited** → only `unlimited` rows remain; click **All** → all return.
- [ ] If filtered to **Unlimited** but there are none, the placeholder **"No unlimited approvals — only capped ones."** (`revoke.scan.noUnlimited`) shows with a **"Show all approvals"** button that flips the filter back.
- [ ] **Select-all** header checkbox selects every *visible* row; unchecking clears. Selecting any row reveals a **batch bar**: "**N selected**", a **"Clear"** button, and a **danger "Revoke N selected"** button.
- [ ] Per-row **Copy** icon: click → it swaps to a ✓ (Check) for ~1.2s then reverts; `navigator.clipboard` then contains the **full** spender address (not the truncated form).
- [ ] Per-row **explorer** link: `href` = `{network.explorerUrl}/address/{spender}`, `target="_blank"`, `rel="noopener"`.
- [ ] **Rescan** toolbar button (`revoke.toolbar.rescan`) re-runs the scan (spinner on the icon while `s.scanning`); disabled while `s.scanning` or `s.revoking`.

### G. Custom token / spender / network modals (AUTHENTICATED — UI + validation only)
**Add token** (`revoke.toolbar.addToken` → modal "Add a custom token"):
- [ ] Standard segmented control offers **ERC-20 / ERC-721 / ERC-1155**; ERC-20 selected by default.
- [ ] Click **Fetch** with an empty/invalid address → inline error **"Enter a valid contract address."** (`revoke.addToken.invalidAddress`), nothing fetched.
- [ ] Paste SHIB (§0.2) → **Fetch** → button shows **"Loading…"** then a success line **"Found SHIB (18 decimals)"** (`revoke.addToken.fetched`).
- [ ] Click **"Add & rescan"** without fetching first (and no symbol) → inline **"Fetch the token details first."** (`revoke.addToken.needMeta`). After a successful fetch, **Add & rescan** closes the modal, adds a **custom chip** (`SHIB ×`) under the network grid, and triggers a rescan.
- [ ] A bad/non-token address → **"Couldn't read this token. Check the address and network."** (`revoke.addToken.fetchFailed`).
- [ ] Footnote present: "The token is saved in your browser for this network and included in every scan."

**Add spender** (`revoke.toolbar.addSpender` → modal "Add a custom spender"):
- [ ] Address field + optional **Label** (placeholder "e.g. MyDApp Router"). Submitting an invalid address → **"Enter a valid contract address."** (`revoke.addSpender.invalidAddress`).
- [ ] Valid address (e.g. Uniswap V2 Router §0.2) + label → **"Add & rescan"** closes modal, adds an accent-colored **spender chip** with the label (falls back to `0x7a25…488D` short form if label blank), and rescans.

**Add network** (`revoke.network.addCustom` → modal "Add a custom network"):
- [ ] Top hint "Search any of 2,000+ EVM chains…" + a search box (placeholder **"Search any EVM chain by name or ID"**).
- [ ] Type `Linea` → a `role="listbox"` of chain rows appears (logo + name + `shortName · symbol` + `#chainId`); while loading it shows **"Searching…"**, and a no-match query (e.g. `zzzqqq`) shows **"No chains found. Check the name or chain ID."**
- [ ] Click a chain row → it's added with name/symbol/explorer/RPC auto-filled, the modal closes, the chip appears in the grid with **· custom** suffix + × remove, and it becomes the selected network (auto-scan fires).
- [ ] **need-rpc path:** if a picked chain exposes no public RPC and the optional **"Custom RPC (optional)"** field is empty, an inline error **"This chain has no public RPC — paste one above to add it."** (`revoke.addNetwork.needRpc`) shows; pasting a valid `https://…` RPC and re-picking succeeds.
- [ ] Removing a custom network (× on its chip) drops it; if it was selected, selection falls back to **Ethereum**.

### H. Revoke flow (AUTHENTICATED + on-chain — MANUAL / largely out of scope for headless)
> The revoke action signs and submits a transaction; it needs real approvals + gas + a wallet confirmation. Verify the **pre-signature** UI only unless you have a funded wallet + a manual signer.
- [ ] Click a row's **"Revoke"** (or batch **"Revoke N selected"**) → the row/button shows a spinner + **"Revoking…"** (`revoke.table.revoking`), and a status banner cycles phases via `phaseLabel`: **Checking… → Building transaction… → Estimating gas… → Sign in your wallet… → Submitting… → Waiting for confirmation…** (`revoke.phase.*`). All other Revoke buttons disable while `s.revoking`.
- [ ] **Success:** a green `role="status"` banner **"Approval revoked."** (`revoke.result.success`) with a **"View transaction"** explorer link (if `explorerUrl`) and a dismiss × (`revoke.alert.dismiss`). Revoked rows are removed from the table; the banner **auto-dismisses after ~6s** (long enough to click the link).
- [ ] **Failure:** a red `role="alert"` banner **"Revoke failed: {error}"** (`revoke.result.failed`) with a dismiss ×. **Critical:** the error must surface **IN THE UI**, not only the console. The error banner **persists** until dismissed (unlike success).
- [ ] **Custom-network biubiu limitation:** when the selected network `isCustom` AND the connected wallet `kind === 'biubiu'`, a warning note shows **"The built-in passkey wallet can't send on custom networks. Connect an injected or paired wallet to revoke here."** (`revoke.note.customBiubiu`) and the batch **Revoke** button is disabled (`!s.sendSupported`). Verify by connecting biubiu + adding/selecting a custom chain.

### I. Empty / error body states (AUTHENTICATED)
- [ ] **No approvals found** (owner with zero live approvals, or a fresh address): a centered placeholder with a shield icon, **"No active approvals found on Ethereum."** (`revoke.scan.empty`) + the hint about adding custom tokens/spenders (`revoke.scan.emptyHint`).
- [ ] **Scan error** (e.g. add a custom network with a bogus RPC like `https://invalid.rpc.example`, select it, let it scan/fail): a placeholder with a warning triangle, **"Couldn't scan this network. Try rescanning, or switch RPC in settings."** (`revoke.scan.error`) and a **Rescan** button. The error must be **in the UI**, not just console.

### J. Responsive
- [ ] **390×844:** hero/subtitle, safety card (chips wrap), and the gate panel stack cleanly with no horizontal overflow. *(Authenticated)*: the network grid reflows (`minmax(150px,1fr)`); the toolbar's "Add token / Add spender / Rescan" buttons wrap; the `ApprovalTable` **collapses each row into a stacked card** (header hidden via `@media (max-width:680px)` — asset/spender/amount/action become grid-areas) — verify no clipping, the checkbox stays top-left.
- [ ] **1280×900:** layout intact, page max-width 920px centered, table columns aligned (At risk right-aligned).

### K. Theme correctness (BOTH — light + dark)
- [ ] **Light** (`theme:'light'`): the hero/safety/gate cards are clearly delineated by border + `--shadow-sm` on the white page (**no white-on-white**); safety chips readable; "Learn more" link in accent. *(Authenticated)*: selected net-chip uses `--accent-subtle`; "Unlimited" amounts red and legible; the **danger** "Revoke selected" button uses `--error` bg with `--bg-elevated` text (readable in BOTH themes — this was a deliberate fix, white-on-red would be low-contrast in dark).
- [ ] **Dark** (`theme:'dark'`): default look intact; no gray-on-gray. Skeleton shimmer visible but subtle.
- [ ] Inspect at least one of: success banner (green tokens) and error banner (red tokens) — both must be legible in each theme.

### L. i18n (15 locales available: de en es-MX fr id it ja ko pt-BR ru tr vi zh zh-HK zh-TW)
- [ ] Switch locale (settings panel / locale switcher) to at least one non-zh (e.g. **fr** or **ja**) and one zh variant (**zh** / **zh-TW**). Every **visible** `revoke.*` string translates — hero, subtitle, safety heading + chips + Learn more, gate, coverage callout, toolbar/filter labels, modal titles/fields/footnotes.
- [ ] **No raw keys leak** on screen (a visible literal `revoke.scan.coverage` / `revoke.title` / `revoke.table.asset` etc. is a **FAIL**). Remember the hydration JSON in HTML containing these keys is normal — judge rendered text only.
- [ ] Interpolated strings render with substituted values, not the raw template — e.g. the filter reads "All (3)" / "Unlimited (1)" not "All ({count})"; "Found SHIB (18 decimals)" not "Found {symbol} ({decimals} decimals)".

### M. Accessibility / keyboard
- [ ] `Tab` through: Learn more link, Connect wallet button (unauth); and (auth) net-chips, filter buttons, Add token/spender/Rescan, table checkboxes, Copy/explorer icon buttons, Revoke buttons — each shows a visible **focus ring** (`:focus-visible` outlines are defined on `.btn`, `.filter button`, `.seg button`, `.link-btn`, `.icon-btn`, `.revoke-btn`, `.chain-row`, `.cb input`, `.status-x`, `.input`).
- [ ] Filter buttons expose `aria-pressed`; the segmented standard buttons expose `aria-pressed`; the select-all + row checkboxes have `aria-label` ("Select all" / "Select {symbol}"); custom-chip remove + status dismiss have `aria-label`s; chain search results are `role="listbox"` with `role="option"` rows.
- [ ] Checkboxes/buttons activate via **Space/Enter**; the explorer link via Enter.

### N. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected JS `error`s. (Tolerated: chain-logo image `404`s that trigger the `onerror` letter-badge fallback; RPC/CORS hiccups that surface as the in-UI scan-error placeholder.)
- [ ] (Authenticated, optional) `list_network_requests` during a scan → reads hit the configured RPC endpoints and call **Multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`); `eth_call` to that aggregator, chunked at ≤400 calls/request, `batchSize: 0`. Custom-token Fetch issues `symbol`/`decimals`/`name` reads to the token contract.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS / FAIL / N/A | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. Use **N/A (needs connected wallet)** for §D–I/§H authenticated rows you couldn't reach headless, but still report §A/B/C/J(unauth)/K(unauth)/M(unauth)/N as real PASS/FAIL. End with a short summary: **# checks, # pass, # fail, # N/A**, and the top user-impacting issues.

## 3. Known traps / notes specific to THIS tool

- **The whole tool is gated.** Don't report "blank app / nothing works" — that's the wallet gate. Headless = you mostly test the hero + safety + gate + i18n/theme of those. Be explicit in the report about what was gated.
- **Auto-scan fires on `onMount` hydrate + an `$effect` watching `walletStore.activeWallet?.address` and `s.networkSlug`.** It scans **once per owner+chain** (guarded by `lastScanKey`). So switching chains re-scans, switching back may use a fresh key after `setNetwork` resets it. If you connect and see no scan, confirm an owner address is actually present.
- **Curated fast scan, not full history (by design).** The coverage callout is permanent and intentional — a niche/brand-new approval legitimately won't appear; that's what "Add token/spender" is for. Do **not** flag the callout as a bug.
- **"Harmless extra spender" model.** A spender/token with no code on the current chain just reads as 0 and is skipped (`allowFailure:true`). So an empty result on a low-activity chain is normal, not a failure.
- **biubiu can't revoke on custom chains** (no bundler infra) → `sendSupported=false`, warning note + disabled batch button. Injected/paired wallets can. This is expected, not a bug.
- **Success banner auto-dismisses (~6s); error banner persists.** If you blink and miss the green banner, that's by design — re-check rows were removed from the table as the durable evidence.
- **Possible bug to VERIFY — per-row Revoke ignores the custom-network/biubiu guard.** In `+page.svelte`, the **batch** "Revoke selected" button is `disabled={s.revoking || !s.sendSupported}`, but the **per-row** Revoke button in `ApprovalTable.svelte` is only `disabled={s.revoking}` — it does **not** check `s.sendSupported`. On a custom chain with the biubiu wallet, the row-level Revoke appears clickable even though sending isn't supported (the warning note is shown, batch is blocked, but a single-row revoke can still be attempted and will presumably fail). If confirmed in the browser, file it: the row button should also respect `!s.sendSupported`.
- **Possible polish gap to VERIFY — copy timeout vs. revert.** `ApprovalTable.copy()` sets `copied = addr` and reverts after **1200ms** with a guard `copied === addr`; rapid copying of different rows could leave a stale ✓ briefly. Low impact; note only if visibly wrong.
- **Custom data persists in IndexedDB.** After adding a custom token/spender/network, a page reload should restore them (loaded in `hydrate()` on mount). Verify persistence if you can connect; clearing site data resets it.
- **Logo 404s are non-fatal.** Both the net-chip logo and the chain-search-row logo have `onerror` fallbacks (letter badge / `DEFAULT_CHAIN_LOGO`). A 404 in the network tab here is **not** a FAIL.
