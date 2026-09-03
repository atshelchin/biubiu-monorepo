# Phase 1 Data Model: 批量代币发送域

**Feature**: `002-token-sender-core` | **Date**: 2026-09-03

---

## 1. Model

```text
SenderModel
├── step: WizardStep                     Config | Recipients | Review | Execute
├── networks: Vec<Network>               内置表进核心（research.md D19）
├── custom_networks: Vec<Network>        用户添加，宿主回灌
├── rpc_overrides: Map<slug, Vec<String>>
├── network_slug: String
├── token_type: TokenType                Native | Erc20
├── token_address: String
├── token_meta: Option<TokenMeta>        { symbol, decimals }，宿主读链得来
├── token_meta_state: MetaState          Idle | Loading | Failed(MetaError)
├── distribution_mode: DistributionMode  Specified | Equal
├── recipients_text: String
├── total_amount_input: String
├── parsed: Option<ParseResult>
├── fee: Option<FeeQuote>                单批费用
├── fee_loading / preflight_loading: bool
├── preflight: Option<PreflightResult>
├── review_error: Option<String>
├── gas_fee_token: Option<String>
├── member_waived: bool                  本会话已完成控制权证明
├── send: SendState                      ★ 批次编排，见 §2
├── history: Vec<SendRecord>
├── in_flight: BTreeMap<u64, InFlightOp>
└── next_operation_id: u64
```

`in_flight` 的语义与 spec 001 完全相同：任何结果先查表，查不到就丢弃。

---

## 2. `SendState` —— 本域的核心，循环被它取代

```text
SendState
├── status: Idle | Running | Paused | Done | 
├── started_at_ms: u64                   由宿主在开始时提供（核心无时钟）
├── plan: Option<SendPlan>               一次发送的不可变输入
└── batches: Vec<BatchState>             每批一条

SendPlan  { network_slug, token_type, token_address, decimals, symbol,
            batch_size, fee_per_batch, gas_fee_token, recipients }

BatchState = Pending
           | InFlight { operation_id }
           | Succeeded { tx_hash, explorer_url, count }
           | Failed { error }
```

### 为什么把它铺成一张表

迁移前，「哪些批次已成功」是 `for` 作用域里的一个局部数组，只在这条执行流活着时存在。铺成
`Vec<BatchState>` 之后，它是**核心拥有的状态**：可断言、可投影到视图、也（在下一个 spec 里）
可持久化。

「不重发已成功批次」这条金钱安全规则，因此从循环里的一行 `continue` 变成一个函数：

```text
next_pending_index(batches) = 第一个 status == Pending 或 Failed 的下标
```

`Succeeded` 永远不会被它选中 —— **这不是靠记得跳过，而是靠它不在候选集里**。

---

## 3. 状态转移

### 3.1 发送

```
StartSend
  ├─ 前置不满足（无解析结果 / 无费用 / 无钱包）⇒ 忽略
  └─ 否则：plan ← 冻结当前输入
            batches ← [Pending; ceil(valid_count / batch_size)]
            status ← Running；step ← Execute
            └─► dispatch_next_batch()

dispatch_next_batch()
  ├─ status ≠ Running                    ⇒ 什么都不做
  ├─ next_pending_index() == None        ⇒ status ← Done
  └─ 否则 batches[i] ← InFlight{ id }
          请求 SendBatch{ id, index: i, plan 的相关片段, recipients: chunk(i) }

BatchSucceeded{ id, tx_hash, explorer_url }
  ├─ id 不在表中 ⇒ 丢弃
  └─ batches[i] ← Succeeded{…}
       ├─ 还有 Pending/Failed 且 status == Running
       │    ⇒ 请求 WaitBetweenBatches{ id2, ms: 2500 }
       └─ 否则 status ← Done（或保持 Paused）

BatchFailed{ id, error }
  ├─ id 不在表中 ⇒ 丢弃
  └─ batches[i] ← Failed{error}；其余同上（「跳过」策略：失败不中止整轮）

DelayElapsed{ id }
  ├─ id 不在表中 ⇒ 丢弃（用户在间隔中暂停了）
  └─ dispatch_next_batch()

Pause
  └─ status ← Paused
     把在途的 WaitBetweenBatches 移出 in_flight   ← 间隔立即失效（FR-007）
     **不动**在途的 SendBatch                      ← 交易可能已上链（D16）

Resume
  ├─ next_pending_index() == None ⇒ 忽略
  └─ status ← Running；dispatch_next_batch()
```

**两个不变量**，都该被测试锁住：

1. 任一时刻 `batches` 中至多一个 `InFlight` —— 每批一次 passkey 确认，串行是产品要求。
2. `Succeeded` 是**终态**：没有任何转移把它改回 `Pending`。这是「不重复打款」的结构性保证。

### 3.2 向导与费用

