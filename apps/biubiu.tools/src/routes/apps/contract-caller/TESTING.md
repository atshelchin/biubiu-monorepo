# Contract Caller — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/contract-caller/TESTING.md`，用 chrome-devtools MCP 把 **Contract Caller** (`/apps/contract-caller`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state / flow / edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- App URL: `http://localhost:5173/apps/contract-caller`
- **What it does:** call any smart contract on any EVM chain without code. You (1) search & pick a network (dynamic chain index + RPC probe/failover), (2) paste a contract address and either **auto-fetch its ABI** (WhatsABI: verified source or bytecode, resolves proxies) or paste it manually, (3) get an auto-generated **read / write** method list with human-friendly inputs (token amounts, ether/gwei, durations, dates, UTF-8→hex). Reads run over RPC for free; writes/**batch** (one atomic Safe MultiSend)/**chain** (atomic, output→input forwarding via a tiny delegatecall helper) require a connected wallet. A **chained-call demo gallery** deploys self-contained showcase contracts (deterministic CREATE2) and runs pre-wired chains you can verify.
- UI language is locale-dependent; the i18n prefix is **`cc`** (file `src/messages/en/apps/contract-caller.json`). The English strings are quoted below so you know exactly what to look for.

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/contract-caller` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to **1280×900**. Mobile: **390×844**.

### 0.1 Critical chrome-devtools-MCP gotchas (read before you start — these WILL bite you)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*, the dedicated automation profile is stuck. Recover with:
  ```bash
  # cheap unlock first (Chrome still alive):
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # if still stuck, full reset:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  **Rule of thumb: one unlock buys ~1–2 MCP calls** before it may re-lock. So don't string a long sequence of `click`s — batch work into `evaluate_script` / `navigate_page(initScript)`.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab sometimes navigates itself to `about:blank` (HMR / MCP relay churn). **Before trusting a screenshot, sanity-check** with `evaluate_script` → `{ url: location.href, h1: document.querySelector('h1')?.textContent }`. If `url` is `about:blank` or `h1` is null, re-navigate and redo. **Prefer `take_snapshot` / `evaluate_script` for assertions**; use screenshots for visual spot-checks (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip is a chance for the relay to reset the page.
- **Svelte 5 binding caveat.** Setting `el.value = …` does **not** trigger `bind:value`. Use the native setter + dispatch:
  ```js
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
  set.call(el, 'VALUE'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  This matters for the **contract address** input (`#cc-address`), the **ABI** textarea (`#cc-abi`), the SmartParamInput fields, and the **search** box (its `<input>` is `oninput`-driven, debounced 280ms — type then wait).
- **Theme.** `navigate_page` `initScript`: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`; per-field defaults are merged, so writing only `theme` is safe. You can also flip live: `document.documentElement.setAttribute('data-theme','light')`.
- **i18n raw-key caveat.** The message-catalog JSON embedded in the page HTML legitimately contains raw keys (hydration data) — only judge **VISIBLE rendered text**. A visible raw key (e.g. `cc.methods.call`, `widgets.networkPicker.change`) IS a FAIL.

### 0.2 What needs network / a wallet (scope your verdicts)

This tool talks to the live network. Be explicit in your report about which parts you could exercise:

- **Chain search + chain load** hit `ethereum-data.awesometools.dev` (`/index/fuse-chains.json`, `/chains/eip155-<id>.json`, `/chainlogos/…`). If that host is blocked, search returns nothing — note it; don't call the UI broken.
- **Reads + RPC probing** are made **from the browser directly to public RPC endpoints** (`POST eth_chainId`, `eth_call`, `getCode`). Like Event Scanner, these are frequently **CORS/CORB-blocked in a headless automation context** → a real read may fail with a transport error even though the app is fine. **If reads fail with CORS/network errors, scope read checks to "UI + validation + error-surfacing", and lean on the demo gallery's deterministic UI for the rest.**
- **Writes / batch execute / chain execute / deploy demo / deploy helper** ALL require a **connected wallet** (top-right sign-in; built-in passkey Safe or injected). These **cannot be automated headless** → scope to **UI + validation + correct gating** (the right "Sign in to …" button, the right read-only/needs-biubiu hints, encoded-calldata preview). Full on-chain execution needs a funded wallet / manual step.

### 0.3 Test data

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — valid EOA, for "valid address" checks
0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48   # USDC (Ethereum) — verified ERC-20, good auto-fetch target
0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE   # SHIB (Ethereum) — verified ERC-20, alt auto-fetch target
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2   # WETH (Ethereum) — has a name()/symbol()/totalSupply()
0x7f268357A8c2552623316e2562D90e642bB538E5   # OpenSea Wynd registry — EIP-1967 proxy (proxy-detection check)
```
- Invalid address (for the bad-input check): `0x123` or `0xdeadbeef`.
- **Manual ABI** (human-readable, paste into `#cc-abi`) — covers a read + a write + a payable + a proxy-like view:
  ```
  function name() view returns (string)
  function totalSupply() view returns (uint256)
  function balanceOf(address owner) view returns (uint256)
  function transfer(address to, uint256 amount) returns (bool)
  function deposit() payable
  ```
- Networks to use: **Ethereum (chainId 1)** = read-only in-app via WhatsABI works; **Base (8453)** / **Arbitrum (42161)** = write-capable in-app (in `WRITE_NETWORK_BY_CHAIN_ID`); a chain NOT in that map (e.g. **Linea 59144** or **Celo 42220**) = read-only → use it to assert the **Read-only** badge + read-only hints.
- Bogus custom RPC for the failure test: `https://invalid.rpc.example` (Custom RPC field → "RPC is unreachable." / chain-id mismatch).

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state
- [ ] Page returns 200 and renders; `<h1>` = **"Contract Caller"**; subtitle = **"Interact with any smart contract — no code required."**
- [ ] **First-open guide** is shown (only while no chain is selected): a 3-step `<ol class="guide">` with **"Pick a network" / "Add the contract" / "Call its methods"** and their descriptions ("Search any EVM chain by name or chain ID." / "Paste an address — we'll fetch its ABI, or paste your own." / "Read for free; sign in to send transactions.").
- [ ] The **Network** picker card is visible: label **"NETWORK"** (uppercased), subtitle **"Search any EVM chain by name or chain ID. Reads work everywhere; in-app writes require a chain the built-in wallet supports."**, and a search input with placeholder **"e.g. Base, Arbitrum, BNB, 1, 56…"**.
- [ ] No Contract / Methods / Batch / Chain / Demos cards yet (they appear only after a chain is selected).
- [ ] `list_console_messages` → no `error` entries.

### B. Network search & selection
- [ ] Type `base` in the search box (native setter + `input` event, then wait ~400ms for the 280ms debounce) → a results list `ul.chain-list` appears; each row shows a logo, chain name, and `#<chainId> · <SYMBOL>`. **Base** (#8453) is present.
- [ ] Type a numeric chain id (e.g. `1`) → **Ethereum (#1 · ETH)** appears (exact-id match is prioritized).
- [ ] Click a result → the picker **collapses to a single bar** showing the logo, name, **"Chain <id>"**, a **badge**, and a **"Change"** link. A **RPC** row appears with an `RPC` tag and either a `<select class="rpc-select">` of probed endpoints (`host · <ms>ms` / `· ✕` for dead / `· …` pending) or a single `code.rpc-url`. (Probing may be CORS-blocked headless → endpoints may all show `· ✕`/`· …`; note it but selection can still proceed since `findBestRpc` falls back to the first url.)
- [ ] **Badge correctness:** pick **Base (8453)** → badge reads **"Read + Write"** (green). Pick a chain NOT in the write map (e.g. **Linea 59144**) → badge reads **"Read-only"**.
- [ ] **"Change"** link clears the selection and returns to the search card (guide reappears, Contract card disappears).
- [ ] **Custom RPC:** in the bar, click **"Custom"** → an input (placeholder **"https://your-rpc…"**) + **"Apply"** button appear. Apply with `https://invalid.rpc.example` → inline **"RPC is unreachable."** (or a chain-id mismatch message) in red `.err`, and the RPC does **not** switch. Apply with empty → button is disabled.

### C. Contract address + auto-fetch / manual ABI
After selecting **Ethereum (#1)**:
- [ ] A **"Contract"** card appears with field label **"Contract address"** and a mono input `#cc-address` (placeholder `0x…`).
- [ ] Enter an invalid value (`0x123`) → the input gets the `.bad` class (error-tinted border); the **"Auto-fetch ABI"** button is **disabled**; the hint to its right reads **"Enter a contract address to load its ABI automatically."**
- [ ] Enter a valid address (USDC `0xA0b8…eB48`) → `.bad` clears; **"Auto-fetch ABI"** enables; hint switches to **"verified source or bytecode · via WhatsABI"**. (After ~500ms the store may also kick off silent proxy detection — fine if nothing visible appears.)
- [ ] Click **"Auto-fetch ABI"** → button shows **"Fetching ABI…"** while loading. *Network permitting:* on success a green line **"✓ Loaded from <source>"** appears and the Methods section populates; on failure an inline red `.err` shows the message (e.g. **"No ABI found at this address."**, **"Found a contract but no callable methods."**, **"Select a network first."**). **If RPC is CORS-blocked headless, expect the failure path — that's environment, not a bug;** verify the error is surfaced **in the UI** (red `.err`, not console-only) and that the **manual ABI** disclosure **auto-opens** on a fetch error.
- [ ] **Manual ABI fallback:** click **"Paste ABI manually"** (chevron disclosure) → a textarea `#cc-abi` appears with label **"ABI"** + hint **"(JSON array, Foundry/Hardhat artifact, or human-readable lines)"** and a long placeholder. Paste the manual ABI from §0.3, click **"Load ABI"** → no error; a count **"<r> read · <w> write"** appears; Methods section renders. Toggling the disclosure flips its label to **"Hide manual ABI"**.
- [ ] **Invalid ABI:** clear the textarea, paste `not json {[`, **"Load ABI"** → inline red **"Invalid ABI."** (`.err`), no methods.
- [ ] **"Load ABI"** is disabled while the textarea is empty/whitespace.

### D. Methods: read list
With the manual ABI loaded (or a real auto-fetch):
- [ ] A **"Read"** card (`<h3>` "Read" + a count chip) lists the view methods: `name`, `totalSupply`, `balanceOf`. A **"Write"** card lists `transfer`, `deposit`. Each method row is a collapsed header: mono name + `(types)` + a **"read"**/**"write"** badge + chevron.
- [ ] Click a read header (e.g. `name`) → it expands (`.method.open`, accent left-border), revealing inputs (none for `name`) and an action row with **"Call"** + **"+ Chain"**.
- [ ] Expand `balanceOf` → a SmartParamInput for `owner (address)` shows: an input with placeholder `0x…`; on a valid address a green `✓` badge + a shortened preview appear; on an invalid one the border tints error (`.bad`).
- [ ] Click **"Call"** on `name` (USDC). *Network permitting:* a green `.result.ok` shows the decoded `string` output (e.g. `USD Coin`), clickable to copy ("Copied!" flash). *If CORS-blocked headless:* a red `.result.err` appears with the transport message — **verify the error renders in the UI** (this is the failover-exhausted display; see §I).
- [ ] **Output smart-tools (use a uint return like `totalSupply`):** when the value is ≥1e12 the big number is digit-grouped and a chip row appears — **"full" / "÷1e18" / "÷1e6" / "gwei" / "raw"** — clicking each reformats the value; a unix-range value would also show a `Calendar` date hint. The big value is click-to-copy.

