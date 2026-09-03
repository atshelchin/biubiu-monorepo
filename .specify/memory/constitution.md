<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Ratification: first adoption; the file previously held only the unfilled Spec Kit scaffold.
- Modified principles: none (all seven are new)
- Added sections:
  - Core Principles I–VII
  - Technology Constraints
  - Development Workflow
  - Governance
- Removed sections: none
- Templates requiring no change: plan-template.md, spec-template.md, tasks-template.md,
  checklist-template.md read this file at runtime and carry no copied principle text.
- Follow-up TODOs: none
-->

# BiuBiu Monorepo Constitution

## Core Principles

### I. Core 只决定，不执行 (NON-NEGOTIABLE)

`rust/crates/biubiu-core` 拥有业务规则、业务状态与状态转换，并且**只**拥有这些。它 MUST NOT
包含网络、存储、时钟、随机数、文件系统、FFI 或任何平台 API。一次转换的全部输入是
`(Event, &mut Model)`，全部输出是 `Command` —— 要么 `render()`，要么向 Shell 声明一个
`Operation`。

`Operation` 是**句子，不是动作**：`FetchApprovals` 表示「请取回这些授权」，它不包含 URL、
超时、重试策略或 RPC 端点。这些属于 Shell。

理由：这一条不成立时，其余六条全部失效——业务规则一旦持有 I/O，就无法在没有浏览器、没有
网络、没有特定时刻的条件下被证明正确，也就无法被第二个平台复用。

### II. Shell 只做 I/O 与渲染

平台 Shell（今天是 `apps/biubiu.tools` 的 SvelteKit Web Shell）MUST 限于三件事：把用户输入
编码成 `Event`、执行 Core 请求的 `Operation`、渲染返回的 `ViewModel`。

Shell MUST NOT 持有业务状态。凡是「什么时候允许点这个按钮」「失败后回滚到哪」「哪个响应算
过期」这类判断，都是 Core 的。Shell 里出现 `if` 分支决定业务后果时，那个 `if` 属于 Core。

已经迁移的域，其 Svelte store MUST 退化为 ViewModel 的持有者：`$state` 只存 Core 返回的
视图，不再存派生结论。

### III. 陈旧响应由 Core 的相关性 ID 丢弃

每个跨 Shell 的操作 MUST 携带 Core 分配的单调 `operation_id`，并 MUST 记录在 Model 的
in-flight 表中。结果回到 Core 时，若 `operation_id` 不在表中，或其关联的目标/阶段与结果
不符，该结果 MUST 被丢弃且 MUST NOT 改变任何状态。

Shell MUST NOT 自行实现「防陈旧」计数器、代次变量或请求身份比较。

理由：现存代码里每个 store 各写了一份这类保护（例如 revoke 的 `scanGen`、fetch-coordinator
的协调逻辑），语义各不相同且无人测试。这是结构性问题，不是每处小心即可。

### IV. Core↔Shell 合约由工具生成，禁止手写

Core 与 Shell 之间的 `Event`、`ViewModel`、`Operation`、`ShellResult` 的 TypeScript 镜像
MUST 由 `ts-rs` 在 `bindings` feature 下生成，输出到 Shell 的 `generated/` 目录。

生成产物 MUST NOT 被手工编辑，MUST NOT 被 Shell 之外的代码导入，并且 MUST 在
`dev` / `build` 前自动重新生成。手写的等价 interface MUST NOT 存在。

理由：手写镜像会在 Rust 侧改动后静默漂移，而 JSON 边界不会在编译期报错。

### V. 业务规则的测试不依赖浏览器、网络与时间 (NON-NEGOTIABLE)

每条进入 Core 的业务规则 MUST 有 Rust 单测，形式为「给定 Model + Event，断言 Model / 返回的
Command」。这些测试 MUST 在 `cargo test` 下通过，且 MUST NOT 需要浏览器、网络、真实时钟或
测试替身框架。

一条规则若无法这样测试，说明它还持有 I/O，属于原则 I 的违反，MUST 先修边界再写测试。

被迁移的域，其原有 TypeScript 测试所覆盖的每一条业务断言 MUST 在 Rust 侧有对应用例；原测试
在对应用例通过前 MUST NOT 删除。

### VI. 迁移必须行为等价、可增量、可并存

