# Strategy Description Protocol v3 (SDP)

> Version: 3.0
> Date: 2026-03-22

---

## Design Philosophy

策略描述协议的组织方式应该**跟着交易员的思维走**，不是跟着代码实现走。

一个交易员面对每一轮 BTC 5 分钟预测市场，脑子里的决策链：

```
新一轮开始
  │
  ├─ 1. 现在适合交易吗？      → filter    过滤：时间、波动率、亏损限额
  │     不适合 → 跳过
  │
  ├─ 2. 信号怎么说？方向是？    → signal    核心 alpha：产出 direction + confidence
  │     无信号 → 跳过
  │
  ├─ 3. 怎么入场？             → entry     执行：下单方式、资金量、价格限制、时机
  │
  ├─ 4. 怎么保护自己？         → risk      止损、对冲、冷却、每日限额
  │
  └─ 5. 什么时候走？           → exit      止盈、跟踪止盈、到期结算
```

**schema 的顶层字段就是这 5 步，加上元数据。**

---

## Complete Schema

```jsonc
{
  // ══════════════════════════════════════════════════
  // META — 这个策略是什么
  // ══════════════════════════════════════════════════
  "$schema": "biubiu-strategy-v3",
  "id": "my-rsi-balanced",                      // 唯一标识，kebab-case
  "name": "RSI 反转平衡版",                       // 显示名称
  "description": "RSI 超卖做多、超买做空，配合日亏损限制和对冲",
  "tags": ["reversal", "rsi", "hedged"],         // 分类标签
  "riskLevel": "balanced",                       // "conservative" | "balanced" | "aggressive"
  "author": "shelchin",                          // 可选，市场展示
  "version": 1,                                  // 策略自身迭代版本号
  "createdAt": "2026-01-15T00:00:00Z",

  // ══════════════════════════════════════════════════
  // STEP 1: FILTER — 这轮要不要看？
  // ══════════════════════════════════════════════════
  //
  // 前置过滤器，按顺序检查，全部通过才会进入信号判断。
  // 过滤器回答的是"环境是否适合交易"，不涉及方向。
  //
  "filter": {

    // 时间窗口：只在特定时段交易
    "schedule": {
      "timezone": "Asia/Shanghai",
      "windows": [
        { "days": ["mon","tue","wed","thu","fri"], "from": "09:00", "to": "22:00" }
      ]
    },

    // 波动率过滤：只在合适的波动率下交易
    "volatility": {
      "mode": "require_high",                    // "require_high" | "require_low"
      "atrThreshold": 0.07                       // ATR 占价格的百分比阈值
    },

    // 趋势过滤：要求市场有足够的趋势性
    "trend": {
      "minEfficiencyRatio": 0.2,                 // 效率比 (0-1)，越高越趋势
      "minBodyRatio": 0.3,                       // K线实体占比，越高越有方向性
      "lookback": 10                             // 回看 K 线数量
    }
  },

  // ══════════════════════════════════════════════════
  // STEP 2: SIGNAL — 方向是什么？有多确信？
  // ══════════════════════════════════════════════════
  //
  // 策略的核心 alpha。信号模块负责回答两个问题：
  //   1. 是否值得交易？（confidence 是否足够）
  //   2. 方向是什么？（up / down）
  //
  // 只能选一种 method，不同 method 有不同的参数。
  //
  "signal": {
    "method": "rsi_reversal",

    // ── 各 method 的参数 ──

    // method: "clob_follow"
    // 跟随 CLOB 订单簿多数方向，无需参数。
    // 最简单的策略：大多数人怎么下注，我就跟。

    // method: "prev_candle"
    // 跟随上一根 Binance 5 分钟 K 线方向。
    // 涨了就买 UP，跌了就买 DOWN。无需参数。

    // method: "rsi_reversal"
    // 逆向：RSI 超卖 → UP，RSI 超买 → DOWN。
    "params": {
      "oversold": 30,                            // RSI 低于此值 → 做多 (UP)
      "overbought": 70                           // RSI 高于此值 → 做空 (DOWN)
    },

    // method: "scoring"
    // 多指标打分系统。每个指标根据条件给分，
    // 总分超过阈值就交易，分数方向决定 UP/DOWN。
    // "params": {
    //   "threshold": 3,                          // 总分 ≥ 3 才交易
    //   "allowReverse": true,                    // 总分 ≤ -3 时反向交易
    //   "reverseThreshold": -3,
    //   "indicators": [                          // 指标列表，见 Signal Indicators
    //     {
    //       "name": "RSI 超卖信号",
    //       "type": "rsi",
    //       "config": { "period": 14 },
    //       "rules": [
    //         { "when": [null, 30],  "up": 3, "down": -1 },
    //         { "when": [70, null],  "up": -1, "down": 3 },
    //         { "when": [40, 60],    "score": 0 }
    //       ],
    //       "required": false                    // true = 必须命中某条 rule 才继续
    //     },
    //     {
    //       "name": "放量确认",
    //       "type": "volume_ratio",
    //       "config": { "period": 20 },
    //       "rules": [
    //         { "when": [2.0, null], "score": 2 },
    //         { "when": [null, 0.5], "score": -1, "veto": true }
    //       ]
    //     }
    //   ]
    // },

    // method: "ml"
    // 机器学习模型预测方向。
    // "params": {
    //   "model": "rf-v5-30s",                   // 模型 ID
    //   "type": "random_forest",                 // "random_forest" | "xgboost" | "gbdt"
    //   "minConfidence": 0.6,                    // 模型置信度 < 此值则跳过
    //   "waitForDataSec": 30                     // 等多少秒收集交易数据后再预测
    // },

    // method: "post_close"
    // 收盘后推断。等市场关闭后，看 CLOB 价格推断胜负，在结算前买入。
    // 必须搭配 entry.method = "scan"。
    // "params": {
    //   "confidencePrice": 0.95,                 // midpoint ≥ 此值认为该方向会赢
    //   "timeoutSec": 30                         // 最多等多少秒
    // }
  },

  // ══════════════════════════════════════════════════
  // STEP 3: ENTRY — 信号来了，怎么入场？
  // ══════════════════════════════════════════════════
  //
  // 信号说"做多"，但具体怎么买？花多少钱？什么价格？什么时机？
  //
  "entry": {
    // 每轮投入金额 (USD)
    "amount": 5,

    // 动态仓位管理（可选，不配则永远用固定 amount）
    // 根据近期胜负自动调整下注金额。
    //
    // "sizing": {
    //   "method": "fixed",                       // "fixed" | "martingale" | "anti_martingale" | "kelly"
    //
    //   // method: "martingale" — 亏了加倍，赢了回到 base
    //   // "multiplier": 2,                      // 每次亏损后 amount × multiplier
    //   // "maxAmount": 50,                      // 加倍上限
    //   // "resetOnWin": true,                   // 赢了回到 base amount
    //
    //   // method: "anti_martingale" — 赢了加注，亏了回到 base
    //   // "multiplier": 1.5,
    //   // "maxAmount": 30,
    //   // "resetOnLoss": true,
    //
    //   // method: "kelly" — 根据历史胜率和赔率计算最优仓位
    //   // "lookback": 50,                       // 用最近 N 轮数据计算
    //   // "fraction": 0.5,                      // Kelly 系数的折扣（半 Kelly 更安全）
    //   // "minAmount": 1,                       // 最低金额
    //   // "maxAmount": 50,                      // 最高金额
    // },

    // 价格范围（share price, 0-1）
    // maxPrice: 价格越低赔率越高。0.55 意味着赔率约 1:0.82。
    // minPrice: 过滤掉"已无悬念"的轮次。价格太低说明市场已判定这一方会输。
    "maxPrice": 0.55,
    "minPrice": 0.01,             // 可选，默认 0.01。设 0.55 = 只在赔率合理时入场

    // 入场方式
    "method": "market",

    // ── method: "market" ──
    // 市价单，立即成交。最简单。

    // ── method: "limit" ──
    // 限价单，挂单等成交。
    // "limitPrice": 0.50,                       // 挂单价格
    // "timeoutSec": 60,                         // 超时未成交则取消

    // ── method: "swing" ──
    // 等价格跌到目标价再买入。适合高波动行情。
    // "targetPrice": 0.45,                      // 等 share price 跌到这个价
    // "windowSec": 120,                         // 在这个时间窗口内等待

    // ── method: "scan" ──
    // 收盘后扫描买入。必须搭配 signal.method = "post_close"。
    // "scanMaxPrice": 0.55,                     // 扫描时最高买入价
    // "scanBudget": 100,                        // 扫描总预算
    // "scanDelaySec": 5,                        // 收盘后等几秒再开始扫描
    // "scanDurationSec": 30,                    // 扫描持续多久
    // "scanIntervalMs": 500,                    // 扫描间隔

    // 入场时间窗口
    // 一轮 5 分钟 (300 秒)，窗口定义"剩余多少秒时可以入场"。
    // 多个窗口 = 多次尝试机会（第一个窗口没买到价格，等第二个窗口再试）。
    "windows": [
      { "from": 220, "to": 190 },               // 剩余 220-190 秒时尝试
      { "from": 160, "to": 130 },               // 第二次窗口
      { "from": 100, "to": 70 }                 // 第三次窗口
    ],

    // 每小时最多交易几轮（可选，防止过度交易）
    "maxPerHour": 8
  },

  // ══════════════════════════════════════════════════
  // STEP 4: RISK — 入场后，怎么保护自己？
  // ══════════════════════════════════════════════════
  //
  // 交易一定会亏钱，问题是亏多少你能接受。
  //
  "risk": {

    // 每日最大亏损 (USD)。触达后当日暂停交易。
    "dailyLossLimit": 25,

    // 连胜连败行为管理（可选，替代简单 cooldown）
    // 数组形式，可以同时配多条规则。
    "streakRules": [
      {
        // 连亏 3 次后暂停 10 分钟
        "trigger": "loss",                         // "loss" | "win"
        "count": 3,                                // 连续几次触发
        "action": "pause",                         // "pause" | "stop" | "adjust_amount"
        "pauseMinutes": 10                         // action=pause 时必填
      }
      // 更多例子：
      // { "trigger": "win",  "count": 5, "action": "pause", "pauseMinutes": 5 }
      //   → 连赢 5 把后冷静 5 分钟，防止过度自信
      //
      // { "trigger": "loss", "count": 2, "action": "adjust_amount", "multiply": 0.5 }
      //   → 连亏 2 把后仓位减半
      //
      // { "trigger": "win",  "count": 3, "action": "adjust_amount", "multiply": 1.5, "maxAmount": 30 }
      //   → 连赢 3 把后仓位 ×1.5（但不超过 $30）
    ],

    // 对冲：在反方向买一点保险。
    // 赢了对冲亏一点成本，输了对冲回收一部分。降低波动。
    "hedge": {
      "enabled": true,
      "price": 0.10,                             // 对冲的限价（低价买入反方向）
      "shares": 5,                               // 买几份
      "sellAbove": 0.35                          // 对冲份额涨到多少时卖出止盈
    },

    // 止损价格。token 价格跌到此值以下时立即卖出止损。
    "stopLoss": {
      "price": 0.08,                             // share price 跌到 0.08 时止损
      "minHoldSec": 30                           // 至少持有 30 秒才允许止损（防止刚买就卖）
    }
  },

  // ══════════════════════════════════════════════════
  // STEP 5: EXIT — 什么时候离场？
  // ══════════════════════════════════════════════════
  //
  // 按顺序检查，第一个触发的就执行。
  // "settlement"（等结算）是兜底，永远在最后。
  //
  "exit": [
    {
      // 止盈：赚到 15% 就走
      "type": "takeProfit",
      "profitPct": 0.15
    },
    {
      // 跟踪止盈：从最高点回撤 10% 就走
      // 适合趋势行情，让利润奔跑，但不让利润全部回吐
      "type": "trailingStop",
      "drawdownPct": 0.10
    },
    {
      // 中途检查点：在剩余 180 秒时重新判断方向，
      // 如果方向反了就提前卖出。
      "type": "checkpoint",
      "atRemainingSec": 180
    },
    {
      // 兜底：等市场结算。一定要有。
      "type": "settlement"
    }
  ]
}
```