### E. Methods: write list (gating — no wallet needed to verify)
Disconnected (no wallet), on a **write-capable** chain (Base 8453):
- [ ] Expand `transfer` → action row shows a **disabled "Sign in to send"** button (title **"Sign in (top-right) to send"**), plus **"+ Batch"**, **"+ Chain"**, **"Encode calldata"** (all enabled once the address is valid).
- [ ] Fill `to` = vitalik, `amount` = `1000000` → click **"Encode calldata"** → a green `.result.ok` row labelled **"calldata"** with the `0x…` hex, click-to-copy ("Copied!"). With a bad arg → red `.result.err` (the encode/validation error).
- [ ] Expand `deposit` (payable) → an **"ETH value"** / **"wei"** input appears above the actions.
- [ ] **Read-only chain gating:** switch to a chain NOT in the write map (Linea 59144) and reload the ABI → write methods now show the inline hint **"Read-only network — use the calldata"** (no Send button), but **"+ Batch" / "+ Chain" / "Encode calldata"** remain. Badge in the network bar = **"Read-only"**.

### F. Batch tray (build without sending)
On Base, with the write ABI loaded:
- [ ] Click **"+ Batch"** on `transfer` (after filling valid args) → a **sticky right sidebar** (wide screens) / stacked tray (mobile) appears with a **"Batch"** card (title + count chip + hint **"One atomic Safe transaction via MultiSend"**). The queued item shows its label `transfer(0x…, …)` and `→ <shortAddr>`.
- [ ] Add a 2nd call → reorder with the up/down icon buttons (titles **"Move up"/"Move down"**, first up / last down disabled), remove with the **×** (title "Remove").
- [ ] Actions: disconnected → a disabled **"Sign in to execute"**; an enabled **"Export Safe file"**; a **"Clear"** ghost button. (Export downloads `contract-caller-batch-<chainId>.json` — to assert content without a real download, wrap `URL.createObjectURL` before clicking and inspect the Blob.)
- [ ] On a read-only chain the batch tray shows the hint **"This network is read-only in-app — export the Safe file and run it from your Safe."** and no execute button.
- [ ] **"Clear"** empties the tray and the sidebar disappears (when chain tray also empty).

