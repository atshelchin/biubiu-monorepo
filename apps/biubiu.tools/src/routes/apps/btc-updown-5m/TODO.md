# BTC Up/Down 5m — Remaining Work

## Done
- [x] Route structure: multi-route with persistent URLs
  - `/apps/btc-updown-5m` → Hub
  - `/apps/btc-updown-5m/space/[spaceId]` → Space (4-tab)
  - `/apps/btc-updown-5m/space/[spaceId]/instance/[instanceId]` → Instance detail
  - `/apps/btc-updown-5m/space/[spaceId]/strategy/[strategyId]` → Strategy detail
  - `/apps/btc-updown-5m/space/[spaceId]/member/[userId]` → User profile
  - `/apps/btc-updown-5m/marketplace` → Marketplace
  - `/apps/btc-updown-5m/editor` → Strategy editor
- [x] Types + Mock data + Store (`$lib/updown-v2/`)
- [x] Hub page: Overview / My Instances / Spaces tabs
- [x] Mode filter (All/Sandbox/Live) with stats
- [x] Real auth: `authStore` + `AuthModal` (passkey login)
- [x] i18n: EN + ZH, parent-path fallback for sub-routes
- [x] CSS token system (no hardcoded colors)
- [x] Logged-out view with trending + sign-in prompt
- [x] Onboarding card when no instances
- [x] Sparkline charts on trending cards
- [x] Reusable `DataTable` component (sorting, status filter, pagination)
- [x] My Instances: sortable table with status filter + pagination
- [x] Marketplace: sortable table with period stats columns
- [x] Marketplace: search input with clear button
- [x] Marketplace: card/list view toggle
- [x] Space page: 4-tab (Overview/Strategies/Members/Admin)
- [x] Space admin: live trading toggle, max instances, admin codes
- [x] Space leaderboard: profit rankings, clickable user profiles
- [x] Instance detail: draggable sidebar resize handle + collapse toggle
  - StatsGrid, HourlyChart, WeekdayChart, Direction Split, Streaks, Hedge
  - DatePicker with presets (Today/7d/30d/90d)
  - RoundsHistory with status + result filters
- [x] Strategy detail: full analytics dashboard
  - Rich hero with author link, follow/copy counts, tags, risk badge
  - StatsGrid, HourlyChart, WeekdayChart, Direction Split, Streaks, Hedge
  - Config viewer (BIP-323 JSON, card layout by section)
  - RoundsHistory + purchase banner for locked strategies
- [x] Member profile: stats, running instances, StatsGrid, HourlyChart
- [x] HourlyChart: hover tooltip on all hours (consistent with WeekdayChart)
- [x] RoundsHistory: simplified filters (removed BET/Reverse/SKIP)
- [x] Add Space modal: ResponsiveModal
- [x] Activity feed: card-based with colored dots, clickable links
- [x] Analytics CSS in shared.css (Direction Split, Streaks, Hedge)

## TODO — Features (requires real API)
- [ ] Strategy Editor: integrate BIP-323 editor (from /tmp/strategy-creator.html prototype)
- [ ] Instance create/start/stop/pause: wire to BIP-328 API
- [ ] SSE live data: connect to endpoint SSE stream
- [ ] Real data: replace mock with actual API calls
- [ ] Join space flow: real API with passkey signature verification
- [ ] Admin code linking: real flow with endpoint verification
- [ ] Profile modal: show sub-accounts (BIP-327)
- [ ] Payment: strategy purchase with 50/25/25 split (Creator/Space/BiuBiu)
- [ ] Subscription: Free/Pro tier paywall

## TODO — Global
- [ ] Footer: add tools/GitHub links
- [ ] Footer: add language/theme quick toggle
- [ ] PageHeader: clean up unused CSS
