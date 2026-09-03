---

description: "Task list for 001-biubiu-core-crux"
---

# Tasks: biubiu-core 可移植业务核心 + 授权撤销试点迁移

**Input**: Design documents from `/specs/001-biubiu-core-crux/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: 必须包含。宪法原则 V 与 FR-024 要求每条业务规则有 `cargo test` 用例，且迁移前的
TypeScript 断言 100% 有等价用例。

**Organization**: 按用户故事分组。规则 ID（R-01…R-21）引用 [data-model.md](./data-model.md) §5。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无依赖）
- **[Story]**: 所属用户故事（US1–US4）

## Path Conventions

仓库根为 `/Volumes/data/production/shelchin-workspace/sveltekit-project-next/biubiu-monorepo`。
下文路径均相对仓库根。Rust 在 `rust/`，宿主在 `apps/biubiu.tools/`。

---

## Phase 1: Setup（共享基础设施）

**Purpose**: Rust workspace 就位，且不干扰既有构建

- [X] T001 创建 `rust/Cargo.toml`：workspace `resolver = "2"`，成员 `crates/biubiu-core`、
  `crates/biubiu-core-wasm`；`[workspace.package]` 定 `edition = "2024"`、`rust-version = "1.85"`；
  `[workspace.dependencies]` 作为版本单一来源，钉住 `crux_core = "0.19"`、`serde`、`serde_json`、
  `ts-rs = "12.0.1"`、`wasm-bindgen`（理由见 research.md D2，注释写进文件）
- [X] T002 [P] 创建 `rust/rust-toolchain.toml`：固定 channel 与 `targets = ["wasm32-unknown-unknown"]`
- [X] T003 [P] 更新根 `.gitignore`：`rust/target/`、
  `apps/biubiu.tools/src/lib/wasm/`、`apps/biubiu.tools/src/lib/generated/`
- [X] T004 [P] 创建 `rust/scripts/check-toolchain.mjs`：检查 rustc / wasm32 target / wasm-pack，
  缺失时打印 quickstart.md「前置条件」中的对应安装命令并以非零码退出（FR-027）

**Checkpoint**: `cd rust && cargo metadata` 成功；既有 `bun run build:biubiu` 不受影响

---

## Phase 2: Foundational（阻塞性前置）

**Purpose**: 泛型桥 + 宿主泵 + 构建接线。**这一层写完之后，新增任何业务域都不应再改动它。**

**⚠️ CRITICAL**: 未完成前，任何用户故事都不能开始

### Rust 侧

- [X] T005 创建 `rust/crates/biubiu-core/Cargo.toml`：`crate-type = ["lib"]`；`default = []`；
  可选 feature `crux = ["dep:crux_core"]`、`bindings = ["dep:ts-rs", "crux"]`、`devtools = []`；
  `[[bin]] generate_bindings` 带 `required-features = ["bindings"]`（原则 VII）
- [X] T006 创建 `rust/crates/biubiu-core/src/lib.rs`：组合根，只做模块装配，不含业务逻辑
- [X] T007 创建 `rust/crates/biubiu-core/src/app/mod.rs`：定义 `SplitEffect` trait
  （`type Op: Operation; fn into_shell(self) -> Option<Request<Self::Op>>`），使桥能在不了解任何
  业务域的前提下区分 render 与 shell 请求（contracts/bridge.md §2 B-3）
- [X] T008 创建 `rust/crates/biubiu-core-wasm/Cargo.toml`：`crate-type = ["cdylib"]`，依赖
  `biubiu-core` 并启用 `crux` feature
- [X] T009 创建 `rust/crates/biubiu-core-wasm/src/bridge.rs`：泛型 `Bridge<A>`，实现
  `dispatch` / `resolve_effect` / `view`，单调分配 `effect_id`，并落实 contracts/bridge.md §2 的
  B-1 与 B-2（未知 id ⇒ 返回当前视图、不改状态）
- [X] T010 创建 `rust/crates/biubiu-core-wasm/src/lib.rs`：`bridge_class!` 宏，把泛型 `Bridge<A>`
  包装为一个 `#[wasm_bindgen]` 导出类；每个业务域一行声明
