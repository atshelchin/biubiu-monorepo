# Contract: 授权撤销域的 Core↔Shell 词汇表

**Feature**: `001-biubiu-core-crux`

以下三个联合体是该域跨界的**全部**内容。TypeScript 侧由 `ts-rs` 生成到
`apps/biubiu.tools/src/lib/generated/`，本文件是其权威描述，不是副本——生成物与本文件不一致时，
以 Rust 源码为准并修正本文件。

序列化约定：外部标签 `#[serde(tag = "type", rename_all = "snake_case")]`，字段名 `snake_case`。

---

## 1. `RevokeEvent` —— 进入核心的唯一入口

### 来自用户/页面

| `type` | 字段 | 含义 |
|---|---|---|
| `page_ready` | — | 页面挂载。触发自定义数据回灌 |
| `wallet_changed` | `owner: string \| null` | 钱包连接/切换/断开 |
| `set_network` | `slug: string` | 切换网络 |
| `request_scan` | — | 手动重新扫描 |
| `set_filter` | `filter: "all" \| "unlimited"` | 切换筛选 |
| `toggle_row` | `id: string` | 单行选中翻转 |
| `select_all_visible` | — | 全选当前可见行 |
| `clear_selection` | — | 清空选择 |
| `set_gas_fee_token` | `token: string \| null` | 批量 gas 结算资产 |
| `revoke_one` | `id: string` | 撤销单行 |
| `revoke_selected` | — | 撤销选中项 |
| `dismiss_notice` | — | 关闭提示（并作废在途自动收起） |
| `add_custom_token` | `standard`, `address`, `symbol`, `name?`, `decimals?` | |
| `remove_custom_token` | `address: string` | |
| `add_custom_spender` | `address: string`, `label: string` | |
| `remove_custom_spender` | `address: string` | |
| `add_network_by_chain_id` | `chain_id: number`, `rpc_override?: string` | |
| `remove_custom_network` | `slug: string` | |

### 来自宿主的应答（统一入口）

| `type` | 字段 |
|---|---|
| `shell_completed` | `result: RevokeShellResult` |

**只有一个应答事件**。所有宿主结果都从这里进核心，因此「先查 `in_flight`」这一步只需写一次，
不可能被某个新增分支绕过。

---

## 2. `RevokeOperation` —— 核心对宿主的请求

每一项都携带 `operation_id: number`。

### `scan_approvals`

```jsonc
{
  "type": "scan_approvals",
  "operation_id": 3,
  "chain_id": 1,
  "rpcs": ["https://…"],
  "multicall3": "0x…",
  "owner": "0x…",
  "tokens":   [ { "standard": "erc20", "address": "0x…", "symbol": "USDC", "decimals": 6 } ],
  "spenders": [ { "address": "0x…", "label": "Uniswap", "kind": "dex" } ]
}
```

核心已经把内置注册表与自定义条目**合并去重**后交出来。宿主不查注册表，只按给定清单扫。

### `revoke_approvals`

```jsonc
{
  "type": "revoke_approvals",
  "operation_id": 7,
  "chain_id": 1,
  "explorer_url": "https://etherscan.io",
  "gas_fee_token": null,
  "rows": [ { "id": "erc20:0x…:0x…", "standard": "erc20",
              "token": "0x…", "spender": "0x…", "is_permit2": false } ]
}
```

宿主据此做 ABI 编码（`approve(spender,0)` / `setApprovalForAll(op,false)` /
`Permit2.lockdown`）与发送。核心不知道这些函数存在（research.md D6）。

### `schedule_dismiss`

```jsonc
{ "type": "schedule_dismiss", "operation_id": 8, "delay_ms": 6000 }
```

宿主 `setTimeout(delay_ms)` 后回送 `dismiss_due`。宿主**不需要**保存 timer 句柄以便取消——
取消由核心的 id 判定完成（research.md D5）。

### `fetch_chain_metadata`

```jsonc
{ "type": "fetch_chain_metadata", "operation_id": 9, "chain_id": 8453 }
```

### `load_custom_data` / `persist_custom_data`

```jsonc
{ "type": "load_custom_data", "operation_id": 1 }

{ "type": "persist_custom_data", "operation_id": 5,
  "networks": [ … ], "tokens": { "1": [ … ] }, "spenders": { "1": [ … ] } }
```

持久化整体回写，而非增量指令——核心是这三张表的**唯一真相来源**，宿主只负责落盘。

---

## 3. `RevokeShellResult` —— 宿主对请求的应答

| `type` | 字段 |
|---|---|
| `approvals_scanned` | `operation_id`, `rows: ApprovalRow[]` |
| `scan_failed` | `operation_id`, `message: string` |
| `revoke_phase_changed` | `operation_id`, `phase: SendPhase` |
| `revoke_completed` | `operation_id`, `success: boolean`, `tx_hash?: string`, `explorer_url?: string`, `error?: string` |
| `dismiss_due` | `operation_id` |
| `chain_metadata_fetched` | `operation_id`, `found: boolean`, `name?`, `symbol?`, `explorer_url?`, `rpcs: string[]`, `is_testnet: boolean` |
| `custom_data_loaded` | `operation_id`, `networks`, `tokens`, `spenders` |
| `persist_completed` | `operation_id`, `ok: boolean` |

`SendPhase` 逐字沿用宿主既有的 `SendStatus`（`apps/biubiu.tools/src/lib/auth/safe-tx/send-token.ts`）：
`checking` / `building` / `estimating` / `signing` / `submitting` / `waiting` / `confirmed` / `failed`。
八个取值全部保留 —— 少一个，页面上就少一档进度反馈，那是一次用户可见的行为变更。

**每一项都带 `operation_id`**，包括 `revoke_phase_changed` 这种纯进度通知——一次已被取代的
撤销的进度不得点亮当前的进度条。

### 关于 `ApprovalRow.unlimited`

由宿主判定并传入（research.md D4）。判定口径**必须**与迁移前一致：额度 ≥ 阈值即视为无限。
这是本次迁移中唯一一处规则留在宿主的地方，因为它是 256 位比较；把它搬进核心是后续 spec 的
候选项，届时 `allowance` 才需要成为真正的大整数类型。

---

## 4. 契约级验收

- 三个联合体的 TypeScript 镜像 100% 由 `ts-rs` 生成；`src/lib/generated/` 之外不存在等价手写
  interface（`grep` 可查）。
- 宿主的 `execute()` 是一个对 `operation.type` 的穷尽 `switch`，TypeScript 在新增 operation 时
  报未覆盖——这是「合约变更不会被静默忽略」的机制保证。
