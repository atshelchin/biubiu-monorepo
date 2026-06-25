# apps/biubiu.tools — Review Follow-up & Decisions

Companion to `REVIEW-FINDINGS.md`. Tracks what's been fixed, what's verified-safe to remove,
and what needs a human decision (per `agent-rules/AI-CODING-RULES.md` Owner notes / Follow-up).

## ✅ Fixed this pass (each with a regression test; full suite 545/545 green)

| # | Area | Fix | Tests |
|---|------|-----|-------|
| P1 | routes `/api/proxy` | Unauthenticated SSRF → IP-level guard (`$lib/server/ssrf.ts`): blocks loopback/private/link-local/IMDS/IPv6-ULA, DNS-resolves hostnames & rejects any private resolved IP (defeats rebinding + numeric-IP obfuscation), `redirect:'error'` (defeats 302→IMDS), connect-only timeout (SSE-safe). | ssrf.spec.ts (15) |
| P1 | subscription | Fee-waiver bypass + false-negative: `subscriptionStore` now tracks `loadedFor`, fails closed on RPC error, latches `loaded` only on success; every premium check bound to the user's own Safe. | member-proof.spec.ts (6) |
| P1 | wallet-sweep | Relay-key file no longer lies ("can redirect ANY still-delegated EOA … DELETE after revoke"); relay key auto-wiped after gas recovery when no delegations remain; post-revoke guidance log. | relayer.spec.ts (6) |
| P1 | balance-radar | Multicall on custom networks threw `ChainDoesNotSupportContract` → pass `multicallAddress` explicitly (native + ERC20). | multicall-balance.spec.ts |
| P1 | contract-caller | Read failover was dead (transport errors misread as reverts via `0x[0-9a-f]{8}`) → dropped the selector match. | rpc-client.test.ts |
| P1 | event-scanner | Terminally-failed chunk was silently counted as covered → now recorded as a gap; `isFullyCovered()` withholds "complete" while gaps exist. | event-scanner.spec.ts |
| P1 | token-sender | Fund-critical resume/double-payout guard had no test → resume-skip tests (no re-send, no re-charged fee, no re-paid recipients). | orchestrator.spec.ts |
| sec | routes `/+page.server.ts` | Deleted — it `console.log`ged `DATABASE_URL` + `API_KEY` (secret leak; debug scaffold, no `load`). | n/a |
| test | routes homepage | Fixed pre-existing harness failure (mock `$app/stores` page for `SEO.svelte`). | page.svelte.spec.ts |

## 🔢 Verified-dead exports — safe to remove (grep-confirmed 0 prod refs)

`BATCH_TOP_VALUE`, `batchNativeOutflow` (+spec) — token-sender/infra/multisend.ts ·
`getSend`, `deleteSend` (+spec) — token-sender/history/send-history.ts ·
`RevokeOutcome` — revoke/types.ts ·
`currencyName` — wallet/infra/currency-catalog.ts ·
`isSupportedChain` — wallet/infra/chains.ts ·
`providerChainIds` — wallet/infra/providers.ts ·
`subscribeServiceNodes` — wallet/infra/endpoints.ts ·
`WeekdayStats` — updown-shared/types.ts ·
`SignalConfig` (deprecated alias) — updown-shared/configurator/types.ts ·
`shortDate`, `shortDateHour` — updown-v2/utils.ts ·
3 unused CSS selectors — updown-shared/configurator/ConfiguratorDrawer.svelte (`.field-unit`, `.range-row`, `.sub-section`).

### ⚠️ Claimed dead but NOT (kept — verification saved us)
- `encodeMultiSend` — **3 prod references**, in use. Keep.
- `getEventTypeLabel` — **1 prod reference**, in use. Keep.

## 🧑‍⚖️ Needs a human decision (NOT auto-changed)

