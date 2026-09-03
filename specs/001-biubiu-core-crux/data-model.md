# Phase 1 Data Model: 授权撤销域

**Feature**: `001-biubiu-core-crux` | **Date**: 2026-09-03

本文件描述核心内部状态（`Model`）、对外投影（`ViewModel`）与两者之间的规则。跨界的线格式
（`Event` / `Operation` / `ShellResult`）见 [contracts/](./contracts/)。

---

## 1. Model —— 核心内部状态，不对外暴露

```text
RevokeModel
├── network_slug: String                     当前选中网络的 slug
├── custom_networks: Vec<Network>            用户添加的网络（内置网络是常量表，不在 Model 里）
├── custom_tokens:   Map<chain_id, Vec<TokenEntry>>
├── custom_spenders: Map<chain_id, Vec<SpenderEntry>>
├── rows: Vec<ApprovalRow>                   最近一次成功扫描的结果
├── scan: ScanState                          Idle | Scanning | Scanned | Failed(String)
├── last_scan_key: Option<String>            "<owner 小写>:<chain_id>"，自动扫描的去重键
├── filter: RowFilter                        All | Unlimited
├── selected_ids: Vec<String>                选中行的稳定标识（保持用户点选顺序）
├── revoke: RevokeState                      Idle | Running { phase, row_ids }
├── notice: Option<Notice>                   成功/失败提示
├── owner: Option<String>                    当前钱包地址（由宿主经事件告知）
├── gas_fee_token: Option<String>            批量 gas 结算资产；None = 原生
├── in_flight: BTreeMap<u64, InFlightOp>     在途请求表 —— 唯一的陈旧判定依据
└── next_operation_id: u64                   单调计数器
```

### `InFlightOp`

```text
InFlightOp = Scan     { chain_id, owner }
           | Revoke   { row_ids: Vec<String> }
           | Persist  { kind: PersistKind }
           | Dismiss                          6 秒自动收起的计时
```

**这是整个设计的支点**。任何结果回到核心，第一步永远是
`in_flight.remove(&operation_id)`：拿不到 → 丢弃；拿到但内容与结果不符（例如
`Scan.chain_id` 已非当前链）→ 丢弃。宿主因此不需要、也不允许持有任何代次计数器。

### `ScanState`

| 状态 | 含义 | 视图表现 |
|---|---|---|
| `Idle` | 尚未扫描（刚切链、尚无 owner） | 空态 |
| `Scanning` | 有一次扫描在途 | 转圈 |
| `Scanned` | 至少成功过一次 | 表格（可能为空表） |
| `Failed(msg)` | 最近一次扫描失败 | 错误态 |

`Scanning` 与 `in_flight` 中的 `Scan` 条目**必须**同时存在或同时不存在——这是一条应被测试
覆盖的不变量。

### `Notice`

```text
Notice = Success { tx_hash: Option<String>, explorer_url: Option<String> }   // 6 秒后自动收起
       | Failure { message: String }                                          // 须用户关闭
```

---

## 2. 值类型

