# Contract Deployer — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/contract-deployer/TESTING.md`，用 chrome-devtools MCP 把 **合约部署器** (`/apps/contract-deployer`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- **App URL:** `http://localhost:5173/apps/contract-deployer`
- **What it does:** Deploy a compiled Foundry contract via **CREATE2** (deterministic address — same on every chain). The flow is a single, growing screen (NOT a wizard): a slim **setup bar** (1) connect a local **Foundry build server** + (2) sign in with a **passkey wallet**; then sections reveal one-by-one as you fill them — **Choose a contract** (select + constructor args) → **Pick the target chain** (search any EVM chain, auto-pick fastest RPC, run a passkey-infra readiness check) → **Review & deploy** (predicted CREATE2 address, salt + gas behind "Advanced", one Deploy button) → **Verify on the explorer** (Etherscan/Blockscout) + deployment history. Below everything sits a collapsible **Log**.
- Default UI language is **English** (locale `en`); the strings to look for are quoted from `src/messages/en/apps/contract-deployer.json` below.

> **Scope caveat — READ THIS.** The full happy path is **un-automatable headless**: it needs (a) a separate local **Foundry build server** running on port 8420 (`deno run -A jsr:@command/foundry-contract-deployer-server` inside a Foundry project), AND (b) a real **passkey** sign-in (WebAuthn), AND (c) a funded smart-contract wallet on a real mainnet to actually sign + broadcast. None of these can be driven by an MCP browser. So this playbook splits into:
> - **Automatable (the bulk):** first load, the progressive-reveal gating logic, the setup bar's disconnected UI + validation, copy feedback, the deploy-blocker messages, themes, responsive, i18n, a11y, console hygiene. Drive these by **directly mutating the store** via `evaluate_script` (see §0.4 — the store is a singleton you can poke to fake "connected"/"wallet"/"contract"/"chain" states without a real server or wallet).
> - **Manual / needs-funded-wallet:** the live readiness check against a real RPC, the actual `Deploy Contract` passkey signing + broadcast, and on-chain `Verify`. For these, verify **UI + validation + error-state only**; mark the broadcast itself as "needs funded wallet / manual step".

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/contract-deployer` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900`. Mobile: `390×844`.

### 0.1 Critical chrome-devtools-MCP gotchas (read before you start — these WILL bite you)

- **Profile lock.** On `The browser is already running … chrome-profile` or `Connection closed`:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1-2 MCP calls**, then it may re-lock. So **don't chain long sequences of `click`s** — batch "set state + click" into a single `evaluate_script` (or `navigate_page` `initScript`) and screenshot separately.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` sometimes returns an all-white frame, and after a burst of interactions the tab can self-navigate to `about:blank` (HMR / MCP relay churn). Before trusting a screenshot, sanity-check:
  ```js
  evaluate_script: () => ({ url: location.href, h1: document.querySelector('h1')?.textContent })
  ```
  If `url` is `about:blank` or `h1` is null → re-navigate and redo. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions.**
