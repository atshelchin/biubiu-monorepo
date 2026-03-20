# polymarket-strategy-v2 JSON Schema Specification

Version: 2.0
Date: 2026-03-20

## Overview

A strategy JSON file is a self-contained, shareable configuration that fully describes
a trading strategy for the Bitcoin Up/Down 5-minute prediction market. It uses the
`polymarket-strategy-v2` schema and is structured into 7 functional groups plus metadata.

**TypeScript type**: `StrategyJsonV2` (file format) / `StrategyConfigV2` (runtime config)

---

## File Format (`StrategyJsonV2`)

```jsonc
{
  "$schema": "polymarket-strategy-v2",  // required, literal
  "id": "my-strategy",                  // required, 3-40 chars, [a-zA-Z0-9-]
  "label": { "zh": "...", "en": "..." },// required, bilingual display name
  "description": { "zh": "...", "en": "..." }, // required, bilingual
  "version": 1,                          // optional, author increments on update
  "schedule": { ... },                   // optional, when to run
  "exportedAt": "2026-03-20T13:04:48Z",  // optional, ISO 8601

  // ... all StrategyConfigV2 fields below
}
```

`StrategyJsonV2` extends `StrategyConfigV2` with metadata fields.
When importing, metadata is extracted separately from the config.

---

## 1. Entry

**When, how much, and how to enter a position.**

| Field | Type | Required | Range | Default | Description |
|-------|------|----------|-------|---------|-------------|
| `amount` | number | yes | 0.01-10000 | 50 | Budget per entry (USD) |
| `priceRange` | [number, number] | yes | each 0.01-0.99, [0]<[1] | [0.55, 0.70] | Only enter when token price is within range |
| `windows` | EntryWindowConfig[] | yes | 1-3 items | 3 windows | Time windows for entry (see below) |
| `method` | string | yes | enum | "market" | Entry execution method |
| `maxBuyPrice` | number | no | 0.01-0.99 | - | Price ceiling for market/swing orders |
| `limitPrice` | number | no | 0.01-0.99 | - | Limit order price (method=limit) |
| `limitTimeoutSec` | number | no | >0 | - | Limit order timeout in seconds |
| `swingTargetPrice` | number | no | 0.01-0.99 | - | Target price for swing (method=swing_limit) |
| `swingWindowSec` | number | no | >0 | - | Swing wait window in seconds |
| `scanMaxBuyPrice` | number | no | 0.01-0.99 | - | Post-market scan price ceiling |
| `scanMaxSpend` | number | no | >0 | - | Post-market scan total budget |
| `scanWaitSec` | number | no | >=0 | - | Wait seconds after market close |
| `scanWindowSec` | number | no | >0 | - | Scan duration in seconds |
| `scanPollIntervalMs` | number | no | >0 | - | Scan polling interval (ms) |

### Entry Methods

| Method | Description | Required Fields |
|--------|-------------|-----------------|
| `market` | FOK market order, immediate fill | (none extra) |
| `limit` | GTC limit order, passive fill | `limitPrice`, `limitTimeoutSec` |
| `swing_limit` | Poll midpoint, buy when price hits target | `swingTargetPrice`, `swingWindowSec` |
| `post_market_scan` | After market close, scan orderbook for cheap asks | `scanMaxBuyPrice`, `scanMaxSpend`, `scanWaitSec`, `scanWindowSec`, `scanPollIntervalMs` |

### EntryWindowConfig

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `window` | 1\|2\|3 | - | Window number |
| `start` | number | >end, >0 | Remaining seconds: window opens |
| `end` | number | >=0 | Remaining seconds: window closes |

Example: `{ "window": 1, "start": 220, "end": 190 }` means enter when 220-190 seconds remain.

---

## 2. Direction

**How to decide Up or Down. Mutually exclusive -- pick one method.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | yes | Direction decision method |
| `params` | object | depends | Method-specific parameters |

### Direction Methods

#### `clob_follow` (default)
Follow the CLOB midpoint majority direction. No params needed.

#### `prev_candle`
Follow the direction of the previous Binance K-line candle. No params needed.
Requires `dataSources: ["binance"]`.

#### `rsi_reversal`
Enter against the trend when RSI hits extremes.
Requires `dataSources: ["binance"]`.

