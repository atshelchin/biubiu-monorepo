# Phase 0 Research: biubiu-core 可移植业务核心 + 授权撤销试点迁移

**Feature**: `001-biubiu-core-crux` | **Date**: 2026-09-03

参考实现：`/Volumes/data/production/crux-demo`（Core/Shell 教学示例）与
`/Volumes/data/production/vela-wallet`（26 个业务域的生产落法）。下文凡「参考实现」均指这两处。

---

## D1 — crate 划分：纯核心与 WASM 桥分离

**Decision**：`rust/` 作为 Cargo workspace，含两个 crate：

- `rust/crates/biubiu-core` — `crate-type = ["lib"]`，纯业务逻辑。**不依赖 `wasm-bindgen`**。
- `rust/crates/biubiu-core-wasm` — `crate-type = ["cdylib"]`，承载 `wasm-bindgen` 导出与泛型桥。

**Rationale**：核心一旦直接依赖 `wasm-bindgen`，它就只能编译到 wasm 目标，`cargo test` 在宿主
架构上无法运行——而宪法原则 V 要求业务规则在一条普通命令下可验证。分离后 `cargo test -p
biubiu-core` 在 macOS/Linux 原生跑，`wasm-bindgen` 只出现在桥 crate 里。这也是 vela-wallet 的
划分（`vela-core` / `vela-core-wasm`），且为将来可能的 `biubiu-core-uniffi` 留了位置而无需改动核心。

**Alternatives rejected**：
- **单 crate（crux-demo 的做法）**：demo 里 `release.rs` 同时含业务逻辑与 `#[wasm_bindgen]`
  包装。教学上更短，但把 `wasm-bindgen` 拖进了业务 crate 的依赖图，且每个业务域都要手写一份
  几乎相同的 `dispatch/resolve_effect/view` 包装。域数量上去后这是纯复制。
- **把桥放在 `apps/biubiu.tools` 内的 Rust 目录**：前端应用目录里出现 Cargo workspace 会让
  turbo 的缓存边界与 `bun install` 的 workspace 扫描都变得含混。

---

## D2 — 版本与 edition：`crux_core` 固定 0.19，edition 2024

**Decision**：`crux_core = "0.19"`，`edition = "2024"`，`rust-version = "1.85"`。

**Rationale**：crates.io 上现有 `crux_core` 0.20，但两个参考实现都跑在 0.19，其 API 形状
（`#[effect]` 宏、`Command::request_from_shell(...).then_send(...)`、`Core::resolve(&mut request,
result)`）是**已被验证可用**的。第一个 spec 的目的是建立骨架并证明边界成立；同时引入一个未经
验证的大版本，会让任何编译失败在「我们写错了」与「API 变了」之间无法归因。

本地 `rustc 1.97.1` 支持 edition 2024，crux-demo 已在用。

**Follow-up（不在本 spec 范围）**：单独评估升级到 `crux_core` 0.20，届时两个参考实现的迁移
经验可作对照。

**Alternatives rejected**：
- **直接上 0.20**：收益是少一次将来的升级，代价是本次的每个编译错误都多一个可能来源。
- **edition 2021（vela-wallet 的选择）**：无理由跟随一个更旧的 edition。

---

## D3 — Core↔Shell 边界走 JSON 字符串，而非 `serde-wasm-bindgen` 直传

**Decision**：桥的三个方法签名为 `dispatch(event_json: &str) -> String`、
`resolve_effect(effect_id: u64, result_json: &str) -> String`、`view() -> String`；两侧各做一次
`JSON.parse` / `serde_json`。

**Rationale**：
1. **一个泛型桥服务所有域**。`#[wasm_bindgen]` 不能导出泛型，但只要边界是字符串，
   `Bridge<A>` 就能对任意 `App` 复用，每个域只剩一个薄壳类。若走 `serde-wasm-bindgen` +
   `tsify`，每个域都要为自己的类型重新生成一整套绑定。
2. **合约在编译期由 `ts-rs` 生成，运行期只有一种编解码**。JSON 是 `ts-rs` 生成的 TS 类型所
   描述的**同一种**序列化形态，两者不会分叉。
3. **可观测**。传输中的每一个事件与结果都是可打印的字符串，devtools/日志无需额外适配。

代价是每次转换多一次序列化。本域的负载是几十到几百行授权数据，量级上不构成问题；真出现热点
时可对单个域另行优化，而不必先付这笔抽象成本。

