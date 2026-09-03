# Implementation Plan: 批量代币发送域迁移 —— 阻塞循环变状态机

**Branch**: `002-token-sender-core` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

## Summary

把 `token-sender` 迁入 `biubiu-core`。与 revoke 不同，本域的难点不是陈旧响应，而是**形态**：
`runSend` 是一条从头持有到尾的阻塞执行流，进度只存在内存。迁移把它变成状态机 —— 核心持有一张
批次表，一次只请求一批，由结果推进到下一批。

「不重发已成功批次、不重复收费」这条金钱安全规则，因此从循环里的一行 `continue` 变成
`Succeeded` 不在候选集里的结构性保证。

技术决策见 [research.md](./research.md)（D15–D20，承接 spec 001 的 D1–D14）。

## Technical Context

**Language/Version**: 同 spec 001 —— Rust 1.85+（edition 2024）、`crux_core` 0.19、Svelte 5。

**Primary Dependencies**: 不新增。核心侧的金额加总用 `i128`/`u128`，不引入大整数 crate
（单笔金额与总额以十进制字符串过界，research.md D4）。

**Storage**: 核心无存储。自定义网络、RPC 覆盖、发送历史由宿主经 IndexedDB 读写。
**发送进度的持久化不在本次范围内**（FR-019）。

**Testing**: `cargo test -p biubiu-core --features crux`；宿主侧沿用 spec 001 建立的
browser-mode 集成测试形态。

**Target Platform**: 仅 Web / `wasm32-unknown-unknown`。

**Constraints**: 每批一次 passkey 确认，**串行**是产品要求 —— 核心任一时刻至多一个批次在途。
批间约 2.5 秒间隔由核心声明、宿主计时。

**Scale/Scope**: 迁移前宿主侧 531 行 store + 196 行 orchestrator + 127 行 parse。
设计文档提到十万级收件人，本次不改变解析的同步性质，但**须实测**跨 WASM 边界的往返成本。

## Constitution Check

| 原则 | 本设计如何满足 | 判定 |
|---|---|---|
| **I. Core 只决定不执行** | MultiSend 打包、ERC20 编码、钱包签名、余额读取、`setTimeout` 全在宿主。核心不含循环也不含时钟 —— `started_at_ms` 由宿主随事件提供。 | PASS |
| **II. Shell 只做 I/O 与渲染** | 宿主的 `AbortController`、批次循环、`await` 延时全部消失；`execute()` 是穷尽 switch。 | PASS |
| **III. 陈旧响应由相关性 ID 丢弃** | 沿用 spec 001 的在途表。本域新增一处应用：暂停时把批间延时移出表，其到期回送被丢弃。 | PASS |
| **IV. 合约由工具生成** | `ts-rs`，与 spec 001 同一条流水线，不新增机制。 | PASS |
| **V. 测试不依赖浏览器/网络/时间** | S-01…S-24 全部为 `cargo test`。批间延时已外化为请求，因此「暂停使间隔失效」的测试不需要等 2.5 秒。 | PASS |
| **VI. 行为等价、增量、并存** | 只动 token-sender；FR-019 明确把**进度持久化**排除在外，尽管迁移后修它会变得容易 —— 那是下一个 spec。 | PASS |
| **VII. 依赖成本按 feature 门控并被测量** | 不新增依赖；体积第二数据点是本 spec 的一项交付（SC-008）。 | PASS |

**一处需要说明但不构成偏离**：`getAddress`（EIP-55 校验和）留在宿主。核心需要的只是「地址是否
合法」与「小写形式用于去重」，两者都不需要 keccak256。判据与 spec 001 对 `unlimited` 的处理相同
（research.md D17）。

**Complexity Tracking**: 无需填写。

## Project Structure

```text
rust/crates/biubiu-core/src/app/
├── mod.rs                    改：加一行 pub mod sender
├── sender.rs                 新增：Model/Event/Operation/ShellResult/update/view + 业务单测
├── sender_parse.rs           新增：收件人解析（规则密集，单独成文件便于对照迁移前）
└── sender_networks.rs        新增：内置网络表（本域自己的数据，research.md D19）

rust/crates/biubiu-core-wasm/src/lib.rs   改：一行 bridge_class!(SenderCore, …, debug)
rust/crates/biubiu-core/src/bin/generate_bindings.rs  改：加该域的导出根

apps/biubiu.tools/src/lib/pda-apps/token-sender/
├── shell/                    新增：operation 路由（唯一的 I/O 处）
│   ├── index.ts                穷尽 switch + toFailure
│   ├── send-batch.ts           复用既有 core/orchestrator 的 buildBatchSubTransactions + wallet
│   ├── token-meta.ts           复用 core/wallet.ts 的 getErc20Meta
│   ├── fee.ts                  复用 core/fee.ts + subscription
│   ├── preflight.ts            复用 core/orchestrator.ts 的 preflight
│   ├── custom-data.ts          复用 infra/custom-store.ts
│   ├── history.ts              复用 history/send-history.ts
│   └── wire.ts                 形状转换
├── store.svelte.ts           改：退化为 ViewModel 持有者
├── core/ infra/ history/      保留：被 shell/ 调用的纯 I/O
└── (parse.ts / orchestrator 的编排部分在 T-收尾 阶段删除)
```

**Structure Decision**：解析与网络表各自成文件。解析规则密集且必须逐字对照迁移前，混进
`sender.rs` 会让那份对照难以进行；网络表是数据，与规则分开。

## 实施顺序

1. **核心类型与状态机**：Model / Event / Operation / ShellResult / `SendState` 的转移。
   此阶段不碰宿主。
2. **规则测试**：S-01…S-24。**S-01/S-02/S-03 先写** —— 它们是资金安全，不该在实现之后才补。
3. **解析与网络表**：`sender_parse.rs`（对照 `core/parse.ts` 与其 145 行既有测试）、
   `sender_networks.rs`（脚本生成，不手抄）。
4. **宿主接线**：`shell/` 路由、store 改写、页面改写。
5. **收尾**：删除被取代的宿主代码、体积实测与门禁重设、`results.md`。

## 已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| 十万级收件人跨 WASM 边界的往返成本 | 解析变慢或内存峰值 | 阶段 3 结束时实测；超预期则记录为独立条目（方向：分块解析、或只回传摘要） |
| 批次表在收件人极多时使 ViewModel 变大 | 每次 render 都序列化整张表 | 视图只投影**摘要 + 当前批**，不投影全部收件人；由 S-03 之外的一条断言把关 |
| 「至多一个批次在途」被将来的并发需求打破 | 上百个 passkey 弹窗 | 写成不变量测试（S-03），改动它必须先改测试 |
| 体积增量接近 revoke | 后续 12 个域会线性放大 | 数值出来再判读（research.md D20），不提前假设 |