### `ApprovalRow` —— 一条当前生效的授权

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String` | 稳定标识，见下方「标识规则」 |
| `standard` | `Erc20 \| Erc721 \| Erc1155` | 代币标准 |
| `token` | `String` | 代币合约地址（小写） |
| `token_symbol` | `String` | |
| `token_name` | `Option<String>` | |
| `decimals` | `Option<u8>` | 仅 ERC20 |
| `spender` | `String` | 授权方地址（小写） |
| `spender_label` | `Option<String>` | 已知授权方的可读名；未知则无 |
| `spender_kind` | `Option<SpenderKind>` | `dex \| permit2 \| marketplace \| bridge \| lending \| other` |
| `allowance` | `Option<String>` | 十进制字符串，仅 ERC20。核心不对其做算术（研究 D4） |
| `approved_for_all` | `Option<bool>` | 仅 ERC721/1155 |
| `unlimited` | `bool` | 额度实际无上限。**由宿主在读链时判定**并传入 |
| `from_logs` | `bool` | 来自深度日志扫描而非内置清单 |
| `is_permit2` | `bool` | Permit2 子额度，决定撤销走 `lockdown` |

**标识规则（FR-021，必须与迁移前逐字一致）**：
`id = "{standard}:{token}:{spender}"`，三段全部小写；Permit2 子额度的 `standard` 段为
`permit2`。宿主的逐行状态（进行中转圈）靠这个 id 对齐，规则一变，重新扫描后逐行状态就会错位。

### `Network`

| 字段 | 类型 | 说明 |
|---|---|---|
| `slug` | `String` | 内置网络沿用既有 apiNetworkId（如 `eth-mainnet`）；自定义为 `custom-<chainId>` |
| `chain_id` | `u64` | |
| `name` / `symbol` | `String` | |
| `rpcs` | `Vec<String>` | 故障转移顺序，首个为主 |
| `explorer_url` | `String` | 无尾部斜杠 |
| `multicall3` | `String` | 聚合器地址 |
| `is_testnet` / `is_custom` | `bool` | |

内置网络表**由宿主在启动时供给**（`custom_data_loaded` 一并带上），不是核心内的常量 ——
它逐条派生自钱包的 `CHAINS`，而 wallet 域这次不迁移，复制进核心会制造两份真相（research.md D12）。
`Model` 分别存内置与自定义两份列表。`Model.network_slug` 指向两者之一，解析不到时回退默认网络。

内置**代币与授权方**注册表则相反，是核心内的常量：它们是 revoke 域自己的数据，且带着合并去重的
业务规则。

### `TokenEntry` / `SpenderEntry`

用户添加的探测目标。去重键分别为 `"{standard}:{address 小写}"` 与 `address 小写`。

合并顺序为 `[内置…, 自定义…]`，**保留首次出现** —— 因此同键时**内置胜出**。这是迁移前的实际
行为（`dedupeBy` 保留 first occurrence），必须逐字保持：方向反了，用户给内置代币添加同地址自定义
条目时符号/精度就会变，那是一次静默的行为改变（research.md D13）。

---

## 3. ViewModel —— 对外投影

核心在每次 `render()` 时整体重算。宿主除此之外不持有任何业务状态。

```text
RevokeViewModel
├── networks: Vec<NetworkView>          内置 + 自定义，已排序
├── network: NetworkView                当前选中
├── owner: Option<String>
├── rows: Vec<ApprovalRowView>          已应用 filter 的可见行，含 is_selected / is_pending
├── total_count / unlimited_count: usize
├── filter: RowFilter
├── selected_count: usize
├── is_scanning: bool
├── has_scanned: bool
├── scan_error: Option<String>
├── is_revoking: bool
├── revoke_phase: Option<SendPhase>
├── notice: Option<NoticeView>
├── gas_fee_token: Option<String>
├── can_scan: bool                      有 owner 且当前无在途扫描
├── can_revoke_selected: bool           选中非空、无在途撤销、当前链支持发送
└── send_supported: bool                自定义链 + biubiu 钱包 ⇒ false（无 bundler 基础设施）
```

**`ApprovalRowView` 已经是可渲染形态**：`is_selected` 与 `is_pending` 是核心算好的布尔值，
不是宿主用 `selectedIds.includes(id)` 现算的。宿主模板里不应再出现集合查找。

**内部记账不进视图**：`in_flight`、`next_operation_id`、`last_scan_key` 一律不出现在
`ViewModel` 中。仅在默认关闭的 `devtools` feature 下，另有一份脱敏 `DebugSnapshot` 暴露它们。

---

## 4. 状态转移

### 4.1 扫描

```
                        SetNetwork(slug)  ─┐
                                           ├─► 使在途 Scan 失效（移出 in_flight）
   WalletChanged(owner) ────────────────────┤   清空 rows / scan / selected / notice / gas_fee_token
                                           │   last_scan_key ← None
                                           ▼
   PageReady / 上述任一 ──► 若 owner 存在 且 "owner:chain" ≠ last_scan_key 且无在途 Scan
                              └─► last_scan_key ← "owner:chain"
                                  in_flight[id] = Scan{chain_id, owner}
                                  scan ← Scanning
                                  请求 ScanApprovals{ id, chain, owner, tokens, spenders }

   ScanCompleted{ id, rows }  ──► id 不在表中 ⇒ 丢弃
                                  Scan.chain_id ≠ 当前链 ⇒ 丢弃
                                  否则 rows ← 排序后结果；scan ← Scanned；selected ← []
   ScanFailed{ id, message }  ──► 同样的丢弃判定；否则 scan ← Failed(message)；rows ← []
```

**排序规则（与迁移前一致）**：`unlimited` 降序 → `token_symbol` 升序 → `spender` 升序。

### 4.2 撤销

```
   RevokeSelected / RevokeOne(id)
        ├─ revoke ≠ Idle              ⇒ 忽略（FR-014）
        ├─ 目标行集合为空              ⇒ 忽略，不发请求
        └─ 否则 dismiss_notice()      （连带作废在途 Dismiss）
                revoke ← Running{ phase: Checking, row_ids }
                in_flight[id] = Revoke{ row_ids }
                请求 RevokeApprovals{ id, chain, rows, gas_fee_token }

   RevokePhaseChanged{ id, phase }  ──► id 不在表中 ⇒ 丢弃；否则更新 phase（仅影响视图）
   RevokeCompleted{ id, result }    ──► id 不在表中 ⇒ 丢弃
        ├─ 成功：rows 移除 row_ids；selected 移除 row_ids
        │        notice ← Success{...}
        │        in_flight[id2] = Dismiss；请求 ScheduleDismiss{ id2, delay_ms: 6000 }
        └─ 失败：notice ← Failure{ message }（不排期收起）
        两种情况都：revoke ← Idle

   DismissDue{ id }     ──► id 不在表中 ⇒ 丢弃（用户已手动关闭 / 又发生了一次撤销）
                            否则 notice ← None
   DismissNotice        ──► notice ← None；作废在途 Dismiss（移出 in_flight）
