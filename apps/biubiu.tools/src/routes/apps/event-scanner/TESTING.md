# Event Scanner — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/event-scanner/TESTING.md`，用 chrome-devtools MCP 把 **事件扫描器** (`/apps/event-scanner`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- **App URL:** `http://localhost:5173/apps/event-scanner`
- **What it does (一句话):** Tax/audit-grade EVM **event-log scanner**. Pick any chain (search by name/ID, auto-fastest RPC), enter a contract (proxy-aware: it can auto-fetch the ABI and follow EIP-1967/1822/Beacon/1167/Diamond proxies), pick an event + indexed-topic filters (or a "track a wallet in/out" shortcut), choose a block/date range, and **Start Scan**. It runs `eth_getLogs` with **RPC failover + adaptive chunk-splitting**, decodes logs against the ABI, persists results to **IndexedDB** (resumable across reloads), tracks **block-coverage gaps** for auditability, and exports **CSV/JSON**. Optional **live-tail** keeps watching new blocks. There is also a CLI (`bun run pda:event-scanner`).
- UI language is locale-dependent; default zh strings are quoted below so you know what to look for.

---

## 0.1 Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/event-scanner` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900`. Mobile: `390×844`.

## 0.2 Critical chrome-devtools-MCP gotchas (COPY THESE — they bite every run)

- **Profile lock / "browser is already running … chrome-profile" / "Connection closed".** The dedicated automation profile is stuck. Recover with:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck? full reset:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1–2 MCP calls**, then it may relock. So don't chain a long string of `click`s — batch "set value + click" into one `evaluate_script` / `navigate_page(initScript)` and screenshot separately.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame; after a burst of interactions the tab sometimes navigates itself to `about:blank` (HMR / relay churn). Before trusting a screenshot, sanity-check with `evaluate_script` → `{ url: location.href, h1: document.querySelector('h1')?.textContent }`. If `url` is `about:blank` or `h1` is null, **re-navigate and redo** setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot` for assertions.**
- **Batch round-trips.** Each `evaluate_script` / `navigate_page` is a chance for the relay to reset the page. Do setup (search chain, set contract, apply preset) in as few calls as possible.
- **Svelte 5 binding.** Inputs here use `value={…}` + `oninput`/`onchange` (NOT `bind:value`), but they still need a real event. `el.value=...` alone does NOT update component state — use the native setter + dispatch:
  ```js
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'xxx');
  el.dispatchEvent(new Event('input', { bubbles: true }));   // contract/abi/range use oninput
  // the Etherscan-key field + <select> use 'change': dispatch new Event('change',{bubbles:true})
  ```
  The chain search input + RPC live inside the shared **NetworkPicker** widget — easiest is to drive the chain via the WebMCP/preset path or by typing into the search box and clicking a result; see §0.4.