---

## Schema Reference

### Meta Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | `"biubiu-strategy-v3"` | yes | 协议标识，固定值 |
| `id` | string | yes | 唯一标识，3-40 字符，`[a-z0-9-]` |
| `name` | string | yes | 显示名称 |
| `description` | string | no | 一句话描述策略逻辑 |
| `tags` | string[] | no | 分类标签 |
| `riskLevel` | enum | no | `"conservative"` / `"balanced"` / `"aggressive"` |
| `author` | string | no | 创建者名称 |
| `version` | number | no | 策略迭代版本，自增 |
| `createdAt` | string | no | ISO 8601 |

> **i18n**: `name` 和 `description` 可以是 string（单语言）或 `{ zh, en }` 对象（双语）。UI 端自动适配。

---

### filter — 前置过滤

所有过滤器可选，配了就检查，全部通过才看信号。

#### filter.schedule

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timezone` | string | yes | IANA 时区，e.g. `"Asia/Shanghai"` |
| `windows` | array | yes | 交易时间窗口 |
| `windows[].days` | DayOfWeek[] | yes | `"mon"` `"tue"` ... `"sun"` |
| `windows[].from` | string | yes | 开始时间 `"HH:MM"` |
| `windows[].to` | string | yes | 结束时间 `"HH:MM"` |

#### filter.volatility

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | enum | yes | `"require_high"` = 只在高波动时交易, `"require_low"` = 只在低波动时 |
| `atrThreshold` | number | yes | ATR / price 百分比阈值。`require_high`: ATR 须 ≥ 此值；`require_low`: ATR 须 ≤ 此值 |

#### filter.trend

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `minEfficiencyRatio` | number | no | 效率比阈值 0-1，越高趋势越强 |
| `minBodyRatio` | number | no | K 线实体占比阈值 0-1 |
| `lookback` | number | no | 回看 K 线数量，default 10 |
| `mustMatchDirection` | boolean | no | 趋势方向必须和信号方向一致，default true |

---

### signal — 方向信号

策略核心。只能选一种 method。

| Method | 适合谁 | 复杂度 | 需要 Binance 数据 |
|--------|-------|--------|------------------|
| `clob_follow` | 小白 | 零配置 | No |
| `clob_fade` | 小白 | 零配置 | No |
| `fixed` | DCA | 零配置 | No |
| `prev_candle` | 小白 | 零配置 | Yes |
| `rsi_reversal` | 初级 | 2 个参数 | Yes |
| `scoring` | 中级 | 多指标配置 | Yes |
| `ml` | 高级 | 需要模型 | Yes |
| `post_close` | 高级 | 搭配 scan 入场 | No |

#### signal.method = "clob_follow"

跟随 CLOB 订单簿多数方向。无参数。

#### signal.method = "clob_fade"

逆向：CLOB 多数方向的反方向。适合逆势/反共识策略。无参数。

#### signal.method = "fixed"

固定方向，每轮都入场，不看任何信号。适合 DCA 定投。

| Field | Type | Description |
|-------|------|-------------|
| `params.direction` | `"up"` / `"down"` | 固定方向 |

#### signal.method = "candle"

基于 K 线分析决定方向。3 种模式：

| Mode | 难度 | Logic |
|------|------|-------|
| `follow` | 小白 | 上一根 K 线涨 → UP，跌 → DOWN。可反转。 |
| `streak` | 初级 | 连续 N 根同向后触发（顺势或反转） |
| `template` | 中级 | 用户定义蜡烛序列模板，机器匹配 |

##### mode: "follow"

最简单的蜡烛策略。看上一根 K 线方向。

```jsonc
// 跟随：上一根涨就 UP
{ "method": "candle", "params": { "mode": "follow" } }