```

**关键不变量**：`DismissNotice` 之后到达的 `DismissDue` 必然被丢弃，因为它的 id 已不在表中。
即使宿主没有调用 `clearTimeout`，也不会有第二次状态变更（研究 D5）。

### 4.3 自定义条目

```
   AddCustomToken / RemoveCustomToken / AddCustomSpender / RemoveCustomSpender
        └─► 内存中的列表立即更新（去重键为准）
            请求 PersistCustomData{ id, ... }
            触发一次重扫（走 4.1 的扫描路径，先把 last_scan_key 置空）

   PersistCompleted{ id, ok }
        └─► ok=false ⇒ 记录但不回滚（FR-018）。内存条目保持可用。

   AddNetworkByChainId{ chain_id, rpc_override }
        ├─ 该 chain_id 已在 networks 中 ⇒ 直接 SetNetwork(existing.slug)，不新增
        └─ 否则请求 FetchChainMetadata{ id, chain_id }
              └─ MetadataFetched{ id, meta }
                    rpcs = 去重([rpc_override] + meta.rpcs)
                    rpcs 为空 ⇒ notice ← Failure("need-rpc")，不新增网络
                    否则 新增自定义网络（name/symbol/explorer 取自 meta，缺失则兜底）
                        → PersistCustomData → SetNetwork(新 slug)

   RemoveCustomNetwork{ slug }
        └─► 移除；若它是当前选中 ⇒ SetNetwork(默认网络)（走 4.1 的全部清空规则）
            → PersistCustomData

   CustomDataLoaded{ id, networks, tokens, spenders }   （启动时一次性回灌）
        └─► 覆盖三张表；失败则保持为空（best-effort，不产生错误提示）
```

---

## 5. 需要被测试锁住的规则

按宪法原则 V，下列每一条对应至少一个 `cargo test` 用例（不依赖浏览器/网络/时钟）：

| # | 规则 | 来源 |
|---|---|---|
| R-01 | 切链后，先前那次扫描的成功结果被丢弃 | 既有 TS 测试 P2#1 第 1 例 |
| R-02 | 两次扫描交错时，只有最后一次的结果落地（无论谁先返回） | 既有 TS 测试 P2#1 第 2 例、P2#2 第 1 例 |
| R-03 | 切链后，先前那次扫描的失败不产生错误提示 | 既有 TS 测试 P2#1 第 3 例 |
| R-04 | 较早的扫描结束不得清除仍在途扫描的加载态 | 既有 TS 测试 P2#2 第 2 例 |
| R-05 | 同一 owner+chain 只自动扫描一次；切链后视为新组合 | FR-011 |
| R-06 | 切链清空 rows / scanned / error / selected / notice / gas_fee_token | FR-012 |
| R-07 | `Unlimited` 筛选下「全选可见」只选中可见行 | FR-013 |
| R-08 | 撤销进行中忽略新的撤销触发 | FR-014 |
| R-09 | 空行集合的撤销不产生请求 | FR-014 |
| R-10 | 撤销成功后移除对应行与对应选中项 | FR-015 |
| R-11 | 成功提示排期收起；失败提示不排期 | FR-016 |
| R-12 | 手动关闭后到达的 `DismissDue` 被丢弃 | FR-017 |
| R-13 | 撤销期间切链后，撤销结果**仍然落地**（与迁移前一致，非丢弃） | 迁移前行为 |
| R-14 | 持久化失败不回滚内存条目 | FR-018 |
| R-15 | 添加/移除自定义条目后触发重扫 | FR-018 |
| R-16 | 添加已存在的链 ⇒ 直接选中，不新增 | FR-019 |
| R-17 | 无可用 RPC 且无覆盖值 ⇒ `need-rpc`，不新增网络 | FR-019 |
| R-18 | 移除当前选中的自定义网络 ⇒ 回退默认并执行切链清空 | FR-020 |
| R-19 | 行标识为 `{standard}:{token}:{spender}` 全小写 | FR-021 |
| R-20 | 排序为 unlimited 降序 → symbol 升序 → spender 升序 | 迁移前行为 |
| R-21 | `Scanning` 与在途 `Scan` 条目同时存在或同时不存在 | Model 不变量 |
