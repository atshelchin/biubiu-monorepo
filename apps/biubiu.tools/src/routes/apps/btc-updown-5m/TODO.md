# BTC Up/Down 5m — Remaining Work

## Done
- [x] Route structure: `/apps/btc-updown-5m`
- [x] Types + Mock data + Store (`$lib/updown-v2/`)
- [x] Hub page: Overview / My Instances / Spaces tabs
- [x] Mode filter (All/Sandbox/Live) with stats that follow
- [x] Real auth: `authStore` + `AuthModal` (passkey login)
- [x] i18n: EN + ZH message files
- [x] CSS token system (no hardcoded colors)
- [x] Logged-out view with trending + sign-in prompt
- [x] Onboarding card when no instances
- [x] Sparkline charts on trending cards
- [x] Click feedback (`:active` scale) on all interactive elements
- [x] PageHeader simplified: no nav links, no mobile drawer, avatar-only on mobile
- [x] Marketplace list view (sortable table)
- [x] Strategy detail page (stats + lock/purchase)

## TODO — UI Polish
- [ ] Strategy detail: real charts (integrate existing HourlyChart/WeekdayChart)
- [ ] Strategy detail: author info card, follow/copy counts, creation date
- [ ] Strategy detail: config viewer for public/purchased strategies
- [ ] Marketplace: card view toggle (list/card switch button)
- [ ] Marketplace: search input, filter by tags/visibility
- [ ] Marketplace: column sorting on click
- [ ] Add Space: real modal with URL input + validation (like existing AddStrategyModal)
- [ ] Space dashboard: integrate existing updown-shared components (StatsGrid, RoundsHistory, LiveFeed, HourlyChart, WeekdayChart)
- [ ] Space dashboard: mobile sidebar drawer for strategy list
- [ ] Follow/Copy/Unlock buttons: real actions with API calls
- [ ] Activity feed: filter by mode (sandbox/live)

## TODO — Features
- [ ] Strategy Editor: integrate the BIP-323 editor (from /tmp/strategy-creator.html prototype)
- [ ] Instance create/start/stop/pause: wire to BIP-328 API
- [ ] SSE live data: connect to endpoint SSE stream
- [ ] Real data: replace mock with actual API calls
- [ ] Profile modal: show sub-accounts (BIP-327)

## TODO — Global
- [ ] Footer: add tools/GitHub links (removed from header)
- [ ] Footer: add language/theme quick toggle
- [ ] PageHeader: clean up unused CSS (nav-desktop, drawer-links etc.)
