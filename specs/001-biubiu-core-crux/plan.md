# Implementation Plan: biubiu-core 可移植业务核心 + 授权撤销试点迁移

**Branch**: `001-biubiu-core-crux` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-biubiu-core-crux/spec.md`

## Summary

在 monorepo 中建立一个 Rust Cargo workspace，产出两个 crate：`biubiu-core`（纯业务逻辑，无
I/O、无 `wasm-bindgen`，`cargo test` 原生可跑）与 `biubiu-core-wasm`（`wasm-bindgen` 桥，一个
泛型 `Bridge<A>` 服务所有业务域）。业务域与宿主之间以 JSON 字符串通信，TypeScript 类型由
`ts-rs` 生成，宿主侧的事件泵是产品无关的共享模块。

用授权撤销（revoke）域作为试点完整迁移一遍：它的全部业务规则进入核心，其 Svelte store 退化为
ViewModel 的持有者。迁移的判据是**行为等价**——迁移前该域的 5 个陈旧响应测试，在核心中有等价
用例，且页面行为逐项不变。

技术决策的完整论证见 [research.md](./research.md)（D1–D10）。

## Technical Context

**Language/Version**: Rust 1.85+（edition 2024，本地 rustc 1.97.1）；TypeScript 5.9 / Svelte 5

**Primary Dependencies**: `crux_core` 0.19（固定，理由见 research D2）、`serde` 1、`serde_json` 1；
可选 feature 下的 `ts-rs` 12.0.1、`wasm-bindgen` 0.2。宿主侧不新增运行时依赖。

**Storage**: 核心无存储。自定义网络/代币/授权方由宿主经 IndexedDB 读写（既有实现复用），核心
持有其业务含义与去重规则（research D10）。

**Testing**: `cargo test -p biubiu-core --features crux`（业务规则，无网络/浏览器/时钟）；宿主
侧沿用既有 vitest；`bun run preview:biubiu` 做二进制模式的端到端确认。

**Target Platform**: 仅 Web / `wasm32-unknown-unknown`。不产出 uniffi 绑定，但核心不得引入会
阻断未来添加它的依赖。

**Project Type**: monorepo —— Rust 业务核心 + SvelteKit Web 宿主。

**Performance Goals**: 核心的规则测试套件 < 10 秒（SC-001）。运行期无特定指标：一次转换的负载
是几十到几百行授权数据，JSON 编解码不构成热点（research D3）。

**Constraints**: 核心 `default = []`；`crux` / `bindings` 为默认关闭的可选 feature。release
wasm 有体积上限门禁，上限值在试点实测后设定（research D8）。其余 14 个工具应用行为不变。

**Scale/Scope**: 本次 1 个业务域（迁移前宿主侧 413 行 store + 已有 5 个测试用例）。仓库中待迁
的其余域约 13 个，不在本次范围。

## Constitution Check

*GATE: Phase 0 前必须通过；Phase 1 设计后复检。*

| 原则 | 本设计如何满足 | 判定 |
|---|---|---|
| **I. Core 只决定不执行** | `biubiu-core` 依赖表中只有 `crux_core`/`serde`/`serde_json`；`wasm-bindgen` 隔离在 `biubiu-core-wasm`。ABI 编码、RPC、IndexedDB、`setTimeout` 全在宿主（research D5/D6/D10）。 | PASS |
| **II. Shell 只做 I/O 与渲染** | 宿主的 `execute()` 是对 `operation.type` 的穷尽 switch，是唯一的 I/O 处；store 退化为 ViewModel 持有者（FR-023），由 quickstart 验证 5 的 `grep` 把关。 | PASS |
| **III. 陈旧响应由核心的相关性 ID 丢弃** | 每个 operation 携带核心分配的 `operation_id` 并记入 `in_flight`；所有宿主结果经**唯一**的 `shell_completed` 事件入核心，先查表再处理（contracts/revoke.md §1）。宿主侧的 `scanGen` / `successTimer` 被删除。 | PASS |
| **IV. 合约由工具生成** | `ts-rs` 在 `bindings` feature 下生成到 `src/lib/generated/`（gitignore）；`dev`/`build` 前置执行；quickstart 验证 2 的 `grep` 确认无手写副本。 | PASS |
| **V. 测试不依赖浏览器/网络/时间** | `data-model.md` §5 列出 R-01…R-21，每条对应至少一个 `cargo test` 用例。时钟以 `schedule_dismiss` 请求外化，因此「6 秒后收起」的规则测试不需要等待 6 秒。 | PASS |
| **VI. 行为等价、增量、并存** | 只动 revoke 一个域（FR-025）；FR-026 明确禁止夹带改进；迁移前的 5 个 TS 用例在核心侧有对应（R-01…R-04）且原测试保留到对应用例通过为止（FR-024）。 | PASS |
| **VII. 依赖成本按 feature 门控并被测量** | `default = []`；`crux`/`bindings` 默认关闭；`check-wasm-size.mjs` 门禁，实测值记入 `results.md`。 | PASS |

**Post-Phase-1 复检**：Phase 1 产出的 data-model / contracts / quickstart 未引入新的偏离。
一处需要说明但**不构成偏离**：`ApprovalRow.unlimited` 的判定留在宿主（256 位比较），已在
contracts/revoke.md §3 记录并说明为何不违反原则 II——它是一次**读链时的数据规格化**，不是
「是否允许撤销」这类业务后果判断。把它内化到核心需要 256 位整数类型，属于后续 spec 的候选。

**Complexity Tracking**: 无需填写（无未论证的违反）。

## Project Structure

### Documentation (this feature)

```text
specs/001-biubiu-core-crux/
├── plan.md              # 本文件
├── spec.md              # 需求
├── research.md          # Phase 0：D1–D10 技术决策
├── data-model.md        # Phase 1：Model / ViewModel / 状态转移 / R-01…R-21
├── contracts/
│   ├── bridge.md        #   通用桥（产品无关）
│   └── revoke.md        #   授权撤销域的 Event / Operation / ShellResult
├── quickstart.md        # Phase 1：6 组验证步骤
├── checklists/
│   └── requirements.md
├── results.md           # 实现期产出：wasm 实测体积、行数对照、遗留缺陷清单
└── tasks.md             # Phase 2（/speckit-tasks 生成，本命令不创建）
```

### Source Code (repository root)

```text
rust/                                       # 新增：Cargo workspace
├── Cargo.toml                              #   workspace 成员 + 版本单一来源
├── rust-toolchain.toml                     #   固定 toolchain 与 wasm32 target
├── scripts/
│   └── check-wasm-size.mjs                 #   体积门禁（原则 VII）
└── crates/
    ├── biubiu-core/                        #   纯业务逻辑，crate-type = ["lib"]
    │   ├── Cargo.toml                      #     default = []；crux / bindings / devtools
    │   └── src/
    │       ├── lib.rs                      #     组合根，只负责装配
    │       ├── app/
    │       │   ├── mod.rs                  #       SplitEffect trait + 跨域共享值类型
    │       │   └── revoke.rs               #       试点域：Event/Model/ViewModel/Operation + 单测
    │       └── bin/
    │           └── generate_bindings.rs    #     required-features = ["bindings"]
    └── biubiu-core-wasm/                   #   wasm-bindgen 桥，crate-type = ["cdylib"]
        ├── Cargo.toml
        └── src/
            ├── lib.rs                      #     bridge_class! 声明（每域一行）
            └── bridge.rs                   #     泛型 Bridge<A>，写一次

