# Contract: 批量代币发送域的 Core↔Shell 词汇表

**Feature**: `002-token-sender-core`

通用桥的约定见 [`../../001-biubiu-core-crux/contracts/bridge.md`](../../001-biubiu-core-crux/contracts/bridge.md)
——本域不改动它的任何一条。

---

## 1. `SenderEvent`

### 来自用户/页面

| `type` | 字段 |
|---|---|
| `page_ready` | — |
| `wallet_changed` | `owner: string \| null` |
| `custom_data_provided` | `networks`, `rpc_overrides`（宿主启动时回灌） |
| `set_network` | `slug` |
| `set_token_type` | `token_type` |
| `set_token_address` | `address` |
| `load_token_meta` | — |
| `set_distribution_mode` | `mode` |
| `set_recipients_text` | `text` |
| `set_total_amount_input` | `amount` |
| `parse` | — |
| `go_to_step` | `step` |
| `prepare_review` | — |
| `set_gas_fee_token` | `token: string \| null` |
| `member_proven` | `waived: bool` |
| `start_send` | `started_at_ms: number`（**时钟在宿主**） |
| `pause` | — |
| `resume` | — |
| `reset` | — |
| `add_custom_network` | `name`, `chain_id`, `rpc`, `symbol`, `explorer_tx_url?` |
| `remove_custom_network` | `slug` |
| `set_rpc_override` | `slug`, `rpcs` |
| `clear_rpc_override` | `slug` |

### 来自宿主的应答

| `type` | 字段 |
|---|---|
| `shell_completed` | `result: SenderShellResult` |

**命名字段，不是元组变体** —— 内部标签枚举套内部标签枚举会产生重复的 `type` 键且无法反序列化
（spec 001 research.md D11）。

---

## 2. `SenderOperation`

每一项携带 `operation_id`。

### `send_batch` —— 本域的主请求

```jsonc
{
  "type": "send_batch",
  "operation_id": 12,
  "batch_index": 2,
  "network_slug": "eth-mainnet",
  "chain_id": 1,
  "rpcs": ["https://…"],
  "explorer_tx_url": "https://etherscan.io/tx/",
  "multi_send_address": "0x…",
  "token_type": "erc20",
  "token_address": "0x…",
  "decimals": 18,
  "fee_wei": "1000000000000000",     // 十进制字符串
  "gas_fee_token": null,
  "recipients": [ { "address": "0x…", "amount": "1000000000000000000" } ]
}
```

宿主据此做 MultiSend 打包、ERC20 编码与钱包发送。**核心一次只发出一个这样的请求**，
下一个由上一个的结果触发（research.md D15）。

### `wait_between_batches`

```jsonc
{ "type": "wait_between_batches", "operation_id": 13, "delay_ms": 2500 }
```

宿主 `setTimeout` 后回送 `delay_elapsed`。**宿主不保存句柄、不做取消** —— 用户在间隔中暂停时，
核心把这个 id 移出在途表，到期回送因此被丢弃。与 spec 001 的自动收起同一机制。

### 其余

| `type` | 字段 | 说明 |
|---|---|---|
| `read_erc20_meta` | `operation_id`, `chain_id`, `rpcs`, `address` | 读 symbol/decimals |
| `quote_fee` | `operation_id`, `network_slug`, `is_member` | 单批费用 |
| `preflight` | `operation_id`, 网络/代币/总额/总费用 | 余额预检 |
| `load_custom_data` | `operation_id` | 自定义网络 + RPC 覆盖回灌 |
| `persist_custom_data` | `operation_id`, `networks`, `rpc_overrides` | 整表回写 |
| `persist_history` | `operation_id`, `record` | 一次发送的汇总 |
| `load_history` | `operation_id`, `limit` | |
| `verify_multi_send` | `operation_id`, `rpc` | 添加网络时校验合约是否部署 |

---

## 3. `SenderShellResult`

| `type` | 字段 |
|---|---|
| `batch_succeeded` | `operation_id`, `tx_hash`, `explorer_url?` |
| `batch_failed` | `operation_id`, `error` |
| `batch_phase_changed` | `operation_id`, `phase: SendPhase` |
| `delay_elapsed` | `operation_id` |
| `erc20_meta_read` | `operation_id`, `ok`, `symbol?`, `decimals?` |
| `fee_quoted` | `operation_id`, `amount`（十进制字符串）, `is_member` |
| `preflight_done` | `operation_id`, `ok`, `reason?`, `native_balance`, `native_needed`, `token_balance?`, `token_needed?` |
| `custom_data_loaded` | `operation_id`, `networks`, `rpc_overrides` |
| `persist_completed` | `operation_id`, `ok` |
| `history_loaded` | `operation_id`, `records` |
| `multi_send_verified` | `operation_id`, `deployed: bool` |

所有金额字段为**十进制字符串**（`JSON.stringify(1n)` 会抛异常 —— spec 001 D4）。

---

## 4. 契约级验收

- `send_batch` 的 `recipients` 已经是**该批的那一片**，宿主不做切分 —— 切分是业务规则。
- 宿主的 `execute()` 是对 `operation.type` 的穷尽 switch；新增 operation 时 TypeScript 报未覆盖。
- 宿主侧**不得**出现 `AbortController`、跨批次循环，或任何 `await` 的批间延时。
