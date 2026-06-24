# Balance Radar — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/lib/pda-apps/balance-radar/TESTING.md`，用 chrome-devtools MCP 把 **余额雷达** (`/apps/balance-radar`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard‑won quirks of *this* app so the agent doesn't re‑discover them.

- App URL: `http://localhost:5173/apps/balance-radar`
- What it does: bulk‑query **native + ERC‑20** token balances for many wallet addresses across several EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Base, Endurance + user‑added custom chains).
- UI language is locale‑dependent; default zh strings are quoted below so you know what to look for.

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/balance-radar` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900`. Mobile: `390×844`.

### 0.1 Critical gotchas (read before you start — these WILL bite you)

- **Browser lock / "browser is already running".** If `navigate_page` errors with *"The browser is already running … chrome-profile"* or *"Target closed"*, the dedicated automation profile is stuck. Recover with:
  ```bash
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  find ~/.cache/chrome-devtools-mcp/chrome-profile -maxdepth 1 -name "Singleton*" -delete
  ```
  then `navigate_page` again. (This profile is a throwaway cache profile — safe to kill.)
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all‑white frame, and after a burst of interactions the tab sometimes navigates itself to `about:blank` (HMR / MCP relay churn). Before trusting a screenshot, sanity‑check with `evaluate_script` → `{ url: location.href, h1: document.querySelector('h1')?.textContent }`. If `url` is `about:blank` or `h1` is null, **re‑navigate and redo** the setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot`** for assertions; use screenshots mainly for visual spot‑checks (retake if blank).
- **Prefer fewer, batched `evaluate_script` calls.** Each round‑trip is a chance for the relay to reset the page. Do setup (select network + focus editor) in one `evaluate_script`, then type, then assert in one more.

### 0.2 Driving the custom address editor (the #1 trap)

The "钱包地址" box is **not** a plain `<textarea>` — it's a custom `LineEditor` (proeditor) with a hidden `textarea.pe-hidden-input` and a rendered overlay. So:

- ❌ `fill` on it does nothing useful. ❌ Setting `.value` programmatically gets **reset** by the editor. ❌ Pasting via a synthetic `ClipboardEvent` inserts the text *visually* but leaves validation at "0 有效" until a real keystroke nudges it.
- ✅ **Reliable recipe — real keystrokes:**
  1. `evaluate_script`: `document.querySelector('main textarea.pe-hidden-input').focus()`
  2. `type_text` the addresses joined by `\n` (one per line)
  3. `press_key` `Enter` (commits the last line)
  4. `press_key` `Backspace` (removes the trailing empty line)
  5. Verify status reads **"N 有效"** and **开始查询** is enabled.
- Behaviour to expect (not bugs): the line **under the cursor** renders amber and is **not counted** until you move off it; a **trailing empty line** shows a ⚠ warning count. That's why step 3+4 exist.
- To clear: click **"清空"** (bottom‑right of the editor) — it should be localized (Chinese **清空** / **上传**, *not* English "Clear"/"Upload"). If you see English here, that's a FAIL (i18n regression).

### 0.3 Driving native controls & theme

- Results **network filter** (`<select class="filter-select">`): `sel.value='ethereum'; sel.dispatchEvent(new Event('change',{bubbles:true}))`.
- Results **search** (`<input class="filter-input">`): use the native value setter then `dispatchEvent(new Event('input',{bubbles:true}))`.
- **Theme**: `document.documentElement.setAttribute('data-theme','light')` (or `'dark'`). Tokens: light `--bg-base`/`--bg-elevated` = `#ffffff`; dark `--bg-base` = `#0a0f0d`, `--bg-elevated` = `#1a2620`.
- **Optional deterministic driving**: the page also exposes its actions over a WebMCP relay (`config_setValidAddresses`, `config_toggleNetwork`, `execution_run`, `get_execution_state`, …). These bypass the editor entirely but are **flaky** (tools connect/disconnect with changing name suffixes). Use them only if the relay is stable; otherwise stick to the keyboard recipe above.

### 0.4 Test data (well‑funded mainnet addresses)

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — always has ETH
0xab5801a7d398351b8be11c439e05c5b3259aec9b   # has ETH on multiple chains
```
- ERC‑20 contract for the "add custom token + Fetch metadata" test (non‑preset on Ethereum): SHIB `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE`.
- Bogus RPC for the failure test: `https://invalid.rpc.example`.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state
- [ ] Page returns 200 and renders; `<h1>` = **余额雷达**; subtitle mentions **原生代币 与 ERC‑20** (not "native only").
- [ ] Editor shows placeholder ("在此粘贴钱包地址…"); status **"0 有效"**.
- [ ] **Ethereum** preselected; under it **ETH (原生币)** token chip selected.
- [ ] **开始查询** is **disabled**, and the hint **"输入至少一个地址并选择代币后即可开始查询"** is visible to its left.
- [ ] `list_console_messages` → no `error` entries.

### B. Address input & validation
- [ ] Enter one valid address (recipe §0.2) → **"1 有效"**, 开始查询 enabled, query‑count **"1 次余额查询"** appears.
- [ ] Enter an invalid line (e.g. `0x123`) → it's flagged (amber / ⚠), **not** counted as valid.
- [ ] **清空** empties the editor → **"0 有效"**, hint + disabled button return.
- [ ] **上传** opens a file‑upload modal (1 column "钱包地址").
- [ ] Upload & Clear labels are **localized** (Chinese), not English.