**Alternatives rejected**：
- **`serde-wasm-bindgen` + `tsify`（vela-core-wasm 的 i18n 部分在用）**：省一次序列化，但每域
  一套绑定，且 `tsify` 生成的类型与 `ts-rs` 生成的类型是两套来源，容易漂移。

---

## D4 — 合约生成：`ts-rs`，`U256` 与 `u64` 一律以字符串过界

**Decision**：`biubiu-core` 提供默认关闭的 `bindings` feature，其下的
`generate_bindings` 二进制把每个域的 `Event` / `ViewModel` / `Operation` / `ShellResult` 递归
导出为 TypeScript，输出到 `apps/biubiu.tools/src/lib/generated/`。

数值跨界规则：
- **代币额度（链上 `uint256`）**：核心内用 `String`（十进制），并附带一个已判定好的
  `unlimited: bool`。核心**不做** 256 位算术。
- **`operation_id` / `effect_id`**：核心内 `u64`，`ts-rs` 标注为 `number`（沿用参考实现的
  `#[cfg_attr(feature = "bindings", ts(type = "number"))]`）；桥的 `resolve_effect` 在 JS 侧接
  `BigInt(effectId)`。id 是单调计数，远不会接近 2^53。

**Rationale**：`ApprovalRow.allowance` 今天在 TS 侧是 `bigint`，而 `JSON.stringify(1n)` 直接抛
异常——JSON 边界上 bigint 必须是字符串。核心真正需要的业务判断只有「是否等于/接近 `MAX_UINT256`」，
这个判断由**宿主在读链时**完成并作为 `unlimited` 传入，核心只需按它筛选与排序。把 256 位大数
运算搬进核心会为了一个布尔值引入一整个 crate。

**Alternatives rejected**：
- **核心内引入 `alloy-primitives::U256`（vela-core 的做法）**：vela 需要它是因为它真的在核心里
  做地址推导与 ABI 编码。本域不做，引入即是无谓的体积与依赖。
- **数值走 `number`**：`uint256` 超出 f64 精度，会静默截断。

---

## D5 — 6 秒自动收起：时钟留在宿主，到期是一个事件

**Decision**：核心在撤销成功时产出一个 `ScheduleDismiss { operation_id }` 请求；宿主
`setTimeout(6000)` 后以同一 `operation_id` 回送 `DismissDue`。核心收到时若该 id 已不在在途表
中（用户已手动关闭，或又发生了一次撤销），**丢弃**，不改变任何状态。

**Rationale**：这是宪法原则 I 与 III 在一个最小场景上的合流。今天 `store.svelte.ts` 里的
`successTimer` 同时是业务规则（「成功提示是短暂的」）与平台机制（`setTimeout` + `clearTimeout`），
所以「关闭后旧定时器不得再改状态」只能靠记得调 `clearTimeout`。改为相关性 id 后，即使宿主忘了
清除定时器、即使定时器照常触发，核心也会丢弃它——**正确性不再依赖宿主的自律**。

「6 秒」这个数值属于业务策略，因此留在核心（由核心在请求中给出 `delay_ms`），宿主只负责执行。

**Alternatives rejected**：
- **引入 `crux_time` capability**：为一个定时器引入一整个 capability crate，且它自身仍需宿主
  提供时钟。收益不抵成本。
- **宿主自行 `setTimeout` 后直接改视图**：宿主就此持有了业务状态，违反原则 II。

---

## D6 — 边界切在哪：核心表达「撤销这些行」，交易构造留在宿主

**Decision**：核心的 `RevokeApprovals` 请求携带待撤销行的业务标识（standard / token / spender /
是否 Permit2）与目标链、gas 结算资产；`buildRevokeCall` 的 ABI 编码、`walletStore.sendCalls`
的 Safe MultiSend 与 EIP-5792 分支、passkey 签名，全部留在宿主。

**Rationale**：`encodeFunctionData` 与钱包差异是**如何做**，不是**是否允许做**。核心真正拥有的
规则是：撤销进行中不接受新请求、空集合不发请求、成功后移除对应行、失败提示不自动收起。把 ABI
搬进核心需要引入 alloy 全家桶，且不会让任何一条规则变得更可测。

同理，扫描的 Multicall 组装、RPC 故障转移、IndexedDB 读写留在宿主；核心拥有的是「同一所有者+链
只自动扫一次」「切链使在途扫描失效」「自定义条目变更后必须重扫」这些规则。

