## BiuBiuPremium 稳定接口（Arbitrum）

### 写操作

| 函数                                                  | 说明                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribe(tier, referrer, recipient, source)`      | 订阅/续费。`tier`: 0=月，1=年。`referrer`: 推荐人(0x0=无)。`recipient`: 接收者(0x0=自己)。`source`: 来源标记(如"web")。需发送 ETH ≥ `getPrice(tier)` |
| `subscribeToToken(tokenId, tier, referrer, source)` | 给指定 NFT 续费（已有 NFT 的情况）                                                                                                                              |
| `activate(tokenId)`                                 | 切换激活的会员 NFT（用户持有多个时）                                                                                                                            |

### 读操作（前端常用）

| 函数                            | 返回值                                         | 说明                                              |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `getPrice(tier)`              | `uint256 wei`                                | 当前订阅价格（ETH），前端加 2-3% buffer |
| `getEthUsdPrice()`           | `uint256` (8 decimals)                       | 当前 ETH/USD 价格，来自 Uniswap V3 WETH/USDC 池。如 `200000000000` = $2,000.00 |
| `getSubscriptionInfo(user)`   | `(isPremium, expiryTime, remainingTime)`     | **核心查询**：用户是否是会员               |
| `activeSubscription(user)`    | `uint256 tokenId`                            | 用户当前激活的 NFT ID（0=无）                     |
| `getTokenAttributes(tokenId)` | `(mintedAt, mintedBy, renewalCount, expiry)` | NFT 详情                                          |
| `getTokenSubscriptionInfo(tokenId)` | `(expiryTime, isExpired, tokenOwner)` | NFT 订阅状态                                     |
| `subscriptionExpiry(tokenId)` | `uint256`                                    | NFT 到期时间戳                                    |
| `nextTokenId()`               | `uint256`                                    | 下一个 NFT ID                                     |

### 常量

| 名称                    | 值                   |
| ----------------------- | -------------------- |
| `MONTHLY_PRICE_USD()` | `100e8` ($100)     |
| `YEARLY_PRICE_USD()`  | `1000e8` ($1,000)  |
| `MONTHLY_DURATION()`  | `2592000` (30天)   |
| `YEARLY_DURATION()`   | `31536000` (365天) |
| `VAULT()`             | `0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA` |

### 价格机制

- 使用 Uniswap V3 WETH/USDC 0.05% 池（Arbitrum）作为去中心化价格预言机
- `getEthUsdPrice()` 和 `getPrice(tier)` 读取同一个 `slot0()`，价格一致
- 前端显示价格时直接调 `getEthUsdPrice()` 换算，避免前后端价格不一致
- 用户多付的 ETH 会自动退还

### 前端典型流程

```ts
// 1. 查 ETH/USD 价格（展示用）
const ethUsd = await contract.getEthUsdPrice();
const ethPriceUsd = Number(ethUsd) / 1e8; // e.g. 2000.00

// 2. 查订阅价格（wei）
const price = await contract.getPrice(0); // 0=月付
const buffer = price * 103n / 100n;       // +3% buffer 防止价格波动

// 3. 订阅
await contract.subscribe(0, referrer, "0x0", "web", { value: buffer });
// 多余的 ETH 会自动退还

// 4. 查会员状态（也用于其他链上判断是否免费调 tool）
const { isPremium, expiryTime } = await contract.getSubscriptionInfo(user);
```

### Events（前端监听/索引）

```
Subscribed(user, tokenId, tier, expiryTime, referrer, referralAmount, paidAmount, source)
ReferralPaid(referrer, amount)
Activated(user, tokenId)
Deactivated(user, tokenId)
```

### ERC721（NFT 标准接口）

BiuBiuPremium 是一个 ERC721 NFT，支持所有标准操作：

- `balanceOf(owner)`, `ownerOf(tokenId)`, `tokenURI(tokenId)`
- `transferFrom(from, to, tokenId)`, `safeTransferFrom(...)`
- `approve(to, tokenId)`, `setApprovalForAll(operator, approved)`
- 转让 NFT 时自动更新双方的 `activeSubscription`

### 推荐人分成

- 订阅费的 50% 自动转给 `referrer`（如果有效）
- `referrer` 不能是 `address(0)` 或 `msg.sender` 本人
- 分成通过 `Referral.processHalf()` 处理，失败不影响订阅

---

## BiuBiuPayable — Tool 收费接口（任意链）

Tool 合约继承 `BiuBiuPayable`，每个付费函数带 `PayInfo calldata pay` 参数。

### PayInfo 结构

```solidity
struct PayInfo {
    address referrer; // 推荐人地址，address(0)=无
}
```

### 收费逻辑

| `msg.value` | 行为 |
|---|---|
| `== 0` | 免费调用（会员，前端链下判断后不发 ETH） |
| `> 0` | 收取 gas-based fee：`gasUsed × tx.gasprice × multiplier`。50% referrer + 50% VAULT。多余退还 |

### Fee 倍率

| 链 | 倍率 | 示例（500k gas） |
|---|---|---|
| Ethereum (chainId=1) | 10x | ~$1-5 |
| L2 (Arbitrum 等) | 1000x | ~$0.1-1 |

### 前端调用 Tool

```ts
// 免费调用（会员）
await tool.distributeEqual(token, recipients, amount, options, { referrer: "0x0" });

// 付费调用（非会员），预估 gas 后多发一些 ETH
const est = await tool.estimateFee(500000); // 预估 500k gas
await tool.distributeEqual(token, recipients, amount, options, { referrer: ref }, { value: est * 120n / 100n });
```