### C. Network & token selection
- [ ] Toggling a network on reveals a per‑network **"<Name> · 代币"** section; toggling off hides it.
- [ ] **全选** selects all 6 built‑ins (each gets a token section); **全不选** clears all → no token sections, button disabled.
- [ ] You **cannot deselect the last token** of a network (at least one stays selected).
- [ ] Query count = (valid addresses) × Σ(selected tokens per selected network). Verify with 2 addresses × (Ethereum: ETH+USDC) = **4**.

### D. Happy path query
- [ ] 1+ address + Ethereum/ETH → 开始查询 → **结果** card appears.
- [ ] Stats show **总计 / 成功 / 耗时**; 成功 = number of returned rows.
- [ ] Table column **网络** shows the **display name** ("Ethereum", **not** "ethereum"/"custom-…").
- [ ] **余额** is formatted (a few significant decimals, thousands‑grouped; e.g. `5.6908`, `73.0819`, `0.002001`) — **not** an 18‑decimal string. Hover/title shows the exact full value.
- [ ] Address cell is truncated (`0xd8dA6B...A96045`) with full address in its `title`.
- [ ] Add a 2nd network (e.g. **Base**) and re‑run → rows for both networks; filter dropdown lists both display names.

### E. Results interactions
- [ ] Click each header (**地址 / 网络 / 代币 / 余额**) → sorts; arrow **↑/↓** toggles on re‑click. **余额** sorts **numerically** (0.002 < 3.12 < 5.69 < 73.08), not lexically.
- [ ] Network filter dropdown narrows rows to the chosen chain.
- [ ] Search box filters by address substring; **combines** with the network filter.
- [ ] Click an address → it shows **"已复制"** (green) for ~1.5s then reverts; clipboard contains the **full** address.
- [ ] **导出 CSV** downloads `balance-radar-YYYY-MM-DD.csv` with header `Address,Network,Token,Contract,Balance` and one row per result (balances at **full precision**, not the truncated display). (To assert content in‑page, wrap `URL.createObjectURL` to capture the Blob before clicking.)
- [ ] **重新运行** returns to the config card with addresses/networks/tokens preserved.

### F. Custom network / token (persisted in IndexedDB)
- [ ] **添加代币** on Ethereum → paste SHIB contract → **Fetch** auto‑fills symbol (`SHIB`) + decimals (`18`) → submit → chip appears with **Custom** badge and is auto‑selected; a remove **×** is present.
- [ ] **添加网络** → fill name/chainId/RPC(https)/symbol → submit adds a chip with **Custom** badge + remove ×. Validations: duplicate chainId rejected; empty/non‑http RPC rejected; the form shows the error inline.
- [ ] Reload the page → custom network & token **persist** (loaded from IndexedDB on mount).
- [ ] Removing a custom network also drops its custom tokens and any selections referencing it.

### G. Error / failure states
- [ ] Add a custom network whose RPC is bogus (`https://invalid.rpc.example`), select it + a real address, run → the run completes and **failures are surfaced in the UI**: 成功/失败 stats reflect it and the **失败** panel toggle reveals address / network / error rows. (This is the previously‑broken path — failures must NOT be silently dropped.)
- [ ] All‑invalid addresses → 开始查询 stays disabled (can't start).

### H. Loading / error‑banner / no‑match states
- [ ] While a (larger/slower) query runs, a **progress bar** + **活动日志** (activity log) show; fast queries may skip straight to results — acceptable.
- [ ] If the whole run errors, the config card shows an inline **error banner** (not only console).
- [ ] Filter/search down to nothing → table shows the **"无结果 / No results"** empty row.

### I. Responsive
- [ ] **390px**: network/token chips wrap to multiple rows; the summary bar (hint + button) stacks; results table scrolls horizontally; action buttons go full‑width. No overflow/clipping.
- [ ] **1280px** (and ~768px): layout intact, card centered, max width respected.

### J. Theme correctness
- [ ] Switch to **light** (`data-theme=light`): card is clearly delineated by border + shadow on the white page (**no white‑on‑white**); recessed inputs visible; all text legible; selected chips use the accent tint.
- [ ] Switch back to **dark**: default look intact.

### K. i18n
- [ ] Switch locale (via the ⚙ settings panel, or whatever locale switch the app uses) to at least one non‑zh and one zh variant → every visible `br.*` string translates; **no raw keys** (e.g. `br.summary.start`) leak; the editor's Upload/Clear translate too.

### L. Accessibility / keyboard
- [ ] `Tab` through chips / link‑buttons / primary button → each shows a visible **focus ring**.
- [ ] Sortable headers are focusable and sort on **Enter/Space**; they expose `aria-sort` (`ascending`/`descending`/`none`).
- [ ] The address‑copy control is keyboard‑activatable.

### M. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected `error`s.
- [ ] (Optional) `list_network_requests` → balance reads hit the configured RPC endpoints and use Multicall3.

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non‑blank) screenshot. End with a short summary: # checks, # pass, # fail, and the top user‑impacting issues.

## 3. Known‑good reference (as of this writing)

A correct run of §D/E looks like: 2 addresses × {Ethereum, Base} native → 4 rows, network shown as `Ethereum`/`Base`, balances like `5.6908` / `73.0819` / `3.1244` / `0.002001`; balance‑sort ascending orders them `0.002001, 3.1244, 5.6908, 73.0819`; clicking an address flashes `已复制`. If you see raw `ethereum` keys, 18‑decimal balances, English Upload/Clear, two clear buttons, or no failure panel when RPCs fail — those are regressions of fixes already landed.