- [X] T011 创建 `rust/crates/biubiu-core/src/bin/generate_bindings.rs`：用 `ts-rs` 的
  `export_all` 递归导出到 `apps/biubiu.tools/src/lib/generated/`

### 宿主侧（产品无关的泵，contracts/bridge.md §3–§5）

- [X] T012 [P] 创建 `apps/biubiu.tools/src/lib/crux/effect-loop.ts`：`start` / `dispatch` /
  `resolve` / `dispose`，AbortController 表，读取 `cancelled_effect_ids`。**不得包含任何业务
  判断、请求编号或新旧响应比较**
- [X] T013 [P] 创建 `apps/biubiu.tools/src/lib/crux/wasm-runtime.ts`：整个标签页共用一个 WASM
  模块实例，缓存 Promise，加载失败时清空缓存以便重试
- [X] T014 创建 `apps/biubiu.tools/src/lib/crux/json-wasm-shell.ts`：JSON 编解码适配层，
  可选透传 `debug_snapshot`（依赖 T012）
- [X] T015 创建 `apps/biubiu.tools/src/lib/crux/create-crux-session.ts`：暴露
  `createCruxSession({ createCore, initialEvent, onView, execute, toFailure })`（依赖 T013、T014）

### 构建接线

- [X] T016 修改 `apps/biubiu.tools/package.json`：新增 `bindings:generate`、`wasm:build`、
  `wasm:build:dev`；`dev` 与 `build` 前置对应的 wasm 任务（FR-006）
- [X] T017 修改 `turbo.json`：新增 `wasm` 任务并让 `build` 依赖它；输出目录纳入缓存键
- [X] T018 创建 `rust/scripts/check-wasm-size.mjs`：读取 release 产物字节数，打印实际值；
  上限值先留空占位，由 T045 依实测设定（research.md D8）
- [X] T019 端到端打通验证：临时加一个最小占位域（一个 Event、一个 Operation、一个 ViewModel），
  在一个临时路由上跑通 `Event → Operation → ShellResult → ViewModel` 一整圈，确认桥、泵与构建
  接线可用；**验证通过后删除该占位域与临时路由**
- [X] T020 在 preview（二进制）模式下验证 WASM 资源可加载：`bun run build:biubiu &&
  bun run preview:biubiu`，打开占位路由。失败则改走 `vite-plugin-arraybuffer` 内联退路，并把
  结论补进 research.md D7（plan.md「已知风险」第 1 项）

**Checkpoint**: 桥与泵可用且已在真实构建产物中验证；此后新增业务域不再触碰 Phase 2 的文件

---

## Phase 3: User Story 1 — 业务规则可在无浏览器条件下被证明（P1）🎯 MVP

**Goal**: 授权撤销域的全部业务规则进入核心，并可用一条不联网、无浏览器的命令验证

**Independent Test**: `cargo test -p biubiu-core --features crux` 全绿且 < 10 秒
（quickstart.md 验证 1）。此阶段**完全不碰宿主代码**——核心应在页面接线之前就被证明正确。

### 类型与骨架

- [X] T021 [US1] 创建 `rust/crates/biubiu-core/src/app/revoke.rs` 的值类型：`ApprovalRow`、
  `Network`、`TokenEntry`、`SpenderEntry`、`TokenStandard`、`SpenderKind`、`RowFilter`、
  `ScanState`、`Notice`（data-model.md §2）。`allowance` 为十进制 `String`，不做算术（research D4）
- [X] T022 [US1] 定义 `RevokeModel` 与 `InFlightOp`，含 `in_flight: BTreeMap<u64, InFlightOp>` 与
  `next_operation_id`（data-model.md §1）
- [X] T023 [US1] 定义 `RevokeEvent`、`RevokeOperation`、`RevokeShellResult`，字段与
  contracts/revoke.md §1–§3 逐项一致；宿主应答统一经 `shell_completed` 单一入口
- [X] T024 [US1] 定义 `RevokeEffect`（`#[effect]`）与 `RevokeViewModel`（data-model.md §3），
  并为 `RevokeEffect` 实现 `SplitEffect`
- [X] T025 [US1] 内置网络常量表与内置代币/授权方注册表：从
  `apps/biubiu.tools/src/lib/pda-apps/revoke/infra/networks.ts`、`registry/tokens.ts`、
  `registry/spenders.ts` 逐条搬入，**不得改动任何取值**