**Alternatives rejected**：
- **把 ABI 编码也搬进核心**：可行但属于下一次的决定。本次若一起做，任何回归都分不清是边界画错
  了还是编码搬错了——正是宪法原则 VI 要防的情况。

---

## D7 — 构建接线：wasm-pack 产物进 `$lib/wasm`，由 turbo 前置任务生成

**Decision**：
- `bun run bindings:generate` → `cargo run -p biubiu-core --features bindings --bin generate_bindings`
- `bun run wasm:build` → 先 `bindings:generate`，再
  `wasm-pack build rust/crates/biubiu-core-wasm --target web --out-dir <app>/src/lib/wasm`
- `apps/biubiu.tools` 的 `dev` / `build` 脚本前置 `wasm:build`（dev 用 `--dev` + `devtools`
  feature），turbo 中体现为 `build` 依赖新增的 `wasm` 任务。
- `src/lib/wasm/` 与 `src/lib/generated/` 写入 `.gitignore`。

**RESOLVED（2026-09-03，tasks.md T020 实测）**：wasm 资源**被**正常发射并内嵌。`vite build` 把它
发射为 `.svelte-kit/output/client/_app/immutable/assets/biubiu_core_wasm_bg.<hash>.wasm`，exe 适配器
把它打进 `dist/biubiu`（该文件名可在二进制的 strings 中找到）。直接运行该二进制并打开验证页，
WASM 加载正常、`Event → Operation → ShellResult → ViewModel` 整圈跑通、控制台无错误。
**下方记录的退路不需要启用**，保留仅作为将来适配器变更时的参考。

**原 Open risk（须在实现中验证，不是假设）**：本应用的适配器是 `@shelchin/exe-sveltekit`，构建产物
是一个内嵌静态资源的 Bun 二进制。`wasm-pack --target web` 生成的 JS 用
`new URL('..._bg.wasm', import.meta.url)` 引用 wasm，Vite 会把它当作资源发射并加哈希。**该资源
是否被 exe 适配器一并嵌入二进制，必须在试点中实测**——`bun run preview:biubiu` 打开撤销页面，
确认 wasm 正常加载。若未被嵌入，退路是用 `vite-plugin-arraybuffer`（本应用 devDependencies 中
已有）把 wasm 内联为 ArrayBuffer 并走 `initSync`，这也是 vela-wallet 为 Expo web 采用的 base64
`initSync` 路线的同类做法。

**Rationale**：把生成与构建挂在既有入口上，是 FR-006 的要求——契约不能依赖开发者记得手动触发。
产物不入库，因为它们是 Rust 源码的函数，入库必然出现「TS 改了 Rust 没改」的僵尸差异。

**Alternatives rejected**：
- **产物入库**：可以省掉贡献者的 Rust 工具链要求，但直接违反 FR-005（生成物不得被手工编辑——
  入库后必然有人手工改一次就再也发现不了）。
- **wasm 走 CDN（本应用 OG 路由对 resvg 的做法）**：那是**服务端**路由为绕开二进制内嵌而做的
  权宜，且依赖公网。业务核心是客户端首屏依赖，不能挂在 jsDelivr 上。

---

## D8 — 体积门禁：`MAX_WASM_BYTES`，超限即失败

**Decision**：`rust/scripts/check-wasm-size.mjs` 在 `wasm:build` 之后运行，对 release 产物
`biubiu_core_wasm_bg.wasm` 做上限检查，超限抛错并打印实际字节数。首个上限取**试点落地后的实测
值上浮 30%**，并把实测值写入本 spec 的 `results.md`。

**Rationale**：宪法原则 VII 要求成本被测量而非假设。上限在实测前无法凭空拍板，所以顺序是
「先落地 → 记录实测 → 以此设限」，而不是先设一个想当然的数字再去迁就它。

`biubiu-core` 的 `default = []`，`crux` / `bindings` 均为可选 feature，保证不启用的消费者不付
这笔依赖。

**Alternatives rejected**：
- **不设门禁**：体积会在无人注意的情况下逐次增长；vela-wallet 的 i18n catalog 正是因为有门禁
  才在 315KB 超限时被拦下并改成运行时加载。

---

## D9 — 取消：本域用「按 id 丢弃」，`cancelled_effect_ids` 保留但为空