- **Theme.** `navigate_page` initScript: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`. Per-field merge, so writing only `theme` is safe.
- **i18n raw-key caveat.** The message-catalog JSON embedded in the page HTML **legitimately** contains raw keys like `es.cfg.startScan` (hydration data). Only judge **visible rendered text**. A visible raw key (e.g. a literal `es.results.complete` on screen) **IS a FAIL**.

## 0.3 The hard truth about real scans in this MCP (read before §1.G/H)

- **A real `eth_getLogs` scan against a public RPC is frequently blocked by CORB/CORS** inside the chrome-devtools MCP browser (same problem documented in `balance-radar/TESTING.md`). So an end-to-end "scan returns rows" run is **best-effort**, not guaranteed.
- The **logic** (gap tracking, completeness badge, resume, fillGaps, dedup, CSV/JSON shape) is fully exercised by the **unit tests**: `src/lib/pda-apps/event-scanner/event-scanner.spec.ts` (`bun run test event-scanner` or `bunx vitest run event-scanner`). Run them and cite the result as evidence for the data-integrity items.
- For UI states that need persisted data (saved scans, **Complete** badge, **gaps warn**, **interrupted/resume**, results table, export), the reliable approach is **inject a ScanMeta + events into IndexedDB** and reload. The DB is `biubiu-event-scanner` (version 1), stores `scans` (keyPath `scanId`) and `events` (keyPath `pk`, index `scanId`, compound index `scanId_block` = `[scanId, blockNumber]`). A ready-to-paste injector is in §0.5.

## 0.4 Driving the config without a real scan

Fastest deterministic config (no network needed for the *form*; network is only hit on RPC probe / Start):

```js
// evaluate_script — apply the ERC-20 preset, set a contract, switch to a tiny block range.
// (Selecting a chain still requires the NetworkPicker; do that by typing in the search box
//  and clicking a result, OR use a preset that carries chainId like 'usdt-bsc'.)
const setVal = (el, v) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
// 1) type a chain search then click the first result:
const search = document.querySelector('input[placeholder*="chain"], input[placeholder*="链"]');
setVal(search, 'ethereum');     // wait for results, then click the first row
```
- **Presets** (`Quick presets` / `快速预设`): buttons reading **ERC-20 Transfers / `ERC-20 转账`**, **USDT on BSC**, **ERC-7708 native transfers**. Clicking `USDT on BSC` pre-fills contract `0x55d398326f99059fF775485246999027B3197955` AND triggers chain select to BSC (chainId 56). This is the lowest-friction "fill the form" path.
- **Contract input:** `<input name="es-contract">` (oninput). **ABI textarea:** `textarea.mono.ta` (oninput) — but presets/Fetch ABI fill it for you.
- **Event** `<select>` (onchange). **Range** segmented control: buttons `Last N days` / `上次 N 天`-style (zh: 最近 N 天 / 日期范围 / 区块范围). Blocks mode inputs are `placeholder="From block"/"To block"`.
- **Start** button: `button.btn-primary.btn-lg` — text **Start Scan** / `开始扫描` (or **Scanning…** / `扫描中…` while running).

## 0.5 Inject saved scans into IndexedDB (the only reliable way to see results/badges)

Paste this in `evaluate_script`, then **reload** the page (`navigate_page` same URL). It seeds **three** saved scans to cover every audit state:

```js
await (async () => {
  const DB='biubiu-event-scanner', V=1, SCANS='scans', EVENTS='events';
  const open=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB,V);
    r.onupgradeneeded=()=>{const db=r.result;
      if(!db.objectStoreNames.contains(SCANS))db.createObjectStore(SCANS,{keyPath:'scanId'});
      if(!db.objectStoreNames.contains(EVENTS)){const s=db.createObjectStore(EVENTS,{keyPath:'pk'});
        s.createIndex('scanId','scanId');s.createIndex('scanId_block',['scanId','blockNumber']);}};
    r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const db=await open();
  const abi=[{type:'event',name:'Transfer',anonymous:false,inputs:[
    {name:'from',type:'address',indexed:true},{name:'to',type:'address',indexed:true},
    {name:'value',type:'uint256',indexed:false}]}];
  const net={key:'chain-1',name:'Ethereum',chainId:1,rpcs:['https://eth.llamarpc.com'],
    symbol:'ETH',decimals:18,explorerUrl:'https://etherscan.io'};
  const base=(id,name,extra)=>({scanId:id,name,network:'chain-1',net,chainId:1,
    contract:'0xdAC17F958D2ee523a2206206994597C13D831ec7',explorerUrl:'https://etherscan.io',
    abi,eventName:'Transfer',eventSignature:'Transfer(address,address,uint256)',
    topic0:'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    filterSets:[{id:'all',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,null]}],
    fromBlock:1000,toBlock:2000,chunkSize:500,eventCount:2,
    createdAt:Date.now(),updatedAt:Date.now(),live:false,...extra});
  const scans=[
    base('scan-complete','Complete demo',{lastScannedBlock:2000,gaps:[]}),                 // green "Complete"
    base('scan-gaps','Gappy demo',{lastScannedBlock:2000,gaps:[[1200,1250],[1800,1800]]}), // warn + Re-scan gaps
    base('scan-interrupted','Interrupted demo',{lastScannedBlock:1500,gaps:undefined}),    // interrupted + Resume (drives top resume-bar)
  ];
  const ev=(id,bn,li,from,to,val)=>({scanId:id,pk:`${id}:0xtx${bn}:${li}`,network:'chain-1',
    contract:'0xdAC17F958D2ee523a2206206994597C13D831ec7',filterSetId:'all',eventName:'Transfer',
    args:{from,to,value:val,arg0:from,arg1:to,arg2:val},blockNumber:bn,
    txHash:`0x${'a'.repeat(63)}${li}`,logIndex:li});
  const evs=[
    ev('scan-complete',1100,0,'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045','0x000000000000000000000000000000000000dEaD','1000000'),
    ev('scan-complete',1900,1,'0x000000000000000000000000000000000000dEaD','0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045','25000000000'),
    ev('scan-gaps',1300,0,'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045','0x000000000000000000000000000000000000dEaD','42'),
    ev('scan-gaps',1700,0,'0x000000000000000000000000000000000000dEaD','0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045','99'),
  ];
  await new Promise((res,rej)=>{const tx=db.transaction([SCANS,EVENTS],'readwrite');
    scans.forEach(s=>tx.objectStore(SCANS).put(s));evs.forEach(e=>tx.objectStore(EVENTS).put(e));
    tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
  return 'seeded';
})();
```
After reload, the **Saved scans / `已保存的扫描`** strip should list all three; a top **resume bar** should appear for `Interrupted demo` (its `lastScannedBlock 1500 < toBlock 2000`). Click a saved chip to open it and check its audit badge.
To clean up: `indexedDB.deleteDatabase('biubiu-event-scanner')` then reload.

## 0.6 Test data (real, well-funded mainnet)

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # vitalik.eth — for "track a wallet" filter
0xdAC17F958D2ee523a2206206994597C13D831ec7   # USDT (Ethereum) — verified ERC-20, has ABI
0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE   # SHIB (Ethereum) — verified ERC-20
0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413   # TheDAO — historic proxy-ish, for proxy/ABI tests
0x55d398326f99059fF775485246999027B3197955   # USDT on BSC (chainId 56) — the 'usdt-bsc' preset
```
- Invalid contract for validation: `0x123` (too short) and `notanaddress`.
- Bogus custom RPC for the failure test: `https://invalid.rpc.example`.
- Note `0xd8dA…` mixed-case is EIP-55 checksummed; `buildScanInput` runs `getAddress()` so lowercase also works.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / empty state
- [ ] Page returns 200 and renders; `<h1>` = **Event Scanner** / `事件扫描器`; subtitle mentions proxy-aware / resumable / exportable (zh: `…支持代理、可续扫、可导出`).
- [ ] The **Network** / `网络` picker is shown with the search box (`Search any chain by name or chain ID…` / `按名称或链 ID 搜索任意链…`) and the hint about auto-fastest RPC.
- [ ] **No config card below the picker yet** — the contract/ABI/event/range section and **Start Scan** button appear **only after a chain is selected** (`{#if cfg.chain}` gate). Confirm there is no orphan Start button before a chain is picked.
- [ ] No **resume bar**, no **alert**, no **results** card on a clean profile (clear IndexedDB first: `indexedDB.deleteDatabase('biubiu-event-scanner')` + reload).
- [ ] `list_console_messages` → no `error` entries.

### B. Chain selection (NetworkPicker)
- [ ] Type `ethereum` into the search box → results appear (`Searching…` / `搜索中…` flickers), clicking a result selects it; the picker collapses to the chosen chain with a **Change** / `更换` control, and an RPC is auto-selected (fastest probe wins).
- [ ] Type a numeric chain ID (e.g. `8453`) → Base resolves.
- [ ] **Custom RPC:** entering a URL whose `eth_chainId` ≠ the selected chain surfaces an inline `Chain ID mismatch…` error; an unreachable URL surfaces `RPC unreachable`/the error message. (Errors render in the UI, not only console.)
- [ ] **Change** / `更换` clears the chain and hides the whole config card again (back to §A state).

### C. Presets
- [ ] After a chain is selected, the **Quick presets** / `快速预设` row shows 3 chips: **ERC-20 Transfers** / `ERC-20 转账`, **USDT on BSC**, **ERC-7708 native transfers**. No raw `es.preset.*` keys.
- [ ] Click **ERC-20 Transfers** → ABI textarea fills (Transfer + Approval), the **Event** select appears with `Transfer(address,address,uint256)` selected, `ABI` shows a `preset` source tag, and **Track a wallet** / `追踪某个钱包（转入 + 转出）` toggle becomes available (preset enables walletTrack).
- [ ] Click **USDT on BSC** → it both switches the chain to BSC (chainId 56) AND fills contract `0x55d398326f99059fF775485246999027B3197955`.
- [ ] Click **ERC-7708 native transfers** → an `implNote` warning appears about ERC-7708 being a draft / verify the emitter (the placeholder contract `0x0000…0000` is intentional — flag it as a note, not a bug, but the warning text MUST be visible).

### D. Contract + ABI + proxy
- [ ] Type an **invalid** contract `0x123` → the input gets the `.bad` red border and the Start button's need-hint reads `That doesn't look like a valid address (0x + 40 hex characters).` / `地址格式不正确…`.
- [ ] Clear it → need-hint reads `Enter the contract address you want to scan.` / `请填写要扫描的合约地址。`
- [ ] Enter a valid contract but no ABI → need-hint reads `Add the ABI — paste it, or use "Fetch ABI / Detect proxy" above.` / (zh add-abi text). Start stays disabled.
- [ ] **Fetch ABI** / `获取 ABI` on USDT (`0xdAC17…ec7`) on Ethereum → button shows `Fetching…` / `获取中…`, then the ABI textarea + Event select populate and an `abiSourceLabel` tag appears. *(Network-dependent; if CORB blocks the fetch, it must show an inline ABI error, not a silent dead button.)*
- [ ] **Detect proxy** / `检测代理` on a proxy contract → on success a proxy banner (`proxy.label` + `→ 0x…`) appears and impl events merge; on a plain contract the impl note reads "No proxy detected — this is a regular contract." Either way feedback is in the UI.
- [ ] Pasting garbage ABI text → inline `abiError` text under the textarea.

### E. Event + filters + wallet-track
- [ ] With ERC-20 ABI loaded, the **Event** select lists `Transfer(...)` and `Approval(...)`; switching events resets indexed filters.
- [ ] **Filters** / `筛选` section: for Transfer it shows per-indexed-param inputs (`from (topic1)`, `to (topic2)`); for an event with no indexed params it shows `This event has no indexed parameters to filter on.` / `此事件没有可筛选的索引参数。`
- [ ] **Track a wallet** toggle ON → a single wallet input (`Wallet address to track (0x…)`) replaces the per-topic inputs, with the hint `Scans both directions…`. Enter `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`. An invalid wallet shows the `.bad` border + `That wallet address looks invalid.` / `该钱包地址看起来无效。`
- [ ] Toggling Track-a-wallet on an event **without** two indexed address params → Start need-hint reads `Wallet tracking needs an event with two indexed address fields, like Transfer.` (e.g. try it on Approval — Approval has two indexed addresses so it qualifies; verify with a single-indexed-address event if one is available).

### F. Range
- [ ] Segmented control offers **Last N days** / `最近 N 天`, **Date range** / `日期范围`, **Block range** / `区块范围`.
- [ ] **Last N days** default = 7; the `1 / 7 / 30 / 90` day chips set the value and the active chip highlights; the number input also edits it. Entering `0` makes range invalid → Start disabled with need-hint `Set a scan range.` / `请设置扫描范围。`
- [ ] **Block range:** entering `From block` > `To block` is rejected (range not OK → Start disabled). Equal/ascending is accepted.
- [ ] **Date range:** two `datetime-local` inputs; both required for validity.

### G. Happy path scan (best-effort — see §0.3)
- [ ] With a valid chain+contract+ABI+event+small range, **Start Scan** enables (need-hint disappears, `Ready to scan.` is the internal ready state).
- [ ] Click Start → status flips to **running**: the page scrolls to and shows the **Execution** widget with a progress bar (`Scanning… {current}/{total} blocks ({percent}%)` / preparing text) and an **Activity** / `活动` log with a "Show technical log" toggle. The button reads **Scanning…** / `扫描中…` and is disabled.
- [ ] On completion: page scrolls to **Results**; a green **Complete** badge appears IF no gaps (see §I); the results table renders. *(If CORB blocks the RPC, expect either an inline **Scan failed** alert (§H) or a scan that records gaps (§I) — NOT a silent success. Note which happened.)*
- [ ] After a run, `Progress is saved automatically…` / `进度已自动保存…` hint behavior holds — reloading the page keeps the scan in **Saved scans**.

### H. Error / failure states (must surface IN THE UI)
- [ ] Force a config that can't build (e.g. clear the contract after a chain is chosen, then somehow trigger Start) → `handleStart` sets `startError` to `Please complete the configuration before scanning.` / `请先完成配置再开始扫描。` rendered as a top **alert** (`role="alert"`) titled **Scan failed** / `扫描失败` with a dismiss ×.
- [ ] A genuinely failing run (bogus custom RPC `https://invalid.rpc.example` selected, then Start) → on error the status becomes `error` and the same red **alert** shows `errorMessage`; clicking **Dismiss** / the × resets to idle. The failure is NEVER only in the console.
- [ ] All-invalid / incomplete config → **Start Scan** stays disabled (can't even start).

### I. Audit / completeness — THE RECENTLY-FIXED BEHAVIOR (verify carefully)
Use the injected scans from §0.5 (open each saved chip), and back it up with the unit tests (§0.3).
- [ ] **Complete demo** (`gaps:[]`, `lastScannedBlock === toBlock`): a **green** `.audit.ok` badge with a check icon reading **Complete — every block in this range was scanned.** / `数据完整 —— 此范围内每个区块都已扫描。`
- [ ] **Gappy demo** (`gaps:[[1200,1250],[1800,1800]]`): a **warning** `.audit.warn` badge reading **`52 block(s) in 2 range(s) couldn't be fetched from any RPC — results may be incomplete.`** / `2 段共 52 个区块未能从任何 RPC 获取…`, plus a mono range preview like `#1200–1250, #1800`, plus a **Re-scan gaps** / `重扫缺口` button. **There must be NO green Complete badge here** — a chunk that failed on every RPC must read as INCOMPLETE. (This is the bug that was fixed: gaps used to be silently dropped → false "complete".)
- [ ] **Interrupted demo** (`lastScannedBlock 1500 < toBlock 2000`, `gaps:undefined`): the audit badge reads **Scan was interrupted before finishing.** / `扫描未完成 —— 上次在此中断。` with a **Resume / `继续扫描`** button; ALSO the **top resume-bar** appears (`Your last scan "Interrupted demo" didn't finish — progress is saved, you can resume.` / `上次的扫描「…」未完成 …`) with **Resume scan** + a dismiss ×.
- [ ] **Legacy scan caveat:** a scan whose `gaps === undefined` AND `lastScannedBlock >= toBlock` shows **no** audit badge at all (saved before gaps were tracked — neither falsely-green nor falsely-warned). Confirm the code path: only `gaps:[]` (defined) yields the green badge.
- [ ] **Re-scan gaps** click → calls `fillGaps`; status flips to running with `Re-scanning gaps…`, then on success the gaps shrink/clear and the badge updates (green if all filled). *(Network-dependent; if it can't reach the RPC, expect an inline error via the alert, not a crash.)* Cross-check `event-scanner.spec.ts` for the deterministic gap-fill assertion.
- [ ] **Resume** (top bar or in-results) click → re-runs only the unfinished chunks (断点续扫); dismissing the top resume-bar (×) hides it for that scanId without deleting the scan.

### J. Results interactions
- [ ] **Saved scans** / `已保存的扫描` strip lists scans newest-first; each chip shows name + `#chainId · eventName · count`; an active chip is outlined; each has a **Resume** (↻, aria-label `Resume / re-scan` / `继续 / 重扫`) and **Delete** (×, aria-label `Delete scan` / `删除扫描`) control.
- [ ] Clicking a chip's main body loads that scan into the table (stats: `<n> events` / `条事件`, block range `#from–to`, short contract).
- [ ] **Order toggle:** button flips between **Newest first** / `最新优先` and **Oldest first** / `最早优先`; the table re-sorts by block.
- [ ] **Table columns** are derived from the event ABI: `Block` / `区块`, `Time` / `时间`, (a `Dir` column ONLY when wallet-track produced >1 filter set, with `IN`/`OUT` pills), then one column per event param (`from address`, `to address`, `value uint256`), then `Tx`.
- [ ] **Numeric column mode select** (raw/amount/date) appears on uint/int columns; `value` (matches the AMOUNT regex) defaults to **amount** with a decimals input (default 18) → `25000000000` shows as `25` at 9 decimals etc.; switching to **raw** shows grouped digits; a `timestamp`-named column would default to **date**.
- [ ] **Address cells** render as a short link to the explorer (`etherscan.io/address/0x…`) when `explorerUrl` is set, else a copyable button. **Tx** cell links to `/tx/0x…`. Hover/title shows the full value.
- [ ] **Copy:** a copyable cell (no explorer) shows **Copied** / `已复制` for ~1.4s after click; clipboard holds the full value.
- [ ] **Time column** lazily fetches block timestamps and shows a relative time (`… ago`) with a full datetime in the title; before load it shows a faint `…`. *(Network-dependent; faint `…` is acceptable if RPC blocked.)*
- [ ] **Pagination** appears only when `eventTotal > 100` (PAGE_SIZE=100): `‹  1–100 / total  ›`, prev disabled on page 0, next disabled on last page.
- [ ] **Empty results** (a scan with `eventCount 0`): the table is replaced by `No events matched this scan.` / `此扫描未匹配到任何事件。` + the hint `Try widening the block or time range, or check your filters.` / (zh hint).

### K. Export
- [ ] **Export CSV** / `导出 CSV` (disabled when `eventTotal === 0`) downloads `event-scan-<8hex>-YYYY-MM-DD.csv` with header `block,txHash,logIndex,direction,event,<argKeys…>` and one row per event. Values are **full precision** (raw `args`, not the truncated/amount display). (To assert content in-page, wrap `URL.createObjectURL` to capture the Blob before clicking.)
- [ ] **Export JSON** / `导出 JSON` downloads `event-scan-<8hex>-YYYY-MM-DD.json` with a top-level `coverage` header (`chainId, contract, event, fromBlock, toBlock, complete, gaps, eventCount, exportedAt`), the full `scan` meta, and the `events` array. Verify for the **Gappy demo** that `coverage.complete === false` and `coverage.gaps` lists the ranges — this is the auditable export of the gap fix.
- [ ] **New scan** / `新建扫描` resets to idle (config card) without deleting saved scans.

### L. Live-tail (config-only unless a real scan runs)
- [ ] Under **Advanced options** / `高级选项` (collapsed by default; toggle `▸/▾`), the **Live-tail** / `实时追踪…` checkbox, **Scan name** field, and **Etherscan V2 API key** field are present.
- [ ] If a scan runs with live ON: a **Live** / `实时` badge with a pulsing dot + a **Stop** / `停止` control appears in the results header; Stop ends it. *(Needs a real completed scan — scope to "UI present" if RPC blocked.)*
- [ ] Etherscan key field persists to `localStorage['es-etherscan-key']` (set it, reload, confirm it's repopulated via `hydrate`).

### M. Responsive
- [ ] **390px:** the network picker, config card, range segmented control, and preset chips wrap without horizontal overflow; the results table scrolls horizontally inside `.table-wrap`; the resume-bar and alert keep their layout (icon + text + button + ×) without clipping; controls row wraps. Page padding shrinks (`@media max-width:640px`).
- [ ] **1280px** (and ~768px): card centered, `max-width: 920px` respected, no stretched controls.

### N. Theme correctness (BOTH themes — no white-on-white)
- [ ] **light** (`data-theme=light`): the config + results **cards** are clearly delineated (border + shadow) on the white page — no white-on-white; recessed inputs (`--bg-raised`) visible; the **green Complete** badge (`--success-subtle/--success`), the **amber gaps/interrupted** badge (`--warning-subtle/--warning`), and the **red Scan-failed alert** (`--error-subtle/--error`) are all legible; the disabled Start button is a quiet neutral (NOT a muddy faded green).
- [ ] **dark:** default look intact; same three semantic states readable; `IN` (green) / `OUT` (amber) direction pills distinguishable.

### O. i18n
- [ ] Switch locale (⚙ settings panel / locale switch) to at least one non-zh (e.g. `en`) and one zh variant → every visible `es.*` string translates; **no raw keys leak** on screen (e.g. a literal `es.results.gapsWarn` or `es.cfg.startScan` rendered as text is a FAIL).
- [ ] Interpolated strings render their values: resume banner shows the scan **name**, gaps warning shows **block count** + **range count**, progress shows current/total/percent.
- [ ] The reference i18n file is `src/messages/en/apps/event-scanner.json`; confirm sibling locales exist and are key-complete (`zh`, `zh-TW`, `zh-HK`, `de`, `es-MX`, `fr`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`, `vi`). A missing locale file is itself a finding.

### P. Accessibility / keyboard
- [ ] `Tab` through preset chips, contract/ABI/range inputs, the Start button, and saved-scan/results controls → each shows a visible focus ring (inputs use `--accent-ring`).
- [ ] The resume-bar ×, alert dismiss ×, saved-scan Resume/Delete icons all have `aria-label`s (`Resume scan`/`Dismiss`/`Delete scan`/`Resume / re-scan`) — verify via `take_snapshot` (roles).
- [ ] The alert container has `role="alert"` (screen-reader announced). The Start button's disabled state is conveyed by `disabled` (not just opacity).
- [ ] Copyable cells and link cells are keyboard-activatable (Enter/Space on the button; links are native `<a>`).

### Q. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no unexpected `error`s (CORB/network-fetch warnings from blocked RPCs are explainable; note them).
- [ ] `list_network_requests` during a scan → requests are `eth_getLogs` / `eth_chainId` / `eth_getBlockByNumber` JSON-RPC POSTs to the selected RPC; ABI fetch hits Etherscan/WhatsABI sources. No requests at all while merely editing the form (other than chain search / RPC probe).

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. End with: **# checks, # pass, # fail**, and the **top user-impacting issues** (ranked).

| Area | Check | PASS/FAIL | Evidence |
|------|-------|-----------|----------|
| A | … | … | … |

---

## 3. Known traps / notes specific to THIS tool

- **CORB on public RPCs** makes end-to-end real scans unreliable in the MCP browser (§0.3). Lean on the **unit tests** (`event-scanner.spec.ts`) for data-integrity claims and the **IndexedDB injector** (§0.5) for UI states. State clearly in the report which checks were verified live vs. via injection/tests.
- **The config card is gated on a selected chain** — there is no Start button until a chain is chosen. Don't report "Start missing" before selecting a chain.
- **The gap/completeness fix is the headline regression target.** The three valid audit states are mutually exclusive and ordered in the code: `interrupted` (lastScannedBlock < toBlock) → `gaps.length > 0` (warn + Re-scan gaps) → `gaps` defined & empty (green Complete). A scan with `gaps === undefined` and fully scanned shows **no** badge (legacy). A green Complete badge while gaps exist, or a silent "success" when every-RPC-failed chunks exist, is a **FAIL** of the landed fix.
- **ERC-7708 preset uses a placeholder emitter `0x0000…0000`** by design — the UI must show the draft-standard warning; treat the zero address as intentional, but verify the warning is visible.
- **`USDT on BSC` preset is the cheapest "fill the whole form" path** (sets chain + contract + ABI + event + walletTrack in one click).
- **Amount columns auto-format via name regex** (`amount|value|wad|tokens|qty|balance|supply|fee|cost|price|reserve|stake` → amount; `time|timestamp|deadline|expir|start|end|when|date|until` → date). A column named `value` defaulting to "amount" at 18 decimals is expected, not a bug — switch to `raw` to see the integer.
- **Export filenames use the first 8 hex of the scanId** (`event-scan-<8hex>-<date>.csv|json`); the scanId is the merkle root of the job set (deterministic identity — same config = same scanId).
- **IndexedDB DB name `biubiu-event-scanner` is separate from TaskHub's own job-state DB.** Deleting it resets saved scans but not in-flight TaskHub state.
- **Live-tail handle + getLogs pool are module-scoped (not in ctx)** and not serializable — they won't survive a reload; resuming reconstructs them. Reloading mid-live-tail stops the tail (expected).
- **CSV header order differs from the JSON shape** — CSV is `block,txHash,logIndex,direction,event,<args>`; JSON wraps `{coverage, scan, events}`. Don't expect identical columns; verify each independently.
- **`getAddress()` is applied to contract + wallet** on build, so lowercase input is fine; an invalid checksum that's still 40 hex will pass the regex but `getAddress` would throw — if Start silently no-ops on a bad-checksum address, note it (the regex gate is looser than viem's checksum).
