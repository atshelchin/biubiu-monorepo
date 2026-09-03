# Results: biubiu-core 可移植业务核心 + 授权撤销试点迁移

**Feature**: `001-biubiu-core-crux` | **Date**: 2026-09-03

实现期的实测数值、代码量对照，以及**发现但未修**的缺陷清单（FR-026）。

---

## 1. 成功判据核对

| # | 判据 | 结果 |
|---|---|---|
| SC-001 | 业务规则可在一条不联网、无浏览器的命令下验证，< 10 秒 | ✅ `cargo test -p biubiu-core --features crux` — 31 个用例，**1.8 秒** |
| SC-002 | 迁移前测试的业务断言 100% 有对应用例 | ✅ 5/5，见 §3 |
| SC-003 | 用户可见行为逐项一致，差异为 0 | ✅ 11 个浏览器集成用例覆盖 quickstart 验证 3 的全部 6 项，见 §6 |
| SC-004 | 宿主 store 不再有业务判断；代码量下降 | ✅ **413 → 188 行**（−225，−54%） |
| SC-005 | 陈旧判定只有一处实现；宿主无代次计数器 | ✅ `scanGen` / `lastScanKey` / `successTimer` 全部消失 |
| SC-006 | 其余 14 个域可正常构建与使用 | ✅ 构建通过；15 条路由在二进制中全部可达；**926 个既有测试全绿** |
| SC-007 | 接入下一个域的宿主代码不含循环/编号/取消 | ✅ 见 §4 |
| SC-008 | 体积有上限并被检查；实际数值被记录 | ✅ 见 §2 |

---

## 2. WASM 体积实测

release + `wasm-opt`：

| 构成 | 字节 | 说明 |
|---|---:|---|
| 骨架 + 一个最小占位域 | 142,255 | 基本是 `crux_core` + `serde_json` 的固定成本 |
| 骨架 + revoke 域 | **322,553** | 占位域已移除 |
| 增量 | +180,298 | **+127%** |

一个域让产物大了一倍多，这需要如实记着 —— 不是「固定成本会被摊薄」。其中相当一部分是内置
注册表的字符串数据（约 100 条代币/授权方，含名称与标签），以及 serde 为每个线类型单态化出来
的代码。

**后续域是否线性放大这个数字，现在还不知道** —— 第二个域落地时才会有第二个数据点。若真呈
线性，注册表数据改为运行时按链拉取是第一个该考虑的方向（vela-wallet 的 i18n catalog 就是被
同一道门禁逼出这个结论的）。

当前门禁 `MAX_BYTES = 419,319`（实测 × 1.3），在 `rust/scripts/check-wasm-size.mjs`。

---

## 3. 迁移前测试断言的对应关系（FR-024）

`store.svelte.spec.ts` 的 5 个用例已在核心侧全部有对应用例并通过，随后删除。

| 迁移前用例 | 核心侧用例 | 规则 |
|---|---|---|
| `discards a chain-A scan that resolves after switching to chain B` | `stale_scan_from_the_previous_chain_is_discarded` | R-01 |
| `lets the chain-B scan win even if the chain-A scan resolves last` | `only_the_latest_scan_writes_rows_regardless_of_arrival_order` | R-02 |
| `does not surface a chain-A scan error after switching chains` | `stale_scan_failure_does_not_surface_an_error` | R-03 |
| `only the latest of two overlapping same-chain scans writes rows` | `only_the_latest_scan_writes_rows_regardless_of_arrival_order` | R-02 |
| `an earlier scan finishing does not clear the spinner for a later in-flight scan` | `an_earlier_scan_finishing_leaves_the_later_one_loading` | R-04 |

核心侧另有 25 个用例覆盖 R-05…R-21 与两条不变量（ViewModel 不泄漏内部记账、逐行状态为预计算
布尔值），加上 2 个契约级往返用例。宿主侧另有 8 个形状转换用例与 11 个浏览器集成用例。

**合计：31 个 Rust 用例 + 19 个 TypeScript 用例，取代了迁移前的 5 个。**

---

## 4. 接入下一个域的成本（SC-007）

宿主侧新增代码里**没有**事件循环、请求编号、取消传播 —— 全部来自 Phase 2 的通用层：

| 文件 | 行数 | 是否含通用机制 |
|---|---:|---|
| `shell/index.ts`（operation 路由） | 123 | 否 —— 一个穷尽 switch |
| `shell/scan.ts` | 38 | 否 |
| `shell/revoke.ts` | 69 | 否 |
| `shell/custom-data.ts` | 72 | 否 |
| `shell/chain-metadata.ts` | 41 | 否 |
| `shell/wire.ts`（形状转换） | 117 | 否 |
| `store.svelte.ts` | 188 | 否 —— 一次 `createCruxSession` + 转发 |

**Phase 2 的通用层在整个 Phase 3–5 中未被改动过一次**，除了给 `bridge_class!` 加一个可选的
`debug` 形式（那属于通用能力，已回补到通用层，见 T052）。

---

## 5. 发现但未修的缺陷（FR-026）

迁移不夹带改进。以下是过程中发现的问题，**本次全部未修**，留作后续独立变更。

### D-01｜撤销进行中切链，成功横幅的浏览器链接指向切换后的链

- **严重度**：低（信息展示错误，不影响资金安全）
- **迁移前是否存在**：**是**。`store.svelte.ts` 的 `revokeRows` 没有任何代次保护，切链后回来
  的撤销结果照样设置 `lastResult` 并弹横幅。
