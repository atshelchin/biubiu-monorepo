# BTC Up/Down 5m — 浏览器测试 Playbook (for code agents)

**怎么用这份文档 / How to use this**

> 跟任意 code agent 说：「参考 `apps/biubiu.tools/src/routes/apps/btc-updown-5m/TESTING.md`，用 chrome-devtools MCP 把 **BTC Up/Down 5m** (`/apps/btc-updown-5m`) 完整测试一遍，按清单逐项执行并报告 PASS/FAIL（FAIL 要附实际现象 + 截图/快照）。」

This is an executable QA script. An agent with the **chrome-devtools MCP** drives the real app, checks every state/flow/edge case below, and reports a PASS/FAIL table. It also captures the hard-won quirks of *this* app so the agent doesn't re-discover them.

- App URL: `http://localhost:5173/apps/btc-updown-5m`
- **What it does:** A multi-route **dashboard** for managing automated "BTC up-or-down in 5 minutes" prediction-trading strategies on Polymarket. It is a **mock-data UI prototype** (no live API): you sign in with a site-wide passkey, then browse/filter your strategy *instances*, drill into a per-instance analytics detail (stats grid, hourly/weekday profit charts, direction split, streaks, hedge, paginated rounds history), browse *spaces* (endpoints) with leaderboards/admin, view member profiles, and build a new BIP-323 strategy in the editor. **Almost all data is hard-coded mock data**; control actions (pause/resume) attempt a passkey signature + a fetch to a fake endpoint.
- UI language is locale-dependent; the default zh strings are quoted below so you know what to look for. The reference EN strings live in `src/messages/en/apps/btc-updown-5m.json` (i18n prefixes `updown5m.*` and `btcUpdown.*`).

---

## 0. Setup & environment

1. **Dev server** must be up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/apps/btc-updown-5m` → expect `200`. If not, start it (`cd apps/biubiu.tools && bun run dev`). (Verified at authoring time: hub `200`, editor `200`.)
2. Use the **chrome-devtools MCP** tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `type_text`, `press_key`, `evaluate_script`, `resize_page`, `list_console_messages`, `wait_for`).
3. Desktop viewport: `resize_page` to **1280×900**. Mobile: **390×844**.

### 0.1 Critical chrome-devtools-MCP gotchas (read before you start — these WILL bite you)

- **Profile lock / "browser is already running".** If a tool errors with *"The browser is already running … chrome-devtools-mcp/chrome-profile"* or *"Connection closed"*:
  ```bash
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
  # still stuck:
  pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
  rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*
  ```
  Rule of thumb: **one unlock buys ~1–2 MCP calls** before it may re-lock. Don't chain a long series of `click`s — batch state into `navigate_page({ initScript })` / `evaluate_script` calls.
- **Blank screenshots / `about:blank` resets.** `take_screenshot` occasionally returns an all-white frame, and after a burst of interactions the tab sometimes navigates to `about:blank` (HMR / MCP relay churn). **Before trusting a screenshot**, sanity-check with `evaluate_script` → `() => ({ url: location.href, h1: document.querySelector('h1')?.textContent })`. If `url` is `about:blank` or `h1` is null, **re-navigate and redo** setup. **Prefer `take_snapshot` / `evaluate_script` over `take_screenshot`** for assertions; use screenshots only for visual spot-checks (retake if blank).
- **Batch work into few `evaluate_script` / `navigate_page(initScript)` calls.** Each round-trip is a chance for the relay to reset the page.
- **Svelte 5 binding:** `el.value = ...` does **NOT** trigger `bind:value`. Use the native setter + dispatch input:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '0.7'); el.dispatchEvent(new Event('input', { bubbles: true }));
  // for <textarea>: HTMLTextAreaElement.prototype; for <select>: dispatch 'change'.
  ```