1. **nft-multisender + token-multisender are entirely dead/WIP tools.** `createNftMultisenderApp` /
   `createTokenMultisenderApp` are never imported anywhere; every distribution-contract address is a
   `0x000…0` placeholder. Either finish + deploy the contracts, or delete both `pda-apps/*-multisender`
   trees (and their specs). Flagged rather than deleted — placeholders read as intentional WIP.
2. **pump-signal is unfinished/orphaned.** `/apps/pump-signal` (865 LOC) uses `pumpSignal.*` i18n keys
   but there is **no `messages/*/apps/pump-signal.json`**, so every visible string renders as a raw key;
   it is also not linked from any nav. Decide: finish (add the 15-locale namespace + link it) or remove.
3. **updown-shared vs updown-v2 duplication.** Two parallel BTC-up/down stacks; updown-v2 carries dead
   parallel auth (`auth`/`login`/`logout`), `summary`, and `MOCK_*`. Needs an owner call on which is
   canonical before a real de-dupe (medium-risk refactor — out of scope for a safe pass).
4. **wallet-sweep contract-level hardening (optional).** The client fixes above are sufficient for the
   P1. To fully remove the "future funds" escalation, pin `dest` into `Sweeper7702` at delegation time
   (constructor, per-relay CREATE2 salt) so the controller cannot redirect — a `biubiu-contracts` change
   + redeploy, deliberately left out of this pass.

## 🐛 Found by the TESTING.md doc agents (reading code like testers) — fixed

| Area | Bug | Fix |
|------|-----|-----|
| e2e-chat | `MessageBubble` reused one `/g` regex for `.test()` across chunks → stateful `lastIndex` mis-linkified multiple URLs; keyed `{#each}` by chunk (dup-key crash risk) | extracted pure `linkify()` (anchored non-global test) + index key; `linkify.spec.ts` (6) |
| revoke | per-row Revoke button missing `!sendSupported` guard (batch button had it) → clickable on unsupported chains | added the guard |
| event-scanner | bad-EIP-55-checksum address passed the loose UI gate, `buildScanInput`→viem `getAddress()` threw, `handleStart` only caught `ActionBusyError` → uncaught | wrap `buildScanInput`, surface inline; execution errors → inline (not re-thrown) |
| wallet-sweep | Gnosis `chainlinkNativeUsdFeed` was a **malformed 41-char address** (silently failed → wrong fee tier + wasted RPC) | removed the bad constant (TODO for correct feed) + `isAddress` guard in `fee.ts` |
| contract-deployer | invalid salt silently nulled the predicted address with NO error, though `deploy.error.invalidSalt` exists | render the inline error + red input when `salt.length !== 66` |

## 🔎 Found by doc agents — flagged (not yet fixed)

- **btc-updown**: `addCustomStrategy` surfaces a hardcoded English literal `"No strategies found at this endpoint"` (not i18n). Needs a 15-locale key (`btcUpdown.*`). Also `'Action failed'` / `'Failed to create'` literals.
- **btc-updown-5m**: `RoundsHistory.svelte` references i18n keys `btcUpdown.round.hedgeFilledAt` / `hedgeSoldAt` that **don't exist** in any catalog (latent — only hidden because mock rounds set `hedge: null`); editor `Create Instance` has zero validation; no inline error banners anywhere (violates "surface errors in UI"); `DataTable` sortable `<th>` lack `aria-sort`/`role`/`tabindex`; editor `.glass-card` hardcodes `rgba(255,255,255,…)` (light-theme contrast).
- **vela-wallet-chain-setup**: the route does NOT match its described purpose (no wallet-connect / Tempo / fiat / 12-chain list) — it's an arbitrary-EVM contract-readiness checker + deployer; deployer private key persists in plaintext `localStorage` (and downloadable). Decide if the route is mislabeled or incomplete.
- **pump-signal** (correction): i18n is **NOT** broken — `pumpSignal.*` keys live in `_global.json`, fully translated in all 15 locales (my earlier premise was wrong). But the route is confirmed **orphaned** (no nav link; `featured.pumpSignal.*` rendered nowhere), SSE lang hard-coded `'en'`, ad cards always English, and an Early-signals `// TODO: replace with real endpoint`.
- **contract-deployer**: dead i18n keys from the retired wizard (`deploy.step.*`, `deploy.nav.*`, several `deploy.error.*`, `deploy.account.notLoggedIn`).
- a11y: several copy buttons / status icons lack `aria-label`; `AddStrategyModal` hardcodes a dark panel (light-theme contrast).

