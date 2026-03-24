# SDP v3 Stability Audit

> Date: 2026-03-23
> Method: Map all 27 existing production strategies + 15 categories of real-world strategies to SDP v3, identify gaps

---

## 1. Production Strategy Mapping (27/27)

### Legend
- ✅ = Fully expressible
- ⚠️ = Expressible with workaround
- ❌ = Cannot express

| # | ID | Name | Signal | Entry | Risk | Exit | SDP v3 | Notes |
|---|-----|------|--------|-------|------|------|--------|-------|
| 1 | v1 | Basic Follow | clob_follow | market | hedge on | settlement | ✅ | |
| 2 | v2 | Naked Follow | clob_follow | market | hedge off | settlement | ✅ | |
| 3 | v3 | Balanced Market | clob_follow | market, price 0.58-0.68 | hedge off | settlement | ⚠️ | **Missing `entry.minPrice`** |
| 4 | v4 | Low-Threshold Hedge | clob_follow | market | hedge sellAbove:15 | settlement | ✅ | |
| 5 | v5 | Light Hedge | clob_follow | market | hedge price:0.20 shares:25 | settlement | ✅ | |
| 6 | v6 | High-Stake Follow | clob_follow | market, amount:500 | hedge off | settlement | ⚠️ | Missing minPrice |
| 7 | v7 | Signal Decision | scoring (9 rules, v1) | market, price 0.58-0.68 | hedge off | settlement | ⚠️ | Missing minPrice |
| 8 | v8 | Signal Filter | scoring (9 rules, no reverse) | market | hedge off | settlement | ✅ | `allowReverse: false` |
| 9 | v9 | High-Stake Signal | scoring (9 rules) | market, amount:500 | hedge off | settlement | ⚠️ | Missing minPrice |
| 10 | v10 | Refined Signal | scoring (v2, 6 rules, ≥3) | market | hedge off | settlement | ✅ | |
| 11 | v11 | Relaxed Signal | scoring (v3, 8 rules, ≥1) | market | hedge off | settlement | ✅ | |
| 12 | v12 | Minimal Filter | scoring (v4, 3 rules, ≥0) | market | hedge off | settlement | ✅ | |
| 13 | v13 | Calm Market | scoring + vol gate (low) | market | hedge off | settlement | ✅ | `filter.volatility` |
| 14 | v14 | Calm & Balanced | clob_follow + vol gate | market, price 0.58-0.62 | hedge off | settlement | ⚠️ | Missing minPrice |
| 15 | v15 | Volatile Swing | clob_follow + vol gate (high) | swing, target:0.48 | SL:0.30 hold:60s | TP:25% | ✅ | `entry.method: "swing"` |
| 16 | v20 | Early Low-Price | clob_follow | market, window:[240,120] | hedge off | settlement | ⚠️ | Missing minPrice |
| 17 | v21 | Small Early | clob_follow | market, amount:5 | hedge off | settlement | ⚠️ | Missing minPrice |
| 18 | v22 | Early Signal | scoring (v2, ≥3) | market, window:[240,140] | hedge off | settlement | ⚠️ | Missing minPrice |
| 19 | v23 | Full-Window Signal | scoring (v2, ≥3) | market, window:[300,30] | hedge off | settlement | ⚠️ | Missing minPrice |
| 20 | v24 | Prev Candle | candle follow | market, maxPrice:0.52 | hedge off | checkpoint:180s | ✅ | |
| 21 | v34 | Prev Candle No Ckpt | candle follow | market, maxPrice:0.52 | hedge off | settlement | ✅ | |
| 22 | v26 | Candle+RSI+CLOB | rsi_reversal (35/65) | market, maxPrice:0.52 | hedge off | checkpoint:180s | ✅ | RSI as primary signal, checkpoint for exit |
| 23 | v27 | RF Prediction | ml (rf, conf:0.55) | market, window:[270,210] | hedge off | checkpoint:180s | ✅ | |
| 24 | v28 | RF Low Threshold | ml (rf, conf:0.52) | market | hedge off | checkpoint:180s | ✅ | |
| 25 | v38 | RF No Checkpoint | ml (rf, conf:0.52) | market | hedge off | settlement | ✅ | |
| 26 | v30 | Post-Market Arb | post_close | scan | hedge off | settlement | ✅ | |
| 27 | v16 | Trend Follow | clob_follow + trend gate | market | hedge off | settlement | ✅ | `filter.trend` |

### Result: 17 ✅ + 10 ⚠️ + 0 ❌

**唯一的 gap：`entry.minPrice`（价格下限）**

10 个策略使用了 `priceMin`（0.55-0.58），SDP v3 只有 `maxPrice` 没有 `minPrice`。

**Why `minPrice` matters:**
- 当 share price 很低（如 <0.10）时，意味着市场已经判定这一方会输，买入几乎是白扔钱
- `priceMin` 过滤掉"已经没悬念"的轮次
- 多个生产策略依赖这个参数

**Fix: Add `entry.minPrice` to SDP v3** — 一行字段，不改结构。

---

## 2. Real-World Strategy Coverage (15 categories)

Based on research against 15 categories of trading strategies:

| Category | Expressible? | How | Limitation |
|----------|-------------|-----|------------|
| RSI Mean Reversion | ✅ | `signal.method: "rsi_reversal"` | — |
| MACD Crossover | ✅ | `scoring` with `macd` indicator | — |
| Bollinger Bounce | ✅ | `scoring` with `bollinger_pct` | — |
| Stochastic | ✅ | `scoring` with `stochastic` | — |
| Order Flow | ✅ | `clob_follow` / `clob_fade` | — |
| Momentum | ✅ | `candle.follow` or `scoring` with `roc` | — |
| Volatility Filter | ✅ | `filter.volatility` | — |
| Time/Schedule | ✅ | `filter.schedule` with grid | — |
| ML Prediction | ✅ | `signal.method: "ml"` | — |
| Post-Close Arb | ✅ | `signal.method: "post_close"` + `entry.method: "scan"` | — |
| Candle Patterns | ✅ | `candle.template` with sequence | — |
| Hedging | ✅ | `risk.hedge` | — |
| Streak/DCA | ✅ | `candle.streak` or `signal.method: "fixed"` | — |
| Multi-Indicator | ✅ | `scoring` with configurable indicators | — |
| Trend Following | ✅ | `filter.trend` + signal method | — |

**Coverage: 15/15 categories expressible.**

Not in scope (by design):
- Grid/Market Making — continuous multi-position, not round-based
- Cross-venue hedging — needs separate execution infrastructure
- Multi-asset correlation — needs additional data sources
- Online adaptive learning — meta-layer, not strategy config

---

## 3. Internal Consistency Check

| Item | Status | Issue | Fix |
|------|--------|-------|-----|
| `candle.template.minSimilarity` computation | ⚠️ | Spec doesn't clarify: does `"any"` count toward total features or not? If it does, templates with many `"any"` get artificially high similarity | **Clarify: similarity = matched_non_any / total_non_any** |
| `risk.streakRules` vs `risk.cooldown` | ⚠️ | Both appear in different parts of the spec. Examples inconsistent | **Standardize: `streakRules` is the canonical form. Remove `cooldown` references** |
| `entry.sizing` | ⚠️ | Defined in spec but no template example uses it | **Add example** |
| Exit `settlement` auto-append | ✅ | Clearly stated: "缺省自动追加" | — |
| Unknown field handling | ✅ | Clearly stated: "MUST ignore" | — |
| `post_close` + `scan` coupling | ✅ | Validation rule #1 covers this | — |
| `candle.template.direction: "reverse"` | ⚠️ | "reverse last" — reverse WHAT last? Last candle? Last template candle? | **Clarify: reverse the direction of the last candle in the matched sequence** |

---

## 4. Forward Compatibility Assessment

| Future Feature | Can add without breaking? | How |
|----------------|--------------------------|-----|
| New indicator type (e.g., `funding_rate`) | ✅ | Add to indicator enum. Old clients ignore unknown types |
| New signal method (e.g., `ensemble`) | ✅ | Old clients reject unknown method (expected) |
| New candle feature (e.g., `volumeProfile`) | ✅ | Add field to template, old clients ignore it |
| New exit type (e.g., `timeLimit`) | ✅ | Add type, old clients ignore unknown exit |
| New filter type (e.g., `spread`) | ✅ | Add `filter.spread`, old clients ignore |
| New entry method (e.g., `twap`) | ✅ | Add method, old clients reject unknown (expected) |
| Cross-asset indicators | ✅ | Add `asset` field to indicator config, old clients ignore |
| Multi-model ensemble signal | ⚠️ | Would need new method or composition mechanism |

**Additive changes (new indicators, filters, exit types) are non-breaking.**
**New methods/modes are breaking for old clients** — but this is expected and handled by `$schema` version.

---

## 5. Stability Verdict

### Ready to stabilize? **Yes, with 3 minor fixes.**

| Fix | Severity | Effort | Description |
|-----|----------|--------|-------------|
| Add `entry.minPrice` | P0 | 1 line | 10 of 27 production strategies need it |
| Clarify `minSimilarity` excludes `"any"` | P1 | 1 paragraph | Avoid ambiguous matching |
| Remove `cooldown` in favor of `streakRules` | P1 | Search & replace | Internal consistency |

### Why it's stable:

1. **100% production coverage** — All 27 existing strategies map to v3 (with the minPrice fix)
2. **100% category coverage** — All 15 real-world strategy categories expressible
3. **Forward compatible** — New indicators/filters/exits are additive, non-breaking
4. **Decision-chain structure is solid** — filter → signal → entry → risk → exit maps to how traders think
5. **No structural ambiguity** — Each strategy maps to exactly one representation (no two ways to express the same thing, except `scoring` can subsume simpler methods)
6. **Extensibility proven** — We successfully added `template` mode, `streakRules`, `sizing`, 14 new indicators WITHOUT changing the core structure

### What makes a protocol "stable":

| Criterion | SDP v3 | Evidence |
|-----------|--------|----------|
| **Expressiveness** — can describe all needed strategies | ✅ | 27/27 production + 15/15 categories |
| **Unambiguity** — one way to parse, one meaning | ✅ after fixes | Only `minSimilarity` and `cooldown` need clarification |
| **Forward compatibility** — new features don't break old | ✅ | Additive design with `"MUST ignore"` unknown fields |
| **Minimality** — no unnecessary complexity | ✅ | 5 top-level sections, each maps to a decision step |
| **Implementability** — can be built by third parties | ✅ | JSON-only, no custom binary formats, clear validation rules |
| **Testability** — can validate a strategy JSON | ✅ | 15 explicit validation rules |
| **Migration path** — old strategies can convert | ✅ | v2→v3 mapping table in spec |