- **Theme:** in `navigate_page` `initScript`, set `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))` (or `'dark'`). It applies via `<html data-theme>`; per-field merge means writing only `theme` is safe.
- **i18n raw-key caveat:** the message-catalog JSON embedded in the page HTML legitimately contains raw keys (`updown5m.*`, `btcUpdown.*`) as hydration data — that is **not** a bug. Judge **only the VISIBLE rendered text**. A *visibly rendered* raw key (e.g. the literal text `updown5m.empty.title` or `btcUpdown.round.hedgeFilledAt` shown on screen) **IS a FAIL**.

### 0.2 Auth gating — THE #1 thing to understand about this app

The hub (and almost every meaningful feature) is gated on the **site-wide passkey auth** (`authStore.isLoggedIn` from `$lib/auth`), **not** on the local `updown-v2` store. Logged-in state is read from `localStorage['biubiu-auth-user']`.

- **Real login** (`Sign in` button → `AuthModal`) requires a **WebAuthn passkey / platform authenticator**, which can't be created headless. So **the real sign-in flow is OUT OF SCOPE for headless automation** — scope it to "logged-out UI + modal opens + has fields" only.
- **To test the logged-in dashboard without a passkey**, inject a fake auth user in `initScript` BEFORE load:
  ```js
  // navigate_page initScript — fake a logged-in user so the hub renders the dashboard
  try {
    localStorage.setItem('biubiu-settings', JSON.stringify({ theme: 'light' }));
    localStorage.setItem('biubiu-auth-user', JSON.stringify({
      name: 'tester',
      credentialId: 'AAAA',
      publicKey: '0x04' + '00'.repeat(64),
      rpId: 'localhost',
      safeAddress: '0x1234567890123456789012345678901234567890',
      createdAt: Date.now()
    }));
  } catch (e) {}
  ```
  This is enough for `authStore.isLoggedIn` → `true` (it only checks `user !== null`). Note: this is a **prototype with mock data** — the instances/spaces/members shown are hard-coded (`$lib/updown-v2/mock.ts`), independent of the fake user.
- The **editor**, **space**, **instance**, and **member** routes are **NOT auth-gated** — you can navigate to them directly even logged out.

### 0.3 Routes map (all reachable; persistent URLs)

```
/apps/btc-updown-5m                                            Hub (logged-out prompt OR logged-in dashboard)
/apps/btc-updown-5m/editor                                     Strategy editor (BIP-323 form + JSON preview)
/apps/btc-updown-5m/space/official                             Space "Public Square" (3 tabs: Overview/Members/Admin-or-Claim)
/apps/btc-updown-5m/space/alpha-club                           Space "Alpha Trading Club"
/apps/btc-updown-5m/space/alpha-club/instance/inst_001         Instance detail (RSI Reversal Pro, live/running)
/apps/btc-updown-5m/space/alpha-club/instance/inst_002         Instance detail (CLOB Momentum, sandbox/paused)
/apps/btc-updown-5m/space/alpha-club/instance/inst_003         Instance detail (Signal Score v2, sandbox/stopped)
/apps/btc-updown-5m/space/alpha-club/member/user_whale         Member profile (quant_whale, pro/admin)
/apps/btc-updown-5m/space/official/member/user_shelchin        Member profile (you)
```
Spaces with mock data: **`official`**, **`alpha-club`** only. All 3 instances live under `alpha-club`; navigating to an instance under `official` falls back to the first space instance, which is empty (`spaceInstances[0]` is undefined) → main panel won't render. Member data only exists for the 6 (official) / 3 (alpha-club) seeded users.

### 0.4 Known mock data (use these for assertions)

- **Instances** (all in `alpha-club`):
  - `inst_001` **RSI Reversal Pro** — `live` / `running` — today **+$42.80**, WR **58.3%**, 24 rounds, 1h +8.2, 30d +386.
  - `inst_002` **CLOB Momentum** — `sandbox` / `paused` — today **−$8.20**, WR 45.0%, 12 rounds, 1h −3.1, 30d +54.
  - `inst_003` **Signal Score v2** — `sandbox` / `stopped` — today **+$15.40**, WR 62.1%, 18 rounds, 1h 0, 30d +122.