## 🧰 `bun run check` (svelte-check) — pre-existing type debt + a tooling bug

Running `bun run check` reports **49 errors / 105 warnings**, but this is misleading:

1. **Tooling bug:** `check` = `svelte-kit sync && svelte-check`. `svelte-kit sync` WIPES
   `.svelte-kit/types/$i18n` (the `$i18n` types are generated by the vite i18n plugin,
   which `svelte-check` does not run). So a plain `bun run check` produces a cascade of
   phantom `Cannot find module '$i18n'` / i18n-type errors. **Workaround / true count:**
   regenerate `$i18n` first (any `vitest`/`vite dev`/`vite build` run does it), then run
   `npx svelte-check` *without* sync. Fix idea: wire the i18n type-gen into the `check` script.
2. **~22 errors are in the out-of-scope `packages/proeditor-sveltekit/` workspace dep**, not in apps/biubiu.tools.
3. The genuine in-scope errors are **pre-existing** (none in files changed this pass) and concentrated in
   `src/routes/apps/btc-updown/+page.svelte` (~16: `'unit'` number-format style not in the i18n
   `NumberFormatOptions`, `filter`/`reduce` on a `never[]`, `TranslateFn` param-variance), plus
   small ones: `auth/browser-check.ts` (Navigator cast), `ui/ScanQrButton.svelte` (`BarcodeDetector`
   missing DOM type), `ui/PageFooter.svelte` & `routes/+page.svelte` ("modifiers cannot appear here"),
   `updown-shared/components/RoundsHistory.svelte` (`Round.signal_rules` missing from type),
   `assets/[chainId]/[address]` (string→number), `vite.config.ts` (vite 6↔7 Plugin type skew).
   **Fixed one real runtime bug here:** `btc-updown/+page.svelte:1014` assigned the undeclared
   `configPanelSection` → `ReferenceError` when removing a custom strategy host (removed the dead line).

These are a bounded, separate cleanup (and a complex file) — left as a dedicated follow-up per
"keep changes small / don't touch unrelated code."

## ✅ Dead code removed this pass (grep-verified 0 refs)
wallet/infra: `currencyName`+`BY_CODE`, `isSupportedChain`, `providerChainIds`(+orphaned `CHAINS` import), `subscribeServiceNodes` ·
`BATCH_TOP_VALUE` (token-sender/infra/multisend.ts) · `RevokeOutcome` (revoke/types.ts) ·
`WeekdayStats` (updown-shared/types.ts) · `SignalConfig` (updown-shared/configurator/types.ts) ·
`shortDate`/`shortDateHour` (updown-v2/utils.ts) · the `configPanelSection` dead assignment (btc-updown).
Still pending (tested-but-unused, removal touches specs): `batchNativeOutflow`, `getSend`, `deleteSend`.

