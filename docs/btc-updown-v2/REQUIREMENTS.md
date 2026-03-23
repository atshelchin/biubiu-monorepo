# BTC Up/Down Dashboard V2 — Requirements Document

> Status: Draft
> Date: 2026-03-22

---

## 1. Overview

Major overhaul of the BTC Up/Down Dashboard, transforming it from a single-endpoint monitoring tool into a **multi-space platform** with user authentication, strategy marketplace, and payment system.

### Core Concept

**Endpoint = Space（空间）**。Each endpoint is an independent, isolated environment where users can run strategy instances (sandbox or live trading). The platform provides one official public space and supports user-managed private spaces.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  apps/btc-updown (SvelteKit Web UI)                 │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │ Space Hub │→ │ Space View│→ │ Strategy Editor │  │
│  │ (入口页)   │  │ (空间内)   │  │ (策略编辑器)     │  │
│  └───────────┘  └───────────┘  └─────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌──────────────┐  ┌──────────────┐
│ Official EP  │ │ Private EP A │  │ Private EP B │
│ (官方端点)    │ │ (私有端点)    │  │ (私有端点)    │
│ sandbox only │ │ sandbox+live │  │ sandbox+live │
└──────────────┘ └──────────────┘  └──────────────┘
        │              │                  │
        ▼              ▼                  ▼
┌──────────────────────────────────────────────────┐
│  btc-updown-5m-bot (Backend per endpoint)        │
└──────────────────────────────────────────────────┘
```

---

## 3. Authentication & Authorization

### 3.1 Identity

- Users authenticate via **biubiu.tools Passkeys**（WebAuthn）
- Every registered biubiu.tools user has a **Profile link**（公开个人资料页）
- Profile contains: public key, display name, avatar, user ID
- Accessing an endpoint requires **signature verification** against the user's passkey

### 3.2 Space Access Control

| Role | Permissions |
|------|-------------|
| **Admin（管理员）** | Add/remove users, configure space limits, enable/disable live trading, manage all instances |
| **Member（成员）** | Create/run strategy instances (within limits), browse strategy marketplace, follow/copy strategies |
| **Visitor（访客）** | View public strategies and their performance (read-only) |

### 3.3 Adding Users to a Space

1. Space admin opens Space Management UI
2. Pastes a user's **Profile link** (e.g., `https://biubiu.tools/profile/xxx`)
3. Assigns role (Member / Admin)
4. User can now access this space via passkey signature

---

## 4. Spaces（空间）

### 4.1 Official Space（官方公开广场）

- Endpoint: `btc-updown-5m-bot-api.biubiu.tools`
- **All registered users** can access by default (no invitation needed)
- **Sandbox only** — live trading is **prohibited**
- Acts as a public playground and strategy showcase
- Strategy marketplace is enabled (see Section 6)

### 4.2 Private Spaces（私有端点空间）

- Managed by third-party operators running their own `btc-updown-5m-bot` instances
- Admin invites users via profile links
- **Both sandbox and live trading** supported
- Admin configures:
  - Max strategy instances per user
  - Whether live trading is allowed
  - Space name, description, branding

### 4.3 Space Configuration（空间配置 — Admin）

```typescript
interface SpaceConfig {
  name: string
  description: string
  endpointUrl: string
  allowLiveTrading: boolean           // 官方端点: false, 私有端点: configurable
  maxInstancesPerUser: number         // e.g., 3 for free, 100 for NFT holders
  strategyMarketplaceEnabled: boolean
}
```

---

## 5. Entry Flow（用户进入流程）

### 5.1 Space Hub（入口页 — 新设计）

**Current problem**: User enters and immediately sees a complex dashboard with no context.

**New design**: Clean, beginner-friendly entry page.

```
┌─────────────────────────────────────────────────┐
│  BTC Up/Down                                    │
│                                                 │
│  ┌─────────────────┐  ┌─────────────────┐       │
│  │  🏛 Official    │  │  ＋ Add Space   │       │
│  │  Space          │  │                 │       │
│  │  btc-updown-5m  │  │  Connect to a   │       │
│  │  -bot-api.      │  │  private        │       │
│  │  biubiu.tools   │  │  endpoint       │       │
│  │                 │  │                 │       │
│  │  [Enter]        │  │  [Add]          │       │
│  └─────────────────┘  └─────────────────┘       │
│                                                 │
│  ┌─────────────────┐                            │
│  │  Private Space A│  (user-added spaces)       │
│  │  my-bot.xxx.com │                            │
│  │  [Enter]        │                            │
│  └─────────────────┘                            │
└─────────────────────────────────────────────────┘
```