- **Hub stat cards** with mode filter = **All** sum these three: Today **+$50.00** (42.8−8.2+15.4), Active **1**, Avg WR **55.13%**, 30d **+$562**. Sub-line "3 instances" / "54 rounds".
  - mode **Sandbox** → instances 2, Today **+$7.20**, Active **0**, 30d **+$176**. mode **Live** → instances 1, Today **+$42.80**, Active **1**.
- **Spaces** (hub bottom grid): **Public Square** (Official, 1,247 users, 86 strategies, Sandbox) + **Alpha Trading Club** (23 users, 12 strategies, Live) + an **"+ Add Space"** card.
- Currency/number formatting respects user preference (default en-US `$1,234.56`). Profits are colored: green `.positive` (≥0) / red `.negative` (<0).

---

## 1. Test checklist (execute each; report PASS/FAIL + evidence)

### A. First load — LOGGED OUT (default state)

> Run with a *clean* `localStorage` (no `biubiu-auth-user`).

- [ ] Page returns 200 and renders; `<h1>` = **BTC 涨跌 5 分钟** (en: `BTC Up/Down 5m`).
- [ ] Subtitle = **在 Polymarket 上自动进行 BTC 预测交易** (`Automated BTC prediction trading on Polymarket`).
- [ ] A **prompt card** shows title **创建、运行并分享自动化策略** + desc **登录即可…3 个免费沙盒实例** and a **Sign in** button (`auth.login.button`).
- [ ] A second **sign-in CTA** block shows the cta line + **开始使用 / Get Started** button.
- [ ] **No** stat cards, **no** mode filter, **no** instances table, **no** Spaces grid are visible when logged out (they live in the `{:else}` branch).
- [ ] There is **no** `+ New Strategy` button in the header when logged out.
- [ ] Clicking **Sign in** / **Get Started** opens the **AuthModal** (passkey). It should show input/registration UI — *do not* attempt to complete it headless (no platform authenticator). Close it.
- [ ] `list_console_messages` → no `error` entries.

### B. First load — LOGGED IN (inject fake auth, §0.2)

- [ ] Header `<h1>` still **BTC 涨跌 5 分钟**; subtitle now = **Your strategies across all spaces** (`updown5m.descLoggedIn`), and a **+ 新建策略 / + New Strategy** button (`.btn-accent`) appears to the right of the title linking to `…/editor`.
- [ ] A **mode filter** row shows 3 pills: **全部 / 沙盒 / 实盘** (All / Sandbox / Live); **全部** is `.active` by default.
- [ ] A **4-card stat grid** shows: 今日盈利 **+$50.00** (green) · 运行中 **1** · 平均胜率 **55.1%** · 30 天盈利 **+$562** (green). Sub-lines: "3 instances", "instances running", "54 rounds", "3 instances".
- [ ] **My Instances** renders as a **DataTable** (it is non-empty, so the onboarding card does NOT show). Columns visible at desktop: 策略 / 空间 / 模式 / 状态 / 1h / Today / 30d / WR.
- [ ] Default sort is by **Today** (`defaultSortKey="day"`, desc): rows ordered RSI Reversal Pro (+$43) → Signal Score v2 (+$15) → CLOB Momentum (−$8). The **Today** header shows a **↓** arrow.
- [ ] **Spaces** section heading **Spaces**; grid shows **Public Square** (Official badge, green online dot), **Alpha Trading Club**, and an **+ Add Space** card.
- [ ] `list_console_messages` → no `error` entries.

### C. Mode filter (hub, logged in)

- [ ] Click **沙盒 / Sandbox** → table shows only `inst_002`, `inst_003`; stats recompute: 今日 **+$7.20**, 运行中 **0**, instances "2 instances".
- [ ] Click **实盘 / Live** → table shows only `inst_001`; 今日 **+$42.80**, 运行中 **1**.
- [ ] Click **全部 / All** → all 3 rows return; stats back to +$50.00 / 1 / 55.1% / +$562.
- [ ] Active pill is visually highlighted (`.mode-pill.active`); others muted.

### D. Instances DataTable (the shared `DataTable.svelte`)

