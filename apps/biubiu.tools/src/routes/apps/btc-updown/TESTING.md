# BTC Up/Down Dashboard — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/btc-updown/TESTING.md`，用 chrome-devtools MCP 把 **BTC 涨跌看板** (`/apps/btc-updown`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- App URL: `http://localhost:5173/apps/btc-updown`
- What it does: a **real-time dashboard** for the Polymarket "BTC Up/Down (5-minute)" prediction strategies. It connects to a remote strategy server via **SSE** (live feed) and REST (`/strategy`, `/stats`, `/rounds`, `/hourly`, `/daily`, `/health`), shows a **strategy sidebar** (built-in + discovered + user-added **custom** backends + managed live-trading endpoints), **stats cards**, **hourly / weekday profit charts**, a **rounds history table** with filters & pagination, and a **live event feed**. Default upstream is `https://bitcoin-up-or-down-5mins-001.awesometools.dev`. There is **no wallet required** to view simulation data; live-trading management needs a passkey + managed endpoint and is out of scope for headless automation (see §0.5).
- UI language is locale-dependent; the default English strings are quoted below (the zh title is **BTC 涨跌看板**) so you know what to look for.

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/btc-updown` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`).
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `list_network_requests`, `wait_for`).
3. Desktop viewport: `resize_page` to `1280×900` (the 2-column sidebar+content grid only appears at **≥1280px**). Mobile: `390×844` (sidebar becomes a bottom **drawer** behind a floating FAB).

> **Network dependency.** This page is NOT self-contained — it talks to a live upstream over the public internet (SSE + REST + a Polymarket price API). If the sandbox has no egress, the page still renders shell/empty states but data panels will be empty and the status badge will read **Connecting…/Disconnected**. That is acceptable for most UI/i18n/responsive/theme checks; mark data-dependent checks as **BLOCKED (no network)** rather than FAIL. Confirm egress first with the §1.A connection-badge check.

### 0.1 Critical chrome-devtools-MCP gotchas (read before you start — these WILL bite you)

- **Profile lock / "browser is already running".** If a tool call errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  then `navigate_page` again. Rule of thumb: **one unlock buys ~1–2 MCP calls**, then it may re-lock — so batch your work.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab sometimes self-navigates to `about:blank` (HMR / MCP relay churn). Before trusting a screenshot, sanity-check with `evaluate_script` → `{ url: location.href, h1: document.querySelector('h1')?.textContent }`. If `url` is `about:blank` or `h1` is null, **re-navigate and redo** the setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot`** for assertions; use screenshots only for visual spot-checks (retake if blank).
- **Batch into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip is a chance for the relay to reset the page. Do setup (theme + locale + click target) in one `navigate_page` initScript, then assert in one more `evaluate_script`.
- **Svelte 5 binding.** `el.value = ...` does NOT trigger `bind:value`. For the Add-Endpoint URL input (and the live-control number inputs) use the native setter + input event:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(el, 'https://example.com'); el.dispatchEvent(new Event('input',{bubbles:true}));
  ```
- **Theme.** Force via `navigate_page` initScript: `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). Applies via `<html data-theme>`. You can also append `?th=light` / `?th=dark` to the URL — the page reads `th`/`ts`/`nl`/`dl`/`cur` query params on mount (a sharing feature).
- **i18n raw-key caveat.** The message-catalog JSON embedded in the HTML legitimately contains raw keys like `btcUpdown.title` (hydration/`%paraglide%` data) — that is **normal**, not a bug. Only judge **VISIBLE rendered text**. A visibly rendered raw key (e.g. the literal string `btcUpdown.strategy.builtin` showing in the UI) **IS a FAIL**.
- **Persistence.** Strategy selection, custom endpoints, hidden strategies and collapsed sections persist in `localStorage` key **`biubiu-btc-updown-strategies`**. To get a true first-visit state, clear it in an initScript: `localStorage.removeItem('biubiu-btc-updown-strategies')` before load. To inspect: `JSON.parse(localStorage.getItem('biubiu-btc-updown-strategies'))`.

### 0.2 Driving the custom-endpoint flow (the headline RECENTLY-FIXED behavior)

The **"+ Add Endpoint"** button (top of sidebar, label `btcUpdown.strategy.addCustom` = **"Add Endpoint"**) opens a modal (`AddStrategyModal`) with a single URL input (`input.strategy-url-input`, placeholder `https://your-server.com`) and **Cancel / Add** buttons.

