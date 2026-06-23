# Token Sender — 设计与落地计划

> 批量代币发送工具（对标 multisender.app / cointools.app）。
> 把用户的 native / ERC20 代币，从 biubiu.tools 站内 **passkey 自托管钱包（Safe 1.4.1 智能账户）**
> 经 **Safe MultiSend 1.4.1** 一次性发给最多 10 万个地址。
>
> 本文只是设计 + 落地计划，**不含实现代码**。决策基线：
> ① 每批一次 passkey 确认（复用现有发送层）
> ② 新建 `token-sender`，借结构不借执行层
> ③ 本轮只出设计

---

## 0. 一句话架构

```
用户把代币充进自己的 Safe 钱包
        │
        ▼
解析/校验地址（最多 10 万，Web Worker） → 计算费用 → 规划分批
        │
        ▼  每一批（chunk）= 一次 passkey 确认
passkey 签名 → UserOp.callData = executeUserOp(
                    to        = MultiSend 1.4.1,
                    value     = 0,                       // delegatecall 不带 value
                    data      = multiSend(packed[...]),  // N 笔转账打包
                    operation = 1 (DELEGATECALL)
                ) → Pimlico bundler
        │
        ▼
TaskHub(IndexedDB) 持久化每批 job（可断点续传） → 完成后写一条 send-history 汇总
```

**核心复用**：[lib/auth/safe-tx](../../auth/safe-tx/) 的 passkey + Safe + ERC-4337 + bundler 全套。
**唯一需要动的底层**：`sendContractCall` 透传 `operation`（详见 §3）。

---

## 1. 复用 vs 新建 清单

| 模块 | 来源 | 处理方式 |
|---|---|---|
| passkey 签名 / UserOp / bundler | `lib/auth/safe-tx/*` | ✅ 直接复用 |
| `executeUserOp` 支持 delegatecall | `build-userop.ts buildCallData(...,operation)` | ✅ 已具备 |
| `sendContractCall` | `lib/auth/safe-tx/send-contract-call.ts` | ⚠️ 加 `operation` 透传（§3.1） |
| MultiSend 1.4.1 地址 | `compute-safe-address.ts CONTRACTS.multiSend = 0x3886…B526` | ✅ 复用 |
| 会员判断 | `lib/subscription subscriptionStore.isPremium` | ✅ 复用 |
| native 价格 | 移植 vela-wallet `price-service.ts`（Chainlink 多链 + DEX 兜底） | ⛏ 移植/精简 |
| 批量任务持久化 / 断点续传 | `@shelchin/taskhub/browser`（Hub + IndexedDBAdapter + merkleRoot） | ✅ 复用模式 |
| PDA app 目录结构 / executor 形态 | `lib/pda-apps/token-multisender/` | ✅ 借结构 |
| 自研配布合约 / approve 流程 | `token-multisender/infra/contracts.ts` | ❌ 不用（改 Safe MultiSend，无需 approve） |
| 添加网络 | `lib/vela-chain-setup`（部署 Safe 全套 + P256 检测） | 🔗 跳转复用 |
| UI 风格 / tokens | `routes/apps/*`、`apps/biubiu.tools/CLAUDE.md` 设计系统 | ✅ 沿用 |

---

## 2. 文件结构（新建）

```
lib/pda-apps/token-sender/
├── DESIGN.md                  # 本文
├── index.ts                   # createTokenSenderApp(walletDeps)
├── schema.ts                  # zod 输入/输出
├── types.ts                   # TokenSenderNetwork / FeeConfig / SendRecord / ...
├── executor.ts                # validate() + run()（借 token-multisender 形态，执行层换 Safe MultiSend）
├── infra/
│   ├── networks.ts            # 支持网络注册表（对齐 CHAIN_CONFIG 的 slug）
│   ├── fee-config.ts          # 每网络固定费用覆盖 + FEE_COLLECTOR + $5 常量
│   ├── multisend.ts           # encodeMultiSend() 打包 + 单批 value 计算
│   ├── price.ts               # nativeUsdPrice(chain) — 移植 vela 价格逻辑
│   ├── erc20.ts               # 取 symbol/decimals/balance，校验代币
│   └── send-source.ts         # TaskHub TaskSource：一批 = 一次 sendMultiSend
├── history/
│   └── send-history.ts        # IndexedDB 历史读写（独立 store）
├── workers/
│   └── parse-recipients.worker.ts  # 10 万地址解析/去重/校验
└── adapters/
    └── sveltekit.ts           # 给路由用的 store/编排（可选）

routes/apps/token-sender/
├── +page.svelte               # 主页面（向导式四步）
└── components/                # 步骤组件、费用卡、进度、历史、安全说明、加网络/加代币弹窗
```