- [ ] **Sort** each sortable header (策略 / 模式 / 状态 / Today / 30d / WR etc.): clicking sets that column's sort (desc first), arrow **↑/↓** appears next to the active header; clicking the **same** header again toggles asc↔desc.
- [ ] **Numeric** columns (Today / 30d / 1h / WR) sort **numerically** not lexically: e.g. Today asc → −8.2, +15.4, +42.8 (i.e. −$8 first). Verify −$8 sorts below +$15 ascending (a lexical sort would mis-order the sign).
- [ ] **Status filter pills** at top of the table (全部/Running/Paused/Stopped via `filterOptions`): selecting **Running** keeps only `inst_001`; **Paused** keeps only `inst_002`; **Stopped** keeps only `inst_003`; **All** restores.
- [ ] With only 3 rows and `pageSize=10`, **no pagination** controls show (`totalPages === 1`). (To exercise pagination you'd need >10 rows — out of scope with current mock; the instance-detail rounds history below DOES paginate.)
- [ ] **Row click** navigates to that instance detail (`/space/alpha-club/instance/<id>`). The row shows a status dot + bold label; mode cell is a **SANDBOX/LIVE** badge (live badge styled differently); status cell text is colored (running=green, paused=amber, stopped=muted).
- [ ] At **390px** the `空间` / `1h` columns (`hideOnMobile`) are hidden; table scrolls horizontally if needed; no clipping.

### E. Add Space modal (layout-level, logged in or out)

- [ ] Click the **+ Add Space** card → a **ResponsiveModal** titled **添加空间 / Add Space** opens.
- [ ] It shows desc **Paste the endpoint API base URL…**, a `<input type="url">` (placeholder `https://btc-bot.example.com`), and **取消 / Cancel** + **连接 / Connect** buttons.
- [ ] Type a URL and click **Connect** → a `window.alert('TODO: Validate & connect to …')` fires (it's a stub), then modal closes + input clears. **Use `handle_dialog` to accept the alert.** (This stub alert is expected, not a FAIL.)
- [ ] **Cancel** closes the modal without an alert.

### F. Strategy editor (`/editor`) — input & validation

> Reachable directly (not auth-gated). 6 sections: Basic Info / Signal / Entry / Risk Management / Exit Rules / Actions.

- [ ] Back link **← 返回 / ← Back** → returns to hub.
- [ ] Title **创建策略 / Create Strategy**.
- [ ] **Basic Info:** Name / Description / Tags / Risk Level. Risk Level `<select>` = Conservative / Balanced / **Aggressive**; default **Balanced**.
- [ ] **Signal** method `<select>` switches the param sub-fields reactively:
  - CLOB Imbalance → Threshold (0–1, step .05, default 0.6) / Window (1m/5m/15m) / Depth Levels.
  - RSI Reversal → Period / Overbought / Oversold.
  - Volume Spike → Multiplier / Lookback.
  - Candle Pattern → Pattern (Hammer/Doji/Engulfing) / Confirm Bars.
  - Custom → a mono `<textarea>` (default `{}`). **Enter invalid JSON** (e.g. `{bad`) → no crash; the preview just emits an empty `params: {}` (parse failure is swallowed by design). Verify the page does NOT throw.
- [ ] **Entry:** Amount ($) (default 5) / Method (Market/Limit) / Max Price / Min Price / Max Per Hour (latter three marked **(optional)**).
- [ ] **Risk Management:** Daily Loss Limit / Max Consecutive Losses (optional); **Stop Loss** checkbox — when ticked, reveals Type (Trailing/Fixed) + Percent (%).
- [ ] **Exit Rules:** **+ Add Rule** appends a row (Type select: Take Profit / Stop Loss / Time Limit; the value label switches between **Percent (%)** and **Minutes** when Type=Time Limit). **Remove** deletes that row.
- [ ] **Preview JSON** toggles a BIP-323 JSON block (`<pre><code>`) that reflects the current form (e.g. set Name "Demo" → preview `"name": "Demo"` and an `id` derived as `demo-<timestamp>`). Verify the JSON is valid and updates live as you edit fields.
- [ ] **Save Draft** fires `alert('Draft saved' / 草稿已保存)` (stub — accept via `handle_dialog`).
- [ ] ⚠ **No client-side validation gate:** **Create Instance** is **always enabled** even with an empty Name / Amount 0. Clicking it creates a sandbox instance in space `official` and navigates to `…/space/official/instance/inst_<ts>`. **Trap:** that new instance lives in `official`, but the instance-detail sidebar filters by `spaceId='official'` which has **no** other mock instances, and `activeInst = found ?? spaceInstances[0]` → the freshly created instance IS found, so the detail should render with zeroed stats. Verify it renders (label = your Name or "Untitled") and does not blank out. Report if the main panel fails to render.

### G. Instance detail (`/space/alpha-club/instance/inst_001`) — the richest screen

- [ ] Loads with back link **← 返回**, page title = space name **Alpha Trading Club**.
- [ ] **Left sidebar** lists the 3 space instances with a sort header row (Strategy / 1H / Today / 30D); clicking a column sorts the sidebar list; clicking the same column toggles asc/desc (arrow ↑/↓). Active instance row is highlighted.
- [ ] **Resize handle** between sidebar and main: dragging it (pointer events) widens/narrows the sidebar; below ~100px it snaps **collapsed** (width 0). The round **toggle button** (chevron) collapses/expands the sidebar; its `aria-label` is **Hide sidebar / Show sidebar** (`updown5m.detail.hideSidebar/showSidebar`). (Dragging via MCP is finicky — at minimum verify the toggle button works and the chevron flips direction.)
- [ ] **Toolbar:** instance label + SANDBOX/LIVE badge + control buttons + status (dot + uptime text). For **inst_001 (running)** the controls are **▮▮ pause** + **■ stop** (aria-labels `Pause` / `Stop`). Uptime text shows like `Nh Nm` (computed from `startedAt`/`createdAt`).
- [ ] **DatePicker** (range mode) with presets **Today / 7d / 30d / 90d** + nav arrows. Changing range clears the selected hour.
- [ ] **StatsGrid** renders (Wallet / Portfolio / Polymarket sections; Traded / Win Rate / Total Profit / Total Rounds / Streak / Entered / Skipped / W / L / Best / Worst / Avg Profit). All labels are translated (`btcUpdown.stats.*`) — **no raw keys**.
- [ ] **HourlyChart** renders bars; hovering a bar shows a tooltip; clicking an hour selects it (StatsGrid shows a "clear hour filter" affordance). Title `Hourly Profit` for single-day. Pick a **multi-day** range (e.g. 30d) → title becomes **Hourly Profit (Aggregated)** and a **WeekdayChart** (Profit by Day of Week, Mon–Sun labels) appears below.
- [ ] **Analytics row** (3 glass cards): **Direction Split** (方向分布: UP/DOWN win-rate + W/L), **Streaks** (Max Win / Max Loss / Current with bars), **Hedge** (COST / RECOVERY + "Net cost:" line). All labels translated, numbers formatted as currency/percent.
- [ ] **RoundsHistory** at the bottom: a list of rounds with status/result filter pills (**All / In Progress / Settled / Skipped** and **Win / Loss / Take Profit / Stop Loss**) + a **Refresh** affordance + pagination (`Page X of Y`, Previous/Next; pageSize 20, total ~80–280 mock rounds). Filtering re-pages to page 0. Expanding a round row shows entry price / outcome / entry time / P&L breakdown. **No raw keys** in any expanded row.
  - With current mock data, rounds always have `hedge: null`, so the hedge-fill / hedge-sold detail rows never appear (see Known Traps re: those two keys being undefined).
- [ ] **Control flow — pause (inst_001):** clicking **▮▮ pause** calls `signControlAction('pause', …)` which triggers a **WebAuthn `navigator.credentials.get`** prompt. Headless this will fail/cancel → the status stays `running` (the function returns null and does nothing). **Scope:** verify the click does NOT crash the page and surfaces no console error; the full pause→paused transition **needs a real passkey** (out of scope headless). It also may attempt a `fetch` to `https://…/api/…` (network error tolerated).
- [ ] **Control flow — start/stop (no passkey):** navigate to **inst_003 (stopped)**. The toolbar control is **▶ start**. Clicking **▶** sets status → `starting` (blinking disabled ▶, aria `Starting`) then after ~1s → `running` (now showing pause/stop). This path is **local-only (no passkey)** so it MUST work headless. Then **■ stop** → back to `stopped`.
- [ ] **Delete flow (inst_003, stopped):** when stopped, a dim **🗑 delete** icon shows. Click it → inline confirm appears: **Delete?** text + **✓ confirm** + **✕ cancel** (aria `Confirm delete` / `Cancel delete`). **✕** cancels (no delete). **✓** deletes the instance and navigates back to the space (`/space/alpha-club`). ⚠ Deletion mutates the shared store for the rest of the session — do this LAST or reload to restore mock data.

### H. Space page (`/space/official` and `/space/alpha-club`) — 3 tabs

- [ ] Header: back link, title = space name, a SANDBOX/LIVE badge (Public Square=Sandbox, Alpha=Live), green online dot, and the endpoint URL as subtitle.
- [ ] **Tab bar:** Overview / Members / **(Admin or Claim Admin)**. The 3rd tab label depends on whether you're an admin of that space: in **official** you (`user_shelchin`) are an **admin** → tab reads **Admin / 管理**; in **alpha-club** you're a member → tab reads **Claim Admin / 认领管理员**.
- [ ] **Overview tab:** 4 stat cards (Users / Active / Today Profit / Avg WR) with the topStrategy as a sub-line; then **My Instances** — for `alpha-club` shows 3 instance cards; for `official` shows the **empty state** (No strategies yet + Create Strategy button), since no mock instances belong to `official`.
- [ ] **Members tab:** **Leaderboard** sorted by total profit desc. Each member card: rank #, name link, **Premium** badge (pro), **Admin** badge (admins), profit/WR/rounds/instances stats, safe address, joined date. Names link to member profiles.
- [ ] **Admin tab (official, as admin):** shows admin settings rows (Allow Live Trading ON/OFF, Max Free Instances, Max Member Instances) + an **Admin Codes** list (code + label + linked/unlinked status). Below: a claim box (input `ADM-XXX-XXXX` + **Claim** button — stub, no handler wired).
- [ ] **Claim Admin tab (alpha-club, as member):** shows only the claim box (**Become Admin** title + desc + input + Claim button); no settings/codes.
- [ ] Switching tabs preserves URL/space; tab state is shared (it's a module-level store `spaceTab`), so the active tab persists across space navigations — note this when verifying.

### I. Member profile (`/space/alpha-club/member/user_whale`)

- [ ] Title = display name **quant_whale**; Premium + Admin badges (whale is pro/admin in alpha-club).
- [ ] 4 stat cards: Profit / Win Rate / Rounds / Instances.
- [ ] Info card: Safe Address (mono), Joined date, Tier badge (Pro/Free), and a **Follow** button that toggles to **Following** on click (local state).
- [ ] **Running Instances** section (mock subset) + **Performance Summary** with StatsGrid + HourlyChart (translated labels, no raw keys).
- [ ] Navigate to a **non-existent** member (e.g. `…/member/nobody`) → shows **User not found** (`updown5m.member.userNotFound`), no crash.

### J. Loading / error / empty states

- [ ] **Instance starting** state (inst_003 → start) shows a blinking disabled ▶ with status text **starting…** then transitions to running — this is the only "loading"-ish affordance (no skeleton loaders in this prototype).
- [ ] **Empty state:** the hub onboarding card (**No strategies yet / Create Strategy**) only appears when `filteredInstances` is empty — reachable by switching mode to a filter with no matches only if all instances were deleted; the **space Overview empty** (official) is the reliable one to check.
- [ ] **DataTable empty:** if you delete all instances then revisit hub, the table area is replaced by the onboarding card; the space instance list shows its own empty state. Verify no raw `updown5m.empty.*` key text leaks.
- [ ] **No inline error banners exist** in this prototype — control failures fail silently (see Known Traps). The only user-facing "error surfaces" are the AuthModal's own error text (passkey path) and `alert()` stubs. Note this when judging "errors surfaced in UI".

### K. Responsive

- [ ] **390×844:** hub stat grid stacks; mode pills wrap/scroll; My Instances table hides `Space`/`1h` columns and scrolls horizontally; Spaces grid → single column; header title + `+ New Strategy` button stack reasonably. Editor sections stack single-column (`field-row` flexes down). Instance detail sidebar should be usable (collapsible). No horizontal overflow / clipping anywhere.
- [ ] **1280×900 (and ~768px):** layouts intact, content centered, max-width respected (editor max 680px, page content wider). DataTable pagination footer (if shown) centers/stacks on mobile.

### L. Both themes (light + dark — test both)

> Set theme via `initScript` (§0.1). Capture A/B/G/H in **light** and **dark**.

- [ ] **Light:** stat cards / glass cards are clearly delineated (border + shadow on white) — **no white-on-white**, no invisible cards. Profit green/red, status dots (run/pause/stop), SANDBOX/LIVE badges, Premium/Admin badges all legible. Charts (Hourly/Weekday) bars + tooltips readable. The editor `.glass-card` uses `rgba(255,255,255,.05)` backgrounds — verify they still read as cards in light mode (potential low-contrast spot to scrutinize).
- [ ] **Dark:** default look intact; no gray-on-gray. Selected mode pill / active tab / active table header all visible.
- [ ] In BOTH themes: the DataTable `.dt-pill.active` and pagination `.dt-page-active` (accent bg) are readable; the resize toggle button is visible against the panel.

### M. i18n (locale switch — no raw keys leak)

- [ ] Switch locale to at least one zh variant and one non-zh/non-en (e.g. via the ⚙ settings panel / locale switcher, or the app's locale mechanism). Verify EVERY visible string under `updown5m.*` and `btcUpdown.*` translates on: hub (logged out + in), editor, space (all 3 tabs), instance detail (incl. StatsGrid / charts / analytics / RoundsHistory), member profile.
- [ ] **No VISIBLE raw key** anywhere (e.g. literal `updown5m.empty.title`, `btcUpdown.stats.winRate`). Remember the embedded catalog JSON in HTML is fine — only rendered text counts (§0.1).
- [ ] Spot-check interpolated strings render values, not placeholders: e.g. stat sub-line **3 instances** (not `{count} instances`), **54 rounds**, RoundsHistory **Page 1 of N** (not `Page {page} of {total}`).

### N. Accessibility / keyboard

- [ ] `Tab` through hub: mode pills → `+ New Strategy` link → table headers → Spaces cards → Add Space card. Each interactive element shows a visible **focus ring**.
- [ ] DataTable sortable headers: they are `<th onclick>` — verify they are reachable/operable. (Note: they are NOT buttons and expose **no `aria-sort`** and may not be keyboard-focusable — flag as an a11y gap if so; the balance-radar table sets `aria-sort`, this one does not.)
- [ ] Instance-detail control icons (pause/stop/start/delete) have **aria-labels** (Pause/Stop/Start/Delete/Confirm delete/Cancel delete) — verify present and that the buttons are keyboard-activatable (Enter/Space).
- [ ] Pagination prev/next buttons have aria-labels (`Previous page` / `Next page`); disabled at the ends.
- [ ] DatePicker preset buttons and the sidebar resize toggle are reachable.

### O. Console / network hygiene

- [ ] `list_console_messages` after the full pass → **no unexpected `error`s**. (Tolerated: a WebAuthn rejection from a pause attempt; a failed `fetch` to the fake endpoint host on pause/resume.)
- [ ] `list_network_requests`: the hub/editor/space/member pages are **mock-only** and should make **no API calls** to a strategy endpoint. The only outbound calls are app/SvelteKit assets + (on a pause/resume attempt) a `controlStrategy` fetch to a non-resolving endpoint (expected to fail).

---

## 2. Reporting format

Produce a table: `Area | Check | PASS/FAIL | Evidence`. For any FAIL include the actual observed value/text and a snapshot or (non-blank) screenshot. End with a short summary: **# checks, # pass, # fail**, and the **top user-impacting issues**.

Example row: `D | Today column sorts numerically | PASS | asc order: -8.2, 15.4, 42.8 (snapshot)`.

---

## 3. Known traps / notes specific to THIS tool

1. **It's a mock prototype, not a live tool.** Per `TODO.md`, real API wiring (create/start/stop, SSE, payments, join-space, admin claim) is unbuilt. Most numbers are hard-coded in `$lib/updown-v2/mock.ts` + `mock-detail.ts`. Don't FAIL items for "data doesn't change after an action" when the action is a documented stub (Add Space alert, Save Draft alert, Claim/Follow local toggles, Connect).
2. **Auth is the GLOBAL passkey store, not the local one.** The page imports `authStore` from `$lib/auth` (localStorage key `biubiu-auth-user`); the `login()/logout()` exported from `$lib/updown-v2/store.svelte` are **dead code** (never called by these pages). To reach the dashboard headless, inject `biubiu-auth-user` (§0.2). Real registration/login needs a platform authenticator → out of scope headless.
3. **Pause/Resume require a real passkey signature.** `signControlAction` calls `navigator.credentials.get(...)`. Headless it returns null/throws → status silently stays unchanged. **Start/Stop/Delete are local-only and DO work headless** — use those for control-flow verification.
4. **No inline error banners.** Control failures, fetch failures, and invalid editor input are all swallowed — nothing surfaces in the UI (violates the project's "surface errors in the UI" rule). If strict QA requires user-visible error states, this is a **gap to report**, not a transient bug.
5. **Editor has no validation gate.** `Create Instance` is always enabled; empty Name → instance labeled "Untitled"; Amount can be 0/blank. Custom-JSON parse errors are silently swallowed (`catch { return {} }`). Report missing validation as a UX gap if held to the strictest bar.
6. **New instances land in space `official`.** `handleCreateInstance` hard-codes `spaceId:'official'`. Verify the resulting detail page renders (it should, since `activeInst` finds the new id). Pre-existing `official` has no other instances, so the sidebar will only list the one you just made.
7. **Latent missing i18n keys (verify they don't surface):** `RoundsHistory.svelte` references `btcUpdown.round.hedgeFilledAt` and `btcUpdown.round.hedgeSoldAt`, which are **absent from the EN (and zh) catalogs**. They only render inside `{#if round.hedge?.filled_at}` / `{#if round.hedge?.sold_at}` — and the mock data always sets `hedge: null`, so these blocks **never render** in this app. **Expected:** you will NOT see these raw keys on screen. If you somehow do (e.g. real hedge data is wired later), that IS a FAIL. Flag the missing keys as a latent i18n defect regardless.
8. **DataTable a11y gap.** Sortable headers are `<th onclick>` with no `role="button"`, no `tabindex`, no `aria-sort` (unlike balance-radar's table). Treat as an a11y finding, not a hard FAIL, unless the strict bar demands it.
9. **`spaceTab` is module-global state.** The active space tab (0/1/2) persists across space navigations and page reloads-within-session. If you left it on "Members", the next space opens on "Members" too — not a bug, but don't mistake it for a routing glitch.
10. **Instance under the wrong space falls back.** Visiting `/space/official/instance/inst_001` (inst_001 actually lives in alpha-club) makes `spaceInstances` (filtered by `official`) empty and `activeInst = found ?? spaceInstances[0]`. `inst_001` IS found globally, so it renders — but the sidebar list (filtered by `official`) won't contain it. Use the correct space in the URL (`alpha-club`) for clean assertions.
11. **`glass-card` in the editor uses hardcoded `rgba(255,255,255,…)`** backgrounds/borders (against the project's token rule). Scrutinize the editor's card contrast in **light** theme specifically — this is the most likely place for a washed-out card.
12. **Profile lock & blank screenshots** — see §0.1; re-verify `location.href`/`h1` via `evaluate_script` before trusting any screenshot, and re-navigate after `about:blank` resets.