- **Batch work into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip can reset the page.
- **Svelte 5 binding:** `el.value = …` does NOT trigger `bind:value`. Use the native setter + dispatch input:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '0xNEWSALT'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  (`store.salt` input, the gas inputs, the Etherscan key, the verify address all use `bind:value` / `oninput`.)
- **Theme:** in `navigate_page` `initScript`: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`. A faster live toggle: `document.documentElement.setAttribute('data-theme','light')`.
- **i18n raw-key caveat:** the message-catalog JSON embedded in the HTML legitimately contains raw keys (hydration data). **Only judge VISIBLE rendered text.** A visible raw key (e.g. `deploy.gate.server`, `deploy.action.deploy`) IS a FAIL.

### 0.2 i18n locale switching (this app)

There is **no in-page locale `<select>`**. The locale is set by a **cookie + full reload** (SSR-resolved):
```js
// switch to Chinese, then reload:
document.cookie = 'locale=zh;path=/;max-age=31536000;SameSite=Lax'; location.reload();
// back to English:
document.cookie = 'locale=en;path=/;max-age=31536000;SameSite=Lax'; location.reload();
```
(The human path is the ⚙ **Settings** button in the header → Language grid; both do the same cookie+reload.) Supported locales: `de en es-MX fr id it ja ko pt-BR ru tr vi zh zh-HK zh-TW`.

### 0.3 The store is a singleton — poke it to fake states (the #1 enabler here)

The page binds to one module-level reactive store, `deployStore`, exported from `$lib/deploy/deploy-store.svelte.js`. The four reveal gates are pure derivations of store fields:

| Section reveals when | store condition |
|---|---|
| **Contract** card | `store.serverStatus === 'connected'` |
| **Network** card | + `store.selectedContract !== null` |
| **Deploy** card | + `store.networkReady` (`selectedChain !== null && rpcUrl !== ''`) |
| **Verify** card | `store.history.length > 0` |

So you can reveal/inspect every card **without a real server or wallet** by mutating the store. Grab it once:
```js
// IMPORTANT: dynamic import returns the SAME singleton the page uses.
evaluate_script: async () => {
  const m = await import('/src/lib/deploy/deploy-store.svelte.js'); // path may be a hashed module in prod build; in `vite dev` this works
  const s = m.deployStore;
  s.serverStatus = 'connected';
  s.serverPath = '/Users/me/my-foundry-project';
  s.contracts = [{ name: 'MyToken', file: 'src/MyToken.sol', bytecode: '0x60806040', abi: [
    { type: 'constructor', inputs: [
      { name: 'initialOwner', type: 'address' },
      { name: 'supply', type: 'uint256' }
    ] }
  ] }];
  return { status: s.serverStatus, n: s.contracts.length };
}
```
> If the dynamic-import path fails under `vite dev`, fall back to driving the **disconnected UI** (port input + Connect button, sign-in button) and the contract `<select>` directly — but note the real server/wallet are required to actually advance. The **deploy-blocker** messages (§1-G) are still fully testable via the store route because `canDeploy`/`deployBlocker` are pure getters.

> **`walletStore.isConnected`** is also part of `setupReady` / `canDeploy`. Faking a connected wallet is harder (it drives passkey/contract-wallet abstractions). If you can't, scope the "wallet connected" checks to: the **sign-in button** renders, and `deployBlocker === 'wallet'` shows the gate text `Sign in with your passkey to continue`.

### 0.4 Test data

- Well-funded mainnet address (use as the `initialOwner` constructor arg / verify address sanity): **`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`** (vitalik.eth).
- The CREATE2 proxy this tool deploys through (constant): **`0x4e59b44847b379578588920cA78FbF26c0B4956C`**.
- Default salt (all-zero bytes32, 66 chars incl. `0x`): `0x0000000000000000000000000000000000000000000000000000000000000000`.
- A **valid non-default salt** to test marked-dot + re-prediction: `0x0000000000000000000000000000000000000000000000000000000000000001`.
- An **invalid salt** (too short → blocks prediction): `0x1234`.
- Baked-in shared Etherscan key (pre-filled in the Verify field): `1GA442Z79I7USRD8KWF8DBQ799MCX3JDX2`.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state (no server, no wallet)
- [ ] Page returns 200 and renders; `<h1>` = **Contract Deployer**; subtitle = **CREATE2 deterministic deployment with Passkey signing**.
- [ ] The **setup bar** shows two cells:
  - **Local build server** with a grey/idle dot, a **port** number input (default `8420`), a **Reconnect** button, and the command `deno run -A jsr:@command/foundry-contract-deployer-server` in a code chip.
  - **Passkey wallet** with a grey/idle dot and a **Sign In** button.
- [ ] **No** Contract / Network / Deploy / Verify cards are visible yet (all four reveal-gates are false). The page is just hero + setup bar (+ no Log, since `logs` may be empty until `init()` fails to connect).
- [ ] `store.init()` runs on mount → it tries to connect to `localhost:8420`. If no server, the Log disclosure appears with an **error** line `Cannot connect to Foundry server. Make sure it is running.` (red). This is expected and is the **correct in-UI surfacing** of the failure (not console-only).
- [ ] `list_console_messages` → the failed `fetch` to `:8420` is OK to see as a network error, but **no uncaught JS errors / no Svelte warnings**.

### B. Setup bar — server connection UI + validation
- [ ] Port input accepts numbers; `min=1 max=65535` enforced (`type=number`). Set it to e.g. `9999` (native setter + input event) → `store.serverPort` updates.
- [ ] Click **Reconnect** with no server → button shows **Connecting...** transiently, then reverts; an error Log line is added; the server dot stays idle. (Real connect needs the build server — manual.)
- [ ] **Server connected (faked via store, §0.3):** the cell flips to the **ok** style (green icon tint), shows the **project path** as a click-to-copy button (the full `serverPath`), and exposes two mini icon-buttons: **Build** (hammer) and **Reconnect** (refresh). Clicking the path copies it and the copy/clipboard icon flips to a ✓ for ~2s.
- [ ] The **Contract** card now reveals (gate `serverStatus==='connected'`).

### C. Contract section (reveals after server connected)
- [ ] With `store.contracts = []`: shows the hint **No contracts found. Build your project first.** and a **Build** primary button. (Clicking Build calls `forge build` on the server — manual; with no server it logs a build error.)
- [ ] With contracts present (faked): a `<select>` appears whose first option is **Select a contract...**, then one option per contract rendered as `Name · file` (e.g. `MyToken · src/MyToken.sol`).
- [ ] Selecting a contract **with** a constructor reveals **Constructor arguments** and one `SmartParamInput` per arg (label = arg name, type pill = arg type).
- [ ] Selecting a contract **without** a constructor shows **This contract has no constructor arguments — nothing to fill in.**
- [ ] **No-bytecode guard:** select a contract whose `bytecode` is `'0x'` / missing / `< 10` chars → a warn pill **No deployable bytecode — this looks like an interface or abstract contract.** appears, AND a `warn` Log line is added.
- [ ] **SmartParamInput type-awareness** (spot-check on the faked `(address, uint256)` ctor):
  - `address` field: typing `0x123` (bad) → red border, no ✓; typing `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` → green border + ✓ badge + a shortened-address preview.
  - `uint256` field: chips **Raw / Token amount / {ETH} / gwei / Duration / Date**; type `1000000000000000000` → a grouped preview `= 1,000,000,000,000,000,000`. Switching to **Token amount** + typing `1.5` ×10^`18` rewrites the canonical value.
- [ ] Each arg change re-runs `updatePredictedAddress()` and re-pre-fills `gasLimitInput` (visible later in Advanced).

### D. Network section (reveals after a contract is selected)
- [ ] The **NetworkPicker** card shows title **Pick the target chain** + intro **Only chains with full passkey-wallet support are listed. The fastest RPC is selected automatically.** and a search box (placeholder from `widgets.networkPicker.searchPlaceholder`).
- [ ] **Quick-pick when search is empty:** the list shows the 8 common chains with logos — **Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Avalanche, Gnosis** — each with `#chainId · symbol` subline.
- [ ] Typing in the search box (debounced ~280ms) queries the chain index; a spinner shows while `searching`. (Live network — if the chains API is unreachable, results go empty; that's an env issue, note it.)
- [ ] **Selecting a chain** (e.g. click Ethereum) → `loadingChain` spinner, then the card collapses to a single **bar** showing the chain logo + name + `Chain {id}` + a **Change** link + an **RPC** dropdown (auto-picked fastest) + a **Custom** toggle. A readiness check kicks off (badge **Checking...** → **Ready** or **Not ready**). **Note:** the live readiness check against a real RPC needs network; if it can't reach RPCs you'll see `Network not ready` with a checklist — that's the real failure path, not a UI bug.
- [ ] **Readiness checklist (not-ready path):** when not ready, an amber `notready` panel lists, with ✓/✗ icons: **CREATE2 deployment proxy** (deployable), **Safe wallet contracts** (deployable), **P256 verification (RIP-7212)** (chain-level), and **Gas balance** (deployable, only if a balance was read). Hard block (no P256) shows hint **P256 verification (RIP-7212) is a chain-level capability that can't be deployed…**; contracts-missing shows **Missing on-chain contracts — deploy them … in one step on the network-setup page.** + a **Set up this network** CTA linking to `/apps/vela-wallet-chain-setup?chainId=…`.
- [ ] **Ready path** (only on a fully-supported chain w/ a reachable wallet): green pill **All infrastructure contracts verified · Balance: N SYMBOL**.
- [ ] **Custom RPC validation:** open Custom, paste a bogus URL, Apply → `rpcError` surfaces in the card (e.g. unreachable / `Chain ID mismatch: RPC is chain X, expected Y`). The error must show **in the card**, not just console.
- [ ] **Change** link resets the chain and re-shows the search list with the common chains.
- [ ] Once a chain + RPC are set, the **Deploy** card reveals (gate `networkReady`).

### E. Deploy section (reveals after networkReady)
- [ ] **Predicted address block** appears once `store.predictedAddress !== null` (needs a selected contract + valid 66-char salt). Label **Predicted Address**, the address rendered as either an explorer link (if `explorerUrl` known) or a click-to-copy button, plus a note **This is the exact address your contract will get — identical on every supported chain.**
- [ ] **Already-deployed detection:** after the predicted address + RPC settle (debounced 500ms), `checkAddressDeployed()` runs `eth_getCode`. If code exists, the block turns **red** (`.taken`), shows **Contract already deployed at this address**, auto-fills `verifyAddress`, and `deployBlocker` becomes `deployed` → Deploy button disabled with gate **A contract already exists at this address**.
- [ ] **Advanced disclosure** (`Advanced — salt & gas`): collapsed by default; shows a **marked dot** when `salt !== EMPTY_SALT`. Expand it →
  - **Salt (bytes32)** input (mono); editing it re-predicts the address live.
    - Set salt to the non-default value (`…0001`) → predicted address **changes** + the disclosure dot appears.
    - Set salt to the invalid `0x1234` → predicted address block **disappears** (prediction returns null because `salt.length !== 66`) and `deployBlocker` is non-null (Deploy stays disabled). The salt itself is silently rejected for prediction — verify the Deploy button does NOT enable.
  - **Gas Settings:** three inputs **Gas Limit**, **Max Fee ({unit})**, **Priority ({unit})**. `{unit}` is `gwei` or `wei` (auto-detected). Gas Limit is pre-filled from bytecode size; Max/Priority placeholders read **fetching...** until `fetchGasPrices()` returns.
- [ ] **The one primary action** is a full-width **Deploy Contract** button (rocket icon). It is **disabled unless `canDeploy`** (server connected + wallet connected + contract + chain + ready + rpc + valid salt + not deploying + not already-deployed).
- [ ] **Deploy-blocker message** under the button (when disabled): shows the FIRST blocking reason via `deploy.gate.<key>`. Verify each maps correctly (drive by toggling store fields — these are pure getters):

  | store state | gate key | visible text |
  |---|---|---|
  | server not connected | `server` | **Connect the build server to continue** |
  | wallet not connected | `wallet` | **Sign in with your passkey to continue** |
  | no contract | `contract` | **Select a contract first** |
  | no chain | `network` | **Select a target chain first** |
  | rpc empty | `rpc` | **Set an RPC endpoint first** |
  | network check not ready | `notReady` | **This chain isn't ready yet — check the network status** |
  | predicted addr already deployed | `deployed` | **A contract already exists at this address** |

  None of these should ever render the raw key (`deploy.gate.server` etc.) — that's a FAIL.
- [ ] **Deploying state** (manual / needs funded wallet): when `deploying` is true the button shows a spinner + **Deploying...**, and the status line cycles through `deploy.status.*` (**Checking wallet status... → Building transaction... → Estimating gas... → Confirm with passkey... → Submitting transaction... → Waiting for confirmation... → Deployment confirmed!**). The actual passkey prompt + broadcast can't be automated — mark "needs funded wallet / manual".
- [ ] **Successful deploy** (manual): on success the Log gets `Deployed at 0x…` + `Tx: 0x…` + an `Explorer: https://…` link (clickable, from `linkify`), the record is saved to history, `verifyAddress` is pre-filled, and the **Verify** card reveals.

### F. Verify section + history (reveals when history is non-empty)
- [ ] Seed history (fake: `store.history = [{ id:'1', timestamp:Date.now(), contractName:'MyToken', chainName:'Ethereum', chainId:1, address:'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', txHash:'0x'+'ab'.repeat(32), salt:'0x'+'0'.repeat(64), constructorArgs:[], deployer:'0x…', verified:false }]`) → the **Verify on the explorer** card appears.
- [ ] **Verifier segmented control** (Etherscan / Blockscout): Etherscan is default + active; clicking Blockscout flips active styling and **hides** the Etherscan-key field.
- [ ] **Etherscan** selected → **Etherscan API Key** label with a **Get a free key** link (→ etherscan.io/apidashboard, opens new tab), and the key input pre-filled with the baked-in key.
- [ ] **Deployed Address** input (placeholder `0x…`) is pre-filled with the deployed/predicted address when one exists.
- [ ] **Verify** button is disabled unless `!verifying && verifyAddress.trim() && serverStatus==='connected'`. Clicking it (with server) runs `forge verify` on the build server — the actual verify needs the server + a real on-chain contract → **manual**; with a bad/empty address it logs `Enter the deployed contract address`.
- [ ] **Deployment History** list: each row shows contract name, a chain pill, a relative time, a **Verified** ✓ pill if verified, the address as an explorer link (or copy button), and a `tx …` link. **Clear All** opens a `ConfirmModal` (title from `deploy.history.title`, message **Clear all deployment history?**); Cancel keeps it, Confirm empties it.
- [ ] History **persists across reload** (stored via `$lib/deploy/history.js` — IndexedDB/localStorage). Reload the page → seeded/real records still render. (If you only faked `store.history` in memory, this won't persist — use a real deploy or the history API to test persistence; otherwise scope to "in-memory render OK".)

### G. Log / activity panel
- [ ] The **Log** disclosure renders **only when there are log entries** (`store.logs.length > 0`). Title **Log**; the collapsed summary shows the **latest** message; auto-opens while `deploying`.
- [ ] **Clear** button empties the log → the disclosure disappears again.
- [ ] Log entry colors map to type: info, ok (green), warn (amber), error (red).
- [ ] URLs in log lines are **linkified** to safe `target=_blank rel=noopener` anchors (e.g. the Explorer line). Verify a log line containing `https://…` renders a clickable link, and that `<`/`>`/`&` in messages are escaped (no HTML injection).

### H. Error / failure states (must surface IN THE UI)
- [ ] **No build server** → the connect failure is an **error Log line**, not console-only. (§A.) PASS requires the red line to be visible after opening the Log.
- [ ] **Build failure** (manual, needs server) → `Build failed: <output>` error Log line.
- [ ] **Bad custom RPC** → `rpcError` shown inline in the network card (§D).
- [ ] **Already-deployed address** → red predicted block + disabled Deploy + gate text (§E).
- [ ] **Invalid constructor args** at deploy time → `buildInitCode` returns null → Deploy short-circuits and logs **Invalid constructor arguments** (error). (Reachable only when `canDeploy` is otherwise true — manual; but you can confirm the predicted-address block disappears when args can't encode, e.g. put a non-numeric string in the `uint256` field → `BigInt()` throws → `predictedAddress` becomes null → Deploy card has no predicted block + Deploy disabled.)
- [ ] **Insufficient gas** key exists (`deploy.error.gasInsufficient`) — surfaced in the not-ready gas hint / deploy errors; verify no raw key.

### I. Loading / skeleton states
- [ ] Server **Connecting...** label on the Reconnect button while `serverStatus==='connecting'`.
- [ ] Network **Checking...** badge + the NetworkPicker spinner while `networkChecking` / `loadingChain` / `searching`.
- [ ] Gas inputs show **fetching...** placeholders until prices arrive.
- [ ] Predicted-address **Checking...** note while `checkingAddress`.
- [ ] Deploy button spinner + **Deploying...** while `deploying`; Verify button spinner + **Verifying...** while `verifying`.
- [ ] Revealed cards **fly/fade in** on reveal (≤220ms, `y:10`); with `prefers-reduced-motion` the duration collapses to 0. No glow/pulse.

### J. Responsive
- [ ] **1280×900:** the whole page is a single **640px max-width centered column** (`.page { max-width:640px }`). Cards stack vertically, centered, comfortable.
- [ ] **390×844 (mobile):** the setup bar **switches to a vertical stack** (its `@media (max-width:560px)` flips `flex-direction:column` and the divider to a horizontal rule). The three **gas inputs stack vertically** (`@media (max-width:480px)`). No horizontal overflow; the predicted address (long hex) wraps (`word-break`), the server path wraps. Buttons are full-width where intended (Deploy, Verify, Build).
- [ ] Spot-check ~768px: layout intact within the 640px column.

### K. Theme correctness (test BOTH)
- [ ] **Light** (`data-theme=light`): every card (setup bar `--bg-raised`, panels `--bg-elevated`, NetworkPicker `--bg-elevated`) is clearly delineated by a 1px border + soft shadow on the white page — **no white-on-white**. The predicted-address block (`--accent-subtle` tint), the not-ready amber panel (`--warning-muted`), the red `.taken` block (`--error-muted`), the green "ready" pills, the gas/salt inputs, and all text are legible.
- [ ] **Dark** (`data-theme=dark`): default look intact; the same blocks readable; the baked-in command chip (accent text on `--bg-sunken`) legible.
- [ ] No hardcoded white/black surfaces leaking through (the QR canvas is allowed black/white — that's functional).

### L. i18n (no raw keys leak)
- [ ] Switch to **zh** (cookie + reload, §0.2) → every VISIBLE string translates: title, subtitle, setup-bar titles, contract/network/deploy/verify headings, the gate text under Deploy, the Log title, the readiness checklist labels. **No raw `deploy.*` keys visible.**
- [ ] Switch to one more non-zh locale (e.g. `ja` or `fr`) and re-spot-check the gate text + section headings.
- [ ] Switch back to **en**.
- [ ] Reminder: raw keys inside the embedded message-catalog `<script>` JSON are hydration data — only judge rendered text.

### M. Accessibility / keyboard
- [ ] `Tab` through the page: port input, Reconnect/Sign In buttons, contract `<select>`, constructor inputs, search box, RPC `<select>`, salt + gas inputs, Deploy button, verifier seg buttons, key + address inputs, Verify button, Clear-all — each shows a **visible focus ring** (inputs get `--accent` border + ring on `:focus`).
- [ ] The **Advanced** disclosure button is keyboard-operable (Enter/Space toggles; `aria-expanded` reflects state).
- [ ] The verifier segmented control is a `role="group"` with `aria-label`; the readiness/no-bytecode warnings are real text (not icon-only).
- [ ] Constructor `address` input bad/good state is conveyed by border color AND a ✓ badge / preview (not color alone for the valid case).
- [ ] Copy controls (path, address, predicted address) are real `<button>`s, keyboard-activatable; success is signalled by an icon swap (not only a transient color).

### N. Console / network hygiene
- [ ] `list_console_messages` after the full pass → **no uncaught JS errors, no Svelte warnings**. The `fetch` failures to `localhost:8420` (no server) and to RPC/chains APIs (env) are acceptable network errors — call them out but don't fail the build on them.
- [ ] `list_network_requests`: confirm the app only talks to `localhost:8420` (build server), the chains/RPC endpoints, and the bundler gas endpoint — nothing unexpected.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. End with a short summary: **# checks, # pass, # fail, # blocked (needs server/wallet/funds)**, and the top user-impacting issues.

Example row:
`E | Deploy-blocker text for 'wallet' | PASS | gate reads "Sign in with your passkey to continue", not raw key`

---

## 3. Known traps / notes specific to THIS tool

- **The happy path can't be fully automated.** It needs (1) the external Foundry build server on :8420, (2) a real passkey/WebAuthn sign-in, and (3) a funded contract wallet on a mainnet to broadcast. Drive the UI via the store singleton (§0.3) for everything except the real connect/sign/deploy/verify, which are manual.
- **Wallet sign-in is hard to fake.** `walletStore.isConnected` gates `setupReady` and `canDeploy`. If you can't fake a connected wallet, you can still fully test the **Contract/Network/Deploy/Verify** cards by setting `serverStatus`, `contracts`, `selectedContractIndex`, `selectedChain`, `rpcUrl`, `history` — but the Deploy button will stay disabled with gate `wallet`. That's expected; verify the gate text, not a green button.
- **Salt validation is silent for prediction.** An invalid salt (≠66 chars) just makes `predictedAddress` null (the predicted block vanishes and Deploy stays disabled). There's a string `deploy.error.invalidSalt` ("Salt must be 66 characters…") but the salt input itself does **not** render an inline error — confirm whether a too-short salt gives the user any visible feedback beyond the predicted block disappearing. **If you find no inline salt error, flag it as a UX gap to verify with the team.**
- **Gas unit label depends on chain gas price.** `{unit}` flips between `gwei` and `wei` after `fetchGasPrices()`. On a chain with sub-0.0001-gwei base fee the labels read **wei** — not a bug.
- **Already-deployed is a feature, not a bug.** CREATE2 means re-deploying the same initcode+salt collides; the red block + disabled button is correct. Changing the salt (Advanced) produces a fresh address.
- **`deploy.step.*` and a couple of `deploy.error.*` / `deploy.account.*` keys are not rendered by the current single-screen widgets** (leftover from the retired wizard). Don't treat their absence on-screen as a FAIL; only flag a *visible* raw key.
- **Verify needs the build server** (it shells out to `forge verify`). With no server, Verify just logs an error — that's the right in-UI behavior.
- **History persistence** is via `$lib/deploy/history.js`. In-memory `store.history =` assignments won't survive reload; only real deploys (or calling the history API) persist. Scope the persistence check accordingly.
- **The network search + readiness check + gas fetch hit live external services** (chains index, RPCs, vela bundler). In a sandboxed/offline run these will fail — distinguish "tool bug" from "no network": a real bug surfaces a raw key, a broken layout, or a silent swallow; an env failure surfaces a proper inline error / not-ready checklist (which is the intended graceful degradation).
