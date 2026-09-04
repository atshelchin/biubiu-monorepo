---

description: "Task list for 003-send-progress-durable"
---

# Tasks: 发送进度跨会话持久化

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)

**通用层不动**：spec 001 建立的桥与宿主泵 MUST NOT 被改动。

---

## Phase 1: 核心 —— `Unknown` 与候选集 🎯 资金安全的地基

- [X] T301 [P] 测试先行：`Unknown` 不参与自动续发；`Unknown` 只能由恢复产生
- [X] T302 [P] 测试先行：用户裁决 —— 「重发这一批」⇒ Failed；「标记完成」⇒ Succeeded 且不发送
- [X] T303 `BatchState::Unknown { hint }`；`next_pending_index` 的候选集**不含**它
- [X] T304 `MarkBatchUnsent` / `MarkBatchDone` 两个事件与它们的转移

**Checkpoint**: 未知批次拿不到自动发送请求

---

## Phase 2: 核心 —— 落盘先于发送

- [X] T305 测试先行：批次请求晚于该批的落盘回执；落盘失败 ⇒ 不发送且暂停
- [X] T306 `PersistSendProgress` operation 与 `ProgressPersisted` 结果；
  `dispatch_next_batch` 一分为二（选批 + 落盘 → 回执后发送）

**Checkpoint**: 每一批的发送都有一次先行的落盘

---

## Phase 3: 核心 —— 恢复

- [X] T307 [P] 测试先行：从快照重建（已成功不重发、InFlight → Unknown、为 Unknown 请求确认）
- [X] T308 [P] 测试先行：确认的三个分支（成功 / 未上链 / 确认不了）
- [X] T309 `SendSnapshot` 线类型（计划 + 批次状态 + 起始时间）与它的序列化
- [X] T310 `LoadPendingSend` / `ConfirmBatch` / `DiscardPendingSend` 三个 operation 与其结果
- [X] T311 `PageReady` 时读盘；`PendingSendLoaded` 的恢复转移；全部终态后请求清理
- [X] T312 `view()` 投影恢复提示（未完成批次数、计划年龄、未知批次清单）；
  **收件人清单不进视图**

**Checkpoint**: `cargo test` 覆盖 SC-001 / SC-002 / SC-003 / SC-004

---

## Phase 4: 宿主 —— 持久化与确认

- [X] T313 [P] `infra/pending-send.ts`：固定键的 IndexedDB store（读/写/删）
- [X] T314 [P] `shell/progress.ts`：落盘 / 读盘 / 丢弃 / 链上确认
- [X] T315 `shell/index.ts`：四个新 operation 的穷尽分支 + `toFailure`
  （落盘失败与确认失败各自对应一个核心认识的结果）

---

## Phase 5: 宿主 —— 凭据回传（D26）

- [X] T316 `auth/safe-tx/send-contract-call.ts`：`submitting` 之后把 `userOpHash` 交给回调
- [X] T317 `wallet/types.ts` 的 `onPhase` 加**可选**凭据参数；各后端透传
- [X] T318 `shell/send-batch.ts`：凭据一到手就作为 `batch_hint_available` 回传核心
- [X] T319 全量回归：其他域的发送路径（revoke、wallet-sweep）不受影响

---

## Phase 6: 页面

- [X] T320 恢复提示：未完成批次数 + 计划年龄 + 「继续」/「丢弃」
- [X] T321 未知批次的两个显式动作，文案明确说明「系统无法确认这一批是否到账」

---

## Phase 7: 收尾

- [X] T322 集成测试：**模拟崩溃**（`dispose()` 后重新 `start()`）后恢复，
  断言已成功批次的发送请求数为 0
- [X] T323 集成测试：在途批次恢复为未知，自动续发不碰它
- [X] T324 十万级计划的落盘与恢复实测（plan.md 风险 1）
- [X] T325 体积实测 + 门禁重设
- [X] T326 `results.md`：判据核对、发现但未修
- [X] T327 clippy / fmt / svelte-check / 全量测试

---

## Dependencies

- Phase 1 是地基：`Unknown` 的候选集语义错了，后面全白做
- Phase 2 依赖 Phase 1 的类型；Phase 3 依赖 1+2
- Phase 4 依赖 Phase 3 的合约；Phase 5 可与 4 并行
- Phase 6 依赖 3+4；Phase 7 依赖全部

### 并行

T301/T302、T307/T308、T313/T314 各自可并行。

## Notes

- **测试先行不是形式**：T301 与 T305 锁的是资金安全，实现之后补写的断言会不自觉地
  迁就实现
- 本 feature 是**新增能力**，不受「迁移不夹带改进」约束；但它自己不得夹带别的改进