- Shows space cards only (no dashboard)
- Official space card always present
- "Add Space" card to add private endpoints
- Each card shows: name, endpoint URL, status indicator (online/offline), user role

### 5.2 Entering a Space

Upon entering a space:

1. Verify user access via passkey signature
2. Show **empty state** if user has no strategy instances
3. Guide user to:
   - **Create a strategy** (via Strategy Editor)
   - **Browse Strategy Marketplace** (discover & follow/copy strategies)
4. Once user has strategies → show current dashboard layout (sidebar + main area)

### 5.3 In-Space Dashboard Changes

- **Both sandbox and live instances** show control buttons: Start / Pause / Stop
- Strategy list sidebar shows instance type badge: `SANDBOX` or `LIVE`
- Admin-only controls visible to space admins (manage users, configure space)

---

## 6. Strategy Marketplace（策略广场）

### 6.1 Strategy Visibility

| Visibility | Behavior |
|------------|----------|
| **Public** | Anyone in the space can view full config, follow, or copy for free |
| **Private** | Only creator sees full config. Others see: name, description, performance metrics (win rate, profit %). Full config requires **purchase ($20)** |

### 6.2 Strategy Actions

| Action | Description | Cost |
|--------|-------------|------|
| **Follow（关注）** | Subscribe to a public strategy's live performance. Read-only, no instance created | Free |
| **Copy（复制实例）** | Clone a strategy config to create your own instance. Can modify after copying | Free (public) / $20 (private) |
| **Download（下载）** | Export strategy config as JSON file to local storage | Free (public) / $20 (private) |
| **Import（导入）** | Import strategy from JSON file or share link | Free |

### 6.3 Cross-Space Strategy Sharing

- **Same space**: Copy/follow directly, no cost beyond private strategy fee
- **Cross-space**: Must first **download/export** from source space, then **import** into target space
  - Alternative: **Share link** — a URL encoding the strategy config, paste into target space to import
- Private strategy purchase is **one-time**: once bought, the config is yours
- **No DRM**: If both creator and buyer delete the strategy, it's gone forever. User is responsible for local backup

### 6.4 Revenue Split（策略交易分成）

Private strategy purchase ($20 fixed price, uniform pricing):
- **50%** → Strategy creator（策略开发者）
- **50%** → biubiu platform

For private spaces, the space operator receives a share from the platform's 50%:
- **50%** → Strategy creator ($10)
- **25%** → Space operator ($5)
- **25%** → biubiu platform ($5)

> Payment via Arbitrum network smart contract (see Section 9).

---

## 7. Strategy Instance Management

### 7.1 Instance Limits

| Tier | Max Sandbox Instances | Max Live Instances | Requirement |
|------|----------------------|-------------------|-------------|
| **Free** | 3 | 0 (official) / admin-set (private) | None |
| **Member（NFT Holder）** | 100 | Admin-set (private spaces only) | Hold biubiu membership NFT |

- NFT ID = user identity for membership verification
- NFT on Arbitrum network
- Space admin can further restrict instance counts

### 7.2 Instance Lifecycle

```
[Created] → [Starting] → [Running] → [Paused] → [Running] → [Stopped]
                                          ↓
                                      [Stopped]
```

All states support user-initiated transitions:
- **Start**: Begin executing strategy
- **Pause**: Temporarily halt (preserve state, resume later)
- **Stop**: Fully halt execution
- **Delete**: Remove instance and its data

Both sandbox and live instances have identical control UX.

### 7.3 Instance Modes

| Mode | Description |
|------|-------------|
| **Sandbox（沙盘模拟）** | Paper trading with virtual funds. Available everywhere |
| **Live（实盘交易）** | Real funds on Polymarket. Only in private spaces with admin permission |

---

## 8. Strategy Editor V2（策略编辑器）

### 8.1 Design Goals

- **Beginner-friendly（小白友好）**: No code required. Visual, drag-and-drop style configuration
- **Progressive disclosure**: Start simple, reveal advanced options as needed
- **Preset templates**: One-click start with tested strategies
- **Live preview**: Show expected behavior before saving

### 8.2 Editor Flow

```
Step 1: Choose Template or Start Blank
  ├── Conservative（保守型）
  ├── Balanced（平衡型）
  ├── Aggressive（激进型）
  └── Custom（自定义）

Step 2: Configure Entry（入场）
  - How much to invest per round
  - Entry method (market / limit / swing)

Step 3: Configure Direction（方向决策）
  - How to decide Up vs Down
  - Visual indicator explanations

Step 4: Configure Risk（风险控制）
  - Stop loss, take profit
  - Daily loss limit
  - Hedging on/off

Step 5: Review & Save
  - Summary card showing all settings
  - Backtest preview (if available)
  - Save / Save as Template
```