What happens on submit (`addCustomStrategy` in `+page.svelte`):
1. The URL is normalized (`http://` auto-prepended if no scheme; trailing `/` stripped; a pasted `/api` or `/api/vN` suffix is stripped back to the server root).
2. The app calls `discoverStrategies(endpointUrl, '/api/strategies', 'en', strategyFetch)`. `strategyFetch` tries a **direct** `fetch` first, and on CORS/network failure falls back to **`/api/proxy?url=<encoded>`**.
3. **`/api/proxy` now enforces an SSRF guard** (`assertPublicUrl` in `src/lib/server/ssrf.ts`) and `redirect: 'error'`. So:
   - A legit **public https** backend → discovery succeeds → its strategies appear under a new host group in the sidebar and the first is auto-selected.
   - An **internal / SSRF** target (e.g. `http://127.0.0.1`, `http://localhost`, `http://169.254.169.254`, `http://10.0.0.1`, numeric `http://2130706433`) → the proxy returns **HTTP 403** `{"error":"Blocked URL","reason":...}`; discovery yields nothing → the modal shows the inline error **"No strategies found at this endpoint"** (string is currently English-literal in `addCustomStrategy`, not an i18n key — note this).
   - **Important nuance:** for `http://127.0.0.1`, `strategyFetch` first tries a *direct browser fetch* to `127.0.0.1`. In dev that may connect to *some* local service or fail with a network/CORS error before ever hitting the proxy. The **server-side SSRF block** is best asserted directly against the proxy endpoint (see §1.G), independent of the browser's direct-fetch attempt.
4. The same input also auto-detects a **managed-endpoint link** of the form `{base}/{64-hex-token}/{client-...}` and registers it as a live-trading endpoint instead of a strategy — don't accidentally paste that shape during the custom-backend test.

### 0.3 Driving native controls

- **Strategy switch:** click a `button.version-btn` in the sidebar (each shows `.strategy-name`). Active one has class `active` and an accent left-border. Switching resets data + reconnects SSE (`onStrategyChange`).
- **History/Live tabs:** `button.history-tab` (text **"Round History"** / **"Live Feed"**). Active has class `active`.
- **Rounds filters:** `button.filter-btn` inside `.filter-bar` (top row: All / Pending / Settled / Skipped; second row: Win / Loss / Take Profit / Stop Loss). Toggling re-fetches via the store.
- **Pagination:** `.pagination` Prev/Next (labels `btcUpdown.pagination.prev/next`, page text `Page {page} of {total}`).
- **Date filter:** the `DatePicker` (range mode) with presets **today / 7d / 30d / 90d** and prev/next navigation; `max` is today.
- **Refresh profits:** the small circular-arrow `button.profit-refresh-btn` in each sidebar section header.

### 0.4 Theme & i18n switching

- **Theme:** initScript `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` or URL `?th=light` / `?th=dark`.
- **Locale:** the app uses the shared i18n. Switch via the global settings/locale UI in `PageHeader`, or set the locale cookie/localStorage the app uses and reload. Spot-check the **zh** title renders as **BTC 涨跌看板** and **en** as **BTC Up/Down Dashboard**. All 15 locales have `apps/btc-updown.json` (verified key-complete).

### 0.5 Out of scope for headless automation (UI + validation + error-state only)

These flows require credentials/hardware that cannot be automated in a headless run — scope them to **UI presence + disabled/error states**, and say so in the report:
- **Live trading / managed endpoints** (`btcUpdown.live.sectionTitle` section, `+K` register-passkey, Start/Stop/Pause instance buttons): require a real managed-endpoint URL with a valid token AND a **WebAuthn passkey** (`navigator.credentials.get`). The control toggle and Save Params call `getSignedAuth` → a passkey prompt. Verify only that the panels render and buttons are present/disabled when status is `unknown`; do NOT attempt to actually start/stop a live strategy.
- **V70 Batch Buy** panel and the **Strategy Control** schedule grid: only visible for specific live strategies; verify rendering if reachable, but the buy/save actions also require a passkey signature.