apps/biubiu.tools/
├── package.json                            # 改：新增 bindings:generate / wasm:build，dev/build 前置
└── src/lib/
    ├── wasm/                               # 新增（gitignore）：wasm-pack 产物
    ├── generated/                          # 新增（gitignore）：ts-rs 产物
    ├── crux/                               # 新增：产品无关的宿主泵
    │   ├── effect-loop.ts
    │   ├── json-wasm-shell.ts
    │   ├── wasm-runtime.ts
    │   └── create-crux-session.ts
    └── pda-apps/revoke/
        ├── store.svelte.ts                 # 改：退化为 ViewModel 持有者
        ├── shell/                          # 新增：operation 路由（唯一的 I/O 处）
        │   ├── scan.ts                     #   复用既有 core/discover.ts + infra/multicall.ts
        │   ├── revoke.ts                   #   复用既有 core/revoke.ts
        │   ├── custom-data.ts              #   复用既有 infra/custom-store.ts
        │   └── chain-metadata.ts
        ├── core/ infra/ registry/          # 保留：被 shell/ 调用的纯 I/O 与注册表
        └── store.svelte.spec.ts            # 保留至 R-01…R-04 通过（FR-024）

turbo.json                                  # 改：build 依赖新增的 wasm 任务
.gitignore                                  # 改：src/lib/wasm/、src/lib/generated/、rust/target/
```

**Structure Decision**: Rust workspace 置于仓库根的 `rust/`，与 `apps/` `packages/` 平级——它
既不是 bun workspace 成员，也不属于任何单个 app（将来第二个 app 也要用同一个核心）。crate 一分
为二的理由是「核心必须能在宿主架构上 `cargo test`」（research D1）；宿主侧的 `src/lib/crux/`
一分为四对应桥合约的四层职责（contracts/bridge.md §3–§5），其中没有一个文件包含业务语义。

## 实施顺序

四个阶段，每个阶段结束时仓库都处于可构建、可运行状态（原则 VI）。

1. **骨架**：Rust workspace、两个 crate、泛型 `Bridge<A>`、`SplitEffect`、宿主侧 `src/lib/crux/`、
   构建接线（`bindings:generate` / `wasm:build` / turbo / gitignore）、体积门禁、工具链前置检查。
   验收：一个最小的占位域能在页面上跑通一次 `Event → Operation → ShellResult → ViewModel`。
2. **核心域**：`app/revoke.rs` 的 Model / Event / Operation / ShellResult / update / view，以及
   R-01…R-21 的全部单测。**此阶段不碰宿主**——核心在页面接线之前就应当被证明正确。
3. **宿主接线**：`shell/` 的 operation 路由（复用既有 `core/` `infra/`）、store 改写、
   `+page.svelte` 改为消费 ViewModel。验收：quickstart 验证 3 的 11 项逐项通过。
4. **收尾**：删除被核心取代的宿主代码与其测试（在 R-01…R-04 通过之后）、`results.md` 记录实测
   体积与行数对照、按实测值设定体积上限、把迁移中发现但**未修**的缺陷列成清单（FR-026）。

## 已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| exe-sveltekit 二进制未内嵌 wasm 资源 | preview/生产模式白屏 | 阶段 1 即用 `preview:biubiu` 实测；退路是 `vite-plugin-arraybuffer` 内联（已在 devDependencies 中）。见 research D7 |
| 贡献者缺少 Rust 工具链 | 无法构建应用 | 前置检查 + 明确指引（FR-027、quickstart 前置条件） |
| 行标识规则与迁移前不一致 | 重新扫描后逐行状态错位 | R-19 用例锁死格式；宿主侧不重新生成 id |
| 迁移中顺手改行为 | 回归无法归因 | FR-026：发现的缺陷只记录不修，列入 `results.md` |