### 测试先行（写完应当失败）

- [X] T026 [P] [US1] R-01 / R-02 / R-03 / R-04 的用例：陈旧扫描结果、交错扫描、陈旧扫描失败、
  较早扫描不得清除加载态。逐条对照
  `apps/biubiu.tools/src/lib/pda-apps/revoke/store.svelte.spec.ts` 的 5 个既有断言（FR-024）
- [X] T027 [P] [US1] R-05 / R-06 / R-21 的用例：自动扫描去重键、切链清空集合、
  `Scanning` 与在途 `Scan` 条目的同生共死不变量
- [X] T028 [P] [US1] R-07 / R-19 / R-20 的用例：筛选与全选可见、行标识格式、排序规则
- [X] T029 [P] [US1] R-08 / R-09 / R-10 / R-13 的用例：撤销并发忽略、空集合不发请求、
  成功后移除行与选中项、撤销期间切链后结果被丢弃
- [X] T030 [P] [US1] R-11 / R-12 的用例：成功排期收起、失败不排期、手动关闭后 `dismiss_due`
  被丢弃。**用例中不得出现任何 sleep**——时钟已外化为请求（research D5）
- [X] T031 [P] [US1] R-14 / R-15 / R-16 / R-17 / R-18 的用例：持久化失败不回滚、自定义条目变更
  触发重扫、已存在的链直接选中、无 RPC 返回 `need-rpc`、移除当前网络回退默认

### 实现

- [X] T032 [US1] 实现 `update()` 的扫描分支（data-model.md §4.1）：`set_network` /
  `wallet_changed` / `page_ready` / `request_scan`，以及扫描结果的 in_flight 判定与丢弃
- [X] T033 [US1] 实现 `update()` 的选择与筛选分支：`set_filter` / `toggle_row` /
  `select_all_visible` / `clear_selection` / `set_gas_fee_token`
- [X] T034 [US1] 实现 `update()` 的撤销分支（data-model.md §4.2）：`revoke_one` /
  `revoke_selected` / 阶段更新 / 完成处理 / `schedule_dismiss` 排期 / `dismiss_due` /
  `dismiss_notice`
- [X] T035 [US1] 实现 `update()` 的自定义条目分支（data-model.md §4.3）：增删代币/授权方、
  按 chainId 加网络、移除网络、启动回灌、持久化结果处理
- [X] T036 [US1] 实现 `view()`：投影出 `ApprovalRowView` 的 `is_selected` / `is_pending`、
  `can_scan` / `can_revoke_selected` / `send_supported` 等派生结论；**`in_flight`、
  `next_operation_id`、`last_scan_key` 不得出现在 ViewModel 中**
- [X] T037 [US1] 在 `devtools` feature 下加一份脱敏 `DebugSnapshot`（暴露在途表与计数器），
  release 构建不含
- [X] T038 [US1] 在 `biubiu-core-wasm/src/lib.rs` 中用 `bridge_class!` 导出 `RevokeCore`，
  并跑通 `bun run --cwd apps/biubiu.tools bindings:generate`（quickstart.md 验证 2）

**Checkpoint**: `cargo test -p biubiu-core --features crux` 全绿；T026–T031 的用例全部通过；
`src/lib/generated/` 出现 4 个联合体的 TS 镜像

---

## Phase 4: User Story 2 — 授权撤销的用户可见行为完全不变（P1）

**Goal**: 宿主接上核心，页面行为逐项等价

**Independent Test**: quickstart.md 验证 3 的 11 项逐项通过

### Shell operation 路由（唯一的 I/O 处）

- [X] T039 [P] [US2] 创建 `apps/biubiu.tools/src/lib/pda-apps/revoke/shell/scan.ts`：执行
  `scan_approvals`，复用既有 `infra/multicall.ts`。**注册表合并去重已由核心完成**，本处不再查
  注册表；`unlimited` 的判定口径必须与迁移前一致（contracts/revoke.md §3）
- [X] T040 [P] [US2] 创建 `shell/revoke.ts`：执行 `revoke_approvals`，复用既有 `core/revoke.ts`
  的 `buildRevokeCall` 与 `walletStore.sendCalls`；把 `onPhase` 回调转成
  `revoke_phase_changed` 结果（带 operation_id）