// 反转：上一根涨就 DOWN（均值回归）
{ "method": "candle", "params": { "mode": "follow", "reverse": true } }
```

##### mode: "streak"

计算连续同方向蜡烛数量，达到阈值后触发。

```jsonc
// 连续 3 根阴线后做多（均值回归：跌太多了，该反弹）
{ "method": "candle", "params": { "mode": "streak", "count": 3, "action": "reverse" } }

// 连续 4 根阳线后继续做多（动量：强趋势延续）
{ "method": "candle", "params": { "mode": "streak", "count": 4, "action": "follow" } }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | 连续几根触发 (2-10) |
| `action` | `"follow"` / `"reverse"` | follow=顺势, reverse=反转 |

##### mode: "template"

**核心概念**：用户定义一个蜡烛**序列模板**（比如 3 根蜡烛的组合），系统在实时 K 线流中匹配这个模板。
匹配时，系统找到相似度最高的匹配，超过阈值就触发。

**每根蜡烛用 4 个特征描述**：

| Feature | Range | Meaning |
|---------|-------|---------|
| `direction` | `"bull"` / `"bear"` / `"any"` | 阳线/阴线/不限 |
| `bodySize` | `"large"` / `"medium"` / `"small"` / `"any"` | 实体大小（large >70%, medium 30-70%, small <30%） |
| `upperWick` | `"long"` / `"short"` / `"any"` | 上影线长短（long >50% of range） |
| `lowerWick` | `"long"` / `"short"` / `"any"` | 下影线长短 |

