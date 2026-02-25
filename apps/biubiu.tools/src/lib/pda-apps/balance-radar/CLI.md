# Balance Radar CLI

批量查询多个钱包地址在不同 EVM 链上的原生代币余额。

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
| `--addresses-file <path>` | 从文本文件读取地址（一行一个） | `wallets.txt` |
| `--config-file <path>` | 从 JSON 文件读取全部参数 | `config.json` |

## 三种使用方式

### 1. 直接传参

适合地址少、临时查询的场景：

```bash
bun run pda:balance-radar -- \
  --addresses "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0x1234567890abcdef1234567890abcdef12345678" \
  --networks '["ethereum","base"]'
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
  "networks": ["ethereum", "base", "polygon"]
}
```

> `--config-file` 会覆盖所有其他参数。

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
