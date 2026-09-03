# Results: 批量代币发送域迁移

**Feature**: `002-token-sender-core` | **Date**: 2026-09-03

---

## 1. 判据核对

| # | 判据 | 结果 |
|---|---|---|
| SC-001 | 「已成功批次不重发、不重复收费」有专门用例，不涉及网络/钱包/真实交易 | ✅ 核心 `resuming_never_re_sends_a_batch_that_already_succeeded` + 浏览器集成用例各一 |
| SC-002 | 核心中不存在跨批次循环；推进由结果事件驱动 | ✅ 唯一发出 `SendBatch` 的地方是 `dispatch_next_batch`，无循环 |
| SC-003 | 迁移前测试的业务断言 100% 有对应用例 | ✅ 见 §3 |
| SC-004 | 宿主状态容器无业务判断；`AbortController`/`await` 延时/批次循环消失 | ✅ **531 → 217 行**；三者在 store 与 shell 中均无 |
| SC-005 | 用户可见行为逐项一致，差异为 0 | ⚠️ 见 §6 —— 需要真实钱包的路径未手工复核 |
| SC-006 | 其余域与 revoke 域不受影响 | ✅ 901 个既有测试全绿；14 条路由在二进制中全部可达 |
| SC-007 | 未改动 spec 001 的通用层 | ⚠️ 改动了**一处**，已回补为通用能力，见 §5 |
| SC-008 | WASM 实测值被记录，足以判断增长是否线性 | ✅ 见 §2 |

---

## 2. WASM 体积：第二个数据点推翻了第一个的猜测

| 构成 | 字节 | 增量 |
|---|---:|---:|
| 骨架 + 一个最小占位域 | 142,255 | — |
| ＋ revoke 域 | 322,553 | +180,298 |
| ＋ sender 域 | **558,032** | **+235,479** |

spec 001 猜 revoke 那 180K「相当一部分是内置注册表的字符串数据（约 100 条代币/授权方）」。
若成立，sender 应该**明显更小** —— 它的数据表只有 **9 条网络**。

结果 sender 加了 **+235K，比 revoke 还多 31%**。主导成本不是数据，是**每个域自己的机器**：
serde 为每个线类型单态化出的代码（sender 有 24 个事件、9 个 operation、13 个结果、约 20 个值
类型，每一个都要一份 `Serialize` + `Deserialize`），加上解析器与 `tiny-keccak`。

**会随域数大致线性增长。** 剩下 12 个域按每个 ~200K 估，还要再涨 ~2.4MB，总量到 3MB 量级 ——
那是首屏必须下载的。三个应对方向按代价排在 [research.md D20](./research.md)；倾向**按域切分
WASM**（每个工具是独立页面，契合度最高），但它会改动 spec 001 的通用层，**需要一个独立 spec**。

门禁：`MAX_BYTES = 725,442`（实测 × 1.3）。

---

## 3. 迁移前测试断言的对应关系（FR-017）

`core/parse.spec.ts`（12 个用例）与 `core/orchestrator.spec.ts` 中的编排部分已全部有对应，随后删除。

| 迁移前用例 | 核心侧 | 规则 |
|---|---|---|
| parses "address,amount" with decimals | `separators_may_be_comma_tab_or_space` 等 | S-10 |
| accepts comma / tab / space separators | 同上 | S-10 |
| ignores comments and blank lines | `blank_and_comment_lines_are_invisible_to_every_counter` | S-10 |
| checksums addresses | `output_addresses_carry_the_eip55_checksum` | D21 |
| flags invalid / missing / invalid / zero amounts | `every_invalid_reason_is_classified_as_before` | S-12 |
| dedupes repeated addresses | `duplicates_are_counted_but_never_listed_as_invalid` | S-11 |
| splits totalAmount evenly, dust to first | `equal_mode_gives_the_dust_to_the_first_recipient` | S-13 |
| returns empty when totalAmount is missing | `equal_mode_without_a_total_yields_nothing` | D22 |
| returns empty for no input | `empty_input_yields_an_empty_result` | — |
| **rejects when total < recipient count** | `a_total_smaller_than_the_recipient_count_is_refused_not_silently_zeroed` | **D22** |
| accepts when total == recipient count | `a_total_exactly_equal_to_the_recipient_count_is_accepted` | — |
| one recipient with tiny total | `a_single_recipient_with_a_tiny_total_still_works` | — |
| chunks by size / empty / size 0 → 1 | `batch_count_and_total_fee_follow_the_per_batch_limit`、`a_zero_batch_limit_is_treated_as_one` | S-14、S-22 |
| sends all batches; fee rides every batch | `every_batch_carries_the_same_per_batch_fee_including_on_resume` | S-04 |
| **resume — no double-payout** | `resuming_never_re_sends_a_batch_that_already_succeeded` | **S-01** |
| abort during the delay | `pausing_during_the_inter_batch_delay_takes_effect_immediately` | S-07 |

**合计：核心 32 个用例 + 浏览器集成 7 个，取代迁移前的 ~16 个编排/解析用例。**
`preflight` 的 5 个用例保留在宿主（它是一次读链）。

---

## 4. 宿主侧的形态变化