- [X] T041 [P] [US2] 创建 `shell/custom-data.ts`：执行 `load_custom_data` / `persist_custom_data`，
  复用既有 `infra/custom-store.ts`
- [X] T042 [P] [US2] 创建 `shell/chain-metadata.ts`：执行 `fetch_chain_metadata`，复用既有的
  ethereum-data 取数与 `extractRpcUrls`
- [X] T043 [US2] 创建 `shell/index.ts`：对 `operation.type` 的**穷尽 switch**（新增 operation 时
  TypeScript 报未覆盖），含 `schedule_dismiss` 的 `setTimeout` —— 其回调只做一件事：回送
  `dismiss_due`，**不保存句柄、不做取消**（research D5）

### store 与页面

- [X] T044 [US2] 改写 `apps/biubiu.tools/src/lib/pda-apps/revoke/store.svelte.ts`：退化为
  ViewModel 持有者 + `dispatch` 转发。删除 `scanGen`、`lastScanKey`、`successTimer` 与所有派生
  getter（FR-023）
- [X] T045 [US2] 改写 `apps/biubiu.tools/src/routes/apps/revoke/+page.svelte`：消费 ViewModel，
  把交互编码为 Event。模板中不得再出现 `selectedIds.includes(...)` 之类的集合查找
- [X] T046 [US2] 逐项执行 quickstart.md 验证 3 的 11 项并记录结果；差异逐条归因为「搬错了」
  或「记录为缺陷」（FR-026 禁止在本次修复）

**Checkpoint**: 撤销页面行为与迁移前逐项一致

---

## Phase 5: User Story 4 — 未迁移的域不受影响（P1）

**Goal**: 其余 14 个工具应用行为与构建方式不变

**Independent Test**: quickstart.md 验证 4

- [X] T047 [US4] `bun run build:biubiu && bun run preview:biubiu`，逐一打开 `/apps/*` 下的其余
  14 个页面确认可用
- [X] T048 [US4] 在二进制模式下打开 `/apps/revoke` 确认 WASM 加载正常（T020 的结论在真实域上
  复验）
- [X] T049 [US4] 跑既有测试套件：`bun run --cwd apps/biubiu.tools test:unit -- --run`，确认
  非 revoke 的用例全部不受影响
- [X] T050 [US4] 确认缺少 Rust 工具链时 `bun run dev:biubiu` 给出可执行指引而非原始构建错误
  （临时重命名 `wasm-pack` 复现，FR-027）

**Checkpoint**: 增量与并存成立（宪法原则 VI）

---

## Phase 6: User Story 3 — 新增一个业务域的成本可预期（P2）

**Goal**: 把接入下一个域的步骤写清楚，并由 revoke 的实际过程验证清单完整

**Independent Test**: 按文档清单逐条核对 revoke 的接入过程，无遗漏步骤

- [X] T051 [US3] 创建 `rust/README.md`：workspace 布局、feature 含义、常用命令、
  「新增一个业务域」的分步清单（Rust 侧：一个 `app/<domain>.rs` + 一个 `SplitEffect` impl +
  一行 `bridge_class!`；宿主侧：一个 `shell/` 路由 + 一次 `createCruxSession` 声明）
- [X] T052 [US3] 核对该清单：接入 revoke 的过程中，Phase 2 的文件是否被改动过。若被改动，
  说明该改动本应属于 Phase 2 的通用能力，补进 T051 的清单或回补到通用层（SC-007）
- [X] T053 [P] [US3] 更新根 `CLAUDE.md`：加一节说明业务逻辑的归属边界（哪些进核心、哪些留
  宿主），指向本 spec 与宪法

---

## Phase 7: Polish & 收尾

- [X] T054 删除被核心取代的宿主代码：`store.svelte.spec.ts` 中已由 R-01…R-04 覆盖的 5 个用例
  （**必须在这些 Rust 用例通过之后**，FR-024）
- [X] T055 依 T018 打印的实测值设定 `check-wasm-size.mjs` 的上限（实测 × 1.3），并使其在超限时
  失败（research D8）
