# biubiu 业务核心（Rust / Crux）

业务规则、业务状态与状态转换住在这里。宿主（今天是 `apps/biubiu.tools` 的 SvelteKit Web Shell）
只做两件事：执行核心要求的 I/O、渲染核心返回的视图。

权威约束见 [`.specify/memory/constitution.md`](../.specify/memory/constitution.md)。
设计论证见 [`specs/001-biubiu-core-crux/`](../specs/001-biubiu-core-crux/)。

## 布局

```
rust/
├── Cargo.toml                    workspace + 版本单一来源
├── rust-toolchain.toml           固定 channel 与 wasm32 目标
├── scripts/
│   ├── check-toolchain.mjs       构建前置检查（缺什么 + 跑哪条命令）
│   └── check-wasm-size.mjs       体积门禁（宪法原则 VII）
└── crates/
    ├── biubiu-core/              纯业务逻辑，crate-type = ["lib"]
    │   └── src/app/<domain>.rs     一域一文件：Event/Model/ViewModel/Operation + 业务单测
    └── biubiu-core-wasm/         wasm-bindgen 桥，crate-type = ["cdylib"]
        └── src/bridge.rs           泛型 Bridge<A>，**写一次，不按域分叉**
```

`biubiu-core` **不依赖 `wasm-bindgen`**。这不是洁癖：核心一旦依赖它，就只能编译到 wasm 目标，
`cargo test` 在本机跑不了，而宪法原则 V 要求业务规则在一条普通命令下可验证。

## Feature 开关

| feature | 默认 | 作用 |
|---|---|---|
| `crux` | 关 | 状态机。不启用的消费者的依赖图里没有 `crux_core` |
| `bindings` | 关 | `ts-rs` 生成 TypeScript 契约。构建期专用，永不进运行期产物 |
| `devtools` | 关 | 脱敏的内部快照（在途表、计数器）。release 构建里这些代码不存在 |

`default = []` 是原则 VII 的落实：不用的东西不该付它的代价。

## 常用命令

```bash
cargo test -p biubiu-core --features crux    # 业务规则（无网络 / 无浏览器 / 无 sleep）
cargo clippy -p biubiu-core --features crux -- -D warnings
bun run --cwd ../apps/biubiu.tools wasm:build       # 生成契约 + 构建 release wasm + 体积门禁
bun run --cwd ../apps/biubiu.tools bindings:generate # 只重新生成 TypeScript 契约
```

`dev` 与 `build` 已经前置了 wasm 构建，日常开发不需要记得手动跑（FR-006）。

## 新增一个业务域

以 `revoke` 为样板。**Phase 2 建立的通用层（`bridge.rs`、宿主的 `$lib/crux/*`）不该被改动** ——
如果你发现必须改它，那多半说明改动本身属于通用能力，应该回补到通用层而不是塞进你的域。

### Rust 侧（3 处）

1. **`crates/biubiu-core/src/app/<domain>.rs`** —— 该域的全部内容：

   ```rust
   pub enum <D>Event { …, ShellCompleted { result: <D>ShellResult } }
   pub enum <D>Operation { … }   // #[cfg_attr(feature = "bindings", ts(export))]
   pub enum <D>ShellResult { … }
   #[effect] pub enum <D>Effect { Render(RenderOperation), Shell(<D>Operation) }
   impl App for <D>App { fn update(…) -> Command<…>; fn view(…) -> <D>ViewModel; }
   ```

   **`ShellCompleted` 必须是命名字段，不能是元组变体** —— 内部标签枚举套内部标签枚举会产生
   重复的 `type` 键且完全无法反序列化（research.md D11）。`tests/wire_contract.rs` 钉死了这一点。

2. **`SplitEffect` 实现**（3 行）：

   ```rust
   impl SplitEffect for <D>Effect {
       type Op = <D>Operation;
       fn into_shell(self) -> Option<Request<<D>Operation>> {
           match self { Self::Render(_) => None, Self::Shell(r) => Some(r) }
       }
   }
   ```

3. **契约生成** —— `src/bin/generate_bindings.rs` 里给新域**开一个自己的子目录**：

   ```rust
   let mine = Config::new().with_out_dir(&root.join("<domain>"));
   MyEvent::export_all(&mine)?;   // Event / Operation / ShellResult / ViewModel 四个根
   ```

   `Operation` 从 Event/ViewModel 都不可达，**必须显式导出**，否则宿主的穷尽 switch 无从写起。

   **为什么一定要分目录**：文件名就是类型名。两个域各有一个 `Network`，写进同一个目录就会
   互相覆盖 —— `ts-rs` 不报错，后写的赢，直到 `svelte-check` 在十几处报「属性不存在」。
   spec 002 真踩过（`specs/002-token-sender-core/results.md` §5）。

4. **`crates/biubiu-core-wasm/src/lib.rs`** 一行：
   `bridge_class!(<D>Core, biubiu_core::app::<domain>::<D>App, debug);`
   （`debug` 可选，要求 ViewModel 实现 `DebugSnapshot`。）

### 宿主侧（2 处）

5. **`<domain>/shell/`** —— operation 路由，对 `operation.type` 做**穷尽** switch，末尾
   `assertNever(op)`。这是该域**唯一**做 I/O 的地方。

6. **一次 `createCruxSession` 声明** —— 五个字段：`createCore` / `initialEvent` / `onView` /
   `execute` / `toFailure`。没有一项是循环、编号或状态。

就这些。事件泵、请求编号、取消传播、契约生成都已经有了。

## 边界在哪：一个可复用的判据

迁移 revoke 时反复用到、后续域同样适用：

- **规则进核心，机制留宿主。** 「什么时候允许撤销」是规则；`encodeFunctionData` 是机制。
- **陈旧判定只有一种写法。** 每个跨宿主的操作带一个核心分配的 `operation_id` 并记入在途表；
  结果回来先查表，查不到就丢弃。宿主**不许**再写代次计数器（宪法原则 III）。
- **本域拥有的静态数据进核心；尚未迁移的其他域拥有的，由宿主供给。** revoke 的代币/授权方
  注册表进了核心；内置网络表没有 —— 它派生自钱包的 `CHAINS`，wallet 域还没迁（research.md D12）。
- **时钟、随机数、存储一律外化成请求。** 「6 秒后收起提示」里，6 秒是策略（核心），
  `setTimeout` 是机制（宿主）。
- **搬迁语义要读实现，不能靠印象。** 合并两个列表的方向反了就是一次静默的行为变更
  （spec 001 D13）。
- **既有测试是规则清单，源码只是其中一种表述。** spec 002 的解析器写完、用例全绿之后，
  对照迁移前的测试才发现漏了三条规则 —— 其中一条是「零额转账」的拦截，源码注释里记着它是
  修过的一次事故（spec 002 D22）。
- **数据结构的复杂度也要搬对。** 把 TS 的 `Set` 搬成 Rust 的 `Vec` + `contains`，语义没变，
  10 万行输入从 2 秒变成 91 秒。功能测试全绿，因为它们只有几行（spec 002 D23）。
- **输入也不该进视图。** 十万行文本存进 Model 就意味着每次 render 都序列化 4.5MB 送过边界。
  核心该拥有的是解析**结果**，不是编辑器缓冲区。