> 网络标识 **必须对齐钱包层的 slug**（`'eth-mainnet'`/`'arb-mainnet'`/`'base-mainnet'`/`'opt-mainnet'`/`'matic-mainnet'`/`'bnb-mainnet'`/`'avax-mainnet'`/`'gnosis-mainnet'`），因为最终要调用 `sendContractCall({ network })`。
> 注意：旧 `token-multisender/infra/networks.ts` 用的是 `'ethereum'` 这类 key，**不能直接照搬**。

---

## 3. 执行层（核心）

### 3.1 唯一的底层改动：`sendContractCall` 透传 operation

`buildCallData` 已支持 `operation`，但 `sendContractCall` 写死成 CALL。两种做法二选一：

- **方案 A（最小改动，推荐）**：给 `ContractCallParams` 加可选 `operation?: number`，在第 70 行
  `buildCallData(to, value, data)` → `buildCallData(to, value, data, operation ?? 0)`。
  默认 0，完全向后兼容订阅/NFT 等现有调用。
- 方案 B：在 token-sender 内复制一个 `sendMultiSend()`，逻辑与 `sendContractCall` 相同但 operation=1。

> 选 A：改动一行、风险最低、不新增重复代码。

### 3.2 一批的发送 = 一次 `sendContractCall`

```
sendContractCall({
  safeAddress, publicKeyHex, credentialId, rpId,   // 来自 authStore.user
  to:        network.multiSendAddress,             // 0x3886…B526
  value:     0n,                                   // delegatecall 不携带顶层 value
  data:      encodeMultiSend(batchTransactions),   // §3.3
  operation: 1,                                    // DELEGATECALL
  network:   network.slug,                         // 'eth-mainnet' ...
  onStatus,                                         // 驱动 UI 状态机
})
```

每调用一次 → 一次 WebAuthn（生物识别）→ 一笔上链交易。
**N 个 chunk = N 次确认**（这是 v1 的明确取舍，见 §9）。

### 3.3 MultiSend 打包（packed，非 abi.encode）

`multiSend(bytes transactions)`，`transactions` 为每笔顺序拼接：

```
operation(1B=0x00 CALL) ‖ to(20B) ‖ value(32B) ‖ dataLength(32B) ‖ data(dataLength)
```

- **native 一笔**：`to=recipient, value=amount, data=空(len=0)`
- **ERC20 一笔**：`to=token, value=0, data=transfer(recipient, amount)`（4+32+32=68B）

外层 `executeUserOp(MultiSend, value=0, data=multiSend(...), operation=1)`：
Safe delegatecall 进 MultiSend，MultiSend 内部对每笔做 `call`，
因此 native 从 **Safe 余额** 扣、ERC20 的 `msg.sender` = **Safe**（代币从 Safe 转出）。**全程无需 approve。**

### 3.4 单批 value 与余额校验（正确性关键）

| 代币类型 | 顶层 value | 每笔子 value | Safe 必须持有 |
|---|---|---|---|
| native | 0 | amount_i | Σamount + 本批费用(若首批) + gas |
| ERC20 | 0 | 0 | 足额 ERC20 + 本批费用(native, 若首批) + gas |

- **gas 由 Safe 用 native 支付**（经 bundler）。preflight 必须校验 native 余额能覆盖：
  `native 发送总额(若 native) + 费用 + 所有批次的预估 gas`。不足则在发送前明确报错，给出还差多少。
- 顶层 `value` 始终 0：delegatecall 不转 value，真正的 native 转账在子笔里。

### 3.5 分批大小（gas 约束，可配置）

| 类型 | 默认 chunk | 依据 |
|---|---|---|
| native | 400 / 批 | ~ 区块 gas 上限与 bundler callGasLimit |
| ERC20 | 250 / 批 | 单笔 transfer ~ 35–65k gas |