**params:**
| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `thresholdLow` | number | 0-100, < thresholdHigh | RSI below this = oversold, go Up |
| `thresholdHigh` | number | 0-100 | RSI above this = overbought, go Down |

#### `ml_model`
Use a machine learning model for prediction.
Requires `dataSources: ["binance"]` (and `"polymarket_trades"` for some models).

**params:**
| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `modelType` | string | "random_forest"\|"gradient_boosting"\|"xgboost" | Model algorithm |
| `modelId` | string | - | Engine-embedded model identifier (e.g. "rf-v5-30s") |
| `confidenceThreshold` | number | 0.5-1.0 | Minimum prediction confidence to trade |
| `maxBuyPrice` | number | 0.01-1.0 | Price ceiling for entry |
| `tradeWindowSec` | number | 5-120 | Wait for trade data before predicting |

#### `post_market_inference`
Infer the outcome from CLOB prices after the market closes.
Must be paired with `entry.method = "post_market_scan"`.

**params:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `inferThreshold` | number | 0.95 | Midpoint >= this = winner |
| `inferTimeoutSec` | number | 30 | Max seconds to wait for inference |

---

## 3. Gates (optional)

**Entry filters. Ordered pipeline -- ALL must pass for entry to proceed.**

Array of gate objects. Each has a `type` discriminant.

### Volatility Gate

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `type` | "volatility" | - | Discriminant |
| `maxAtrPct` | number | 0.001-1 | ATR as percentage of price |
| `mode` | string | "require_low"\|"require_high" | Low = calm markets only; High = volatile markets only |

### Trend Gate

| Field | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `type` | "trend" | - | - | Discriminant |
| `minAtrPct` | number | 0-1 | 0.04 | Minimum ATR% for trend confirmation |
| `minER` | number | 0-1 | 0.2 | Minimum Efficiency Ratio |
| `minBodyRatio` | number | 0-1 | 0.3 | Minimum candle body/range ratio |
| `requireMatch` | boolean | - | true | Trend direction must match entry direction |
| `period` | number | >0 | 10 | K-line lookback period |

---

## 4. Signal (optional)

**Score-based entry refinement. Compute technical indicators, sum scores, decide.**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `rules` | SignalRuleDefinition[] | yes | - | 1-20 indicator rules |
| `betThreshold` | number | no | 2 | Total score >= this to enter |
| `reverseThreshold` | number | no | -2 | Total score <= this to reverse direction |
| `reverseEnabled` | boolean | no | false | Allow reverse-direction entry |

### SignalRuleDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Rule identifier (e.g. "rsi_zone") |
| `indicator` | string | yes | One of: `roc`, `rsi`, `taker_buy_ratio`, `body_ratio`, `ema_crossover`, `vwap_deviation`, `volume_ratio`, `bullish_candles`, `candle_range_pct`, `volume_trend` |
| `params` | object | no | Indicator parameters (e.g. `{ "period": 14 }`) |
| `conditions` | RuleCondition[] | yes | Value-to-score mappings |
| `required` | boolean | no | If true, this rule must match (AND gate) |

### RuleCondition

| Field | Type | Description |
|-------|------|-------------|
| `range` | [number\|null, number\|null] | Value range [min, max]. null = unbounded. |
| `score` | number | Score to add (direction-agnostic) |
| `scoreUp` | number | Score to add when evaluating Up direction |
| `scoreDown` | number | Score to add when evaluating Down direction |
| `veto` | boolean | If true and range matches, skip this round entirely |

Example:
```json
{
  "name": "rsi_zone",
  "indicator": "rsi",
  "params": { "period": 14 },
  "conditions": [
    { "range": [30, 40], "score": 3 },
    { "range": [70, null], "scoreUp": 2, "scoreDown": -3 },
    { "range": [80, null], "veto": true }
  ]
}
```

---

## 5. Exit

**When to close the position. Array of rules -- ANY triggered = exit.**

`settlement` is always appended as a safety net if not already present.

### Exit Rule Types

