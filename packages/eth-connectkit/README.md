# @shelchin/eth-connectkit

UI 无关的以太坊钱包连接库。提供统一的 API 来管理钱包连接、链切换、签名和交易，不绑定任何 UI 框架。

## 特性

- **框架无关** — 纯逻辑层，适配 Svelte、React 或原生 JS
- **多钱包支持** — 浏览器注入钱包（MetaMask 等）、远程二维码钱包、Coinbase Smart Wallet
- **EIP-6963 多钱包发现** — 自动检测用户安装的所有浏览器钱包
- **自动重连** — 页面刷新后恢复上次连接
- **零依赖** — 唯一可选依赖是 `@coinbase/wallet-sdk`
- **TypeScript 优先** — 完整类型定义

## 安装

```bash
bun add @shelchin/eth-connectkit

# 可选：使用 Coinbase 钱包时
bun add @coinbase/wallet-sdk
```

## 快速开始

### 1. 创建 Store

```typescript
import {
  createStore,
  InjectedConnector,
  RemoteInjectConnector,
  CoinbaseConnector,
} from '@shelchin/eth-connectkit';
import { mainnet, base, sepolia } from '@shelchin/eth-connectkit/chains';

const chains = [mainnet, base, sepolia];

const store = createStore({
  connectors: [
    new InjectedConnector({ chains, enableEIP6963: true }),
    new RemoteInjectConnector({ chains }),
    new CoinbaseConnector({ appName: 'My App', chains }),
  ],
  autoReconnect: true,
});
```

### 2. 订阅状态变化

```typescript
store.subscribe((state) => {
  console.log(state.status);    // 'disconnected' | 'connecting' | 'connected'
  console.log(state.address);   // '0x...' 或 null
  console.log(state.chainId);   // 1, 8453 等
});
```

### 3. 连接钱包

```typescript
// 连接浏览器钱包
await store.connect('injected');

// 连接指定钱包（通过 RDNS）
await store.connect('injected', { target: 'io.metamask' });

// 签名
const sig = await store.signMessage('Hello');

// 切换链
await store.switchChain(8453); // Base

// 断开
await store.disconnect();
```

### 4. 在 Svelte 5 中使用

```typescript
// lib/wallet.svelte.ts
import type { ConnectKitState } from '@shelchin/eth-connectkit';

function createWalletState() {
  let state = $state<ConnectKitState>(store.getState());
  store.subscribe((s) => { state = s; });
  return { get value() { return state; } };
}

export const wallet = createWalletState();
```

```svelte
<!-- +page.svelte -->
<script>
  import { wallet } from '$lib/wallet.svelte';
</script>

{#if wallet.value.status === 'connected'}
  <p>已连接: {wallet.value.address}</p>
{:else}
  <button onclick={() => store.connect('injected')}>连接钱包</button>
{/if}
```

## 三种连接器

### InjectedConnector — 浏览器钱包

处理 MetaMask、Trust Wallet 等通过 `window.ethereum` 或 EIP-6963 注入的钱包。

```typescript
new InjectedConnector({
  chains,
  enableEIP6963: true,  // 自动发现所有已安装钱包
})
```

**EIP-6963 钱包发现：**

```typescript
// 获取用户安装的所有钱包
const wallets = store.getDiscoveredWallets();
// [{ info: { name: 'MetaMask', icon: '...', rdns: 'io.metamask' }, provider }]

// 连接指定钱包
await store.connect('injected', { target: 'io.metamask' });

// 监听新钱包安装
store.onWalletsDiscovered((wallets) => {
  console.log('发现新钱包:', wallets);
});
```

### RemoteInjectConnector — 远程二维码钱包

通过 WebSocket 中继连接手机端钱包，用户扫码完成签名。

```typescript
new RemoteInjectConnector({
  serverUrl: 'https://remote-inject.awesometools.dev',
  timeout: 120_000, // 2 分钟超时
  chains,
})
```

**二维码连接流程：**

```typescript
import QRCode from 'qrcode';

const connector = store.getConnector('remote-inject') as RemoteInjectConnector;

// 发起连接（不阻塞）
const connectPromise = store.connect('remote-inject');

// 等待 session 就绪
let session = null;
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 100));
  session = connector.getSession();
  if (session?.url) break;
}

// 生成二维码展示给用户
if (session?.url) {
  const qrDataUrl = await QRCode.toDataURL(session.url);
  // 展示 qrDataUrl 给用户扫码
}

await connectPromise; // 用户扫码后解析
```

### CoinbaseConnector — Coinbase Smart Wallet

支持 Passkey 的 Coinbase 智能钱包，SDK 按需懒加载。

```typescript
new CoinbaseConnector({
  appName: 'My App',        // 必填
  appLogoUrl: 'https://...', // 可选
  chains,
})
```

## API 参考

### Store

| 方法 | 说明 |
|------|------|
| `getState()` | 获取当前状态快照 |
| `subscribe(listener)` | 订阅状态变化，返回取消订阅函数 |
| `connect(connectorId, options?)` | 连接钱包 |
| `disconnect()` | 断开当前连接 |
| `switchChain(chainId)` | 切换链 |
| `switchAccount(address)` | 切换账户 |
| `signMessage(message)` | 签名消息 |
| `signTypedData(data)` | 签名类型化数据 |
| `sendTransaction(tx)` | 发送交易 |
| `getProvider()` | 获取 EIP-1193 Provider |
| `getDiscoveredWallets()` | 获取已发现的 EIP-6963 钱包 |
| `destroy()` | 销毁 store，清理所有监听 |

### 状态结构

```typescript
interface ConnectKitState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  address: `0x${string}` | null;
  accounts: `0x${string}`[];
  chainId: number | null;
  connectorId: string | null;
  error: Error | null;
  connectors: ConnectorConfig[];
  discoveredWallets: EIP6963ProviderDetail[];
  isReconnecting: boolean;
}
```

### 预定义链

从 `@shelchin/eth-connectkit/chains` 导入：

`mainnet` · `sepolia` · `base` · `baseSepolia` · `polygon` · `arbitrum` · `optimism` · `bsc` · `fantom` · `gnosis` · `celo` · `moonbeam` · `zkSync` · `linea` · 等

## 自定义存储

默认使用 `LocalStorageAdapter` 持久化连接数据。可替换为自定义实现：

```typescript
import { createStore, MemoryStorageAdapter } from '@shelchin/eth-connectkit';

const store = createStore({
  connectors: [...],
  storage: new MemoryStorageAdapter(), // 内存存储，不持久化
});
```

自定义存储需实现：

```typescript
interface StorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}
```

## 注意事项

- **自动重连有时间窗口** — InjectedConnector 仅在 24 小时内重连，RemoteInjectConnector 在 session 2 分钟过期前重连
- **EIP-6963 是异步的** — Store 创建后钱包列表可能为空，需要通过 `subscribe` 或 `onWalletsDiscovered` 监听
- **必须调用 `destroy()`** — 组件卸载时清理，否则 event listener 会泄漏
- **Coinbase SDK 按需加载** — 仅在 `connect()` 时加载，需安装 `@coinbase/wallet-sdk`
- **签名方法不是所有连接器都支持** — 调用前检查连接器是否实现了对应方法
- **SSR 安全** — 内部检查 `typeof window`，可在 SSR 环境安全使用