## ✅ Unit coverage added for the 6 zero-test areas (+204 tests → suite 755/755 green)
- `deploy/create2.spec.ts` (31) — **found+fixed a real bug**: `parseArgValue` checked `startsWith('uint')` before `endsWith('[]')`, so numeric array constructor args (`uint256[]`, `int8[]`) went to `BigInt('[...]')` → threw → `buildInitCode` silently returned `null`. Reordered the array branch first.
- `evm/asset-icons.spec.ts` (18) + `network-pool.spec.ts` (6) — note: `createEVMPools` throws if a mapped network has empty `rpcs` (Pool needs ≥1 vendor) — latent edge, flagged not fixed.
- `chains/rpc.spec.ts` (18) + `wallet.spec.ts` (21) — EIP-3085 add-chain params, http(s)-only, key-templated-RPC filtering.
- `updown-v2/utils.spec.ts` (18) + `formatter-bridge.spec.ts` (10).
- `vela-chain-setup/contracts.spec.ts` (22) + `deployer-wallet.spec.ts` (11) — pre-signed keyless-deploy tx sender recovery, key derivation.
- `wallet-debug/helpers.spec.ts` (35) + `labels.spec.ts` (11).
Also fixed: **subscription waiver now resets on logout/account-switch** (`memberWaiver.syncToUser` + PageHeader effect) so it can't silently reactivate without a fresh passkey proof — 3 tests.

## ✅ Type-check is now clean for apps/biubiu.tools (was 26 real in-scope errors → 0)
- **Fixed the `check` tooling bug**: `scripts/gen-i18n-types.mjs` regenerates `$i18n` between `svelte-kit sync` and `svelte-check` (wired into `package.json` `check`/`check:watch`), so `bun run check` no longer emits phantom `$i18n` errors.
- Fixed all in-scope pre-existing type errors: `btc-updown/+page.svelte` (16 — FormatterContext options variance, `typeof`→`never`, 8× `TranslateFn` key-contravariance), `app.d.ts` ambient globals (`__COMMIT_HASH__`, `BarcodeDetector`) removing mis-placed `declare const` in `+page.svelte`/`PageFooter.svelte`, `browser-check.ts` (Navigator cast), `ScanQrButton.svelte` (`in globalThis` feature-detect), `RoundsHistory.svelte` (`Round.signal_rules` added to type), assets route (`Number(chainId)`), `vite.config.ts` (vite 6↔7 `PluginOption[]` cast).
- **Remaining 22 `bun run check` errors are ALL in the out-of-scope `packages/proeditor-sveltekit` workspace dep** — not apps/biubiu.tools. Fixing them is a separate task in that package.
- **i18n literals**: `btc-updown` "No strategies found…" is now `t('btcUpdown.strategy.notFound')`; added `btcUpdown.strategy.notFound` + `btcUpdown.round.hedgeFilledAt/hedgeSoldAt` across all 15 locales (translated).

## ✅ Round 2 — P2 batch 2 + dedup (suite 817 → 946 green, typecheck still 0 in-scope)

**P2 batch 2 (fixed + tested):**
- deploy: CREATE2 salt now hex-validated (was length-only → confident-but-wrong address); `deployAllMissing` honors the UI-scoped set; rapid-chain-switch race guard (`_checkToken`). Skipped+flagged: deployer-key plaintext persistence, network-check cache poisoning (both need a caching/UX decision).
- event-scanner: **deterministic `scanId`** (`infra/scan-id.ts`) — resume/dedup now actually match for "last N days"/relative ranges (was keyed off resolved blocks+now). Skipped: live-tail reorg cleanup (needs shared event-store infra).
- updown-shared: `fetchHourly` half-hour-timezone bucket fix (was dropping all rows for +5:30 users); StrategyControlPanel preserves real config on edit.
- updown-v2: **`isSpaceAdmin`** real-user gate (was hardcoded fake id → admin codes shown to anyone); winRate %-format; DataTable sort-init guard.
- forever: unify unlock/deriveKey guard (no concurrent derive); seal preflight separates fee vs fee+gas.
- wallet-sweep: RPC timeout now covers the response-BODY read; funding estimate uses per-chunk gas math (was underfunding multi-chunk sweeps); service fee no longer re-charged on re-sweep (`feePaidKey`/`fee-session.ts`).
- wallet-debug: `usesMultiSend` gate (no MultiSend preview for external wallets); add-chain targets the active wallet.