- **现状**：行为逐字保持一致（research.md D14）。
- **为什么不在这里修**：那笔撤销**真的成功了**，把它的提示整个吞掉会让用户以为什么都没发生。
  正确的修法是让横幅记住交易实际所在的链并据此生成链接 —— 那是一次功能变更，不是搬迁。
- **修的时候**：核心的 `Notice::Success` 增加 `chain_id`，宿主据此解析浏览器基址。

### D-02｜`ApprovalRow.unlimited` 的判定仍在宿主

- **严重度**：低（设计遗留，非缺陷）
- **现状**：额度是否「无上限」由宿主在读链时判定（256 位比较），核心只按它筛选与排序。
  这是本次迁移中唯一一处业务判定留在宿主的地方。
- **为什么不在这里修**：把它内化需要核心引入 256 位整数类型，为一个布尔值付一整个 crate。
- **修的时候**：与「ABI 编码是否进核心」一并决定 —— 两者都指向同一个问题：核心要不要理解
  链上数值。

### D-03｜`store.svelte.ts` 的 `fetchTokenMeta` 绕过核心直接读链

- **严重度**：低
- **现状**：添加自定义代币前的元数据预读是一次纯读取，不改变业务状态，因此没有走核心。
- **为什么不在这里修**：它更像表单自动填充而不是业务转换；读到的值随 `add_custom_token`
  一起进核心，核心仍是唯一真相来源。
- **值得重新判断的时机**：如果将来这个预读需要参与「同一个代币是否已存在」之类的判断，
  它就变成业务了，应当进核心。

---

## 6. SC-003：宿主接线的端到端验证

`src/lib/pda-apps/revoke/store.svelte.spec.ts`（vitest browser mode，Playwright chromium）
覆盖 quickstart 验证 3 的全部 6 项，**11 个用例全绿，可在 CI 反复跑**。

| quickstart 项 | 用例 |
|---|---|
| 1 自动扫描一次 | 连接即扫描；重复上报同一钱包不再扫；核心把注册表合并好再交给宿主 |
| 2 切链清空并重扫 | 结果/选择/gas 资产清空，新链上重新扫描且 chainId 正确 |
| 3 扫描中切链 | 旧链结果晚到时被丢弃；旧链**失败**同样不冒错误提示 |
| 5 撤销成功 | 行消失、成功提示出现、**真的等 6 秒**后自动收起 |
| 6 失败提示 | 不自动收起（等过 6 秒仍在），须手动关闭；失败时行不消失 |
| 8 并发忽略 | 第一笔在途时的第二、三次点击不产生第二笔发送；逐行 pending 标记正确 |

另有一个用例验证形状确实穿过了整条链路：bigint 额度一位不差地以十进制字符串过界、
Permit2 前缀被正确识别、camelCase 字段全部落到核心。

### 只有两处替身，都是本次未改动的代码

- `scanApprovals`（Multicall 读链）
- `walletStore`（钱包签名与发送）

真 WASM 核心、真 shell operation 路由、真形状转换、真 IndexedDB、真 ABI 编码全部照常跑。
**ABI 编码是真的在跑**——第一版夹具用了 `0xAAA` 这种非法地址，viem 直接抛异常，5 个用例因此
失败。这恰好证明替身只挡住了该挡的那一层。

### 为什么不用真钱包 + 真交易

考虑过 CDP 虚拟认证器（`WebAuthn.addVirtualAuthenticator`）造真 passkey，以及在 Gnosis 上用真
xDAI 跑一遍。结论是**收益低于成本**：

- `registerPasskey` 依赖索引服务器上传；biubiu 的 Safe 是反事实地址，首次发交易前链上无 code，
  智能账户门禁那关还要绕。
- 真交易能额外证明的只有 `buildRevokeCall` + `sendCalls` 仍可用 —— 那是 wallet 域的代码，
  本次**一行未改**。
- 真交易反而做不到三件事：制造一次**失败**的撤销、在第一笔**仍在途时**点第二次、不先发一笔
  approve 就有东西可撤。替身把这三项变成了确定的。

若日后想加一次真链兜底，合适的位置是 wallet 域自己的 e2e，不是这个 spec。

---
## 7. 已知的环境注意事项

- 本机 `localhost:5173` 上另有一个来自其他 checkout 的 dev server。验证时用了 `--port 5199`
  以免打到错的进程上 —— 症状是「路由 404 但 manifest 里有」。
- 系统设置了 `http_proxy` / `all_proxy`，`curl` 打本机端口需要 `--noproxy '*'`。
- 该 checkout 原本没有 `node_modules`，验证前跑了一次 `bun install`（`bun.lock` 因此有改动），
  以及一次 `playwright install chromium`（浏览器测试需要）。

### 既有问题：两个 vitest project 同跑时 `hooks.server.spec.ts` 失败

`bun run test:unit --run`（同时跑 `server` 与 `client` 两个 project）时，
`src/hooks.server.spec.ts` 以 `Cannot find module '$i18n/routes'` 在**文件级**失败。

**与本次改动无关，已验证**：把本次新增的浏览器测试文件移走后仍然失败（99 文件 / 972 用例）。
单独 `--project=server` 一直是好的（100 文件 / 983 用例全绿）。

按 FR-026 不在这里修 —— 它属于 i18n 类型生成与 vitest 多 project 的接线，是一次独立的变更。
