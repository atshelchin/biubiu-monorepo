# BTC Up/Down — Protocol Specifications

> Status: Draft
> Date: 2026-03-22

---

## Table of Contents

1. [Endpoint Integration Protocol (EIP)](#1-endpoint-integration-protocol-eip) — 第三方端点接入协议
2. [Strategy Description Protocol (SDP)](#2-strategy-description-protocol-sdp) — 策略描述规范
3. [Economic Protocol (EP)](#3-economic-protocol-ep) — 经济模型协议
4. [Referral Protocol (RP)](#4-referral-protocol-rp) — 推荐人协议
5. [Event Protocol (EVP)](#5-event-protocol-evp) — 实时事件协议
6. [Marketplace Protocol (MP)](#6-marketplace-protocol-mp) — 策略市场交易协议
7. [Future Protocols](#7-future-protocols规划中) — Backtesting + Notification（规划中）

---

## 1. Endpoint Integration Protocol (EIP)

### 1.1 Overview

第三方要接入 biubiu.tools BTC Up/Down UI 体系，需要在自己的服务器上实现一组标准 HTTP API。这些 API 分为三层：

| Layer | Required | Description |
|-------|----------|-------------|
| **Core** | YES | 健康检查、空间信息、数据查询（只读）—— 不接入这些就无法展示任何东西 |
| **Engine** | YES (if running instances) | 策略实例的 CRUD 和控制（创建/启停/删除）|
| **Auth** | YES | Passkey 签名验证、用户管理 |
| **Marketplace** | Optional | 策略广场、交易、导入导出 |
| **Webhook** | Optional | 事件推送到外部系统 |

### 1.2 Base URL Convention

```
https://{endpoint-domain}/api/v1/...
```

所有 API 必须支持 CORS（`Access-Control-Allow-Origin: *` 或指定 biubiu.tools 域名）。

### 1.3 Authentication

第三方端点必须验证来自 biubiu.tools 的 Passkey 签名。

**Flow:**

```
1. 用户在 biubiu.tools 登录（WebAuthn Passkey）
2. biubiu.tools UI 对写操作请求生成签名
3. 第三方端点验证签名

请求头格式：
  Authorization: Bearer {token}      ← 端点颁发的 session token
  X-Client-Id: {client-id}           ← 用户在此端点的 client ID
  X-Biubiu-Signature: {signature}    ← 写操作需要 passkey 签名
  X-Biubiu-User-Id: {user-id}       ← biubiu.tools 用户 ID
```

**验证签名的方式:**

第三方端点需要调用 biubiu.tools 公钥服务验证签名：

```
GET https://biubiu.tools/api/passkey/public-key/{user-id}
→ { publicKey: string, algorithm: "ES256" }
```

或者在用户首次加入空间时，管理员通过 profile link 添加用户，此时端点已缓存该用户的公钥。

### 1.4 Core API（必须实现）

#### 1.4.1 Health Check

```
GET /api/v1/health
→ {
    status: "ok" | "degraded" | "down",
    version: string,          // EIP 协议版本, e.g. "1.0"
    uptime: number,           // seconds
    timestamp: string         // ISO 8601
  }
```

#### 1.4.2 Space Info

```
GET /api/v1/space
→ {
    id: string,
    name: string,
    description?: string,
    endpoint: string,         // self URL
    isOfficial: boolean,
    capabilities: {
      liveTradingEnabled: boolean,
      marketplaceEnabled: boolean,
      maxFreeInstances: number,
      maxMemberInstances: number
    },
    stats: {
      totalUsers: number,
      activeInstances: number,
      totalStrategies: number
    }
  }
```

#### 1.4.3 Statistics

```
GET /api/v1/stats?strategy={id}&hour={0-23}&date={YYYY-MM-DD}
→ {
    totalRounds: number,
    entered: number,
    skipped: number,
    wins: number,
    losses: number,
    winRate: number,
    invested: number,
    payout: number,
    profit: number,
    fees: number,
    avgProfit: number,
    currentStreak: number,       // positive = win, negative = loss
    maxWinStreak: number,
    maxLoseStreak: number,
    hedgeCost: number,
    hedgeRevenue: number,
    // signal breakdown
    signalBet: number,
    signalReverse: number,
    signalSkip: number,
    // stop-loss
    stopLossTriggered: number,
    stopLossAmount: number
  }
```

#### 1.4.4 Rounds

```
GET /api/v1/rounds?strategy={id}&page={1}&pageSize={20}&status={entered|settled|skipped}&result={win|loss}&date={YYYY-MM-DD}&hour={0-23}
→ {
    rows: Round[],
    total: number,
    page: number,
    pageSize: number
  }

GET /api/v1/rounds/current?strategy={id}
→ { round?: Round, fills?: Fill[], snapshots?: Snapshot[], hedge?: Hedge }
```

**Round 对象：**

```typescript
interface Round {
  id: string
  marketSlug: string
  status: "watching" | "entering" | "entered" | "settled" | "skipped"
  entry?: {
    direction: "up" | "down"
    price: number
    shares: number
    cost: number
    time: string              // ISO 8601
    remainingSec: number
  }
  outcome?: {
    result: "win" | "loss" | "stop_loss"
    payout: number
    profit: number
    fees: number
  }
  hedge?: {
    direction: "up" | "down"
    limitPrice: number
    shares: number
    cost: number
    revenue: number
  }
  signalAction?: "bet" | "reverse" | "skip"
  skipReason?: string
  startedAt: string
  settledAt?: string
}
```

#### 1.4.5 Hourly & Daily Aggregates

```
GET /api/v1/hourly?strategy={id}&date={YYYY-MM-DD}
→ HourlyStats[]

GET /api/v1/daily?strategy={id}&from={YYYY-MM-DD}&to={YYYY-MM-DD}
→ DailyStat[]
```

```typescript
interface HourlyStats {
  hour: number               // 0-23
  rounds: number
  wins: number
  losses: number
  winRate: number
  invested: number
  payout: number
  profit: number
  avgProfit: number
}

interface DailyStat {
  date: string               // YYYY-MM-DD
  rounds: number
  entered: number
  skipped: number
  wins: number
  losses: number
  winRate: number
  invested: number
  payout: number
  profit: number
}
```

#### 1.4.6 Strategy Metadata

```
GET /api/v1/strategy?id={id}
→ {
    id: string,
    label: { zh: string, en: string },
    description: { zh: string, en: string },
    startedAt?: string,
    config?: StrategyDescriptor     // SDP format (see Section 2)
  }
```

#### 1.4.7 Strategy Profit Summary（sidebar 对比数据）

```
GET /api/v1/profits?strategies={id1,id2,...}
→ {
    [strategyId]: {
      current: { status: string },
      hour:  { profit: number, rounds: number, winRate: number },
      day:   { profit: number, rounds: number, winRate: number },
      all:   { profit: number, rounds: number, winRate: number }
    }
  }
```

### 1.5 Engine API（实例管理）

#### 1.5.1 List Instances

```
GET /api/v1/engine/status
Authorization: Bearer {token}
→ { instances: StrategyInstance[] }
```

```typescript
interface StrategyInstance {
  id: string
  baseStrategyId: string
  label: string
  status: "stopped" | "running" | "paused" | "error"
  mode: "sandbox" | "live"
  config: StrategyDescriptor       // SDP format
  schedule?: ScheduleRule[]
  stats?: {
    totalRounds: number
    winRate: number
    profit: number
  }
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
```

#### 1.5.2 Available Base Strategies

```
GET /api/v1/engine/strategies
→ { strategies: { id: string, label: { zh: string, en: string } }[] }
```

#### 1.5.3 CRUD & Control

```
POST   /api/v1/engine/instances                 # Create
POST   /api/v1/engine/{instanceId}/start         # Start
POST   /api/v1/engine/{instanceId}/stop          # Stop
POST   /api/v1/engine/{instanceId}/pause         # Pause
PUT    /api/v1/engine/{instanceId}/config        # Update config
PUT    /api/v1/engine/{instanceId}/schedule      # Update schedule
DELETE /api/v1/engine/{instanceId}               # Delete
```

Create body:
```json
{
  "baseStrategyId": "rsi-reversal",
  "label": "My RSI Strategy",
  "mode": "sandbox",
  "config": { /* StrategyDescriptor */ }
}
```

All write endpoints require passkey signature.
All return: `{ ok: boolean, error?: string, instance?: StrategyInstance }`

### 1.6 Auth API

#### 1.6.1 Join Space（用户首次加入空间）

```
POST /api/v1/auth/join
Body: {
  profileUrl: string,         // https://biubiu.tools/profile/{userId}
  signature: string           // 用 passkey 签名的 challenge
}
→ {
    token: string,            // session token
    clientId: string,
    role: "member" | "admin",
    permissions: { trading: boolean, maxInstances: number }
  }
```

#### 1.6.2 Verify Session

```
GET /api/v1/auth/verify
Authorization: Bearer {token}
→ { valid: boolean, userId: string, role: string }
```

#### 1.6.3 Member Management（Admin only）

```
GET    /api/v1/auth/members                      # List members
POST   /api/v1/auth/members                      # Add member (by profile URL)
PATCH  /api/v1/auth/members/{userId}             # Update role/permissions
DELETE /api/v1/auth/members/{userId}              # Remove member
```

### 1.7 SSE (Server-Sent Events)

```
GET /api/v1/sse/live?strategy={id}&token={token}
```

Event format:
```
event: {eventType}
data: {"type":"{eventType}","timestamp":"{ISO}","data":{...}}
```

Event types: `round_start`, `entry`, `settlement`, `round_skip`, `exit_trigger`, `hedge_entry`, `hedge_exit`, `error`, `strategy_status`

### 1.8 Compliance Checklist

第三方接入前的自检清单：

- [ ] `/api/v1/health` 返回正确的 EIP version
- [ ] `/api/v1/space` 返回空间配置
- [ ] CORS headers 配置正确
- [ ] Passkey 签名验证通过
- [ ] SSE 连接稳定，支持重连
- [ ] Stats / Rounds / Hourly / Daily 数据格式正确
- [ ] Engine CRUD 正常工作
- [ ] Rate limiting：读 60 req/min，写 20 req/min

---

## 2. Strategy Description Protocol (SDP)

### 2.1 Design Principles

1. **JSON-first** — 人类可读，机器可解析
2. **声明式** — 描述"做什么"，不描述"怎么做"
3. **向后兼容** — 新版本添加字段，老版本忽略不认识的字段
4. **自描述** — 包含 `$schema` 和 `version` 字段
5. **跨端点可移植** — 同一份 JSON 可以在任何端点导入运行

### 2.2 StrategyDescriptor

完整的策略描述格式：

```jsonc
{
  // ── Meta ──
  "$schema": "https://biubiu.tools/schemas/strategy/v2",
  "version": "2.0",
  "id": "rsi-reversal-balanced-001",         // unique, kebab-case
  "label": { "zh": "RSI 反转平衡版", "en": "RSI Reversal Balanced" },
  "description": {
    "zh": "当 RSI 超卖时做多，超买时做空，配合每日止损和对冲",
    "en": "Go long on RSI oversold, short on overbought, with daily loss limit and hedging"
  },
  "tags": ["reversal", "rsi", "hedged"],
  "riskLevel": "balanced",                    // "conservative" | "balanced" | "aggressive"
  "author": {                                  // optional, for marketplace
    "id": "user_abc123",
    "name": "shelchin"
  },
  "createdAt": "2026-01-15T00:00:00Z",
  "exportedAt": "2026-03-22T08:30:00Z",

  // ── Entry ──
  "entry": {
    "amount": 5,                               // USD per round
    "method": "market",                        // "market" | "limit" | "swing_limit" | "post_market_scan"
    "maxBuyPrice": 0.65,                       // max price per share (optional)
    "windows": [                               // entry timing windows (optional)
      { "window": 2, "start": 270, "end": 240 }
    ],
    "maxRoundsPerHour": 8,                     // rate limit (optional)
    // method-specific params (optional):
    "limitPrice": 0.55,                        // for method: "limit"
    "swingTargetPrice": 0.45,                  // for method: "swing_limit"
    "swingBuyPrice": 0.50,
    "postMarketWindows": [                     // for method: "post_market_scan"
      { "afterSec": 10, "maxPrice": 0.55 }
    ]
  },

  // ── Direction ──
  "direction": {
    "method": "rsi_reversal",                  // see 2.3 for all methods
    "params": {                                // method-specific params
      "thresholdLow": 30,
      "thresholdHigh": 70
    }
  },

  // ── Gates (pre-entry filters, evaluated in order) ──
  "gates": [
    {
      "type": "daily_loss_limit",
      "maxLossUsd": 25
    },
    {
      "type": "cooldown",
      "afterConsecutiveLosses": 3,
      "pauseMinutes": 10
    },
    {
      "type": "schedule",
      "timezone": "UTC",
      "rules": [
        { "days": ["mon","tue","wed","thu","fri"], "start": "08:00", "end": "22:00" }
      ]
    }
  ],

  // ── Signals (for method: "signal_score") ──
  "signals": {
    "betThreshold": 3,
    "reverseThreshold": -3,
    "reverseEnabled": true,
    "rules": [
      {
        "name": "RSI Oversold",
        "indicator": "rsi",
        "params": { "period": 14 },
        "conditions": [
          { "range": [null, 30], "scoreUp": 3, "scoreDown": -1 },
          { "range": [70, null], "scoreUp": -1, "scoreDown": 3 }
        ]
      },
      {
        "name": "Volume Spike",
        "indicator": "volume_ratio",
        "params": { "period": 20 },
        "conditions": [
          { "range": [2.0, null], "score": 2 }
        ]
      }
    ]
  },

  // ── Exit Rules (evaluated in order, first match wins) ──
  "exit": [
    { "type": "take_profit", "pct": 0.15 },
    { "type": "stop_loss", "price": 0.08, "minHoldSec": 30 },
    { "type": "trailing_stop", "drawdownPct": 0.10 },
    { "type": "settlement" }                   // always include as fallback
  ],

  // ── Hedge ──
  "hedge": {
    "enabled": true,
    "limitPrice": 0.55,
    "shares": 5,
    "sellThreshold": 0.60
  },

  // ── Data Sources (what external data the strategy needs) ──
  "dataSources": ["binance_ohlcv_5m", "polymarket_clob"]
}
```

### 2.3 Direction Methods

| Method | `direction.params` | Description |
|--------|--------------------|-------------|
| `clob_follow` | `{}` | Follow CLOB midpoint majority |
| `prev_candle` | `{}` | Follow previous 5m candle direction |
| `rsi_reversal` | `{ thresholdLow: 30, thresholdHigh: 70 }` | Contrarian on RSI |
| `signal_score` | `{}` (use top-level `signals` block) | Multi-indicator weighted scoring |
| `ml_model` | `{ modelType: "rf"|"xgboost"|"gbdt", modelId: string, confidenceThreshold: 0.6 }` | Machine learning model |
| `post_market_inference` | `{ inferThreshold: 0.55, inferTimeoutSec: 30 }` | Post-close price inference |

### 2.4 Gate Types

| Type | Required Fields | Description |
|------|----------------|-------------|
| `daily_loss_limit` | `maxLossUsd` | Pause when daily loss exceeds limit |
| `cooldown` | `afterConsecutiveLosses`, `pauseMinutes` | Cool off after streak |
| `schedule` | `timezone`, `rules[]` or `grid` | Time-based entry control |
| `volatility` | `maxAtrPct`, `mode` | ATR-based volatility filter |
| `trend` | `minAtrPct`, `minER`, `period` | Trend strength filter |

### 2.5 Indicator Types（for `signals.rules`）

| Indicator | Params | Output Range | Description |
|-----------|--------|-------------|-------------|
| `rsi` | `{ period }` | 0-100 | Relative Strength Index |
| `roc` | `{ period }` | -∞ to +∞ | Rate of Change (%) |
| `taker_buy_ratio` | `{ period }` | 0-1 | Binance taker buy volume ratio |
| `body_ratio` | `{ period }` | 0-1 | Candle body/range ratio |
| `ema_crossover` | `{ fast, slow }` | -∞ to +∞ | EMA cross difference |
| `vwap_deviation` | `{ period }` | -∞ to +∞ | Price deviation from VWAP (%) |
| `volume_ratio` | `{ period }` | 0+ | Volume vs average ratio |
| `bullish_candles` | `{ period }` | 0-1 | Ratio of bullish candles |
| `candle_range_pct` | `{ period }` | 0+ | Avg candle range as % of price |
| `volume_trend` | `{ period }` | -∞ to +∞ | Volume trend slope |

### 2.6 Exit Types

| Type | Fields | Description |
|------|--------|-------------|
| `settlement` | — | Hold until round settles (default) |
| `take_profit` | `pct` | Exit when profit % reached |
| `stop_loss` | `price`, `minHoldSec?` | Exit at price threshold |
| `trailing_stop` | `drawdownPct` | Exit on drawdown from peak |
| `checkpoint` | `remainingSec` | Re-evaluate direction at time T |

### 2.7 Versioning & Compatibility

- `version: "2.0"` — Current version
- 新字段添加不需要 bump version（向后兼容）
- 移除或重命名字段需要 bump version（`"3.0"`）
- 端点收到未知字段时 **MUST ignore**，不得报错
- 端点收到高于自己支持的 version 时，返回 `{ error: "unsupported_version", supported: "2.0" }`

### 2.8 Minimal Valid Strategy

最小合法策略（所有可选字段省略）：

```json
{
  "$schema": "https://biubiu.tools/schemas/strategy/v2",
  "version": "2.0",
  "id": "simple-follow",
  "label": { "en": "Simple Follow" },
  "entry": { "amount": 5, "method": "market" },
  "direction": { "method": "clob_follow" },
  "exit": [{ "type": "settlement" }],
  "hedge": { "enabled": false }
}
```

---

## 3. Economic Protocol (EP)

### 3.1 Revenue Streams

biubiu 平台有三个收入来源：

```
┌──────────────────────────────────────────────────────────┐
│                     Revenue Streams                      │
├──────────────────┬──────────────┬────────────────────────┤
│ 1. Subscription  │ 2. Strategy  │ 3. Space Operator Fee  │
│    (会员订阅)     │    Trade     │    (端点运营商分成)      │
│                  │    (策略交易)  │                        │
├──────────────────┼──────────────┼────────────────────────┤
│ $100/mo or       │ $20 per      │ Included in strategy   │
│ $1000/yr         │ strategy     │ trade split            │
│                  │ unlock       │                        │
└──────────────────┴──────────────┴────────────────────────┘
```

### 3.2 Subscription Tiers

| Tier | Price | Payment | Instance Limit | Features |
|------|-------|---------|---------------|----------|
| **Free** | $0 | — | 3 sandbox | Basic dashboard, public marketplace |
| **Pro (Monthly)** | $100/mo | ETH on Arbitrum | 100 sandbox + live | Full analytics, priority SSE, export |
| **Pro (Annual)** | $1,000/yr | ETH on Arbitrum | 100 sandbox + live | Same as monthly, ~17% discount |

**Membership verification:**
- Payment creates an on-chain subscription record
- Or: Hold biubiu membership NFT (legacy, still honored)
- API: `GET /api/v1/membership/status?userId={id}` → `{ tier, expiresAt, instanceLimit }`

### 3.3 Strategy Trade (Private Strategy Unlock)

**Fixed price: $20 per strategy unlock (paid in ETH equivalent on Arbitrum)**

Revenue split depends on context:

#### Case A: No referrer, official space

```
$20 → Creator: $10 (50%) + Platform: $10 (50%)
```

#### Case B: No referrer, third-party space

```
$20 → Creator: $10 (50%) + Space Operator: $5 (25%) + Platform: $5 (25%)
```

#### Case C: With referrer, official space

```
$20 → Referrer: $10 (50%) + Creator: $5 (25%) + Platform: $5 (25%)
```

#### Case D: With referrer, third-party space

```
$20 → Referrer: $10 (50%) + Creator: $5 (25%) + Space Operator: $2.50 (12.5%) + Platform: $2.50 (12.5%)
```

**规则：推荐人总是拿 50%，剩余 50% 按原比例分配给其余参与方。**

### 3.4 Split Summary Table

| Scenario | Referrer | Creator | Operator | Platform |
|----------|----------|---------|----------|----------|
| Official, no referrer | — | 50% ($10) | — | 50% ($10) |
| Private, no referrer | — | 50% ($10) | 25% ($5) | 25% ($5) |
| Official, with referrer | 50% ($10) | 25% ($5) | — | 25% ($5) |
| Private, with referrer | 50% ($10) | 25% ($5) | 12.5% ($2.5) | 12.5% ($2.5) |

### 3.5 Smart Contract Interface

Repository: `biubiu-contracts` on Arbitrum

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBiubiuEconomy {

    // ── Subscription ──

    /// @notice Subscribe to Pro tier
    /// @param months Number of months (1 = monthly, 12 = annual discount)
    function subscribe(uint8 months) external payable;

    /// @notice Check subscription status
    function subscriptionOf(address user) external view returns (
        uint8 tier,          // 0=free, 1=pro
        uint256 expiresAt
    );

    event Subscribed(address indexed user, uint8 months, uint256 amount, uint256 expiresAt);

    // ── Strategy Trade ──

    /// @notice Purchase a private strategy
    /// @param strategyId Unique strategy identifier (bytes32 hash of SDP id)
    /// @param creator Strategy creator address
    /// @param operator Space operator address (address(0) if official)
    /// @param referrer Referrer address (address(0) if none)
    function purchaseStrategy(
        bytes32 strategyId,
        address creator,
        address operator,
        address referrer
    ) external payable;

    /// @notice Check if user has purchased a strategy
    function hasPurchased(address user, bytes32 strategyId) external view returns (bool);

    /// @notice Withdraw accumulated earnings
    function withdraw() external;

    /// @notice Check pending earnings
    function pendingEarnings(address account) external view returns (uint256);

    event StrategyPurchased(
        bytes32 indexed strategyId,
        address indexed buyer,
        address creator,
        address operator,
        address referrer,
        uint256 price
    );

    event Withdrawn(address indexed account, uint256 amount);

    // ── Pricing ──

    /// @notice Get current prices in ETH (updated via oracle)
    function monthlyPriceETH() external view returns (uint256);
    function annualPriceETH() external view returns (uint256);
    function strategyPriceETH() external view returns (uint256);
}
```

### 3.6 Price Oracle

所有价格以 USD 标价，但以 ETH 支付。合约使用 Chainlink ETH/USD price feed 实时换算：

```
strategyPriceETH = $20 / ethPrice
monthlyPriceETH  = $100 / ethPrice
annualPriceETH   = $1000 / ethPrice
```

允许 ±2% 滑点。

### 3.7 Payment Flow

```
User clicks "Unlock" ($20)
  → Frontend reads strategyPriceETH() from contract
  → User signs transaction (MetaMask / WalletConnect)
  → Contract:
      1. Verify msg.value ≥ strategyPriceETH
      2. Split ETH to creator/operator/referrer/platform
      3. Record purchase: purchases[buyer][strategyId] = true
      4. Emit StrategyPurchased event
  → Frontend listens for event
  → Backend verifies on-chain: hasPurchased(buyer, strategyId)
  → Strategy config unlocked for this user
```

---

## 4. Referral Protocol (RP)

### 4.1 Referral Link Format

```
https://biubiu.tools/apps/btc-updown?ref={referrerUserId}
```

Or for specific strategy:
```
https://biubiu.tools/apps/btc-updown/strategy/{strategyId}?ref={referrerUserId}
```

### 4.2 Referral Attribution Rules

1. `ref` parameter 写入 cookie / localStorage，**30 天有效**
2. 仅首次购买某策略时生效，同一用户同一策略不重复计算
3. 自己推荐自己无效（`referrer === buyer` 时 referrer 设为 `address(0)`）
4. 推荐人必须是已注册 biubiu.tools 用户，且有关联的钱包地址

### 4.3 Referral Dashboard

推荐人可在 biubiu.tools 上查看自己的推荐收益：

```
GET /api/v1/referral/stats?userId={id}
→ {
    totalReferrals: number,          // 总推荐购买次数
    totalEarnings: number,           // 总收益 (USD)
    pendingWithdraw: number,         // 待提取 (ETH)
    recentPurchases: [
      { strategyId, buyerName, amount, date }
    ]
  }
```

### 4.4 Referral Tiers（未来扩展，v1 不实现）

| Tier | Requirement | Bonus |
|------|------------|-------|
| Bronze | 0-10 referrals | 50% base |
| Silver | 10-50 referrals | 50% + 5% bonus |
| Gold | 50+ referrals | 50% + 10% bonus |

---

## 5. Event Protocol (EVP)

### 5.1 Purpose

统一所有端点的事件格式，使 UI 层、webhook、日志系统都能一致消费。

### 5.2 Event Envelope

```typescript
interface Event {
  id: string                    // unique event ID (UUID or ULID)
  type: EventType
  timestamp: string             // ISO 8601
  source: {
    endpoint: string            // endpoint URL
    strategy: string            // strategy ID
    instance?: string           // instance ID (if managed)
  }
  data: Record<string, unknown> // type-specific payload
}
```

### 5.3 Event Types

| Type | Trigger | Key Data Fields |
|------|---------|----------------|
| `round_start` | New round begins | `marketSlug`, `roundId` |
| `signal` | Direction signal computed | `direction`, `score`, `indicators[]` |
| `entry` | Position entered | `direction`, `price`, `shares`, `cost` |
| `round_skip` | Round skipped | `reason` |
| `settlement` | Round settles | `result`, `payout`, `profit` |
| `exit_trigger` | Early exit triggered | `exitType`, `price`, `profit` |
| `hedge_entry` | Hedge position entered | `direction`, `price`, `shares` |
| `hedge_exit` | Hedge sold | `revenue`, `profit` |
| `strategy_status` | Instance status change | `from`, `to` (e.g. running→paused) |
| `daily_limit` | Daily loss limit hit | `totalLoss`, `limit` |
| `error` | Error occurred | `message`, `code` |

### 5.4 Webhook Integration（Optional）

第三方端点可选择支持 webhook 推送：

```
POST /api/v1/webhooks
Body: {
  url: "https://my-service.com/hook",
  events: ["settlement", "daily_limit"],    // subscribe to specific events
  secret: "hmac-secret-123"                  // for signature verification
}
```

Webhook 请求带 `X-Webhook-Signature: sha256={hmac}` header。

---

## 6. Marketplace Protocol (MP)

### 6.1 Strategy Listing

```
GET /api/v1/marketplace/strategies?sort={profit|winRate|rounds|newest}&visibility={public|private}&page={1}
→ {
    strategies: MarketplaceStrategy[],
    total: number,
    page: number
  }
```

```typescript
interface MarketplaceStrategy {
  id: string
  label: { zh?: string, en: string }
  description: { zh?: string, en: string }
  visibility: "public" | "private"
  price: number                     // 0 for public, 20 for private
  riskLevel: "conservative" | "balanced" | "aggressive"
  tags: string[]
  author: { id: string, name: string }
  performance: {
    totalRounds: number
    winRate: number
    profit24h: number
    profit30d: number
    profitAll: number
    maxDrawdown: number
  }
  config?: StrategyDescriptor       // null if private & not purchased
  followCount: number
  copyCount: number
  createdAt: string
}
```

### 6.2 Strategy Actions

```
POST   /api/v1/marketplace/strategies                     # Publish strategy
PATCH  /api/v1/marketplace/strategies/{id}                # Update visibility/description
DELETE /api/v1/marketplace/strategies/{id}                 # Unpublish

POST   /api/v1/marketplace/strategies/{id}/follow          # Follow (read-only subscribe)
DELETE /api/v1/marketplace/strategies/{id}/follow          # Unfollow

POST   /api/v1/marketplace/strategies/{id}/copy            # Copy config → create instance
GET    /api/v1/marketplace/strategies/{id}/export           # Download config JSON
POST   /api/v1/marketplace/import                          # Import from JSON or share link
```

### 6.3 Share Link Format

Strategy share link encodes the full config:

```
https://biubiu.tools/apps/btc-updown/import?data={base64url(gzip(StrategyDescriptor))}
```

Or short link via platform:
```
https://biubiu.tools/s/{shortId}
```

### 6.4 Purchase Verification

After on-chain purchase, backend verifies:

```
POST /api/v1/marketplace/verify-purchase
Body: {
  strategyId: string,
  txHash: string,                    // Arbitrum transaction hash
  buyer: string                      // wallet address
}
→ {
    verified: boolean,
    config?: StrategyDescriptor       // unlocked config
  }
```

---

## 7. Future Protocols（规划中）

### 7.1 Backtesting Protocol（回测协议）

回测是验证策略最直接的方式，需要定义：

**历史数据格式：**
```typescript
interface BacktestDataset {
  timeframe: "5m"
  from: string                    // ISO 8601
  to: string
  candles: {                      // Binance OHLCV
    t: number                     // timestamp ms
    o: number, h: number, l: number, c: number
    v: number                     // volume
  }[]
  clob?: {                        // Polymarket CLOB snapshots (optional)
    t: number
    bestBid: number, bestAsk: number
    midpoint: number
  }[]
  rounds: {                       // Polymarket round schedule
    id: string
    startAt: number, endAt: number
    outcome: "up" | "down"        // actual result
  }[]
}
```

**回测结果报告：**
```typescript
interface BacktestResult {
  strategy: StrategyDescriptor
  dataset: { from: string, to: string, totalRounds: number }
  results: {
    entered: number
    skipped: number
    wins: number, losses: number
    winRate: number
    totalProfit: number
    maxDrawdown: number
    sharpeRatio: number
    profitFactor: number          // gross profit / gross loss
    avgProfit: number
    bestRound: number, worstRound: number
  }
  rounds: {                       // per-round details for chart rendering
    roundId: string
    direction: "up" | "down"
    result: "win" | "loss" | "skip"
    profit: number
  }[]
  equity: number[]                // cumulative equity curve
}
```

**API endpoint：**
```
POST /api/v1/backtest
Body: { strategy: StrategyDescriptor, from: string, to: string }
→ BacktestResult
```

回测数据可由 biubiu.tools 官方端点提供（已有历史数据），第三方端点可选实现。

### 7.2 Notification Protocol（通知协议）

用户需要在关键时刻收到通知，不能只靠盯着 dashboard。

**通知渠道：**

| Channel | Delivery | Setup |
|---------|----------|-------|
| Web Push | Browser notification | 浏览器原生 Push API，授权即可 |
| Telegram | Bot message | 用户绑定 Telegram bot，获取 chat_id |
| Webhook | HTTP POST | 自定义 URL，面向开发者 |

**通知触发规则：**

```typescript
interface NotificationRule {
  id: string
  channel: "web_push" | "telegram" | "webhook"
  events: NotificationEvent[]
  config: {
    // channel-specific
    telegramChatId?: string
    webhookUrl?: string
    webhookSecret?: string
  }
}

type NotificationEvent =
  | "daily_limit_hit"              // 日亏损限触发
  | "strategy_error"               // 策略报错停止
  | "strategy_paused"              // 策略暂停
  | "profit_milestone"             // 盈利里程碑（$100, $500, $1000...）
  | "win_streak"                   // 连胜 N 场（configurable N）
  | "loss_streak"                  // 连亏 N 场
  | "round_result"                 // 每轮结果（高频，慎用）
```

**API：**
```
GET    /api/v1/notifications/rules         # 列出用户的通知规则
POST   /api/v1/notifications/rules         # 创建规则
DELETE /api/v1/notifications/rules/{id}    # 删除规则
POST   /api/v1/notifications/test          # 发送测试通知
```

通知由 biubiu.tools 平台侧实现（订阅各端点的 SSE / Webhook），第三方端点不需要实现通知发送逻辑。

---

## Appendix A: Error Codes

所有 API 统一使用以下错误格式：

```json
{
  "error": "error_code",
  "message": "Human-readable message",
  "details": {}
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `unauthorized` | 401 | Missing or invalid auth |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `rate_limited` | 429 | Too many requests |
| `invalid_request` | 400 | Malformed request body |
| `invalid_strategy` | 400 | SDP validation failed |
| `unsupported_version` | 400 | Strategy version not supported |
| `instance_limit` | 403 | Max instances reached |
| `live_not_allowed` | 403 | Live trading not enabled |
| `payment_required` | 402 | Strategy is private, needs purchase |
| `already_purchased` | 409 | User already owns this strategy |
| `internal` | 500 | Server error |