- [X] T056 创建 `specs/001-biubiu-core-crux/results.md`：记录 release wasm 实测字节数、
  `store.svelte.ts` 迁移前后行数对照（quickstart.md 验证 5）、T046 中发现但未修的缺陷清单
- [X] T057 [P] `cargo clippy -p biubiu-core --features crux -- -D warnings` 与
  `cargo fmt --check` 通过
- [X] T058 [P] `bun run --cwd apps/biubiu.tools check` 通过
- [X] T059 完整跑一遍 quickstart.md 的 6 组验证并逐项记录结果

---

## Dependencies & Execution Order

### Phase 依赖

- **Phase 1 Setup**：无依赖
- **Phase 2 Foundational**：依赖 Phase 1；**阻塞所有用户故事**
- **Phase 3 (US1)**：依赖 Phase 2。可独立完成并交付价值（规则可测），此时页面尚未改动
- **Phase 4 (US2)**：依赖 Phase 3——核心未被证明正确之前不接线
- **Phase 5 (US4)**：依赖 Phase 4（验证的是接线后的全局状态）
- **Phase 6 (US3)**：依赖 Phase 4（清单要由真实接入过程验证）
- **Phase 7 Polish**：依赖 Phase 3–6

### 用户故事依赖

- **US1 (P1)**：Phase 2 后即可开始，不依赖其他故事。**它是 MVP**——完成后「业务规则可在无浏览器
  条件下证明」已经成立，即使页面还没接
- **US2 (P1)**：依赖 US1。这是本 spec 中唯一一处故事间的硬依赖，且是刻意的：先证明后接线
- **US4 (P1)**：依赖 US2 落地后才有意义
- **US3 (P2)**：依赖 US2 的实际经验

### 并行机会

- T002 / T003 / T004 可并行
- T012 / T013 可并行（T014、T015 依赖它们）
- **T026–T031 六个测试任务可完全并行**（不同的测试模块，无共享可变状态）
- T039 / T040 / T041 / T042 可并行（四个独立文件；T043 依赖全部）
- T057 / T058 可并行

### 每个故事内部

- 测试先写并确认失败，再实现（T026–T031 先于 T032–T036）
- 值类型先于 Model，Model 先于 `update()`，`update()` 先于 `view()`
- 核心完成后才接宿主

---

## Parallel Example: User Story 1 的测试

```bash
# 六组规则测试可同时开写（不同模块、无共享状态）
Task: "R-01…R-04 陈旧响应用例"            # T026
Task: "R-05/R-06/R-21 扫描去重与不变量"    # T027
Task: "R-07/R-19/R-20 筛选、标识、排序"    # T028
Task: "R-08/R-09/R-10/R-13 撤销策略"      # T029
Task: "R-11/R-12 提示收起（无 sleep）"     # T030
Task: "R-14…R-18 自定义条目"              # T031
```

---

## Implementation Strategy

### MVP 优先（US1）

1. Phase 1 Setup
2. Phase 2 Foundational（**关键，阻塞一切**）
3. Phase 3 US1
4. **停下来验证**：`cargo test -p biubiu-core --features crux` 全绿且 < 10 秒
5. 此时价值已经交付——那 21 条规则第一次成为可执行的断言，而页面一行未改

### 增量交付

1. Setup + Foundational → 骨架就位（含二进制模式的 wasm 加载已验证）
2. US1 → 规则可证明 → **可停可交**
3. US2 → 页面接上核心 → 行为等价逐项核对
4. US4 → 确认其余 14 个域不受影响
5. US3 → 沉淀接入清单，为下一个域降本

### 下一个 spec 的候选（不在本次范围）

按「状态机清晰度 × 与钱包耦合度」排序，建议顺序：
`token-sender` → `wallet-sweep` → `balance-radar` / `event-scanner` → `updown-shared` →
`wallet` / `auth` / `subscription`（最后做，因为它们被其余全部域依赖）。

---

## Notes

- `[P]` = 不同文件、无依赖
- 每个任务或每组逻辑相关的任务后提交一次
- **迁移中发现的缺陷只记录不修**（FR-026）——修复属于后续独立变更
- 任何时候若发现某条规则的测试需要 sleep、网络或浏览器，停下来修边界，不要给测试加超时