**匹配逻辑**：
- 系统取最近 N 根蜡烛（N = 模板长度）
- 逐根对比每个特征，计算匹配分
- `"any"` 特征总是匹配（通配符）
- 匹配分 = 匹配的特征数 / 总特征数
- 匹配分 ≥ `minSimilarity` 时触发

```jsonc
// 经典"锤子线反转"模板：
// 第 1 根：阴线，大实体（下跌）
// 第 2 根：小实体，长下影（探底反弹 = 锤子线）
// → 结论：做多
{
  "method": "candle",
  "params": {
    "mode": "template",
    "sequence": [
      { "direction": "bear", "bodySize": "large", "upperWick": "any", "lowerWick": "short" },
      { "direction": "any",  "bodySize": "small", "upperWick": "short", "lowerWick": "long" }
    ],
    "direction": "up",
    "minSimilarity": 0.75
  }
}
```

```jsonc
// "三连跌后十字星"模板（自定义）：
// 3 根阴线 + 1 根 doji → 做多
{
  "method": "candle",
  "params": {
    "mode": "template",
    "sequence": [
      { "direction": "bear", "bodySize": "any", "upperWick": "any", "lowerWick": "any" },
      { "direction": "bear", "bodySize": "any", "upperWick": "any", "lowerWick": "any" },
      { "direction": "bear", "bodySize": "any", "upperWick": "any", "lowerWick": "any" },
      { "direction": "any",  "bodySize": "small", "upperWick": "any", "lowerWick": "any" }
    ],
    "direction": "up",
    "minSimilarity": 0.7
  }
}
```

**预设模板**（用户可一键选用或作为起点修改）：

| Preset | Sequence | Direction | Description |
|--------|----------|-----------|-------------|
| Hammer | [bear+large] → [any+small+longLower] | UP | 下跌后探底反弹 |
| Shooting Star | [bull+large] → [any+small+longUpper] | DOWN | 上涨后冲高回落 |
| Bullish Engulfing | [bear+any] → [bull+large] | UP | 阳线吞没阴线 |
| Bearish Engulfing | [bull+any] → [bear+large] | DOWN | 阴线吞没阳线 |
| Morning Star | [bear+large] → [any+small] → [bull+large] | UP | 三根反转 |
| Three Black Crows | [bear+large] → [bear+large] → [bear+large] | DOWN | 三连大阴 |
| Doji Reversal | [bull/bear+large] → [any+small] | reverse | 强势后犹豫 |

**`direction: "reverse"` 含义**：取模板中最后一根蜡烛的方向的反方向。如果最后一根是 bull → 交易方向为 DOWN；如果是 bear → UP；如果是 any → 看实际匹配到的蜡烛方向来反转。

**`minSimilarity` 计算规则**：
- 只计算**非 `"any"` 的特征**。`"any"` 是通配符，不参与相似度计算
- `similarity = 匹配的非any特征数 / 总非any特征数`
- 如果所有特征都是 `"any"`，该蜡烛视为总是匹配

**阈值含义**：
- `1.0` = 每个明确特征必须精确匹配（非常严格，很少触发）
- `0.75` = 允许 25% 的明确特征不匹配（推荐，平衡精度和触发频率）
- `0.5` = 一半匹配就行（宽松，触发多但噪声大）

**一个模板 = 一个信号规则**。如果需要多个模板，应使用 `scoring` 方法，将每个模板作为一个 indicator（类型 `candle_template`，未来扩展）。

#### signal.method = "rsi_reversal"

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `params.oversold` | number | 0-100 | RSI ≤ 此值 → UP |
| `params.overbought` | number | 0-100 | RSI ≥ 此值 → DOWN |