### G. Chain builder (output → input forwarding; build/validate without sending)
- [ ] Click **"+ Chain"** on a read or write method → a **"Chain"** card appears (sidebar) titled "Chain" + count + hint **"Run these calls in one transaction. A step can reuse an earlier step's result."** Each step shows its index, mono name `(types)`, short `to`, and up/down/× controls.
- [ ] Add a 2nd step whose param is a **static word type** (address/uint/bool/bytes32) → for that param a **"use a previous result"** link (with a corner-down-right icon) appears; clicking it swaps the literal input for a `<select>` of **"Step <n> · <label>"** options; **"use a value"** switches back to a literal SmartParamInput. (Non-static-word params, or step 1, never offer the ref link.)
- [ ] **Helper-setup notice:** if the chain helper isn't deployed on this RPC, a `.helper-box` shows **"One-time setup: deploy a tiny helper on this chain (same address everywhere — <0x…>). After that, chaining just works."** with a **"Deploy chain helper"** button (disconnected → instead the hint **"Sign in (top-right) to deploy it."**).
- [ ] **Execute gating:** disconnected on a write chain → disabled **"Sign in to execute"**; on a non-biubiu / unsupported context → the hint **"Chaining needs the built-in biubiu wallet."** Execute is also disabled until the helper is deployed. **"Clear"** empties the chain.
- [ ] Reorder a chain step → all refs reset to literal (safety) — the previously-set "use a previous result" select reverts to a literal input. Removing an earlier step clears any ref that pointed at/after it.