- 每网络可在 `networks.ts` 覆盖 `maxBatchNative` / `maxBatchErc20`（L2 可更大）。
- 10 万地址 → native ≈ 250 批、ERC20 ≈ 400 批。把这一点如实展示给用户（§9）。

---

## 4. 费用逻辑

**会员（`subscriptionStore.isPremium === true`）→ 免费，跳过整个收费分支。**
非会员每次发送收费，金额按优先级：

```
feeNative =
  feeConfig[network].fixedNative           // ① 代码配置写死（最高优先）
  ?? usdToNative(5, nativeUsdPrice(network))// ② 取到价 → $5 等值 native
  ?? 1 * 10^decimals                        // ③ 取不到价 → 1 个 native
```

- 配置：`infra/fee-config.ts`
  ```
  FEE_USD = 5
  FEE_COLLECTOR: Address                  // biubiu.tools 收款地址（常量）
  FEE_FIXED_NATIVE: Record<slug, bigint>  // 例: { 'eth-mainnet': 2_000_000_000_000_000n }
  ```
- **收取方式**：把费用作为**首批 MultiSend 的额外一笔 native 转账**（`to=FEE_COLLECTOR, value=feeNative`）。
  - native 发送：首批 = [费用笔, ...recipientsChunk0]
  - ERC20 发送：首批 = [费用笔(native), ...erc20Chunk0]（同一 multiSend 内 native + erc20 混合，MultiSend 支持）
  - 好处：**不额外多一次指纹**，费用与发送原子绑定。
- 价格来源（`infra/price.ts`，移植 vela `price-service.ts`）：
  每链 Chainlink native/USD feed → 取不到回退主网 Chainlink → 再取不到则触发 ③ 收 1 native。
  自定义网络多半无 feed → 自然落到 ③，符合预期。
- UI 必须在确认前**清楚展示**：是否会员、本次费用、等值美元、收款地址、计入首批交易。

---

## 5. 支持网络 & 添加网络

- **支持范围 = passkey Safe 能运行的链**（已有：eth/arb/base/opt/matic/bnb/avax/gnosis）。
  原因同 vela-wallet-chain-setup：只有部署了 Safe 全套（含 MultiSend、SharedSigner）且 P256 验证可用（RIP-7212 precompile）的链，钱包本身才能签发交易。
- `networks.ts` 每条 = 合并 `CHAIN_CONFIG`（slug/chainId/explorer/nativeSymbol）+ `multiSendAddress` + `decimals` + `maxBatch*` + 可选 `fixedNative`。
- **添加网络**：按钮跳到 `routes/apps/vela-wallet-chain-setup`：
  1. 检测 P256 precompile（`checkP256Precompile`）
  2. 部署 Safe 全套合约（含 MultiSend 1.4.1）
  3. 成功后把该链写入 token-sender 网络注册表（localStorage 自定义网络，hydrate 时合并内置 + 自定义）
- MultiSend 1.4.1 在各链是同一确定性地址（`0x3886…B526`），由 chain-setup 的确定性部署保证。

---

## 6. 添加 ERC20 代币

`infra/erc20.ts`：输入合约地址 → 经钱包 readContract / RPC 取 `symbol` `decimals` `balanceOf(safe)` → 校验：

- 地址合法（注意 0x 地址在序列化/CLI 时要 `JSON.stringify`，避免被当 Number）
- 是合约、`decimals` 在 0–36、`symbol` 可读
- 展示 Safe 当前余额，发送前校验 `balance >= Σamount`

自定义代币（地址、symbol、decimals、所属链）存 IndexedDB / localStorage，跨会话保留。

---

## 7. 历史记录（IndexedDB）

两层：

1. **TaskHub job 层**（复用 `token-multisender` 模式）：
   每批是一个 job，`merkleRoot(jobIds)` 去重；中断后 `findTaskByMerkleRoot` → `resumeTask` 续传。
   解决「发到第 180 批断了」的恢复。