约束：`oversold` < `overbought`。RSI 在两者之间时跳过本轮。

#### signal.method = "scoring"

多指标加权打分。

| Field | Type | Description |
|-------|------|-------------|
| `params.threshold` | number | 总分 ≥ 此值 → 交易（方向由分数正负决定） |
| `params.allowReverse` | boolean | 总分 ≤ reverseThreshold 时是否反向交易 |
| `params.reverseThreshold` | number | 反向交易阈值（负数） |
| `params.indicators` | Indicator[] | 指标列表 |

**Indicator:**

```jsonc
{
  "name": "RSI 超卖",              // 人类可读名称
  "type": "rsi",                    // 指标类型（见下表）
  "config": { "period": 14 },       // 指标参数
  "rules": [                        // 值 → 分数 映射
    {
      "when": [null, 30],           // 值在 (-∞, 30] 范围内
      "up": 3,                      // 给 UP 方向 +3 分
      "down": -1                    // 给 DOWN 方向 -1 分
    },
    {
      "when": [70, null],           // 值在 [70, +∞) 范围内
      "up": -1,
      "down": 3
    }
  ],
  "required": false                 // true = 必须命中至少一条 rule
}
```

**Rule fields:**

| Field | Type | Description |
|-------|------|-------------|
| `when` | [min\|null, max\|null] | 值范围，null = 无限 |
| `score` | number | 方向无关分数（UP/DOWN 都加这个分） |
| `up` | number | 仅给 UP 方向的分数 |
| `down` | number | 仅给 DOWN 方向的分数 |
| `veto` | boolean | true = 命中时直接跳过本轮 |

> `score` vs `up`/`down`: 用 `score` 表示"这个条件增强信心但不区分方向"（如放量确认），用 `up`/`down` 表示"这个条件暗示了方向"（如 RSI 超卖暗示该涨了）。

**Available Indicator Types:**

Oscillators（振荡器）:

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `rsi` | `{ period: 14 }` | 0-100 | 相对强弱指标。>70 超买，<30 超卖 |
| `stochastic` | `{ kPeriod: 14, dPeriod: 3 }` | 0-100 | 随机指标 %K。>80 超买，<20 超卖 |
| `macd` | `{ fast: 12, slow: 26, signal: 9 }` | 实数 | MACD 柱状图值。>0 多头动能，<0 空头动能 |

Trend（趋势）:

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `roc` | `{ period: 3 }` | % | 价格变化率。正值=上涨动能 |
| `ema_crossover` | `{ fast: 9, slow: 21 }` | 0/1 | 快慢 EMA 是否交叉。1=金叉发生 |
| `price_vs_ema` | `{ period: 21 }` | % | 价格偏离 EMA 的百分比。正=价格在 EMA 上方 |
| `adx` | `{ period: 14 }` | 0-100 | 趋势强度指标。>25 有趋势，<20 震荡 |
| `efficiency_ratio` | `{ period: 15 }` | 0-1 | Kaufman 效率比。1=纯趋势，0=纯噪声 |

Volatility（波动率）:

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `atr` | `{ period: 14 }` | 实数 | 平均真实波幅（绝对值）|
| `atr_pct` | `{ period: 14 }` | % | ATR 占价格百分比 |
| `bollinger_pct` | `{ period: 20, stddev: 2 }` | 0-1 | 价格在布林带中的位置。0=下轨，1=上轨，0.5=中轨 |
| `bollinger_width` | `{ period: 20, stddev: 2 }` | % | 布林带宽度占价格百分比。越窄越可能突破 |
| `candle_range_pct` | — | % | 最近一根 K 线振幅占价格比 |

Volume（量能）:

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `volume_ratio` | `{ period: 10 }` | 0+ | 当前成交量 / 均量。>2 放量，<0.5 缩量 |
| `volume_trend` | `{ recent: 3, prior: 3 }` | 比值 | 近期/前期成交量比。>1 量增，<1 量缩 |
| `taker_buy_ratio` | `{ period: 5 }` | 0-1 | Binance 主动买入占比。>0.6 买盘主导 |
| `vwap_deviation` | — | % | 价格偏离 VWAP。正=高于均价 |

Price Action（价格行为）:

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `body_ratio` | `{ period: 3 }` | 0-1 | K 线实体占比。高=强方向性，低=犹豫 |
| `bullish_candles` | `{ period: 5 }` | 0-1 | 最近 N 根阳线占比 |
| `wick_ratio` | — | -1 to 1 | 上下影线比。正=上影长(看跌)，负=下影长(看涨) |
| `engulfing` | — | -1/0/1 | 吞没形态检测。1=看涨吞没，-1=看跌吞没 |
| `consecutive` | `{ period: 5 }` | -N to N | 连续同向蜡烛数。正=连涨，负=连跌 |

#### signal.method = "ml"

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `params.model` | string | yes | 模型 ID。内置模型如 `"rf-v5-30s"`，或用户上传的模型 ID |
| `params.type` | enum | yes | `"random_forest"` / `"xgboost"` / `"gbdt"` |
| `params.minConfidence` | number | no | 0.5-1.0, 置信度低于此值跳过。默认 0.6 |
| `params.waitForDataSec` | number | no | 等多少秒收集交易数据后再预测。默认 30 |
| `params.features` | string[] | no | 模型使用的特征列表（内置模型自动设定，自定义模型需指定）|