**Dedup / reuse (behavior-preserving, tested):**
- token-sender: `publicClientFor` shared RPC client; `isAddress({strict:false})` (byte-identical to the old regex — deliberately not strict, to preserve the store's acceptance set); `runWithCallbacks` for send/resume.
- revoke: `dedupeBy` (3 copies → 1); `withStore` IndexedDB wrapper.
- contract-caller: `isDeployedWith`/`isDeployed` getCode helper; RPC-list dedup.
- wallet: `json-rpc.ts` (`jsonRpcPost` + `RpcResponse`, used by chain-RPC + bundler — error mappers kept caller-supplied so failover semantics are byte-identical) + `bundler-headers.ts`.
- e2e-chat: `format.ts` `shortenAddress`.

## ✅ Round 3 — adversarial self-review of the session's own diff (caught + fixed agent-introduced regressions)

A 6-agent skeptic pass audited THIS session's `git diff` for regressions the fix/dedup agents introduced. It found real ones — all now fixed:
- **[P1, funds-safety — was MINE] wallet-sweep relay-key auto-wipe**: it gated on the in-memory `sweptSet`, which resets to empty on reload → "Recover gas" after a reload could permanently delete the relay key while EOAs were still delegated. Fixed: gated on a new `didDelegateThisSession` flag (set only when a sweep actually delegates EOAs this session), so a post-reload Recover gas never wipes. Regression scenario added to wallet-sweep `TESTING.md` §H.
- **[P1] event-scanner deterministic `scanId`**: reverted to the per-run `merkleRoot` — the "fix" had made prior-run gaps permanent, accumulated stale out-of-window events, and forked old saved scans on resume. Resume still works (rebuilds the same concrete blocks → same merkleRoot). The round-1 gap-on-failure / `isFullyCovered` fix was preserved.
- **[P2 — was MINE] /api/proxy `redirect:'error'`**: broke legitimate http→https / trailing-slash upstream redirects. Fixed: follow redirects MANUALLY (max 5 hops), re-validating EACH hop through the SSRF guard so an allowed host still can't 302 to an internal target.
- **[P3] member-proof in-flight dedup**: added `subscriptionStore.loadingFor` so concurrent first-loads for the same Safe don't fire duplicate RPC pairs.
- **[P3] deploy `networkChecking` stuck spinner**: `changeNetwork()` now clears the flag (a stale in-flight check no longer leaves the spinner stuck).
- Accepted/flagged (not bugs): subscription same-address reload keeps last-known-good on RPC failure (matches documented intent); `pickBundlerRpcUrl` worst-case latency (correctness > speed); SSRF DNS-failure → 403 vs 502 (cosmetic).

**Post-fix verification: unit 938/938, `bun run check` 0 in-scope errors.** (938 vs 946 = the 8 reverted scan-id tests.)

## 📋 Remaining work (roadmap — risk map in REVIEW-FINDINGS.md)
- Unit-test gaps for the 0-test areas: `wallet-debug`, `deploy`, `updown-v2`, `vela-chain-setup`, `evm`, `chains`.
- Playwright E2E for non-wallet flows (route smoke, i18n raw-key, theme); wallet flows are covered by the per-tool `TESTING.md` agent playbooks.
- P2 sweep (64 verified P2 findings, per area in REVIEW-FINDINGS.md).
- i18n: btc-updown `"No strategies found…"` literal + btc-updown-5m missing `hedgeFilledAt`/`hedgeSoldAt` keys (15-locale).
- Pre-existing svelte-check type debt (above).

## Residual risk after fixes
- SSRF: a sub-second DNS-rebinding TOCTOU between the resolve-check and `fetch`'s re-resolution remains
  (closing it fully needs a socket pinned to the validated IP via a custom dispatcher). IMDS, redirect,
  and hostname→internal paths are closed. `/api/proxy` is still an open, unauthenticated, unrate-limited
  proxy by design — consider per-IP rate limiting.
- Membership waiver is client-side by product decision; a modified local client can still zero the fee
  on-chain. The signature gate only stops session-copy / watch-only bypasses (as documented in code).