2. **send-history 汇总层**（`history/send-history.ts`，独立 IndexedDB store）：每次发送一条记录：
   ```
   SendRecord {
     id, createdAt, network, tokenType, tokenAddress?, tokenSymbol, decimals,
     totalRecipients, totalAmount(string), feeNative(string), isMember,
     batches: { index, txHash, status, count, explorerUrl }[],
     status: 'completed' | 'partial' | 'failed',
     merkleRoot,                 // 关联 TaskHub，用于「继续未完成」
   }
   ```
   历史页：列表 + 详情（各批 txHash 跳浏览器）+ 「继续未完成的发送」入口。

---

## 8. UI / UX（向导式四步 + 全程状态清晰）

沿用 `apps/biubiu.tools/CLAUDE.md` 设计系统（glass-card、shine sweep、tokens、i18n、SEO、fadeInUp）。

**Step 1 选网络 + 代币**：网络选择器（仅支持链 + 「添加网络」）；native / ERC20 切换；ERC20 走「添加代币」；展示 Safe 在该链/该代币的当前余额。
**Step 2 录入接收方**：粘贴 / CSV 上传（`address,amount` 或等额均分）；Web Worker 实时统计「有效 / 重复 / 非法」条数 + 总额；大列表虚拟滚动预览。
**Step 3 复核 + 费用**：总额、地址数、批次数（明确告诉用户「将分 N 批、需确认 N 次」）、费用卡（会员免费 / 非会员金额+美元+收款方）、native 余额是否够付（发送额+费用+gas）。
**Step 4 发送**：逐批进度条（第 k/N 批、txHash、成功/失败）；失败可「跳过本批 / 重试 / 停止返回部分结果」（executor 已有该交互模型）；完成写历史 + 成功态。

**安全/信任区块（贯穿 Step 1 与首页入口，针对小白）**：
- 「这是**你自己的** Safe 智能账户，地址由你的 passkey 推导，**私钥永不离开你的设备**」
- 「biubiu.tools **无法**动用你的资金，每一笔都需你的指纹/PIN 当场确认」
- 「与 Vela Wallet **同一原理**（Safe 1.4.1 + passkey），且 biubiu.tools **开源**」+ 源码链接
- 展示 Safe 地址 + 区块浏览器链接，鼓励先小额试。

**状态机**（复用 `send-token.ts` 的 `SendStatus`）：`checking → building → estimating → signing → submitting → waiting → confirmed/failed`，每批独立展示。

---

## 9. 已知张力 / 风险（必须如实告知用户）

1. **N 批 = N 次指纹**：v1 取舍。≤ 数千地址体验良好；10 万级需上百次确认。
   - 缓解：批量尽量取大（gas 上限内）、断点续传、进度清晰。
   - v2 升级位（已为其抽象执行层）：一次 passkey 授权一个**限定用途 / 限时的 session key / Safe module**，由它无感提交所有批次 → 一次确认发全部。需在 vela-chain-setup 增加 module 部署。
2. **gas 与余额**：native 余额需覆盖 发送额 + 费用 + 全部批次 gas；preflight 必须算清并拦截，否则发到一半 gas 不足。
3. **bundler / RPC 限流**：上百批次需节流与重试（TaskHub `concurrency: max 1` 串行，已契合 passkey 逐批确认）。
4. **价格失败**：Chainlink/DEX 都取不到 → 落到「1 native」，UI 要显式说明为何是 1 native。
5. **10 万地址前端性能**：解析/去重/校验放 Web Worker；预览虚拟滚动；避免主线程卡死。
6. **MultiSend 部分失败语义**：MultiSend 任一子笔 revert 会整批回滚（要么全成要么全败），对账简单但要让用户理解「失败批可整批重试」。
7. **0x 地址类型强转**：CLI/配置序列化务必 `JSON.stringify`（既往教训）。

---

## 10. 分阶段落地计划

> 每个 Phase 可独立验收、可跑通后再进下一阶段。

**Phase 0 — 执行层打底（半天）**
- `sendContractCall` 加 `operation` 透传（方案 A）。
- `infra/multisend.ts`：`encodeMultiSend()` + 单批 value 计算 + 单测（native / erc20 / 混合 各一例，对拍已知 MultiSend 编码）。