**Model sources（模型来源）:**

1. **Built-in（内置）** — 端点预装的模型，用户直接选用，ID 格式 `{type}-{version}-{window}`
2. **User uploaded（用户上传）** — 上传到当前空间的模型文件，ID 格式 `user:{userId}:{modelName}`
3. **Marketplace（市场）** — 从策略市场购买/复制的模型，ID 格式 `market:{strategyId}:{modelName}`

用户上传过的模型保存在空间内，下次创建策略时可直接选用，无需重复上传。

**Built-in models（内置模型列表由端点决定，示例）:**

| Model ID | Type | Window | Features | Historical Accuracy |
|----------|------|--------|----------|-------------------|
| `rf-v5-30s` | Random Forest | 30s | OHLCV + 技术指标 | ~56% |
| `rf-v5-60s` | Random Forest | 60s | OHLCV + 技术指标 + 交易流 | ~57% |
| `gbdt-v2-30s` | GBDT | 30s | OHLCV + 订单流 | ~58% |
| `xgb-v1-30s` | XGBoost | 30s | OHLCV + 技术指标 | ~56% |

#### signal.method = "post_close"

| Field | Type | Description |
|-------|------|-------------|
| `params.confidencePrice` | number | midpoint ≥ 此值认为该方向胜 |
| `params.timeoutSec` | number | 最多等几秒 |

约束：必须搭配 `entry.method = "scan"`。

---

### entry — 入场执行

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | yes | 每轮投入 USD (0.01 - 10000) |
| `maxPrice` | number | no | 最高可接受 share price (0.01-0.99)。不配则不限 |
| `minPrice` | number | no | 最低可接受 share price (0.01-0.99)。过滤"已无悬念"的轮次。默认 0.01 |
| `method` | enum | yes | `"market"` / `"limit"` / `"swing"` / `"scan"` |
| `windows` | array | no | 入场时间窗口 |
| `maxPerHour` | number | no | 每小时最多交易轮数 |

**Entry Windows:**

```jsonc
{ "from": 220, "to": 190 }   // 剩余 220 秒到 190 秒之间尝试入场
```

一轮 300 秒。`from` > `to`。最多 3 个窗口。不配则使用默认窗口。

**Method-specific fields:**

| Method | Extra Fields | Description |
|--------|-------------|-------------|
| `market` | — | 市价单，即时成交 |
| `limit` | `limitPrice`, `timeoutSec` | 限价挂单，等成交 |
| `swing` | `targetPrice`, `windowSec` | 等价格跌到目标再买 |
| `scan` | `scanMaxPrice`, `scanBudget`, `scanDelaySec`, `scanDurationSec`, `scanIntervalMs` | 收盘后扫描买入 |

**Dynamic Sizing（可选）:**

| Field | Type | Description |
|-------|------|-------------|
| `sizing.method` | enum | `"fixed"` / `"martingale"` / `"anti_martingale"` / `"kelly"` |
| `sizing.multiplier` | number | martingale/anti: 每次乘数 |
| `sizing.maxAmount` | number | 金额上限 |
| `sizing.resetOnWin` | boolean | martingale: 赢了回到 base |
| `sizing.resetOnLoss` | boolean | anti_martingale: 亏了回到 base |
| `sizing.lookback` | number | kelly: 用最近 N 轮算 |
| `sizing.fraction` | number | kelly: Kelly 系数折扣 (0.5 = half-Kelly) |
| `sizing.minAmount` | number | kelly: 最低金额 |

不配 `sizing` 时等同于 `{ "method": "fixed" }`，永远用 `amount`。

---

### risk — 风险控制

所有字段可选。

| Field | Type | Description |
|-------|------|-------------|
| `dailyLossLimit` | number | 每日最大亏损 USD，触达暂停 |
| `streakRules` | array | 连胜/连败行为规则（见下表） |
| `hedge.enabled` | boolean | 是否启用对冲 |
| `hedge.price` | number | 对冲限价 (0.001-0.99) |
| `hedge.shares` | number | 对冲份数 (1-10000) |
| `hedge.sellAbove` | number | 对冲止盈阈值 |
| `stopLoss.price` | number | 止损触发价格 |
| `stopLoss.minHoldSec` | number | 最少持有秒数后才允许止损 |

**Streak Rules:**

| Field | Type | Description |
|-------|------|-------------|
| `trigger` | `"win"` / `"loss"` | 连胜还是连败 |
| `count` | number | 连续几次触发 |
| `action` | enum | `"pause"` / `"stop"` / `"adjust_amount"` |
| `pauseMinutes` | number | action=pause 时，暂停多久 |
| `multiply` | number | action=adjust_amount 时，金额乘数 |
| `maxAmount` | number | 仓位调整上限 |

示例组合：
- 连亏 3 → 暂停 10 分钟（经典 cooldown）
- 连赢 5 → 暂停 5 分钟（防止 overtrading）
- 连亏 2 → 仓位减半（减少曝险）
- 连赢 3 → 仓位 ×1.5（趁热打铁，但有上限）

---

### exit — 离场规则

数组，按顺序检查，第一个触发的执行。`settlement` 是兜底（缺省自动追加）。