迁移 MUST 逐域进行。任何一次提交后，`apps/biubiu.tools` MUST 可构建、可运行，且未迁移的域
行为不变。

一个域迁移完成的判据是**行为等价**：用户可见行为、错误文案、加载与失败状态 MUST 与迁移前
一致，除非该差异被明确记录为修复并在 spec 中列出。

「顺手改进」MUST NOT 与迁移混在同一次变更里。发现的缺陷 MUST 记录为独立条目，在等价迁移
落地后单独修。

理由：迁移与改进混合时，任何回归都无法归因——分不清是搬错了还是改错了。

### VII. 依赖成本按 feature 门控并被测量

`biubiu-core` 的 `default` feature MUST 为空。`crux`、`bindings` 等能力 MUST 是默认关闭的
可选 feature，使不启用它的消费者的依赖图中不出现对应 crate。

WASM 产物体积 MUST 有上限门禁并在 CI 中执行。一次使体积显著变化的改动，其数值 MUST 记录在
该 spec 的结果文档中，作为重新决策的依据，而不是被顺带合入。

## Technology Constraints

- **Core**: Rust，`crux_core` 0.19，`crate-type = ["lib"]`。纯逻辑，无 `wasm-bindgen` 依赖。
- **WASM Shell 桥**: 独立 crate `biubiu-core-wasm`（`crate-type = ["cdylib"]`），承载
  `wasm-bindgen` 导出与泛型 `Bridge<A>`。新增一个业务域 SHOULD 只需一个 `SplitEffect` impl
  与一行 bridge 声明。
- **平台目标**: 当前仅 Web / WASM。uniffi（iOS/Android）不在范围内，但 Core MUST NOT 引入
  会阻断未来添加它的依赖。
- **前端**: SvelteKit + Svelte 5 runes。effect loop、WASM runtime 缓存、session 创建
  MUST 是产品无关的共享模块，每个域 MUST NOT 各写一份。
- **UI**: `agent-rules/UI-DESIGN-RULES.md` 是 UI 与前端的权威标准；`CLAUDE.md` 中的
  Apple 风格设计原则（克制的阴影、≤2px 位移、无 pulse/glow）继续适用于所有 Shell 代码。
- **包管理**: bun workspaces + turbo。Rust 构建 MUST 通过 turbo 任务暴露，使
  `bun run dev:biubiu` 之类的既有入口自动包含合约生成与 WASM 构建。

## Development Workflow

- 所有工作 MUST 走 Spec Kit 流程：`/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
  → `/speckit-implement`，产物落在 `specs/<NNN>-<slug>/`。
- 每个 spec MUST 声明它迁移哪些域、不迁移哪些域，以及等价性如何验证。
- 涉及跨 Core/Shell 边界的设计决策 MUST 记录在该 spec 的 `research.md` 中，包含被否决的
  方案与否决理由。
- 提交前的门禁：`cargo test`、`cargo clippy`、前端 `check` 与既有测试套件 MUST 通过。
- Core 的每个 `pub` 类型与每条非显然的规则 MUST 有文档注释说明**为什么**存在，而不只是
  它做什么。规则若源于一次线上问题，该问题 SHOULD 被引用。

## Governance

本宪法优先于其他实践约定。与之冲突的既有代码不构成豁免，只构成待迁移项。

**修订程序**：修订 MUST 以对本文件的提交进行，并 MUST 在文件顶部的 Sync Impact Report 中
记录版本变化、受影响原则与遗留 TODO。修订 MUST 说明动机；单纯为了让某次实现通过而放宽
原则 MUST NOT 被接受——那种情况下要改的是实现。

**版本策略**（语义化版本）：
- MAJOR —— 移除原则，或以不向后兼容的方式重定义治理规则。
- MINOR —— 新增原则或章节，或实质性扩展既有指导。
- PATCH —— 澄清、措辞与排版修正，不改变语义。

**合规审查**：每个 spec 的 plan 阶段 MUST 对照本宪法做一次检查，并记录任何偏离及其理由。
复杂度 MUST 被论证：一个新增的抽象层若无法说明它替代了哪些重复，MUST NOT 引入。
运行期开发指导见 `CLAUDE.md` 与 `agent-rules/UI-DESIGN-RULES.md`。

**Version**: 1.0.0 | **Ratified**: 2026-09-03 | **Last Amended**: 2026-09-03