### H. Chained-call demo gallery (the deterministic surface — exercise this hardest)
The **"Chained-call demos"** card (title + subtitle **"Deploy self-contained showcase contracts in one click, then watch an earlier call's result flow straight into the next — one signature, atomic."**) appears once a chain is selected and `canChain` is true (built-in wallet on a supported chain, e.g. Base). It's a collapsible card (chevron) open by default.
- [ ] Four scenario tiles render: **"Factory builds a contract → Registry records its address"**, **"Random mint → exact transfer"**, **"Oracle quote → settle at that price"**, **"Lottery: draw → hit it in the same tx"**. Each shows a description, a **flow row** (`step1` code → forwarded-value label → `step2` code, e.g. `BoxFactory.createBox()` → "new contract address" → `BoxRegistry.register(box)`), and a status pill.
- [ ] **Deploy-status probe (read path — this is the read-failover regression surface):** on load the gallery calls `checkDemos()` which does `getCode` on each demo contract over `readRpcs`. *Network permitting,* each tile shows **"Checking…"** then **"Ready"** (green check) if already deployed network-wide, else **"Not deployed"** (dashed). **A flaky/slow first RPC must NOT make a deployed contract read as "Not deployed"** — see §I.
- [ ] **Deploy gating (no wallet):** when not Ready, disconnected → a disabled **"Sign in to deploy"** button. Connected-but-unsupported-chain context → the note **"Demos need the built-in biubiu wallet on a supported chain."**. When Ready, **"Load chain"** + **"Verify result"** buttons show.
- [ ] **Load chain (no tx needed):** on a **"Ready"** tile click **"Load chain"** → the pre-wired steps populate the **Chain** builder in the sidebar (step 2's arg shows as a ref to step 1), the tile shows **"Loaded into the Chain panel → hit Execute, then Verify"**, and the previous proof is cleared. This is verifiable headless even without a wallet — only **Execute** needs signing.
- [ ] **Verify (read path):** click **"Verify result"** → **"Verifying…"** then a `dl.proof` of label→value rows (e.g. "Registry latest", "Registered count", "Recipient balance", "Settled price", "Trades", "Winner", "Winning number"). On a read error the value cell turns red (`dd.bad`). *(If CORS-blocked headless, the proof rows surface the transport error inline — still a UI-surfaced result, not a silent drop.)*

### I. RECENTLY FIXED — read failover must work (verify explicitly)
The fix: a **transport error** (timeout / 429 / network) on a read now **fails over to the next RPC** instead of being misread as a revert. Only deterministic outcomes (containing "revert" / "invalid opcode" / "out of gas" / "execution failed") short-circuit. (See `isRetryableRpcError` in `src/lib/contract-caller/rpc-client.ts` and `executeReadWithFailover` in `read.ts`.)
- [ ] **Reads still succeed when the first RPC is slow/dead.** Best surface = the demo gallery on a chain where demos are deployed (Base): with multiple healthy RPCs probed, deploy-status / Verify reads should resolve to real values even if one endpoint is `· ✕` in the RPC select. To force the scenario, in the network bar switch the active RPC to a deliberately dead/slow one **but keep a healthy one in the probed list** (so `readRpcs` = [dead, …healthy]); a read should still return a value (it failed over), **not** an empty/"reverted" error.
- [ ] **A transport failure is NOT shown as a revert.** When ALL RPCs are unreachable, the surfaced error is a transport-style message (e.g. "RPC is unreachable" / "No reachable RPC endpoint." / a timeout), **never** the misleading "Empty response — the call reverted…". (That revert message must only appear for a genuine `0x` return from a reachable node.)
- [ ] **A genuine revert short-circuits** (does not spin through every RPC): calling a read that truly reverts surfaces the revert message quickly, once, with no failover delay. *(Hard to stage headless; if you can't, mark N/A and note it.)*

### J. Loading / error states (must surface IN THE UI)
- [ ] Auto-fetch in flight → button text **"Fetching ABI…"** (the button is the loading indicator; there is no separate spinner here). Search/chain-load in flight → a small `.spinner` inside the search box.
- [ ] Every failure renders **in the UI**, not just console: chain load (`.err` under search, e.g. **"Failed to load chain."** / **"All RPC endpoints are unreachable."**), custom RPC (`.err` in the bar), ABI parse (`.err`), read (`.result.err`), encode (`.result.err`), write/batch/chain (`.result.err`), demo deploy (`.err` in the tile). Confirm at least the chain-load and a read/encode error visibly appear.
- [ ] No skeleton loaders are expected on this tool (results are inline); just confirm nothing renders as a permanent bare spinner with no resolution.

### K. Responsive
- [ ] **1280×900:** once a Batch or Chain tray exists, the page widens to ~1180px and the layout becomes a 2-column grid with a **sticky** right sidebar (`position:sticky`) for Batch/Chain. With no trays, the column is centered at ~760px.
- [ ] **390×844:** the guide collapses to a single column; the network bar, method cards, batch/chain trays stack vertically; the demo gallery grid collapses to 1 column; method action buttons / chips wrap without overflow or clipping; the long mono calldata/address values wrap (`word-break`) instead of overflowing.

### L. Theme correctness (test BOTH)
- [ ] **Light** (`data-theme=light`): every card is clearly delineated by border + shadow on the white page (**no white-on-white**); recessed inputs (`--bg-sunken`) are visible; the "read"/"write" badges, accent left-border on an open method, proxy/accent tints, and `.result.ok`/`.result.err` panels are all legible; the RPC `<select>` text is readable. No unreadable low-contrast text.
- [ ] **Dark** (`data-theme=dark`): default look intact; same panels legible.
- [ ] Spot-check the demo gallery, an expanded method with a result, and the Chain/Batch trays in **both** themes.

### M. i18n (no raw keys leak)
- [ ] Switch locale (the ⚙ settings panel / locale switch in the header) to at least one non-English locale (e.g. `zh` or `ja`) and back → every **visible** string under `cc.*`, `widgets.networkPicker.*`, and `widgets.smartParam.*` translates. **No raw keys** in rendered text (e.g. a visible `cc.methods.call`, `cc.demos.title`, `widgets.networkPicker.change` is a FAIL). Remember: raw keys inside the embedded catalog JSON are hydration data, not a bug — judge only what's painted on screen.
- [ ] Sanity check a few high-traffic strings exist in the chosen locale's `apps/contract-caller.json` (the type-gen reference locale is the first readdir dir — **de** — so all 15 locales must be key-complete; a missing key would render the raw key).

### N. Accessibility / keyboard
- [ ] `Tab` through the search input, chain-result buttons, the address input, "Auto-fetch ABI", the disclosure, method headers, action buttons, and the demo tiles → each shows a visible focus state (inputs get the accent ring + 3px `--accent-ring` halo; buttons get the UA/focus outline).
- [ ] Method headers, the manual-ABI disclosure, and the demo-gallery head are real `<button>`s with `aria-expanded` toggling `true`/`false` — verify via snapshot and that **Enter/Space** toggles them.
- [ ] The copy controls (output value, calldata, impl address) are `<button>`s and keyboard-activatable; the explorer / tx links are real `<a target="_blank" rel="noopener noreferrer">`.

### O. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected `error`s. (Known-acceptable: CORS/CORB/`net::ERR_FAILED` from blocked public-RPC reads in the headless context, and `404`/hidden logo images via the `onerror` fallback. Anything else — Svelte runtime errors, unhandled rejections, "raw key" warnings — is a FAIL.)
- [ ] (Optional) `list_network_requests` → chain index/info/logos hit `ethereum-data.awesometools.dev`; reads/probes are `POST`s straight to the public RPC hosts; **no third RPC retry storm** to a single dead host (the client uses `retryCount: 0` + an 8s timeout and does its own failover).

---

## 2. Reporting format

Produce a table:

| Area | Check | PASS/FAIL | Evidence |
|------|-------|-----------|----------|

For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. End with counts (**# checks / # pass / # fail / # N-A**) and the **top user-impacting issues** first (e.g. a read transport error shown as a revert; a raw i18n key; white-on-white in light theme; a missing read-only/needs-biubiu gate).

---

## 3. Known traps / notes specific to THIS tool

- **Read = direct browser → public RPC.** Like Event Scanner, headless reads are routinely CORS/CORB-blocked. Don't fail the tool for that — verify the error is **surfaced in the UI** and (crucially) that a **transport failure is not mislabeled a revert** (§I). The demo gallery's deploy-status/Verify reads share the same path and are the cleanest deterministic surface.
- **The read-failover fix is selector-sensitive.** viem embeds the request's calldata (e.g. `0x06fdde03` for `name()`) into *every* `CallExecutionError` message including timeouts/429s. The fix deliberately does **not** match a bare `0x…` selector as "revert" — only the literal words `revert` / `invalid opcode` / `out of gas` / `execution failed` short-circuit failover. If you ever see a timeout/429 producing the "Empty response — the call reverted…" message, that's the regression.
- **Writes/batch/chain/demo-deploy need a connected wallet** and (for biubiu) a chain in `WRITE_NETWORK_BY_CHAIN_ID` (1, 10, 56, 100, 130, 137, 143, 480, 4217, 8453, 42161, 43114, 80002). Disconnected, you can fully verify gating, validation, calldata encoding, batch building/export, chain building, and demo "Load chain" — but not on-chain execution. Scope those checks accordingly.
- **"Empty response — the call reverted or no contract exists at this address."** is the *correct* message when a reachable node returns `0x` (e.g. you called a method on an EOA, or a non-contract address). Don't confuse it with the transport-error case.
- **Auto-fetch can legitimately fail** ("No ABI found at this address." / "Found a contract but no callable methods.") for unverified contracts on networks WhatsABI can't introspect — that's a valid UI state, not a crash. The manual-ABI disclosure auto-opens on any fetch error (a deliberate UX, via `$effect`).
- **Custom RPC chain-id guard:** applying a custom RPC that reports a different chainId is rejected inline ("Chain ID mismatch: RPC is chain {actual}, expected {expected}.") — a good targeted check that doesn't need a wallet.
- **Sticky sidebar only on ≥1024px and only when a Batch/Chain tray exists.** Below that, or with empty trays, there's no sidebar — don't report its absence as a bug.
- **RPC persistence:** the chosen RPC per chain is saved to `localStorage['contract-caller-rpc']`; reloading a chain reuses it. If a saved RPC is now dead, selection still proceeds (the code keeps the saved url). Clear that key if you want a clean RPC-probe run.
- **Logo 404s are swallowed** (`onerror` hides the `<img>`) — broken chain logos are expected for less-common chains and are not a FAIL.
- **Demo contracts are deterministic + shared.** Their addresses are identical on every chain (fixed CREATE2 salt + bytecode); the first user to deploy seeds them network-wide, so a tile may already read **"Ready"** on a popular chain without you deploying anything — that's by design.
