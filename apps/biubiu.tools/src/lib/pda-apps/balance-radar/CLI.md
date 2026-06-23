# Balance Radar CLI

批量查询多个钱包地址在不同 EVM 链上的**原生代币和 ERC20 代币**余额，并支持**自定义网络**与**自定义 ERC20 代币**。

## 运行方式

从 monorepo 根目录或 `apps/biubiu.tools` 目录均可运行：

```bash
bun run pda:balance-radar -- [options]
```

## 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--addresses <addrs>` | 逗号分隔的钱包地址 | `"0xABC...,0xDEF..."` |
| `--networks <json>` | JSON 数组，指定查询的网络 | `'["ethereum","base"]'` |
| `--tokens <json>` | 每个网络要查询的代币（不传则只查原生币） | 见下方示例 |
| `--custom-networks <json>` | 自定义 EVM 网络数组 | 见下方示例 |
| `--addresses-file <path>` | 从文本文件读取地址（一行一个） | `wallets.txt` |
| `--config-file <path>` | 从 JSON 文件读取全部参数 | `config.json` |

> `--tokens` 是 `--tokenSelections` 的别名；`--custom-networks` 对应 schema 字段 `customNetworks`。

## 三种使用方式

### 1. 直接传参

适合地址少、临时查询的场景：

```bash
bun run pda:balance-radar -- \
  --addresses "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0x1234567890abcdef1234567890abcdef12345678" \
  --networks '["ethereum","base"]'
```

#### 查询 ERC20 代币

`--tokens` 是一个数组，为每个网络指定要查询的代币列表。每个代币是自包含的 `TokenSpec`（`kind` + `symbol` + `decimals`，ERC20 还需 `address`）：

```bash
bun run pda:balance-radar -- \
  --addresses "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" \
  --networks '["ethereum"]' \
  --tokens '[{"network":"ethereum","tokens":[
    {"kind":"native","symbol":"ETH","decimals":18},
    {"kind":"erc20","address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","symbol":"USDC","decimals":6}
  ]}]'
```

> 不传 `--tokens` 时，每个选中的网络默认只查询其原生币（向后兼容）。

#### 自定义网络

通过 `--custom-networks` 合并用户自定义链，合并后用 `custom-<chainId>` 作为网络键引用：

```bash
bun run pda:balance-radar -- \
  --addresses "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" \
  --networks '["custom-56"]' \
  --custom-networks '[{"name":"BNB Chain","chainId":56,"rpcs":["https://bsc-rpc.publicnode.com"],"symbol":"BNB","decimals":18}]'
```

### 2. 地址文件 + 参数

适合地址多的场景，地址写在文件里，其他参数在命令行指定：

```bash
bun run pda:balance-radar -- \
  --addresses-file wallets.txt \
  --networks '["ethereum","polygon"]'
```

**wallets.txt 格式：**

```
# 我的钱包
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
0x1234567890abcdef1234567890abcdef12345678

# 团队钱包
0xabcdef1234567890abcdef1234567890abcdef12
```

- 一行一个地址
- `#` 开头的行是注释，会被忽略
- 空行会被忽略

### 3. JSON 配置文件

适合参数固定、反复执行的场景，所有参数写在一个 JSON 文件里：

```bash
bun run pda:balance-radar -- --config-file config.json
```

**config.json 格式：**

```json
{
  "addresses": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0x1234567890abcdef1234567890abcdef12345678",
  "networks": ["ethereum", "base", "polygon"],
  "tokenSelections": [
    {
      "network": "ethereum",
      "tokens": [
        { "kind": "native", "symbol": "ETH", "decimals": 18 },
        { "kind": "erc20", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "symbol": "USDC", "decimals": 6 }
      ]
    }
  ],
  "customNetworks": [
    { "name": "BNB Chain", "chainId": 56, "rpcs": ["https://bsc-rpc.publicnode.com"], "symbol": "BNB", "decimals": 18 }
  ]
}
```

> `--config-file` 会覆盖所有其他参数。`config.json` 中直接使用 schema 字段名 `tokenSelections` / `customNetworks`。

## 支持的网络

| 网络 | 值 | 原生代币 |
|------|-----|---------|
| Ethereum | `ethereum` | ETH |
| Polygon | `polygon` | MATIC |
| Arbitrum | `arbitrum` | ETH |
| Optimism | `optimism` | ETH |
| Base | `base` | ETH |
| Endurance | `endurance` | ACE |

## 优先级规则

参数按以下优先级处理：

1. `--config-file` — 最高优先级，忽略其他所有参数
2. `--addresses-file` — 从文件读取地址，其他参数（如 `--networks`）从命令行读取
3. `--addresses` / `--networks` — 直接命令行参数

## 存储与恢复

CLI 使用 TaskHub 管理任务状态。如果执行中断：
- 在 Bun 环境下，任务状态保存在本地 SQLite 文件中
- 相同输入重新运行时，会自动恢复上次的进度（基于 Merkle Root 匹配）

## 相关文件

```
balance-radar/
  adapters/
    cli.ts        ← CLI 入口
    sveltekit.ts  ← GUI 入口
  executor.ts     ← 核心执行逻辑（CLI/GUI 共享）
  schema.ts       ← 输入输出 Schema
  infra/
    networks.ts   ← 支持的网络配置
    source.ts     ← 查询数据源
```