| Type | Fields | Description |
|------|--------|-------------|
| `settlement` | (none) | Wait for market settlement (default) |
| `take_profit` | `pct`: number (0.001-100) | Exit when profit >= pct (e.g. 0.25 = 25%) |
| `stop_loss` | `price`: number (0.001-0.99), `minHoldSec?`: number | Exit when token price drops to this level |
| `trailing_stop` | `drawdownPct`: number (0.001-1) | Exit on drawdown from peak (e.g. 0.10 = 10%) |
| `checkpoint` | `remainingSec`: number (>0) | Re-check direction at N seconds remaining |

---

## 6. Hedge

**Opposite-side hedge position for downside protection.**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | yes | false | Enable hedging |
| `limitPrice` | number | yes | 0.10 | Hedge limit order price (0.001-0.99) |
| `shares` | number | yes | 50 | Number of hedge shares (1-10000) |
| `sellThreshold` | number | yes | 35 | Profit % to trigger hedge sell (>1) |

---

## 7. Risk (optional)

**Risk management guardrails.**

| Field | Type | Description |
|-------|------|-------------|
| `cooldown.afterConsecutiveLosses` | number (>=1) | Pause after N consecutive losses |
| `cooldown.pauseMinutes` | number (1-1440) | Minutes to pause |
| `dailyLossLimit` | number (>=1) | Max daily loss in USD |
| `maxOpenPositions` | number (>=1) | Max concurrent positions |
| `positionSizing.method` | "fixed"\|"kelly"\|"atr_scaled" | Position sizing method |
| `positionSizing.params` | object | Method-specific params |

---

## 8. Schedule (optional, file format only)