| Type | Fields | Description |
|------|--------|-------------|
| `takeProfit` | `profitPct` | 利润达到 X% 时卖出 |
| `trailingStop` | `drawdownPct` | 从最高点回撤 X% 时卖出 |
| `checkpoint` | `atRemainingSec` | 在剩余 N 秒时重新判断方向，反了就卖 |
| `settlement` | — | 等市场结算（兜底） |

---

## Minimal Valid Strategy

最小合法策略，5 行核心配置：

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "simple-follow",
  "name": "跟随大众",
  "signal": { "method": "clob_follow" },
  "entry": { "amount": 5, "method": "market" }
}
```

缺省值：
- `filter`: 无过滤，每轮都看
- `risk`: 无限制
- `exit`: `[{ "type": "settlement" }]` 自动追加

---

## Template Examples

### 1. Conservative — 保守型（小白推荐）

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "conservative-starter",
  "name": "保守入门",
  "description": "低价入场，设好止盈止损，每天最多亏 $25",
  "riskLevel": "conservative",

  "signal": { "method": "clob_follow" },

  "entry": {
    "amount": 3,
    "maxPrice": 0.52,
    "method": "market",
    "windows": [
      { "from": 220, "to": 190 },
      { "from": 160, "to": 130 }
    ]
  },

  "risk": {
    "dailyLossLimit": 25,
    "streakRules": [{ "trigger": "loss", "count": 3, "action": "pause", "pauseMinutes": 30 }]
  },

  "exit": [
    { "type": "takeProfit", "profitPct": 0.15 },
    { "type": "settlement" }
  ]
}
```

### 2. RSI Reversal + Hedge — 中级

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "rsi-reversal-hedged",
  "name": "RSI 反转 + 对冲",
  "description": "RSI 超卖做多，超买做空。对冲降低每轮最大亏损。",
  "riskLevel": "balanced",

  "filter": {
    "trend": {
      "minEfficiencyRatio": 0.2,
      "minBodyRatio": 0.3,
      "lookback": 10,
      "mustMatchDirection": true
    }
  },

  "signal": {
    "method": "rsi_reversal",
    "params": { "oversold": 35, "overbought": 65 }
  },

  "entry": {
    "amount": 5,
    "maxPrice": 0.55,
    "method": "market",
    "windows": [{ "from": 280, "to": 240 }]
  },

  "risk": {
    "dailyLossLimit": 50,
    "streakRules": [{ "trigger": "loss", "count": 3, "action": "pause", "pauseMinutes": 10 }],
    "hedge": {
      "enabled": true,
      "price": 0.10,
      "shares": 5,
      "sellAbove": 0.35
    },
    "stopLoss": { "price": 0.35, "minHoldSec": 60 }
  },

  "exit": [
    { "type": "takeProfit", "profitPct": 0.15 },
    { "type": "checkpoint", "atRemainingSec": 180 },
    { "type": "settlement" }
  ]
}
```

### 3. Multi-Indicator Scoring — 高级

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "multi-signal-pro",
  "name": "多指标打分策略",
  "description": "RSI + 成交量 + EMA 交叉联合打分，总分 ≥ 3 才交易",
  "riskLevel": "aggressive",

  "filter": {
    "schedule": {
      "timezone": "UTC",
      "windows": [
        { "days": ["mon","tue","wed","thu","fri"], "from": "08:00", "to": "20:00" }
      ]
    },
    "volatility": { "mode": "require_high", "atrThreshold": 0.05 }
  },

  "signal": {
    "method": "scoring",
    "params": {
      "threshold": 3,
      "allowReverse": true,
      "reverseThreshold": -3,
      "indicators": [
        {
          "name": "RSI",
          "type": "rsi",
          "config": { "period": 14 },
          "rules": [
            { "when": [null, 30], "up": 3, "down": -1 },
            { "when": [70, null], "up": -1, "down": 3 }
          ]
        },
        {
          "name": "放量确认",
          "type": "volume_ratio",
          "config": { "period": 20 },
          "rules": [
            { "when": [2.0, null], "score": 2 },
            { "when": [null, 0.3], "veto": true }
          ]
        },
        {
          "name": "EMA 金叉",
          "type": "ema_crossover",
          "config": { "fast": 5, "slow": 20 },
          "rules": [
            { "when": [0.5, null], "up": 2, "down": -1 },
            { "when": [null, -0.5], "up": -1, "down": 2 }
          ]
        }
      ]
    }
  },

  "entry": {
    "amount": 10,
    "maxPrice": 0.60,
    "method": "market",
    "maxPerHour": 6
  },

  "risk": {
    "dailyLossLimit": 100,
    "streakRules": [{ "trigger": "loss", "count": 4, "action": "pause", "pauseMinutes": 15 }],
    "hedge": { "enabled": true, "price": 0.12, "shares": 8, "sellAbove": 0.40 },
    "stopLoss": { "price": 0.30, "minHoldSec": 45 }
  },

  "exit": [
    { "type": "takeProfit", "profitPct": 0.20 },
    { "type": "trailingStop", "drawdownPct": 0.08 },
    { "type": "settlement" }
  ]
}
```