**Decision**：桥的返回体保留 `cancelled_effect_ids` 字段（共享 effect loop 会读它），但本域
恒为空数组。切链使在途扫描失效的手段是**核心把它移出在途表**，随后该结果回来时被丢弃。

**Rationale**：真正的 abort（`AbortController` 中止 HTTP）是一项额外收益，但它要求核心能主动
撤回一个已发出的请求，这在本域没有对应的正确性需求——扫描是只读的，让它跑完再丢弃结果不会
造成任何副作用。而撤销请求**绝不能**被中止（交易可能已上链）。

参考实现的 vela-core 也是这个结论：字段在，值恒空，注释写明原因。

**Alternatives rejected**：
- **不要这个字段**：共享 effect loop 是产品无关的，将来某个域需要 abort 时不应改动 loop。
- **本次就实现 abort**：为一个当前无人需要的能力增加核心的复杂度。

---

## D10 — 自定义网络/代币/授权方：业务含义在核心，读写在宿主

**Decision**：核心持有这三类自定义条目的**列表与规则**（去重键、按链归属、添加后必须重扫、
移除当前选中网络须回退默认）。持久化读写是宿主请求：启动时 `LoadCustomData` 一次性回灌，
变更时 `PersistCustomData`。持久化失败的结果回到核心时被记录但**不回滚**内存中的条目。

**Rationale**：「持久化失败不影响本次会话」（FR-018）是一条**业务决定**——它选择了可用性优先。
今天这条决定散落在四个 `try { … } catch { /* ignore */ }` 里，没有任何地方记录它是一个决定
而不是偷懒。放进核心后它有名字、有测试。

**Alternatives rejected**：
- **持久化完全留在宿主、核心不知情**：那么「保存失败也要能用」就无处表达，核心也无法在
  添加条目后触发重扫。

---

---

## D11 — 宿主应答用命名字段包一层，不能用元组变体（实现期实测发现）

**Decision**：`Event::ShellCompleted { result: <Domain>ShellResult }`，**不是**
`Event::ShellCompleted(<Domain>ShellResult)`。

**Rationale**：两个枚举都用 `#[serde(tag = "type")]`（内部标签）。写成元组变体时，serde 把内层的
字段**摊平**进外层对象，于是两层的标签键撞在一起。实测结果：

```
序列化 → {"type":"shell_completed","type":"echoed","operation_id":1,"message":"hi"}
反序列化 → Err("duplicate field `type`")
```

**这个形状根本无法往返**——不是「不好看」，是坏的。而它不会在编译期报错，只会在第一次真正
跨界时炸掉。

参考实现 crux-demo 的 `ReleaseEvent::ShellCompleted(ReleaseShellResult)` 是同一个形状，因此带着
同一个潜伏问题。**照抄参考实现在这一点上会踩坑。**

命名字段把内层隔进 `result` 的值里，两层标签各在各的对象中：

```
{"type":"shell_completed","result":{"type":"echoed","operation_id":1,"message":"hi"}}
```

`rust/crates/biubiu-core/tests/tagtest.rs` 用一个契约级往返用例把这个格式钉死，以免日后有人
「顺手简化」回元组变体。

**副作用**：结构体变体的构造器不是函数，`.then_send(Event::ShellCompleted)` 不再成立，要写成
`.then_send(|result| Event::ShellCompleted { result })`。

**Alternatives rejected**：
- **内外层用不同的标签键**（如内层用 `kind`）：能跑，但同一个仓库里两套标签约定，生成的 TS 也
  两副面孔，读的人每次都要回想哪层用哪个。
- **外层改邻接标签 `#[serde(tag = "type", content = "data")]`**：等价于本方案，但会把**所有**
  变体都套进 `data`，包括那些本来就是扁平的用户事件，白白加一层。

---

## D12 — 静态数据的归属：域自己的进核心，别的域的由宿主供给（实现期发现）

**Decision**：
- **内置代币 / 授权方注册表**（`registry/tokens.ts`、`registry/spenders.ts`）→ **搬进核心**。
- **内置网络表**（`infra/networks.ts` 的 `BUILTIN_NETWORKS`）→ **留在宿主**，启动时随
  `custom_data_loaded` 一并交给核心。

**Rationale**：这两份数据看起来同类，归属却不同。

代币与授权方清单是 **revoke 域自己的**：没有别的域读它，而且它带着业务规则——按链归属、与自定义
条目合并时的去重语义。规则和它作用的数据分居两地，规则就没法测。