**When the strategy should run. Two modes (mutually exclusive).**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timezone` | string | yes | IANA timezone (e.g. "Asia/Shanghai") |
| `grid` | object | grid or rules | Hourly grid (see below) |
| `rules` | ScheduleTimeRule[] | grid or rules | Minute-precision rules |

### Grid Mode (hourly)

Key = day abbreviation (`sun`|`mon`|`tue`|`wed`|`thu`|`fri`|`sat`).
Value = array of active hours (0-23). Omitted days = inactive.

```json
{
  "timezone": "Asia/Shanghai",
  "grid": {
    "mon": [9,10,11,14,15,16,17],
    "tue": [9,10,11,12,13,14,15,16,17],
    "fri": [9,10,11,12,13,14]
  }
}
```

### Rules Mode (minute-precision)

```json
{
  "timezone": "Asia/Shanghai",
  "rules": [
    { "days": [1], "start": "09:00", "end": "12:00" },
    { "days": [1], "start": "14:00", "end": "18:00" },
    { "days": [2,3,4], "start": "09:00", "end": "18:00" }
  ]
}
```

`days`: 0=Sunday, 1=Monday, ..., 6=Saturday.
`start` < `end` (no midnight crossing; split into two rules).

---

## Data Sources

| Field | Type | Description |
|-------|------|-------------|
| `dataSources` | string[] | Auto-inferred from config. `"binance"` required for gates, signal, prev_candle, rsi_reversal, ml_model. |

---

## Cross-Group Validation Rules

| Rule | Reason |
|------|--------|
| `post_market_scan` entry requires `post_market_inference` direction | Scan needs known outcome |
| `post_market_scan` requires `windows: []` | No entry windows for post-market |
| `swing_limit` requires `swingTargetPrice` | No target = no trigger |
| `limit` requires `limitPrice` | No price = no order |
| `ml_model` requires `params.modelType` + `params.modelId` | Engine needs model reference |
| `rsi_reversal` requires `params.thresholdLow` < `params.thresholdHigh` | Logic constraint |
| signal/gates/prev_candle/rsi_reversal require `dataSources: ["binance"]` | Auto-added if missing |
| exit must have at least one rule | `settlement` auto-appended if empty |
| TP price > SL price (for swing_limit entries) | Logical consistency |
| `schedule.grid` and `schedule.rules` are mutually exclusive | Pick one mode |

---

## Complete Examples

### Minimal (CLOB Follow + Settlement)

```json
{
  "$schema": "polymarket-strategy-v2",
  "id": "basic-follow",
  "label": { "zh": "基础跟随", "en": "Basic Follow" },
  "description": { "zh": "跟随CLOB方向，等待结算", "en": "Follow CLOB direction, wait for settlement" },
  "entry": {
    "amount": 50,
    "priceRange": [0.55, 0.70],
    "windows": [{ "window": 1, "start": 220, "end": 190 }],
    "method": "market"
  },
  "direction": { "method": "clob_follow" },
  "exit": [{ "type": "settlement" }],
  "hedge": { "enabled": true, "limitPrice": 0.10, "shares": 50, "sellThreshold": 35 }
}
```

### RSI Reversal + TP/SL

```json
{
  "$schema": "polymarket-strategy-v2",
  "id": "rsi-reversal-tpsl",
  "label": { "zh": "RSI反转+止盈止损", "en": "RSI Reversal + TP/SL" },
  "description": { "zh": "RSI极值反转入场，止盈15%止损$0.35", "en": "RSI extreme reversal, 15% TP, $0.35 SL" },
  "entry": {
    "amount": 30,
    "priceRange": [0.50, 0.60],
    "windows": [{ "window": 1, "start": 280, "end": 240 }],
    "method": "market",
    "maxBuyPrice": 0.55
  },
  "direction": {
    "method": "rsi_reversal",
    "params": { "thresholdLow": 35, "thresholdHigh": 65 }
  },
  "gates": [
    { "type": "trend", "minAtrPct": 0.04, "minER": 0.2, "minBodyRatio": 0.3, "requireMatch": true, "period": 10 }
  ],
  "exit": [
    { "type": "take_profit", "pct": 0.15 },
    { "type": "stop_loss", "price": 0.35, "minHoldSec": 60 },
    { "type": "settlement" }
  ],
  "hedge": { "enabled": false, "limitPrice": 0.10, "shares": 50, "sellThreshold": 35 },
  "risk": {
    "dailyLossLimit": 50,
    "cooldown": { "afterConsecutiveLosses": 3, "pauseMinutes": 30 }
  },
  "dataSources": ["binance"]
}
```

### Post-Market Arbitrage

```json
{
  "$schema": "polymarket-strategy-v2",
  "id": "post-market-arb",
  "label": { "zh": "盘后套利", "en": "Post-Market Arbitrage" },
  "description": { "zh": "市场结束后推断结果，扫描低价挂单", "en": "Infer outcome after close, scan cheap asks" },
  "entry": {
    "amount": 50,
    "priceRange": [0.01, 0.99],
    "windows": [],
    "method": "post_market_scan",
    "scanMaxBuyPrice": 0.48,
    "scanMaxSpend": 50,
    "scanWaitSec": 5,
    "scanWindowSec": 180,
    "scanPollIntervalMs": 2000
  },
  "direction": {
    "method": "post_market_inference",
    "params": { "inferThreshold": 0.95, "inferTimeoutSec": 30 }
  },
  "exit": [{ "type": "settlement" }],
  "hedge": { "enabled": false, "limitPrice": 0.10, "shares": 50, "sellThreshold": 35 }
}
```

### ML Model with Schedule

```json
{
  "$schema": "polymarket-strategy-v2",
  "id": "rf-weekday",
  "label": { "zh": "RF工作日策略", "en": "RF Weekday Strategy" },
  "description": { "zh": "随机森林模型，工作日9-18点运行", "en": "Random Forest model, weekdays 9am-6pm" },
  "entry": {
    "amount": 50,
    "priceRange": [0.45, 0.55],
    "windows": [{ "window": 1, "start": 270, "end": 240 }],
    "method": "market",
    "maxBuyPrice": 0.52
  },
  "direction": {
    "method": "ml_model",
    "params": {
      "modelType": "random_forest",
      "modelId": "rf-v5-30s",
      "confidenceThreshold": 0.55,
      "maxBuyPrice": 0.52,
      "tradeWindowSec": 30
    }
  },
  "exit": [
    { "type": "checkpoint", "remainingSec": 180 },
    { "type": "settlement" }
  ],
  "hedge": { "enabled": false, "limitPrice": 0.10, "shares": 50, "sellThreshold": 35 },
  "dataSources": ["binance", "polymarket_trades"],
  "schedule": {
    "timezone": "Asia/Shanghai",
    "grid": {
      "mon": [9,10,11,12,13,14,15,16,17],
      "tue": [9,10,11,12,13,14,15,16,17],
      "wed": [9,10,11,12,13,14,15,16,17],
      "thu": [9,10,11,12,13,14,15,16,17],
      "fri": [9,10,11,12,13,14,15,16,17]
    }
  }
}
```
