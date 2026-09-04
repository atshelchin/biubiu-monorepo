# Implementation Plan: 发送进度跨会话持久化

**Branch**: `003-send-progress-durable` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

## Summary

把 spec 002 建立的批次表落盘，让一次上百批的发送在崩溃、刷新、切走之后仍能续上，
且**已打款的批次一个都不重发**。

三条设计支点，全部在 [research.md](./research.md)：

- **D24 持久化先于花钱**：一批的发送请求是落盘回执的**后继**，不是并发。
- **D25 在途批次恢复为 `Unknown`**，不参与自动候选；能自动确认就确认，确认不了交给用户，
  **绝不猜**。
- **D26 凭据在结果之前落盘** —— 需要加宽钱包层的进度回调把 `userOpHash` 带出来。

## Technical Context

**Language/Version**: 同前 —— Rust 1.85+ / `crux_core` 0.19 / Svelte 5。

**Primary Dependencies**: 不新增。

**Storage**: IndexedDB，与该域既有的自定义网络/历史同一套机制；**新增一个 store**，
键固定（同时只一份记录，D27）。核心仍不接触存储。

**Testing**: `cargo test`（状态机与恢复路径）+ browser-mode 集成（真 IndexedDB，
模拟崩溃 = `dispose()` 后重新 `start()`）。

**Constraints**: 十万级收件人的计划必须能落盘与恢复（约 4.5MB JSON），且**不得进入视图**
（spec 002 D23 的同一条）。

**Scale/Scope**: 一个域的增量能力。核心侧新增 1 个批次状态、4 个 operation、5 个结果；
宿主侧新增 1 个 IndexedDB store + 1 处钱包层回调加宽。

## Constitution Check

| 原则 | 本设计如何满足 | 判定 |
|---|---|---|
| **I. Core 只决定不执行** | 落盘、读盘、链上确认全是宿主请求。核心拥有的是「什么时候该落盘」「未知批次能不能自动重发」。 | PASS |
| **II. Shell 只做 I/O 与渲染** | 恢复提示的**内容**（未完成批次数、计划年龄）由核心投影；宿主只渲染。 | PASS |
| **III. 陈旧响应由相关性 ID 丢弃** | 落盘回执、确认结果都带 id。**新增一处应用**：恢复前的旧发送回执若在恢复后到达，因 id 不在新的在途表中而被丢弃。 | PASS |
| **IV. 合约由工具生成** | 沿用 `ts-rs` + 按域子目录（spec 002 §5）。 | PASS |
| **V. 测试不依赖浏览器/网络/时间** | 「崩溃」在核心测试里就是「用落盘的快照重建一个 Model」—— 纯数据，无需浏览器。链上确认已外化为请求。 | PASS |
| **VI. 行为等价、增量、并存** | 无未完成记录时行为与 spec 002 完成时逐项一致（FR-021 + SC-007）。这是一次**新增能力**，不是迁移，因此不受「不夹带改进」约束 —— 但它自己不得夹带别的改进。 | PASS |
| **VII. 依赖成本按 feature 门控并被测量** | 不新增依赖。体积增量并入门禁，实测记入 `results.md`。 | PASS |

**一处需要说明**：D26 要改钱包层（`safe-tx` 的进度回调加一个可选凭据参数）。它跨出了
token-sender 域，但**不是**对 wallet 域业务规则的改动 —— 只是把一个已经存在的值传出来。
改动点与影响面记在 tasks 的 T307，并由「其余域不受影响」的回归覆盖。

**Complexity Tracking**: 无需填写。

## Project Structure

```text
rust/crates/biubiu-core/src/app/
└── sender.rs                改：BatchState::Unknown、SendPlan 的序列化、
                               PersistSendProgress / LoadPendingSend /
                               ConfirmBatch / DiscardPendingSend 四个 operation、
                               dispatch 改为「落盘回执后才发送」

apps/biubiu.tools/src/lib/pda-apps/token-sender/
├── infra/pending-send.ts    新增：未完成记录的 IndexedDB store（键固定）
├── shell/progress.ts        新增：落盘 / 读盘 / 丢弃 / 链上确认
├── shell/send-batch.ts      改：凭据一到手就回传（D26）
├── shell/index.ts           改：四个新 operation 的路由
├── store.svelte.ts          改：恢复相关的转发
└── ../../../routes/apps/token-sender/+page.svelte
                             改：恢复提示 + 未知批次的两个显式动作

apps/biubiu.tools/src/lib/
├── wallet/types.ts          改：SendCallsOptions 的 onPhase 加可选凭据参数
├── wallet/backends/*.ts     改：把凭据透传出来
└── auth/safe-tx/send-contract-call.ts
                             改：submitting 之后把 userOpHash 交给回调
```

**Structure Decision**：未完成记录**不放进既有的 `send-history`**（D27）——
历史是已完成发送的汇总，混在一起会让「哪些能恢复」从一次读取变成一次筛选。

## 实施顺序

1. **核心：`Unknown` 与候选集**。先把「未知不参与自动续发」写成测试，再实现。
   此阶段不碰宿主，也不碰持久化。
2. **核心：落盘先于发送**。`dispatch_next_batch` 一分为二，落盘回执成为发送的前置。
3. **核心：恢复路径**。从快照重建 Model；`InFlight → Unknown`；为每个 `Unknown` 请求确认。
4. **宿主：持久化与确认**。IndexedDB store + shell 路由。
5. **宿主：凭据回传**（D26，含钱包层的回调加宽）。
6. **页面：恢复提示与裁决动作**。
7. **收尾**：模拟崩溃的集成测试、十万级恢复实测、体积、`results.md`。

## 已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| 十万级计划落盘约 4.5MB，写入耗时 | 每批前的落盘变慢，拖慢整轮 | 阶段 7 实测；若超预期，方向是「计划与批次状态分两条记录，只重写后者」 |
| 钱包层回调加宽波及其他调用点 | 其他域的发送路径编译或行为受影响 | 参数**可选**；阶段 5 后跑全量回归（含 revoke 与 wallet-sweep） |
| 外部钱包拿不到凭据 | 自动确认失效 | 已由 D25 的保底路径覆盖；用例须覆盖「无凭据」分支 |
| 恢复的计划与当前输入混用 | 发错网络 / 发错代币 | 计划在 `StartSend` 时冻结（spec 002 已有）；恢复只读快照，用例断言两者互不影响 |