### 4. Post-Close Arbitrage — 高级套利

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "post-close-arb",
  "name": "收盘后套利",
  "description": "等市场关闭后根据价格推断胜方，在结算前买入确定性高的一方",
  "riskLevel": "conservative",

  "signal": {
    "method": "post_close",
    "params": { "confidencePrice": 0.95, "timeoutSec": 30 }
  },

  "entry": {
    "amount": 100,
    "method": "scan",
    "scanMaxPrice": 0.96,
    "scanBudget": 200,
    "scanDelaySec": 5,
    "scanDurationSec": 25,
    "scanIntervalMs": 500,
    "windows": []
  },

  "exit": [{ "type": "settlement" }]
}
```

### 5. ML Model with Schedule — 机器学习

```json
{
  "$schema": "biubiu-strategy-v3",
  "id": "ml-weekday",
  "name": "RF 模型（工作日）",
  "description": "Random Forest 预测方向，仅工作日 9-18 点运行",
  "riskLevel": "balanced",

  "filter": {
    "schedule": {
      "timezone": "Asia/Shanghai",
      "windows": [
        { "days": ["mon","tue","wed","thu","fri"], "from": "09:00", "to": "18:00" }
      ]
    }
  },

  "signal": {
    "method": "ml",
    "params": {
      "model": "rf-v5-30s",
      "type": "random_forest",
      "minConfidence": 0.6,
      "waitForDataSec": 30
    }
  },

  "entry": {
    "amount": 50,
    "maxPrice": 0.65,
    "method": "market",
    "windows": [{ "from": 270, "to": 240 }]
  },

  "risk": {
    "dailyLossLimit": 200,
    "streakRules": [{ "trigger": "loss", "count": 5, "action": "pause", "pauseMinutes": 60 }]
  },

  "exit": [
    { "type": "trailingStop", "drawdownPct": 0.10 },
    { "type": "settlement" }
  ]
}
```

---

## Validation Rules

1. `signal.method = "post_close"` **必须** 搭配 `entry.method = "scan"`，且 `entry.windows = []`
2. `signal.method = "rsi_reversal"` 要求 `params.oversold < params.overbought`
3. `signal.method = "ml"` 要求 `params.model` 和 `params.type` 都存在
4. `entry.method = "limit"` 要求 `limitPrice` 存在
5. `entry.method = "swing"` 要求 `targetPrice` 存在
6. `entry.windows[].from > entry.windows[].to`（from 是较早时间点，剩余秒数更大）
7. `exit` 数组为空时，自动追加 `[{ "type": "settlement" }]`
8. `risk.stopLoss.price` 应 < `entry.maxPrice`（止损价低于买入价才有意义）
9. `filter.schedule.windows[].from < to`（时间顺序）
10. `signal.method = "fixed"` 要求 `params.direction` 存在
11. `entry.sizing.method = "martingale"` 要求 `sizing.multiplier` 和 `sizing.maxAmount` 存在
12. `entry.sizing.method = "kelly"` 要求 `sizing.lookback` 和 `sizing.fraction` 存在
13. `risk.streakRules[].action = "pause"` 要求 `pauseMinutes` 存在
14. `risk.streakRules[].action = "adjust_amount"` 要求 `multiply` 存在
15. 未知字段 **MUST** 被忽略（向前兼容）

---

## v2 → v3 Migration

| v2 | v3 | 变化 |
|----|-----|------|
| `direction` | `signal` | 重命名，更直觉 |
| `direction.method: "clob_follow"` | `signal.method: "clob_follow"` | 不变 |
| `direction.method: "signal_score"` | `signal.method: "scoring"` | 简化命名 |
| `direction.method: "ml_model"` | `signal.method: "ml"` | 简化命名 |
| `direction.method: "post_market_inference"` | `signal.method: "post_close"` | 更直觉 |
| `direction.params.thresholdLow/High` | `signal.params.oversold/overbought` | 更直觉 |
| `gates[]` | `filter.{schedule,volatility,trend}` | 扁平化，不再是数组 |
| `gates[].type: "daily_loss_limit"` | `risk.dailyLossLimit` | 归入 risk |
| `gates[].type: "cooldown"` | `risk.streakRules[]` | 归入 risk，泛化为 streakRules |
| `hedge` (top-level) | `risk.hedge` | 归入 risk |
| `exit[].type: "stop_loss"` | `risk.stopLoss` | 归入 risk（止损是保护，不是离场策略） |
| `exit[].type: "take_profit"` | `exit[].type: "takeProfit"` | camelCase 统一 |
| `exit[].type: "trailing_stop"` | `exit[].type: "trailingStop"` | camelCase 统一 |
| `entry.method: "swing_limit"` | `entry.method: "swing"` | 简化 |
| `entry.method: "post_market_scan"` | `entry.method: "scan"` | 简化 |
| `label: { zh, en }` | `name: string \| { zh, en }` | 支持单语言 |
| `signals.rules[].indicator` | `signal.params.indicators[].type` | 归入 signal |
| `signals.rules[].conditions[]` | `signal.params.indicators[].rules[]` | 重命名更直觉 |
| `conditions[].scoreUp/scoreDown` | `rules[].up/down` | 简化 |
| — (new) | `signal.method: "clob_fade"` | 新增：逆向 CLOB |
| — (new) | `signal.method: "fixed"` | 新增：固定方向/DCA |
| — (new) | `entry.sizing` | 新增：动态仓位（Martingale/Kelly） |
| `gates[].type: "cooldown"` | `risk.streakRules[]` | 泛化：连胜连败都能处理 |
