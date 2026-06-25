# Vela Wallet Chain Setup — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/vela-wallet-chain-setup/TESTING.md`，用 chrome-devtools MCP 把 **Vela Wallet 链配置** (`/apps/vela-wallet-chain-setup`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- **App URL:** `http://localhost:5173/apps/vela-wallet-chain-setup`
- **What it does:** A beginner-friendly **wizard** that prepares *any* EVM chain to run [Vela Wallet](#) (a passkey/smart-contract wallet). You **search for a chain → it auto-probes the chain's public RPCs → it reads on-chain whether the ~11 required contracts + the RIP-7212 P256 precompile are present → it walks you through deploying the missing ones** (pre-signed txs for the Arachnid proxy + Multicall3, a GitHub-issue flow for the Safe Singleton Factory, and a browser-generated "deployer wallet" you fund to CREATE2-deploy the rest). Everything is read-only or deterministic until you actually fund + broadcast.
- ⚠️ The one-liner spec "add 12 chains + Tempo to a connected wallet" is **not** what this page does. There is **no wallet-connect step, no fixed list of 12 chains, no fiat settings, and no service-node settings** in this route. The page is an **arbitrary-chain contract-readiness checker + guided deployer**. Test what's actually there (below), and flag the spec mismatch.
- UI language is locale-dependent; the default **zh** strings are quoted inline so you know what to look for on screen. (Default locale here resolves to zh — title renders **「Vela Wallet 链配置」**.)

---

## 0. Setup & environment

1. **Dev server** must be up *and healthy*: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/vela-wallet-chain-setup` → expect `200`. If not, start it: `cd apps/biubiu.tools && bun run dev`.
   - ⚠️ **As of this writing the running dev server returns `500 {"message":"Internal Error"}` for EVERY route** (root, balance-radar, this page) — a known `dev-server-i18n-clobber` symptom (a concurrent `bun run check` / build broke the live `$i18n` module graph). The process *is* listening on :5173. **Fix = restart the dev server** (kill the existing `vite dev` and re-run `bun run dev`), then re-curl until you get `200` before testing. Do not report this 500 as a bug in *this page* — it's global env state.
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to **1280×900**. Mobile: **390×844**. (The page content column is capped at `max-width: 640px` and centered — at 1280 you'll see a centered narrow column with whitespace on both sides; that is by design.)

### 0.1 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running".** If a tool call errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*:
  ```bash
  # cheap unlock first (Chrome still alive — highest success rate)
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck → hard reset
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1–2 MCP calls.** So batch your work (below).
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab can self-navigate to `about:blank` (HMR / MCP relay churn). Before trusting any screenshot, sanity-check via:
  ```js
  evaluate_script: () => ({ url: location.href, h1: document.querySelector('h1')?.textContent, step: !!document.querySelector('.card') })
  ```
  If `url` is `about:blank` or `h1` is null, **re-navigate and redo setup.** **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions**; use screenshots only for visual spot-checks (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip is a chance for the relay to reset the page. Do "set theme + pre-select chain + assert" in one or two calls.
- **Svelte 5 binding caveat.** The search box (`.search-input`) and custom RPC input (`.rpc-input`) are real `<input>`s. Setting `el.value=...` does **NOT** trigger Svelte's handlers. Use the native setter + dispatch:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(el, 'Ethereum'); el.dispatchEvent(new Event('input',{bubbles:true}));
  ```
  The search handler is **debounced 300ms** (`store.searchChains` fires 300ms after the last `input`), so `wait_for`/sleep ~400ms before asserting results. The custom-RPC input uses `bind:value` + Enter-to-apply.
- **Theme.** Force it via `navigate_page` initScript before load:
  ```js
  localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' })); // or 'dark'
  ```
  Applies via `<html data-theme>`. Tokens: light `--bg-base` = `#ffffff`; dark `--bg-base` = `#0a0f0d`.
- **i18n raw-key caveat.** The message-catalog JSON embedded in the page HTML legitimately contains raw keys like `vcs.title` (SvelteKit hydration data). **Only judge VISIBLE rendered text.** A *visible* raw key on screen (e.g. the literal text `vcs.results.deployed`) IS a FAIL.

### 0.2 Deep-linking straight into the checker (recommended — skips typing into the search box)

`onMount` reads `?chainId=N` and immediately calls `selectChain(N)`. This is the **fastest, most deterministic** way to reach the results step without driving the debounced search:

```
http://localhost:5173/apps/vela-wallet-chain-setup?chainId=1        # Ethereum mainnet
http://localhost:5173/apps/vela-wallet-chain-setup?chainId=42161    # Arbitrum One
http://localhost:5173/apps/vela-wallet-chain-setup?chainId=8453     # Base
```

On a fully-set-up mainnet (e.g. **chainId=1**), every required contract already exists, so the wizard should land on **step 4 「链已就绪！」 (Chain is Ready!)** — a great happy-path assertion that exercises the whole read pipeline.

### 0.3 Network dependency (this page is NOT offline)

This tool makes **real external HTTP calls** — keep this in mind when reading `list_network_requests` / judging load failures:
- Chain search index + per-chain metadata: `https://ethereum-data.awesometools.dev/index/fuse-chains.json`, `…/chains/eip155-{id}.json`, and chain logos `…/chainlogos/eip155-{id}.png`.
- **Live JSON-RPC** `POST`s to the chain's public RPC URLs: `eth_chainId` (latency probe), `eth_getCode` (per contract), `eth_call` (P256 precompile), `eth_getBalance`, `eth_gasPrice`. These can be **slow or rate-limited**; the "checking" spinner may linger several seconds. That's expected, not a hang — but if `awesometools.dev` is unreachable the search/checker legitimately can't work (note it, don't mark a code bug).

### 0.4 What you can vs. cannot test headless

| Flow | Automatable? |
|---|---|
| Search, chain select, RPC probe/select/custom-RPC, full contract checklist read, P256 status, all 4 wizard steps, copy buttons, FAQ, deep-link, themes, i18n, responsive, a11y | ✅ Yes — UI + real read-only RPC |
| **Actually broadcasting a deploy** (Arachnid / Multicall3 / deployer-wallet CREATE2 txs) | ❌ NO — requires real native-token funds on a chain where contracts are *missing*. **Scope to "UI + validation + button-enable/disable + balance-poll + error-state only."** Do **not** send funds. |
| Deployer-wallet **private-key download** | ✅ The download itself works offline (Blob → `vela-deployer-*.txt`); but it only appears after you reach a Safe/EntryPoint action card (needs a chain with those missing). Use a custom RPC on an "empty"/fresh chain to surface it, or scope to read-only. |

### 0.5 Test data

```
chainId 1       Ethereum mainnet — ALL contracts deployed → expect step 4 「链已就绪！」
chainId 42161   Arbitrum One     — fully set up; good RPC-selector test
chainId 8453    Base             — fully set up
chainId 137     Polygon          — fully set up
Search terms:   "Ethereum", "Polygon", "42161" (the hint literally says 例如 Ethereum、Polygon、42161)
```
- **Custom-RPC happy path (matching chainId):** for chainId=1, a public RPC like `https://eth.llamarpc.com` or `https://ethereum-rpc.publicnode.com`.
- **Custom-RPC chainId-mismatch test:** while a chainId=1 chain is selected, paste a *different* chain's RPC, e.g. `https://polygon-rpc.com` → expect inline error **「Chain ID mismatch: RPC returned 137, expected 1」** (zh build will show the same message; it is interpolated in code, not translated).
- **Custom-RPC unreachable test:** `https://invalid.rpc.example` → inline **「RPC is unreachable」** / fetch error text.
- These pre-deployed contract addresses are checked on-chain (you can spot-verify in an explorer): EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`, Arachnid proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`, Safe Singleton Factory `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state (step = `select-chain`)
- [ ] Page returns **200** and renders; `<h1>` = **「Vela Wallet 链配置」** (en build: *Vela Wallet Chain Setup*); subtitle **「几步即可为 Vela Wallet 准备好任意 EVM 链」**.
- [ ] A single search **card** is visible: input with placeholder **「按链名称或链 ID 搜索…」**, and below it the hint **「例如 Ethereum、Polygon、42161」**.
- [ ] No chain list and **no** "no results" message yet (empty `searchQuery`).
- [ ] A **FAQ card** below shows a collapsed toggle row labeled **「这是什么？」** with a ▼ chevron; it is **collapsed by default** (no answer text visible).
- [ ] `list_console_messages` → no `error` entries (image 404s for missing chain logos are tolerated — they `onerror`-hide; see §traps).

### B. Search & chain list
- [ ] Type **`Ethereum`** (via native-setter recipe §0.1) → after ~400ms a **spinner** appears briefly, then a **chain list** (`ul.chain-list`) of up to **10** results. Each row shows a logo, the chain **name**, **「链 ID：{id}」**, and the native symbol on the right.
- [ ] Type a numeric **`42161`** → Arbitrum One appears (an **exact chainId match is pinned first**, then fuzzy matches).
- [ ] Type gibberish like **`zzzqqq`** → after debounce, **「未找到链，换个关键词试试。」** (`.no-results`) shows and the list is empty.
- [ ] Clear the box (empty value) → list and no-results message both disappear.
- [ ] Clicking a result clears the list and advances to the **checking** step (see C). (Code: `handleSelectChain` sets `searchResults=[]` then `selectChain`.)

### C. Checking step (step = `checking`)
- [ ] Immediately after selecting a chain, a centered **card with a large spinner**, title **「正在检测链兼容性…」**, and subtitle **「正在核查 {chainName} 上所需的合约」** (chainName interpolated, e.g. *Ethereum*).
- [ ] This may persist a few seconds (real RPC reads). It must **resolve** to either `results` or `complete` (it should not spin forever on a reachable chain). If `awesometools.dev` or all RPCs are down it falls through to `results` with a `checkError` banner — that's correct error handling, see G.

### D. Happy path — fully-ready chain (deep-link `?chainId=1`)
- [ ] Navigate to `…?chainId=1`. After checking, land on **step 4 / complete**: a green ✓ icon, title **「链已就绪！」** (*Chain is Ready!*), description **「{chainName} 已为 Vela Wallet 配置完毕。现在可以回到 Vela Wallet 添加这个网络了。」** with chainName = *Ethereum*.
- [ ] A **「配置另一条链」** (*Set Up Another Chain*) ghost button is present; clicking it returns to the empty `select-chain` step (search box cleared).
- [ ] `complete` only triggers when **all contracts deployed AND P256 available** (`store.runCheck`). If Ethereum mainnet shows `results` instead of `complete`, check whether the P256 precompile read failed (mainnet does NOT have RIP-7212 at `0x..0100` by default → `p256Available=false` → you'll legitimately land on **results** with the P256-missing warning card, NOT complete). **This is the more likely real outcome on L1 Ethereum** — see §traps.

### E. Results step — chain header + contract checklist (step = `results`)
Reach this via a chain that's missing something or where P256 is unavailable (Ethereum mainnet `?chainId=1` is a good candidate per D).
- [ ] **Chain header card:** logo + chain name + **「链 ID：{id}」**.
- [ ] **RPC card** (**「RPC 节点」**): shows the current RPC URL in mono, a latency badge like `42ms` (green) when known, an **「可用 RPC」** `<select>` listing probed endpoints with `(NNms)` / **「无法连接」** (unreachable, option disabled) / `(...)` pending, and a **「自定义 RPC」** input + **「应用」** button.
- [ ] **Progress card** (**「链状态」**): a count **「{total} 个合约中已就绪 {count} 个」** and a fill bar whose width ∝ deployed/total.
- [ ] **P256 row (first in the list):** label `P256 Precompile (RIP-7212)`, sublabel **「passkey 签名所需」**, and a status of **「可用」** (✓) or **「不可用」** (✗). On L1 Ethereum expect **「不可用」**.
- [ ] **Contract checklist** (`ul.contract-list`) renders **11 rows** in this order: Deterministic Deployment Proxy, Safe Singleton Factory, Multicall3, EntryPoint v0.7, Safe L2, Safe Proxy Factory, Safe 4337 Module, Safe Module Setup, WebAuthn Signer, Fallback Handler, MultiSend.
- [ ] Each row shows: a status icon (✓ deployed / ✗ missing / ⚠ mismatch), the contract **name**, a **shortened address** `0x4e59…956C`. When the chain has an `explorerUrl`, the address is a **link** (`target=_blank rel=noopener`) to `{explorer}/address/{addr}`; otherwise it's plain `<code>`. Status label = **「已部署」 / 「未部署」 / 「不匹配」**.
- [ ] **Mismatch case:** if any row is `mismatch`, it shows ⚠, the warning text **「此地址上的字节码有误！」**, and a **「不匹配」** label in `--warning` color. (Only the 3 non-CREATE2 contracts — Arachnid proxy, Safe Singleton Factory, Multicall3 — can ever be `mismatch`, since they're bytecode/hash-verified; CREATE2 ones only check code existence.)
- [ ] **Bottom actions:** **「更换链」** (ghost, → back to search) and **「重新检测」** (re-runs the on-chain check).

### F. RPC selector & custom RPC (on a results page)
- [ ] Open the **「可用 RPC」** `<select>` and choose a different reachable endpoint → the app **re-checks** (brief checking) and the current-RPC code + latency update; the choice is **persisted** (localStorage `vela-chain-setup-rpc`, keyed by chainId).
- [ ] Endpoints that failed the probe appear with **「无法连接」** and are `disabled` in the dropdown (can't be selected).
- [ ] **Custom RPC happy path:** paste a *matching-chainId* RPC (e.g. `https://eth.llamarpc.com` for chainId=1) into **「自定义 RPC」**, press **Enter** or click **「应用」** → a **「自定义」** (Custom) badge appears next to the current RPC, and a re-check runs. The **「应用」** button is **disabled when the input is empty/whitespace**.
- [ ] **Custom RPC chainId mismatch:** with chainId=1 selected, paste `https://polygon-rpc.com` → inline red error **「Chain ID mismatch: RPC returned 137, expected 1」** (in `.rpc-error`), and the RPC does **NOT** switch.
- [ ] **Custom RPC unreachable:** paste `https://invalid.rpc.example` → inline red error (e.g. *RPC is unreachable* / fetch failure text), RPC unchanged.
- [ ] Reload the page (same chain via deep-link) → the previously-applied custom RPC is **restored** from localStorage and shows the Custom badge.

### G. Error / failure states (must surface IN THE UI)
- [ ] Deep-link a chain with **no usable public RPC** (or temporarily simulate by selecting then applying a bogus custom RPC, then `recheck`): the chain-header card shows an inline **`.error-banner`** with the message text + a **「重试」** (*Try Again*) button — NOT only a console error.
- [ ] If `selectChain` itself fails (bad chainId, metadata fetch fails), step becomes `results` with `checkError` rendered in the error banner. Try `?chainId=999999999` (nonexistent) → expect a graceful error banner (e.g. *Chain not found* / *No RPC endpoints available for this chain*), not a blank screen or uncaught exception.
- [ ] **P256 missing** → a dedicated `.action-card` with a **「前置条件」** (warning) badge, title **「P256 预编译不可用」**, the explanatory desc, and the italic note **「P256 预编译是一项链级功能…」**. This card replaces the deploy CTA because nothing else can be done.
- [ ] Confirm **every** error path renders text in the DOM (snapshot it), not just `console.error`.

### H. Deploy action cards — UI/validation only (DO NOT broadcast)
> Reaching these needs a chain that's *missing* the relevant contract (and, for the deployer-wallet card, P256 available). Most well-known chains are fully set up, so you may only be able to exercise these via a niche chain or by reading the code paths. Scope to **UI + button enable/disable + balance polling + error display**; never send funds.
- [ ] **「下一步」 (Next Step)** badge appears on the active action card; the active card matches `store.nextAction` (first missing contract in dependency order: arachnidProxy → safeSingletonFactory → multicall3 → entryPoint → safe singletons…).
- [ ] **Arachnid proxy** card: title **「部署 Deployment Proxy」**, a **「开始配置」** button → reveals Step 1 (fund) with the deployer address `0x3fab184622dc19b6109349b94811493bf2a45362`, a **「复制」**/**「已复制！」** copy toggle (reverts after ~2s), an **「所需金额：…」** line, **「当前余额：…」** + **「刷新余额」**. Only when funded (balance ≥ 0.01) does Step 2 **「立即部署」** appear. **Do not click 立即部署.**
- [ ] **Multicall3** card: title **「部署 Multicall3」**, deployer `0x05f32b3cc3888453ff71b01135b34ff8e41263f2`, requires **0.1** native; same fund→deploy gating. **Do not broadcast.**
- [ ] **Safe Singleton Factory** card (external): warning badge, title **「Safe Singleton Factory」**, a 4-step numbered guide, and a **「打开 GitHub Issues」** primary link → `https://github.com/safe-global/safe-singleton-factory/issues` (`target=_blank rel=noopener`), plus the italic note. No deploy button (correct — only the Safe team can deploy it).
- [ ] **EntryPoint / Safe contracts** card: a **「预计 gas：约 {gas}」** line; **「创建部署者钱包」** generates a browser EOA → shows a **QR canvas** (white bg, scannable), the full deployer **address** + copy, **「余额：…」** + **「刷新」**/**「检测中…」**, and **「下载私钥」** (downloads `vela-deployer-<addr8>.txt` — works offline, contains the WARNING text + private key). The **「全部部署 / 部署 EntryPoint」** button only appears once `deployerHasFunds` (balance > 0). **Do not fund/deploy.**
- [ ] During a (hypothetical) batch deploy the card would show a per-contract live list with spinners/✓ and a **「在区块浏览器中查看」** tx link — verify the markup exists if you can reach `deploying`, otherwise note as code-reviewed-only.

### I. Interactions / copy
- [ ] Every **copy** button (deployer addresses, deployer-wallet address) flips its label to **「已复制！」** and reverts after ~2s; clipboard contains the **full** address. (Note: only one `copiedAddress` is tracked at a time — copying a second address reverts the first immediately; expected.)
- [ ] **FAQ toggle:** click **「这是什么？」** → expands to 3 Q&A blocks (**「这是什么？」/「这是免费的吗？」/「安全吗？」** with their answers); chevron rotates 180°; click again collapses.
- [ ] **「重新检测」** re-reads the chain (brief checking, same chain); **「更换链」** / **「配置另一条链」** reset to search.

### J. Loading / skeleton
- [ ] The checking step's large spinner and the search box's inline spinner both appear/disappear correctly. (This tool uses spinners, not skeletons — acceptable for a short read.)
- [ ] RPC dropdown options show `(...)` while `pending`, then resolve to `(NNms)` or `无法连接` — no permanently-stuck `(...)` after probes settle (~5s timeout per probe).

### K. Responsive
- [ ] **390×844 (mobile):** the 640px column collapses to full-width with `--space-3` padding; the title drops to `--text-3xl`; address `<code>` shrinks to `--text-xs` and **wraps** (`word-break: break-all`) — the long deployer/contract addresses must NOT overflow horizontally; the bottom actions **stack vertically**. Take a snapshot at each step (search / results / complete). No clipping, no horizontal scrollbar on the page body.
- [ ] **1280×900 (desktop):** centered 640px column, generous side whitespace (by design), cards intact. Also spot-check ~768px.

### L. Theme correctness (test BOTH)
- [ ] **light** (`theme:'light'`): cards are clearly delineated (border + subtle bg on white) — **no white-on-white**; the search/RPC inputs are visibly recessed; status colors read correctly (✓ green `--success`, ✗ red `--error`, ⚠ amber `--warning`); the **「下一步」** accent badge and **「自定义」** badge use the accent tint and are legible; QR canvas stays white-on-black (functional, fine).
- [ ] **dark** (`theme:'dark'`): default look intact; mono RPC URL / addresses legible against `--bg-sunken`/`--bg-base`; no gray-on-gray.
- [ ] Switch the search results, the full contract checklist, and an action card in both themes — the green/red/amber row colors and the progress fill must stay distinguishable.

### M. i18n (no raw keys leak)
- [ ] Switch locale (⚙ settings panel or however the app exposes it) to at least **one non-zh** (e.g. en → *Vela Wallet Chain Setup*, *Chain Status*, *Deployed/Not deployed*, *Next Step*) and **one other zh variant** (zh-TW/zh-HK) → **every visible `vcs.*` string translates**; **no raw key** (e.g. the literal `vcs.results.deployed`, `vcs.step.title`) is ever visible on screen.
- [ ] Spot-check interpolation in the active locale: `vcs.chainId` → `Chain ID: 1` / `链 ID：1`; `vcs.results.ready` → e.g. `8 of 11 contracts ready` / `11 个合约中已就绪 8 个`; `vcs.complete.description` substitutes the chain name.
- [ ] All **15** locales (de, en, es-MX, fr, id, it, ja, ko, pt-BR, ru, tr, vi, zh, zh-HK, zh-TW) ship this catalog and en/zh are **key-complete (103 keys each)** — if any locale shows English fallback where others translate, note it.
- [ ] **Not a bug:** brand/technical proper nouns stay English even in zh (e.g. `P256 Precompile (RIP-7212)`, `Multicall3`, `EntryPoint v0.7`, `Safe L2`, the **contract names** which come from `REQUIRED_CONTRACTS` and are not translated). Only the surrounding `vcs.*` UI chrome must translate.

### N. Accessibility / keyboard
- [ ] `Tab` through the search input → chain-result buttons → FAQ toggle → (on results) RPC `<select>`, custom-RPC input, **「应用」**, copy/refresh link-buttons, bottom actions: each interactive control takes focus with a **visible focus ring**.
- [ ] Chain-result rows and the FAQ toggle are real `<button>`s → activate on **Enter/Space**.
- [ ] The custom-RPC input applies on **Enter** (`handleCustomRpcKeydown`).
- [ ] Logo `<img>`s use empty `alt=""` (decorative) — acceptable. Address-link buttons are keyboard reachable.
- [ ] **Likely gap to verify:** copy buttons and the contract-status icons (✓/✗/⚠) have **no `aria-label`/`title`/`aria-live`** — a screen-reader user gets only the visible glyph + status text. Note whether status is conveyed by text (it is: 「已部署」/「未部署」) and not by color/icon alone. Flag if the only signal is the glyph.

### O. Console / network hygiene
- [ ] `list_console_messages` after the full pass → **no unexpected `error`s.** Tolerated noise: `404`/`onerror` for missing chain-logo PNGs (handled by hiding the img), and **expected RPC failures** when probing dead public endpoints (the app catches these → they may log as failed fetches but must NOT throw uncaught).
- [ ] `list_network_requests`: confirm the read pipeline hits `awesometools.dev` (search index, chain JSON, logos) and the chain's **public RPC** with `POST` JSON-RPC (`eth_chainId`, `eth_getCode`, `eth_call`, `eth_getBalance`, `eth_gasPrice`). Confirm **no broadcast** (`eth_sendRawTransaction`) happens unless you deliberately deployed (you shouldn't).

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. End with a short summary:

