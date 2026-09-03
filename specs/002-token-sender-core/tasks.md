---

description: "Task list for 002-token-sender-core"
---

# Tasks: 批量代币发送域迁移

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/sender.md](./contracts/sender.md)

**Tests**: 必须包含。规则 ID（S-01…S-24）引用 [data-model.md](./data-model.md) §5。

**通用层不动**：spec 001 建立的桥与宿主泵在本 spec 中 MUST NOT 被改动（FR-021）。

---

## Phase 1: 核心状态机（US1 / US2）🎯 MVP

**Goal**: 批次编排从阻塞循环变成状态机，资金安全规则可测

**Independent Test**: `cargo test -p biubiu-core --features crux sender` 全绿；
此阶段完全不碰宿主。

### 类型

- [X] T101 `app/sender.rs` 值类型：`WizardStep`、`TokenType`、`DistributionMode`、`Network`、
  `TokenMeta`、`Recipient`、`FeeQuote`、`PreflightResult`、`SendPhase`、`SendRecord`
- [X] T102 `SendState` / `SendPlan` / `BatchState`（data-model.md §2）与 `SenderModel`、`InFlightOp`
- [X] T103 `SenderEvent` / `SenderOperation` / `SenderShellResult`，字段与 contracts/sender.md 一致；
  `ShellCompleted` 用**命名字段**（spec 001 D11）
- [X] T104 `SenderEffect` + `SplitEffect` 实现（3 行）

### 资金安全测试先行（写完应当失败）

- [X] T105 [P] **S-01 / S-02**：续发不为已成功批次发请求；`Succeeded` 是终态
- [X] T106 [P] **S-03 / S-04**：至多一个批次在途；每批费用与首轮一致
- [X] T107 [P] S-05 / S-06 / S-07：暂停不发新批；暂停后到达的结果仍被记录；
  暂停使在途延时立即失效（**用例中不得有 sleep**）
- [X] T108 [P] S-08 / S-09 / S-21 / S-22：失败不中止整轮；全成后为 Done；
  空收件人不发请求；每批上限为 0 时按 1 处理

### 实现

- [X] T109 `dispatch_next_batch()` 与 `next_pending_index()`（data-model.md §3.1）
- [X] T110 `update()` 的发送分支：`start_send` / `pause` / `resume` / 三个批次结果 / `delay_elapsed`
- [X] T111 `view()` 的发送投影：**只投影摘要 + 当前批，不投影全部收件人**（plan.md 风险 2）

**Checkpoint**: S-01…S-09、S-21、S-22 全绿；核心中不存在跨批次循环

---

## Phase 2: 解析、网络表与向导（US3 / US4）

- [X] T112 [P] `app/sender_networks.rs`：内置网络表**由脚本从 `infra/networks.ts` 生成**，
  取值不得改动（research.md D19）
- [X] T113 [P] S-10…S-13 的用例：注释/空行、重复只计数不入 invalid、四类非法原因、均分余尘
- [X] T114 `app/sender_parse.rs`：实现解析，逐条对照 `core/parse.ts` 及其 145 行既有测试
- [X] T115 [P] S-14 / S-15 / S-16 / S-17 的用例：批次数、总费用、会员归零、证明后重算
- [X] T116 [P] S-18 / S-19 / S-20 / S-23 / S-24 的用例：切链清空、两步的可推进条件、
  历史状态判定、历史写入失败不影响呈现
- [X] T117 `update()` 的向导/费用/自定义网络分支；`view()` 的派生量（data-model.md §3.2 表）
- [X] T118 `devtools` 快照 + `bridge_class!(SenderCore, …, debug)` + 契约生成

**Checkpoint**: S-01…S-24 全绿；`src/lib/generated/` 出现该域的四个联合体

---

## Phase 3: 宿主接线（US4）

- [X] T119 [P] `shell/wire.ts`：形状转换（bigint ⇄ 十进制字符串、camelCase ⇄ snake_case）
- [X] T120 [P] `shell/send-batch.ts`：复用 `buildBatchSubTransactions` + `wallet.sendBatch`；
  进度回调转成带 id 的 `batch_phase_changed`
- [X] T121 [P] `shell/token-meta.ts` / `shell/fee.ts` / `shell/preflight.ts`
- [X] T122 [P] `shell/custom-data.ts` / `shell/history.ts`
- [X] T123 `shell/index.ts`：穷尽 switch + `toFailure`；`wait_between_batches` 的 `setTimeout`
  **不保存句柄、不做取消**
- [X] T124 改写 `store.svelte.ts` 为 ViewModel 持有者；删除 `AbortController`、批次循环、
  `await` 延时与全部派生 getter
- [X] T125 改写页面与相关组件为消费 ViewModel
- [X] T126 browser-mode 集成测试（沿用 spec 001 的形态）：替身只放在 `wallet` 与读链两处，
  覆盖 US1/US2 的全部验收场景

**Checkpoint**: 页面行为逐项等价

---

## Phase 4: 未迁移域不受影响 + 收尾

- [X] T127 构建 + 逐一打开 15 条路由 + 既有测试套件全绿（含 revoke 域不受影响）
- [X] T128 删除被核心取代的宿主代码与其测试（在等价用例通过之后）
- [X] T129 **十万级收件人的往返成本实测**（plan.md 风险 1）；超预期则记为独立条目
- [X] T130 体积实测 + 门禁重设 + 与 spec 001 的数值并列判读（research.md D20）
- [X] T131 `results.md`：判据核对、行数对照、发现但未修的缺陷（含**进度持久化**这一项）
- [X] T132 clippy / fmt / svelte-check 通过
- [X] T133 核对 spec 001 的通用层是否被改动过（SC-007）；若有，回补为通用能力

---

## Dependencies

- Phase 1 是 MVP：状态机建立、资金安全规则可测，此时页面一行未改
- Phase 2 依赖 Phase 1 的类型；T114 依赖 T113（测试先行）
- Phase 3 依赖 Phase 1+2 —— **核心被证明正确之前不接线**
- Phase 4 依赖 Phase 3

### 并行

- T105–T108 四个测试任务可完全并行
- T112 与 T113 可并行
- T119–T122 四个 shell 文件可并行（T123 依赖全部）

## Notes

- **T105/T106 先于 T109/T110**：资金安全的断言不该在实现之后才补
- 迁移中发现的缺陷只记录不修（FR-019），**包括进度持久化**
- 任何时候若发现某条规则的测试需要 sleep、网络或浏览器，停下来修边界
