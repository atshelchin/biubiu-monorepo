---

description: "Task list for 004-wasm-per-domain"
---

# Tasks: 按域切分 WASM 产物

## Phase 1: 先量清楚

- [X] T401 分别只导出一个域各构建一次，得出底座与各域独有部分的构成
- [X] T402 试三个编译期开关并**各自单独量**（`-Oz` / `panic=abort` / `strip`）

## Phase 2: 切分

- [X] T403 `biubiu-core-wasm` 加 `domain-*` feature，`lib.rs` 按 `#[cfg]` 导出
- [X] T404 `rust/scripts/domains.mjs` 清单（域名 / 导出类名 / 上限）
- [X] T405 `rust/scripts/build-wasm.mjs` 按清单逐域构建

## Phase 3: 门禁

- [X] T406 `check-wasm-size.mjs` 改为清单驱动、逐域检查
- [X] T407 「所有域同时超限」时提示这多半是底座变大，而非某个域的问题

## Phase 4: 宿主

- [X] T408 `wasm-runtime.ts` 按域缓存；`LOADERS` 字面量表（Vite 静态分析要求）
- [X] T409 `createCruxSession` 增加 `domain` 字段；两个 store 各自声明

## Phase 5: 验证与收尾

- [X] T410 构建产物里恰好两个域 wasm，体积与单域构建一致
- [X] T411 二进制模式下两页各自只请求自己的产物
- [X] T412 全量回归（server 901 / client 75）
- [X] T413 `results.md`：实测、判据核对、未达成项与原因