### 0.6 Test data

```
# Legit public backend for the custom-endpoint happy path (the app's own default upstream):
https://bitcoin-up-or-down-5mins-001.awesometools.dev

# SSRF targets that MUST be rejected by /api/proxy (see §1.G):
http://127.0.0.1
http://localhost
http://169.254.169.254          # AWS IMDS
http://10.0.0.1                  # private
http://2130706433               # numeric form of 127.0.0.1
http://[::1]                     # IPv6 loopback
```
- Direct proxy probe (server-side, bypasses the browser's direct-fetch attempt):
  `curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173/api/proxy?url=http%3A%2F%2F127.0.0.1"` → expect **403**.
  `curl -s "http://localhost:5173/api/proxy?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F"` → expect `{"error":"Blocked URL",...}`.

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load / shell / connection
- [ ] Page returns 200 and renders; `<h1>.page-title` = **BTC Up/Down Dashboard** (en) / **BTC 涨跌看板** (zh). Subtitle `.page-description` = **"Real-time visualization of the Polymarket BTC 5-min prediction strategy"**.
- [ ] A **connection status badge** (`.status-badge`) is visible top-right of the title row, reading one of **Connected / Connecting… / Reconnecting… / Disconnected** with a colored dot. **If it reaches "Connected" → egress works** (run data-dependent checks). If it stays "Connecting…/Disconnected" after ~20s → mark data checks **BLOCKED (no network)**.
- [ ] A **disclaimer** banner shows the simulation text `btcUpdown.disclaimer.simulation` ("This is a simulation only — no real money is involved…"). For a live strategy it would switch to the red `…REAL MONEY…` variant.
- [ ] Sidebar shows a **"Strategy"** card with **"+ Add Endpoint"** and a **"Built-in"** group with a `N/M` count badge.
- [ ] `list_console_messages` → no unexpected `error` entries (a benign upstream `502`/aborted-fetch from a slow SSE/REST is acceptable; a thrown app exception is not).

### B. Strategy sidebar
- [ ] The **Built-in** group lists multiple strategies (default-visible set = v1, v3, v7, v8, v14, v15, v16; others start hidden). Each row is a `button.version-btn` with a `.strategy-name`.
- [ ] The active strategy row has class `active` (accent left-border, brighter text). Clicking another row makes IT active and the data panels re-load (watch the badge flip to Connecting→Connected and stats refresh).
- [ ] **Hidden strategies:** a **"Hidden (N)"** toggle (`btcUpdown.strategy.hidden`) expands to show opt-out strategies; clicking one's eye icon un-hides + selects it.
- [ ] **Column headers** show sortable **Name / Today / All** labels; clicking toggles a sort arrow (`ArrowUp`/`ArrowDown`). The Today/All columns have ◀/▶ nav arrows to page back through history (offset shows accent underline when ≠ 0).
- [ ] **Profit cells** render per strategy as `+/-N` with `Nr NN%` meta; positive green (`#34d399`), negative red (`#f87171`). (Only when profits loaded — else BLOCKED.)
- [ ] **Refresh profits** button (circular arrow) spins while fetching and updates the "Ns" last-refresh timestamp.

### C. Custom endpoint — happy path (RECENTLY FIXED: still works)
- [ ] Click **"+ Add Endpoint"** → modal opens (title **"Add Endpoint"**, desc **"Paste an endpoint API base URL"**, URL input focusable, **Add** disabled while input empty).
- [ ] Type a legit public https backend (e.g. `https://bitcoin-up-or-down-5mins-001.awesometools.dev`) and submit → discovery runs; on success the modal closes, a **new host group** (mono-font host label) appears in the sidebar with its discovered strategies, and the first is auto-selected. (Adding the default upstream may dedup against built-ins — prefer asserting "no error + group/strategies present" rather than an exact new row.)
- [ ] While validating, **Add** shows a spinner + **"Validating…"** and Cancel/Close are disabled.
- [ ] The added endpoint persists: reload page → it's still in the sidebar (check `localStorage['biubiu-btc-updown-strategies'].customStrategies`).
- [ ] **Remove:** the host group header has an × (`btcUpdown.strategy.remove`) that removes the group; if it was active, selection falls back to a built-in.

### D. Custom endpoint — invalid input
- [ ] Submit an obviously malformed URL (e.g. `not a url` or empty after trim) → inline error **"Invalid URL format"** (`btcUpdown.strategy.invalidUrl`); modal stays open.
- [ ] Submit a syntactically-valid but non-strategy https URL (e.g. `https://example.com`) → discovery yields nothing → inline error **"No strategies found at this endpoint"**; modal stays open. (Note: this specific message is an English literal in code, not an i18n key — flag if a translated UI still shows English here.)

### E. Stats, charts, filters (data-dependent — needs egress)
- [ ] **Stats grid** renders cards: **Win Rate** (e.g. `62%` with `Nw / Nl`), **Total Profit**, **Total Rounds**, streak/entered/skipped etc. Values are number/currency-formatted (respect locale & currency preference), not raw 18-decimal strings.
- [ ] **Date filter** presets **today / 7d / 30d / 90d** switch the range; **single-day** range shows the **Hourly Profit** chart; **multi-day** shows **Profit by Day of Week** + an **aggregated** hourly chart (`btcUpdown.chart.hourlyProfitAgg`).
- [ ] Clicking an **hour bar** in the hourly chart filters stats+rounds to that hour and shows a **"… hour" badge** with a clear-× (`aria-label` = `btcUpdown.stats.clearHourFilter`); clearing restores.
- [ ] **Rounds history** table: filter buttons (All / Pending / Settled / Skipped, and Win / Loss / Take Profit / Stop Loss) narrow rows and re-fetch; counts in `.filter-count` match the active filter. Filtering to nothing shows the empty state **"No rounds found" / "No rounds match the current filter"**.
- [ ] **Pagination** Prev/Next works; **Page X of Y** updates; Prev disabled on page 1.
- [ ] **Refresh** button (`btcUpdown.history.refresh`) re-fetches without flashing the whole page.

### F. Live feed tab
- [ ] Switch to **"Live Feed"** tab → shows a **Current Round** panel (Direction / Entry Price / Shares / Cost / Price to Beat / Countdown) when a round is active, or **"No active round" / "Waiting for the next 5-minute market to open"** when not.
- [ ] When connected, a small **live dot** (`.tab-live-dot`) appears on the Live tab and a **"Listening for events…"** scan line shows.
- [ ] Empty feed → **"Waiting for events…" / "Events will appear here once the daemon starts a new round"**. As SSE events arrive, rows prepend (max-capped); each renders a localized message (e.g. settlement WIN/LOSS, entry, hedge, round skip) via `getEventMessage` — verify **no raw `{placeholder}`** leaks in the text.

### G. SSRF / proxy block (RECENTLY FIXED — must reject internal targets)
> Best asserted **server-side** against `/api/proxy` directly (the browser's direct-fetch to an internal host can fail/short-circuit before the proxy is even hit).
- [ ] `curl -s -w " [%{http_code}]" "http://localhost:5173/api/proxy?url=http%3A%2F%2F127.0.0.1"` → **403** with body `{"error":"Blocked URL","reason":"Private/reserved IP blocked"}`.
- [ ] `…?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F` (AWS IMDS) → **403** Blocked URL.
- [ ] `…?url=http%3A%2F%2Flocalhost` → **403** `Local hostname blocked`. `…?url=http%3A%2F%2F2130706433` (numeric 127.0.0.1) → **403** (caught after DNS/IP resolution). `…?url=http%3A%2F%2F10.0.0.1` → **403**.
- [ ] `…?url=http%3A%2F%2F%5B%3A%3A1%5D` (IPv6 `[::1]`) → **403**.
- [ ] **Sanity (allowed):** `…?url=https%3A%2F%2Fbitcoin-up-or-down-5mins-001.awesometools.dev%2Fapi%2Fstrategies%3Flang%3Den` → **NOT** 403 (200/2xx if reachable, or 502 if egress is down — either proves it was *not* SSRF-blocked).
- [ ] **No-redirect-to-internal:** the proxy uses `fetch(..., { redirect: 'error' })`; a 3xx upstream yields **502** "Upstream request failed", not a followed redirect. (Hard to trigger without a controlled redirector — note as design check; verify via `redirect: 'error'` in `src/routes/api/proxy/+server.ts` if you can't exercise it live.)
- [ ] **In-UI manifestation:** with the modal open, submitting `http://127.0.0.1` (or `http://169.254.169.254`) must **not** add a working strategy — it surfaces the inline **"No strategies found at this endpoint"** (or an invalid-URL/connection error), never a silently-added internal backend.

### H. Loading / error / no-network states
- [ ] On a cold load with egress, panels populate progressively (status badge Connecting→Connected; stats/rounds fill in). With **no egress**, the shell still renders, badge stays Disconnected, and panels show their **empty states** (not a blank white screen, not an uncaught error overlay).
- [ ] Any surfaced operation error (custom-endpoint failure, instance action failure) appears **in the UI** (modal inline error, `.control-error`, `.instance-action-error`, `.ep-error`) — not only in the console.
- [ ] No infinite spinner: if SSE can't connect, the 15s fallback timer still polls `currentRound`/`rounds` (you may see periodic network requests in `list_network_requests`).

### I. Responsive
- [ ] **1280px**: 2-column grid — sticky **sidebar** (380px) on the left, content on the right; page header sticky at top. No FAB.
- [ ] **390px**: sidebar is hidden; a floating **FAB** (`.mobile-drawer-fab`) bottom-center shows the active strategy name with a hamburger icon. Tapping it slides up a **bottom drawer** (`.sidebar.mobile-drawer-open`) with a grab handle + dimmed backdrop; tapping the backdrop or handle closes it. Charts/table scroll without horizontal overflow; filter buttons wrap cleanly.
- [ ] (~768px) intermediate width: still single-column (grid only kicks in ≥1280px), no clipping.

### J. Theme correctness (light + dark)
- [ ] **Light** (`?th=light` or settings): page + cards clearly delineated by border + shadow on a white background (no white-on-white); the **Add Endpoint modal** uses the light variant (`#fff` panel, dark text — verify the modal's `:global([data-theme='light'])` rules apply, since it hardcodes a dark `rgba(30,30,34,.98)` panel by default). Status badge colors, profit green/red, and disclaimer text all legible.
- [ ] **Dark** (`?th=dark`): default look intact; profit cells and status dots readable on dark.
- [ ] Switch the **modal** open in BOTH themes and confirm the URL input, validation step icons (✓/✗/spinner), and Cancel/Add buttons are readable in each.

### K. i18n
- [ ] Switch locale to at least one non-en and one zh variant → every VISIBLE `btcUpdown.*` string translates: title, subtitle, status badge, disclaimer, "Strategy"/"Built-in"/"Add Endpoint", tab labels, filter labels, pagination, empty states. **No raw `btcUpdown.*` key renders visibly** (remember the embedded catalog JSON legitimately contains keys — only judge rendered text).
- [ ] Known English-literal strings to call out if they appear in a non-en UI (NOT i18n keys, may be intentional or a gap): the custom-endpoint error **"No strategies found at this endpoint"**, the weekday column letters (`Mo Tu We Th Fr Sa Su`) in the live-control schedule, and various instance/error fallbacks (`'Action failed'`, `'Failed to create'`).
- [ ] Numbers/dates/currency reflect locale preference (`formatNumber`/`formatCurrency`/`formatDate`); switching `?cur=EUR` / `?nl=de-DE` should change formatting.

### L. Accessibility / keyboard
- [ ] `Tab` reaches: Add-Endpoint button, each strategy `version-btn`, the history tabs, filter buttons, pagination, and the modal's input + Cancel/Add — each shows a visible **focus ring**.
- [ ] Sidebar section headers / sort labels are `role="button"` `tabindex="0"` and activate on **Enter/Space** (collapse toggles, sort).
- [ ] The Add-Endpoint modal: close button has `aria-label` (`btcUpdown.strategy.close`); pressing **Enter** in the URL field submits; clicking the overlay closes it (unless validating).
- [ ] The mobile drawer backdrop is keyboard-dismissable (Escape).

### M. Console / network hygiene
- [ ] `list_console_messages` after the full pass → no uncaught exceptions / unexpected `error`s (transient upstream 502 / aborted-fetch on strategy-switch are acceptable).
- [ ] `list_network_requests` → strategy data goes either **direct** to the upstream host OR through **`/api/proxy?url=…`** (CORS fallback). The Polymarket price-to-beat call (`polymarket.com/api/crypto/crypto-price`) may appear — non-critical, failures are swallowed.
- [ ] No request leaks a managed-endpoint **token** into the page URL (`syncUrlParams` deliberately skips instance IDs).

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL/BLOCKED | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. Mark data-dependent checks **BLOCKED (no network)** if the connection badge never reaches "Connected". End with a short summary: **# checks, # pass, # fail, # blocked**, and the top user-impacting issues.

Example header:

| Area | Check | Result | Evidence |
|------|-------|--------|----------|
| A | h1 = "BTC Up/Down Dashboard" | PASS | snapshot uid=… |
| G | /api/proxy?url=http://127.0.0.1 → 403 | PASS | curl 403 + body `Blocked URL` |

---

## 3. Known traps / notes specific to THIS tool

- **Network-dependent app.** Unlike balance-radar/wallet-generator (self-contained), this dashboard needs live egress. Don't FAIL data panels for emptiness when the badge is Disconnected — that's a network condition, not a UI bug. Use the §1.A badge to gate.
- **`127.0.0.1` direct-fetch nuance.** The in-browser SSRF test is unreliable because `strategyFetch` tries a *direct* browser fetch first; the **server-side `/api/proxy` 403** (§1.G via curl) is the authoritative assertion for the recently-fixed SSRF guard. Trust the curl results over the modal's exact error wording.
- **Dev allows http.** `assertPublicUrl` is called with `requireHttps: !dev`, so in dev (`bun run dev`) **http://** public hosts are allowed; only **private/reserved/local** targets are 403'd. In production, http would additionally be rejected with `HTTPS required`. Test in dev expecting the private-IP/local-name blocks, not an http scheme block.
- **"No strategies found at this endpoint" is a hardcoded English string** in `addCustomStrategy` (not an i18n key). If the product wants it localized, that's a finding — but it is intentional per current code, so flag it as a note, not a hard FAIL.
- **Modal default panel is dark-hardcoded.** `AddStrategyModal` sets `background: rgba(30,30,34,.98)` and relies on `:global([data-theme='light'])` overrides for light mode. Pay extra attention to the modal in light theme (a missed override = white-on-dark or dark-on-white).
- **Grid breakpoint is exactly 1280px.** At 1279px you still get the single-column + FAB layout, NOT the desktop sidebar. Use 1280×900 for the desktop layout checks.
- **Live-trading / passkey paths are not headless-testable** (§0.5). Don't try to drive Start/Stop/Save Params/Batch-Buy — they will block on a WebAuthn prompt. Verify presence + disabled-when-unknown only.
- **Persisted state can mask first-visit behavior.** If the sidebar looks wrong (e.g. unexpected hidden set), clear `localStorage['biubiu-btc-updown-strategies']` and reload before judging.
- **`?th`/`?ts`/`?nl`/`?dl`/`?cur` query params** are honored on mount (sharing feature) and `history.replaceState` rewrites the URL — handy for deterministic theme/locale/currency setup without touching the settings UI.
- **SSE via proxy.** For *custom* strategies the SSE stream is proxied through `/api/proxy` (which special-cases `text/event-stream` and pipes it through with `redirect: 'error'`); for built-ins it's a direct `EventSource`. If a custom strategy's live feed never connects, check the proxy is streaming, not buffering.
</content>
</invoke>