```
SetNetwork / SetTokenType
  └─► token_meta ← None；token_meta_state ← Idle
      parsed ← None                      （精度可能变了，金额含义随之改变）
      gas_fee_token ← None               （新链上原稳定币可能不存在）

LoadTokenMeta      ──► 请求 ReadErc20Meta{ id, network, address }
  ├─ 地址形状非法 ⇒ token_meta_state ← Failed(InvalidAddress)，不发请求
  └─ 结果回来 ⇒ token_meta / Failed(ReadFailed)

Parse              ──► parsed ← parse_recipients(text, mode, decimals, total_amount)
                        （纯计算，不发请求）

PrepareReview
  └─► 请求 QuoteFee{ id, network, is_member }
      结果回来 ⇒ fee ← quote
                 请求 Preflight{ id, network, token, total_amount,
                                 fee: quote.amount × total_batches }

MemberProven{ waived: true }
  └─► member_waived ← true
      若 step == Review ⇒ 重新走 PrepareReview（FR-014 的时序规则）
```

**派生量**（`view()` 里算，不存 Model）：

| 量 | 规则 |
|---|---|
| `batch_size` | `token_type == Native ? network.max_batch_native : max_batch_erc20` |
| `total_batches` | `valid_count == 0 ? 0 : ceil(valid_count / batch_size)` |
| `fee_total` | `fee.amount × total_batches` |
| `decimals` / `symbol` | 原生取网络的，ERC20 取 `token_meta` 的（缺省 18 / "TOKEN"） |
| `can_proceed_from_config` | 原生恒真；ERC20 需 `token_meta` 存在且无错误 |
| `can_proceed_from_recipients` | `valid_count > 0 且 total_amount > 0` |
| `remaining_batches` | `batches` 中非 `Succeeded` 的条数 |
| `send_supported` | 自定义链 ⇒ false |

---

## 4. 收件人解析（core，规则须与迁移前逐字一致）

```
逐行处理，行号从 1 计：
  空行 或 以 '#' 开头        ⇒ 跳过（不计入任何计数）
  按 [,\t 空格]+ 切分，取第一段为地址
  地址非法                   ⇒ invalid += { line, text, reason: InvalidAddress }
  地址（小写）已出现过        ⇒ duplicate_count += 1，不计入 invalid
  Specified 模式：
      无第二段               ⇒ invalid += MissingAmount
      解析金额失败            ⇒ invalid += InvalidAmount
      金额 <= 0              ⇒ invalid += ZeroAmount
  Equal 模式：金额留待均分

均分：每人 = total / n，**首位收余尘**（total - 每人 × (n-1)）
总额  = 各收件人金额之和
```

**「重复不算非法」** 这一点值得留意：重复地址只增加 `duplicate_count`，不进 `invalid` 清单，
用户看到的是两个不同的数字。搬迁时若把它归进 `invalid`，界面上的两个计数会同时错。

金额以**十进制字符串**过界（沿用 research.md D4）；核心内部用 128 位整数做加总。

---

## 5. 需要被测试锁住的规则

| # | 规则 | 来源 |
|---|---|---|
| S-01 | 续发时已成功的批次不产生任何请求 | FR-003（**资金安全**） |
| S-02 | `Succeeded` 是终态，没有转移能把它改回 `Pending` | 不变量 |
| S-03 | 任一时刻至多一个批次处于 `InFlight` | 不变量 |
| S-04 | 每个批次请求携带的单批费用与首轮一致 | FR-004 |
| S-05 | 暂停后不再发出新的批次请求 | FR-005 |
| S-06 | 暂停后到达的批次结果仍被记录，不被丢弃 | FR-006 |
| S-07 | 暂停使在途的批间延时立即失效（其到期回送被丢弃） | FR-007 |
| S-08 | 单批失败不中止整轮；失败批次可被后续续发重试 | FR-008 |
| S-09 | 全部批次成功后状态为 Done，不再发出请求 | §3.1 |
| S-10 | 解析：空行与注释行被忽略，不计入任何计数 | FR-010/011 |
| S-11 | 解析：重复地址只增加 duplicate_count，不进 invalid | FR-011 |
| S-12 | 解析：四类非法原因分类与迁移前一致 | FR-011 |
| S-13 | 均分模式：余尘归首位，总额等于输入总额 | FR-011 |
| S-14 | 批次数 = ceil(有效数 / 每批上限)，且每批上限随代币类型切换 | FR-012 |
| S-15 | 总费用 = 单批费用 × 批次数 | FR-013 |
| S-16 | 会员豁免成立时单批费用为 0 | FR-013 |
| S-17 | 豁免在 Review 步骤被证明后，费用被重算 | FR-014 |
| S-18 | 切网络/切代币类型清空 token_meta、parsed、gas_fee_token | FR-015 |
| S-19 | ERC20 未取到元数据时不可离开第一步 | FR-009 |
| S-20 | 有效收件人为 0 时不可离开第二步 | FR-009 |
| S-21 | 收件人为空时 StartSend 不产生任何请求 | Edge case |
| S-22 | 每批上限为 0 时按 1 处理，不产生空批或死循环 | Edge case |
| S-23 | 历史状态判定：全成 Completed / 部分 Partial / 全败 Failed | FR-011（迁移前行为） |
| S-24 | 历史写入失败不影响发送结果的呈现 | Edge case |
