# Quickstart & 验证指南

**Feature**: `001-biubiu-core-crux` | **Date**: 2026-09-03

本文件是**验证**指南：怎么跑、怎么确认这个 feature 真的成立。实现细节在 `tasks.md`。

---

## 前置条件

| 工具 | 版本 | 检查 |
|---|---|---|
| Rust | ≥ 1.85（edition 2024） | `rustc --version` |
| wasm32 目标 | — | `rustup target list --installed \| grep wasm32-unknown-unknown` |
| wasm-pack | ≥ 0.13 | `wasm-pack --version` |
| Bun | ≥ 1.3 | `bun --version` |

缺失时的安装（FR-027 要求这段指引存在且可执行）：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

`bun run wasm:build` 会先跑一次前置检查；任一项缺失时打印缺失项与上面的对应命令，而不是把
`cargo` 的原始错误抛给使用者。

---

## 验证 1 — 业务规则可在无浏览器条件下证明（SC-001）

```bash
cd rust
cargo test -p biubiu-core --features crux
```

**预期**：`data-model.md` §5 的 R-01 … R-21 全部通过，用时 < 10 秒。

**这个命令没有联网、没有起浏览器、没有 sleep。** 如果某条规则的测试需要其中任何一样，说明它
还持有 I/O——那是宪法原则 I 的违反，须先修边界。

单独验证陈旧丢弃这一组（对应迁移前的 5 个 TS 用例）：

```bash
cargo test -p biubiu-core --features crux stale
```

---

## 验证 2 — 契约由生成而来，不是手写（SC-002 的前提、FR-005）

```bash
cd /Volumes/data/production/shelchin-workspace/sveltekit-project-next/biubiu-monorepo
bun run --cwd apps/biubiu.tools bindings:generate
git status --porcelain apps/biubiu.tools/src/lib/generated/
```

**预期**：`src/lib/generated/` 不在版本控制中（已 gitignore），且生成后目录内出现
`RevokeEvent.ts` / `RevokeViewModel.ts` / `RevokeOperation.ts` / `RevokeShellResult.ts` 等文件。

确认没有手写副本：

```bash
grep -rn "RevokeViewModel\|RevokeOperation" apps/biubiu.tools/src \
  --include='*.ts' --include='*.svelte' | grep -v 'src/lib/generated/'
```

**预期**：只出现 `import ... from '$lib/generated/...'` 这类引用，没有任何 `interface` /
`type` 定义。

---

## 验证 3 — 页面行为等价（SC-003）

**先跑自动化的那份**（可重复、无需钱包）：

```bash
bun run --cwd apps/biubiu.tools test:unit -- --run --project=client \
  src/lib/pda-apps/revoke/store.svelte.spec.ts
```

**预期**：11 个用例全绿，约 22 秒（其中三次要真的等满 6 秒 —— 验的正是「宿主确实按核心给的
6 秒去计时」）。它覆盖下表全部 6 项，替身只有 `scanApprovals` 与 `walletStore` 两处，都是本次
未改动的代码。

首次运行需要浏览器：`bunx playwright install chromium chromium-headless-shell`。

**再用真钱包手点一遍**（可选，验的是真实钱包 + 真实 RPC 这一层）：

```bash
bun run dev:biubiu
# 打开 http://localhost:5173/apps/revoke
```

逐项对照（对应 spec User Story 2 的验收场景）：

| # | 操作 | 预期 |
|---|---|---|
| 1 | 连接钱包，等待页面就绪 | 自动扫描一次；刷新前不重复自动扫描 |
| 2 | 切换到另一条链 | 结果/选择/错误/上次撤销结果清空，新链自动扫描 |
| 3 | 扫描进行中立刻切链 | 旧链结果永不出现（可在 Network 面板看到旧请求仍返回） |
| 4 | 筛选「仅无限额度」→ 全选可见 | 只有可见行被选中 |
| 5 | 批量撤销成功 | 对应行消失，成功提示出现，约 6 秒后自动收起 |
| 6 | 撤销失败 | 失败提示出现且**不**自动收起 |
| 7 | 成功提示出现后立刻手动关闭 | 6 秒时不再有任何变化 |
| 8 | 撤销进行中再次点击撤销 | 无并发撤销 |
| 9 | 添加自定义代币 | 立即可用，并触发一次重扫 |
| 10 | 添加一个已存在的链 | 直接选中，不出现重复条目 |
| 11 | 添加一个无公开 RPC 的链且不填 RPC | 提示需要 RPC，网络未被添加 |

第 3 项和第 7 项是本次迁移的**核心收益**——迁移前它们靠 `scanGen` 与 `clearTimeout` 保证，
迁移后靠核心的在途表保证。刻意在这两项上多试几次。

---

## 验证 4 — 未迁移的域不受影响（SC-006）

```bash
bun run build:biubiu
bun run preview:biubiu
```

逐一打开其余 14 个工具页面（`/apps/*`），确认可正常使用。

**同时复验 research.md D7**：在 preview（二进制）模式下打开 `/apps/revoke`，确认 WASM 正常加载。
该风险已在实现期实测解除（资源确实被 exe 适配器内嵌），这里是回归检查 —— 若哪天适配器变了导致
加载失败，退路是 `vite-plugin-arraybuffer` 内联（devDependencies 中已有）。

---

## 验证 5 — 宿主侧不再持有业务判断（SC-004、SC-005）

```bash
# 宿主 store 中不应再出现代次计数器、请求身份比较、业务集合运算
grep -n "scanGen\|lastScanKey\|successTimer\|setTimeout" \
  apps/biubiu.tools/src/lib/pda-apps/revoke/store.svelte.ts
```

**预期**：`scanGen` / `lastScanKey` / `successTimer` 一个都不剩。`setTimeout` 只允许出现在
`schedule_dismiss` 这一个 operation 的执行处，且其回调只做一件事：把 `dismiss_due` 回送核心。

```bash
# 迁移前后的行数对照，写入 results.md
git show main:apps/biubiu.tools/src/lib/pda-apps/revoke/store.svelte.ts | wc -l
wc -l apps/biubiu.tools/src/lib/pda-apps/revoke/store.svelte.ts
```

---

## 验证 6 — 体积门禁（SC-008）

```bash
bun run --cwd apps/biubiu.tools wasm:build
```

**预期**：`✓ WASM 322,553 字节（315.0 KB）— 上限 409.5 KB，余量 23%`。

上限是**按实测设定**的（实测 × 1.3，research.md D8）。超限时不要直接调大数字：先弄清多出来的
体积是什么，若增长是有意的，把新数值和理由一并记进 `results.md` 再调整。

---

## 常见问题

**`cargo test` 报找不到 `crux_core` 的宏**：`crux` feature 默认关闭。用
`cargo test -p biubiu-core --features crux`。

**页面白屏、控制台报 wasm 加载失败**：先跑一次 `bun run --cwd apps/biubiu.tools wasm:build`。
`src/lib/wasm/` 不在版本控制中，全新克隆后必须先构建。

**改了 Rust 但页面没变**：`dev` 脚本在启动时构建 WASM，不监听 Rust 文件变化。改完核心后重启
`dev`，或另开一个终端跑 `wasm:build`。