```
Checks: N total · X pass · Y fail
Top user-impacting issues:
1. …
2. …
```

Call out separately (not as page bugs): the **dev-server 500** if you hit it (env), and the **spec mismatch** (this is a per-chain checker, not a "12 chains + fiat + service-node" adder).

---

## 3. Known traps / notes specific to THIS tool

- **Spec ≠ implementation.** The task brief ("add 12 chains + Tempo to a connected wallet, with RPC + fiat + service-node settings") does **not** match this route. There is no wallet connect, no Tempo, no fiat, no service-node UI, and no curated 12-chain list — it's an **arbitrary-EVM-chain contract-readiness checker + guided deployer**. Test the real UI; report the mismatch as a finding (docs/route may be mislabeled).
- **The running dev server currently 500s on every route** (see §0). It's the `dev-server-i18n-clobber` symptom; restart `bun run dev` before testing. Don't attribute it to this page.
- **L1 Ethereum likely lands on `results`, not `complete`.** `complete` requires `p256Available === true`, but mainnet has **no RIP-7212 P256 precompile** at `0x..0100`. So `?chainId=1` is expected to show the contract checklist (all ✓) **plus** the **「P256 预编译不可用」** warning card. To actually see step-4 `complete`, you need a chain that has *both* all contracts AND the P256 precompile (some L2s / OP-stack chains). Don't mark "not reaching complete on mainnet" as a bug.
- **This page is online.** It depends on `ethereum-data.awesometools.dev` and live public RPCs. Slowness/rate-limits during checking are expected, not hangs. If that host is down, search & check can't function — that's external, not a code defect.
- **Search is debounced 300ms** and capped at **10** results, with exact chainId pinned first. Assert after the debounce.
- **Custom RPC validates chainId before switching** (`eth_chainId` must equal the selected chain) — a deliberate guard; the mismatch error is interpolated in code (English) regardless of locale.
- **Only 3 contracts can show `mismatch`** (Arachnid proxy, Safe Singleton Factory, Multicall3 — bytecode/hash-verified). CREATE2 contracts only verify code existence, so they're ✓/✗ only.
- **Deployer-wallet private key lives in `localStorage`** (`vela-chain-setup-deployer`, per chainId) in **plaintext**, and the RPC choice in `vela-chain-setup-rpc`. Not a test failure, but worth noting as a security characteristic; the **「下载私钥」** file includes a plaintext key + warning banner.
- **`copiedAddress` is a single shared value** — copying a second address instantly reverts the first's **「已复制！」**. Don't expect two simultaneous "Copied!" states.
- **QR canvas uses hardcoded `#fff`/`#000`** — that's a functional requirement (QR must be black/white), **not** a token violation.
- **Do NOT broadcast any deploy.** Funding + `eth_sendRawTransaction` spends real money on a real chain. All deploy CTAs are out of scope for headless QA beyond verifying enable/disable, copy, balance polling, and error rendering.
- **Image 404s for chain logos** are caught by inline `onerror` handlers that hide the img — tolerated console noise, not a bug.