网络表**不是** revoke 的。它逐条派生自钱包的 `CHAINS`（`$lib/wallet/infra/chains.js`），原文件的
注释写明了理由：「so it can never drift from what the wallet can actually send on」。wallet 域这次
不迁移，把这张表复制进 Rust 就等于制造两份真相，而钱包那份仍是发送时实际生效的——这正是那行注释
要防的漂移。

由此得出一条可复用的判据，后续 13 个域都适用：

> 核心拥有**本域拥有的**数据；**尚未迁移的其他域拥有的**数据，由宿主在启动时供给。等那个域也迁移
> 了，再把这份数据挪进核心是一次独立的、有明确归属的变更。

核心因此仍然拥有网络相关的全部**规则**（哪个被选中、切换时清空什么、自定义与内置如何并存、
移除当前网络回退默认），只是不拥有内置那张**表**。

**Alternatives rejected**：
- **网络表也搬进核心**：会与钱包的 CHAINS 产生两份真相，且要连带搬入 RPC 列表与浏览器 URL ——
  它们属于 wallet 域的迁移。
- **代币/授权方也留在宿主**：那么「合并去重」这条规则就留在了宿主，R-15、R-16 无从测起。

---

## D13 — 去重方向：内置优先，不是自定义覆盖（实现期发现，纠正设计文档）

**Decision**：合并内置与自定义条目时，**同键保留首次出现**，且顺序为 `[内置…, 自定义…]` ——
因此**同键时内置胜出**。

**Rationale**：这是迁移前的实际行为，读代码才确认的：`dedupeBy` 的实现是「keeps the FIRST
occurrence per key and preserves input order」，而 `discover()` 传入的是
`[...tokensForChain(chainId), ...customTokens]`。

`data-model.md` §2 原先写的是「自定义条目覆盖同键的内置条目」，**方向相反**。按那个写法实现，
用户给一个内置代币添加同地址的自定义条目时，符号/精度会变——一个用户可见的行为改变，而这次迁移
的判据是行为等价（宪法原则 VI）。设计文档已按实际行为更正。

这条记在这里，是因为它说明了一件更一般的事：**「合并两个列表」这种看似无关紧要的细节，方向反了
就是一次静默的行为变更**。搬迁时对这类语义要读实现，不能靠印象。

---

## D14 — 扫描丢弃陈旧结果，撤销不丢弃（实现期发现，纠正设计文档）

**Decision**：切链后，**在途扫描**被移出在途表（其结果被丢弃）；**在途撤销**不被移出（其结果
仍然落地并弹出提示）。

**Rationale**：我在 spec 的 Edge Cases 与 data-model 的 R-13 里原本写的是「撤销结果不得改变
状态」。写完实现、测试跑红之后去读迁移前的代码，才发现那是**发明**而不是观察：
`store.svelte.ts` 的 `revokeRows` 没有任何代次保护，切链后回来的撤销结果照样设置
`lastResult`、照样弹横幅。

按宪法原则 VI，迁移不夹带改进，因此实现改为与迁移前一致。

但更值得记下来的是**为什么这两者本就不该同一套策略**：

- **扫描是只读的**。陈旧的扫描结果覆盖界面纯属有害 —— 它显示的是另一条链的授权，没有任何
  信息价值。
- **撤销是已经发生的事实**。那笔交易真的上链了。把它的成功提示整个吞掉，用户会以为什么都
  没发生。真正的问题只是横幅上的浏览器链接指向上一条链 —— 这是个小缺陷，不是「结果不该落地」。

同一张在途表能表达这两种策略，靠的是**谁在什么时候被移出表**，而不是两套机制。这正是把
「陈旧判定」收敛成一条规则的好处：策略差异变成了一行 `cancel_in_flight` 的有无，而不是两处
互不相干的临时判断。

**记录在案的缺陷（本次不修，FR-026）**：撤销进行中切链，成功横幅的区块浏览器链接指向切换后的
链而非交易实际所在的链。见 `results.md`。

---

## 未决项

无。本 spec 的 `[NEEDS CLARIFICATION]` 数为 0；D7 中的 wasm 资源内嵌是一个**须实测验证的风险**
而非未决决策——决策已定（走 Vite 资源管线），退路也已定（`vite-plugin-arraybuffer` 内联）。