**Phase 1 — 最小可发送闭环（核心）**
- `networks.ts`（对齐 slug，先填 eth/arb/base/opt/matic/bnb/avax/gnosis）。
- `schema.ts` / `types.ts` / `executor.ts`（借 token-multisender 形态，执行层换成「每批 sendMultiSend」）。
- `infra/send-source.ts`：TaskHub TaskSource，一批 = 一次 sendContractCall(operation=1)。
- 路由 `+page.svelte` 跑通 Step1–4（先 native、单网络、小列表），逐批进度 + 失败处理。
- 验收：测试网把 native 发给 10–20 个地址、分 2 批、各确认一次、上链成功、历史落库。

**Phase 2 — ERC20 + 费用 + 会员**
- `infra/erc20.ts`（取 metadata/balance/校验）；ERC20 批量编码（无 approve）。
- `infra/price.ts`（移植 vela Chainlink 逻辑）。
- `infra/fee-config.ts` + 费用三级优先级；费用并入首批；会员免费分支。
- Step3 费用卡 + native 余额（发送额+费用+gas）校验。
- 验收：非会员发 ERC20，首批含 $5 等值 native 费用；会员免费；断网价格回退 1 native。

**Phase 3 — 规模化 + 添加网络/代币 + 历史**
- `workers/parse-recipients.worker.ts`：10 万地址解析/去重/校验 + 虚拟滚动预览。
- 断点续传（merkleRoot resume）打磨；「继续未完成」入口。
- 「添加网络」对接 vela-chain-setup；「添加 ERC20」弹窗 + 持久化。
- 历史页（列表/详情/续传）。
- 安全信任区块 + i18n（en/zh）+ SEO + 设计系统细节。

**Phase 4（可选 v2）— 一次授权发全部**
- session key / Safe module 方案；vela-chain-setup 增加 module 部署；执行层切换为「一次确认 → 无感批量」。

---

## 12. 实现进度（2026-06-23）

**已完成并通过验证（svelte-check 零错零警 + 8 单测通过）：**

- Phase 0 全部：
  - `sendContractCall` 加 `operation` 透传（[send-contract-call.ts](../../auth/safe-tx/send-contract-call.ts)）
  - `infra/multisend.ts` packed 编码器 + `infra/multisend.spec.ts`（8 测试）
  - `infra/{networks,fee-config,erc20}.ts`、`types.ts`
- Phase 1 + 部分 Phase 2：
  - `core/{parse,price,fee,wallet,orchestrator}.ts`、`history/send-history.ts`
  - `store.svelte.ts`（runes-class 向导状态）
  - 路由 `routes/apps/token-sender/+page.svelte`（四步向导 + 安全信任区 + 充值/登录接入 + 逐批进度 + 历史）
  - native + ERC20、Safe MultiSend 发送、会员免费 / 费用三级（含 $5 Chainlink 价 + 1 native 兜底）、余额预检、IndexedDB 历史

**架构偏离说明**：UI 未用 PageKit（balance-radar 那套 config/execution module + auto-default adapter），改用本仓库同样常见的 **runes-class store**（同 `authStore`/`subscriptionStore`）。原因：token-sender 是「单网络单代币」向导且需要 **passkey 逐批交互**，runes store 比 PageKit 的非交互 adapter 更贴合；可复用逻辑已沉到 `core/`，未来若做 CLI/MCP 可再包 `createApp`。

**尚未完成（后续）：**

- Web Worker 解析 10 万地址（当前同步，`core/parse.ts` 接口已为 Worker 化预留）
- 「添加网络」对接 vela-wallet-chain-setup；自定义 ERC20 持久化到 IndexedDB
- TaskHub 断点续传 /「继续未完成的发送」（当前历史仅汇总，无 resume）
- i18n keys + 中文文案（当前英文硬编码）
- **真机端到端验证**：需登录 passkey + 测试网资金，无法在此环境跑通（仅静态验证）

---

## 11. 已锁定的决策（2026-06-23）

- `FEE_COLLECTOR = 0x2C1c9470E6A6fc6340C9e24670361fEC4c347c23`。
- **默认 chunk = 100**（native / ERC20 同）；每网络可在 `networks.ts` 覆盖，但默认不按链微调。
- **不预设** 每网络 `fixedNative`：一律走 `$5 等值 native → 兜底 1 native`（代码配置入口保留，默认空）。
- v1 **不做 CLI adapter**（批量发送强依赖 passkey 交互，CLI 价值有限）。