### 8.3 Strategy Config Spec

Retain current `StrategyConfigV2` schema from `configurator/types.ts` as the underlying data model. The new editor is a **friendlier UI layer** on top of the same schema.

### 8.4 Improvements over Current Editor

Current `ConfiguratorDrawer.svelte` (64KB) issues:
- Too many options shown at once
- No guided flow
- Requires understanding of trading terminology
- No templates beyond basic presets

V2 improvements:
- **Wizard-style** step-by-step flow
- **Tooltips & explanations** for every option (with examples)
- **Visual previews** (e.g., "with these settings, if BTC goes up 2%, you would...")
- **Validation warnings** (e.g., "stop loss too tight, likely to trigger frequently")
- **Strategy description format**: Standardized metadata (name, description, risk level, expected win rate, recommended market conditions)

---

## 9. Payment System（支付系统）

### 9.1 Network

- **Arbitrum** (L2 Ethereum) for low gas fees
- Payment in USDC or ETH (TBD)

### 9.2 Smart Contract Requirements

Repository: `biubiu-contracts`

#### StrategyMarketplace Contract

```solidity
// Core functions needed:

// Purchase a private strategy
function purchaseStrategy(
    bytes32 strategyId,
    address creator,
    address spaceOperator  // address(0) if official space
) external payable;

// Withdraw earnings
function withdrawEarnings() external;

// Revenue split logic
// - If spaceOperator == address(0): 50% creator, 50% platform
// - If spaceOperator != address(0): 50% creator, 25% operator, 25% platform

// Events
event StrategyPurchased(bytes32 strategyId, address buyer, address creator, uint256 price);
event EarningsWithdrawn(address account, uint256 amount);
```

#### Membership NFT Contract

```solidity
// ERC-721 based membership
// Each NFT ID identifies a member
// Holding = membership active
// Transferable (can sell membership)
```

### 9.3 Payment Flow

```
User clicks "Buy Strategy ($20)"
  → Frontend builds Arbitrum tx
  → User signs with wallet (MetaMask / WalletConnect)
  → Contract splits payment
  → Frontend receives tx confirmation
  → Backend verifies on-chain tx
  → Strategy config unlocked for user
```

---

## 10. API Requirements（后端接口）

> Backend: `btc-updown-5m-bot`
> Phase 1: Mock/stub endpoints with documented interfaces. Real implementation later.

### 10.1 Auth APIs

```
POST   /api/v2/auth/verify          # Verify passkey signature, return session token
GET    /api/v2/auth/profile/:id     # Get user profile by ID
```

### 10.2 Space Management APIs

```
GET    /api/v2/space/info                 # Get space config & metadata
GET    /api/v2/space/members              # List space members (admin only)
POST   /api/v2/space/members              # Add member by profile link (admin only)
DELETE /api/v2/space/members/:userId      # Remove member (admin only)
PATCH  /api/v2/space/members/:userId      # Update member role/limits (admin only)
PATCH  /api/v2/space/config               # Update space config (admin only)
```

### 10.3 Strategy Instance APIs (extend existing)

```
GET    /api/v2/instances                  # List user's instances in this space
POST   /api/v2/instances                  # Create instance (sandbox or live)
POST   /api/v2/instances/:id/start        # Start instance
POST   /api/v2/instances/:id/pause        # Pause instance
POST   /api/v2/instances/:id/stop         # Stop instance
DELETE /api/v2/instances/:id              # Delete instance
PATCH  /api/v2/instances/:id/config       # Update instance config
GET    /api/v2/instances/:id/stats        # Instance statistics
GET    /api/v2/instances/:id/rounds       # Instance round history
GET    /api/v2/instances/:id/sse          # Instance SSE stream
```

### 10.4 Strategy Marketplace APIs

```
GET    /api/v2/marketplace/strategies            # Browse available strategies
GET    /api/v2/marketplace/strategies/:id         # Strategy detail (partial if private & not purchased)
POST   /api/v2/marketplace/strategies             # Publish strategy to marketplace
PATCH  /api/v2/marketplace/strategies/:id         # Update visibility (public/private)
DELETE /api/v2/marketplace/strategies/:id         # Unpublish strategy
POST   /api/v2/marketplace/strategies/:id/follow  # Follow a strategy
DELETE /api/v2/marketplace/strategies/:id/follow  # Unfollow
POST   /api/v2/marketplace/strategies/:id/copy    # Copy strategy (creates instance)
GET    /api/v2/marketplace/strategies/:id/export  # Download strategy config JSON
POST   /api/v2/marketplace/import                 # Import strategy from JSON/link
```