| 文件 | 行数 | 是否含通用机制 |
|---|---:|---|
| `store.svelte.ts` | 217（迁移前 531） | 否 —— 一次 `createCruxSession` + 转发 |
| `shell/index.ts` | 122 | 否 —— 一个穷尽 switch |
| `shell/send-batch.ts` | 66 | 否 |
| `shell/reads.ts` | 83 | 否 |
| `shell/storage.ts` | 85 | 否 |
| `shell/wire.ts` | 117 | 否 |

`core/orchestrator.ts` 的 `planBatches` / `runSend` / `abortableDelay` 已删除，只留 `preflight`。
`core/parse.ts` 与其测试已删除。

---

## 5. 对 spec 001 通用层的唯一改动（SC-007）

**契约生成从「同一个目录」改成「按域分子目录」**（`generated/revoke/` 与 `generated/sender/`）。

起因是一次静默事故：revoke 与 sender 都定义了叫 `Network` 和 `SendPhase` 的类型，
`ts-rs` 把它们写进同一个 `Network.ts` —— **后写的赢，不报错**，直到 `svelte-check` 在十几处
报「属性不存在」。

第一版的应对是「生成后比对内容、发现覆盖就报错」。**写完之后实测，它不响** ——
`export_all` 在每个域的调用里都会重写它注册过的全部类型，两次快照读到的内容因此相同，
冲突把自己掩盖了。一个不会响的守卫比没有守卫更糟：它提供虚假的安全感。

于是改成按域分目录：冲突不再需要检测，**因为它不可能发生**。这属于通用能力，已回补到
`generate_bindings.rs`，后续每个域自动受益。

---

## 6. 未手工复核的部分（SC-003 的缺口）

浏览器集成用例（7 个）覆盖了资金安全、暂停语义、批次与费用、解析穿透、视图边界。
**替身只有 `walletStore` 一处**，它是本次未改动的代码。

需要**真实 passkey + 真实交易**的路径没有手工过：真实的每批签名弹窗、真实链上确认、
in-band gas 结算资产的实际报销。这些属于 wallet 域与 subscription 域，本次一行未改。

建议在有钱包的环境里手工过一遍四步向导 + 一次两批发送，再宣布 SC-003 达成。

---

## 7. 发现但未修的缺陷（FR-019）

### D-01｜发送进度不跨会话持久化 —— **资金安全，优先级最高**

- **严重度**：中高（可能导致对已打款地址重复打款）
- **现状**：批次表在核心的 Model 里，但 Model 不落盘。**发送中途关页面或刷新，已成功的批次
  被彻底遗忘**；`can_resume` 为假，用户只能重新录入全部收件人再发一遍。
- **迁移前是否存在**：**是**，而且更糟 —— 进度存在 `store.results` 这个内存数组里，
  连批次表都没有。`DESIGN.md` 承诺过 TaskHub 断点续传，代码里从来没有。
- **为什么不在这里修**：宪法原则 VI。这个域经手用户资金，归因能力尤其重要 —— 混在一起改，
  任何回归都分不清是搬错了还是改错了。而「关页面后能续」是一项**新能力**，它需要自己的验收：
  跨会话恢复、与历史记录的关系、过期计划的清理。
- **迁移已经为它铺好了路**：批次表现在是核心拥有的状态，`Succeeded` 是终态。持久化它是一次
  独立且边界清晰的变更 —— 这正是 [research.md D15](./research.md) 说「没有这一步，那件事无从
  谈起」的意思。
- **建议**：作为 spec 003。

### D-02｜`getErc20Meta` 的地址口径与解析器不同

- **严重度**：低（设计遗留）
- **现状**：核心的 `load_token_meta` 只做形状检查（对应迁移前的 `isAddress(addr, {strict:false})`），
  而解析器做严格的 EIP-55 校验（对应 `isAddress(addr)`）。两处口径在迁移前就不同，本次逐字保持。
- **为什么不在这里修**：统一口径是一次行为变更 —— 收紧会让此前能加的代币加不上，放松会让
  笔误地址进收件人清单。哪个对需要单独判断。

### D-03｜`FeeQuote.usd` 与 `native_usd_price` 是 `f64`

- **严重度**：低
- **现状**：为了逐字保留界面上的价格展示而引入。它们**纯展示**，核心不对其做任何判断，
  但让 `SenderModel` 无法再 `derive(Eq)`。
- **为什么不在这里修**：把展示用的价格挪出核心（由宿主自己保留）是更干净的做法，但那会让
  「费用怎么算出来的」这条解释分居两地。留待与 D20 的体积决定一并考虑。

---

## 8. 实现期发现（详见 research.md）

| # | 发现 | 怎么发现的 |
|---|---|---|
| D19 | 网络表这次**进**核心 —— 与 revoke 结论相反，判据同一条 | 设计期 |
| D21 | EIP-55 校验必须进核心；我按「宽松」实现会让笔误地址静默变成有效收件人 | **实测 viem** |
| D22 | 只读实现漏了三条规则（零额转账拦截、均分缺总额、校验和输出） | **读既有测试** |
| D23 | 去重用 `Vec::contains` 是 O(n²)（91 秒）；ViewModel 回传了 4.5MB 文本 | **实测 10 万行** |
| §5 | 跨域类型重名会被静默覆盖；第一版守卫是假的 | **实测守卫不响** |
| — | `Failed` 批次原本也在候选集里，会让持续失败的批次原地打转 | **测试跑红** |

六条里有五条是**跑出来的**，不是看出来的。