### 10.5 Payment Verification APIs

```
POST   /api/v2/payments/verify-purchase    # Verify on-chain strategy purchase tx
GET    /api/v2/payments/purchases          # List user's purchased strategies
POST   /api/v2/membership/verify-nft       # Verify NFT membership ownership
```

---

## 11. Data Models（数据模型）

### 11.1 Space

```typescript
interface Space {
  id: string
  name: string
  endpointUrl: string
  isOfficial: boolean
  allowLiveTrading: boolean
  maxFreeInstances: number          // default: 3
  maxMemberInstances: number        // default: 100
  createdAt: string
}
```

### 11.2 SpaceMember

```typescript
interface SpaceMember {
  userId: string
  profileUrl: string
  displayName: string
  role: 'admin' | 'member' | 'visitor'
  maxInstances?: number             // override space default
  canLiveTrade?: boolean            // override space default
  joinedAt: string
}
```

### 11.3 MarketplaceStrategy

```typescript
interface MarketplaceStrategy {
  id: string
  name: string
  description: string
  creatorId: string
  creatorName: string
  visibility: 'public' | 'private'
  price: number                     // always 20 for private, 0 for public
  riskLevel: 'conservative' | 'balanced' | 'aggressive'
  performanceMetrics: {
    totalRounds: number
    winRate: number
    totalProfit: number
    maxDrawdown: number
    sharpeRatio?: number
  }
  config?: StrategyConfigV2         // null if private & not purchased
  spaceId: string
  createdAt: string
  updatedAt: string
}
```

### 11.4 StrategyPurchase

```typescript
interface StrategyPurchase {
  id: string
  buyerId: string
  strategyId: string
  txHash: string                    // Arbitrum transaction hash
  price: number
  purchasedAt: string
}
```

---

## 12. Frontend Page Structure（页面结构）

```
/apps/btc-updown/
  ├── (root)                        # Space Hub — space cards grid
  ├── /space/:endpointId            # Space View — dashboard (current layout, enhanced)
  │   ├── /marketplace              # Strategy Marketplace browse
  │   ├── /editor                   # Strategy Editor V2
  │   └── /admin                    # Space Admin panel (admin only)
  └── /import                       # Import strategy via share link
```

---

## 13. Migration Plan（迁移计划）

### Phase 1: Foundation
- [ ] Space Hub entry page
- [ ] Multi-space management (add/remove/persist spaces)
- [ ] Passkey auth integration for space access
- [ ] API v2 interface definitions (mock/stub)

### Phase 2: Strategy Marketplace
- [ ] Strategy publish/browse/follow/copy UI
- [ ] Public/private visibility toggle
- [ ] Strategy share links & import
- [ ] Cross-space strategy transfer

### Phase 3: Strategy Editor V2
- [ ] Wizard-style guided editor
- [ ] Templates & presets
- [ ] Tooltips & explanations
- [ ] Strategy description spec

### Phase 4: Payment & Membership
- [ ] Arbitrum smart contracts (biubiu-contracts)
- [ ] Wallet connection (MetaMask / WalletConnect)
- [ ] Strategy purchase flow
- [ ] NFT membership verification
- [ ] Revenue split logic

### Phase 5: Backend Implementation
- [ ] Implement all v2 API endpoints in btc-updown-5m-bot
- [ ] Database schema extensions
- [ ] Payment verification service

---

## 14. Open Questions（待确认）

1. **Payment currency**: USDC or ETH on Arbitrum?
2. **NFT details**: New collection or existing? Mint price? Max supply?
3. **Strategy price**: Fixed $20 for all private strategies, or creator can set custom price?
4. **Visitor access**: Can non-members view the official space marketplace without signing in?
5. **Strategy versioning**: When a creator updates a public strategy, do followers see the update?
6. **Dispute resolution**: What if a purchased private strategy is low quality? Refund mechanism?
7. **Space operator revenue share**: Confirmed 50/25/25 split (creator/operator/platform)?
8. **Live trading credentials**: How are Polymarket API keys managed in private spaces? Per-user or shared?
9. **Strategy backup**: Should the platform offer cloud backup of purchased strategies, or is local-only acceptable?
10. **Rate limiting**: Max strategy copies per user? Anti-abuse measures for the marketplace?
