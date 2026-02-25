# @shelchin/vendor-pool

高可用供应商池调度库 - 自适应限流、自动故障转移、智能升级。

> **设计哲学**: 把复杂的逻辑留给库，把简单的接口留给开发者，把确定性的结果交给老板。

## 特性

- **自动故障转移** - 供应商失败自动切换，直到成功
- **自适应限流** - 慢启动探测，撞墙后锁定最优速率
- **梯度冷冻** - 软封禁 (429) / 硬封禁 (5xx) 自动区分
- **智能升级** - 全面失败时触发人工干预
- **状态持久化** - 重启后恢复最优配置
- **跨平台** - Node / Bun / Browser / Cloudflare Workers

## 安装

```bash
bun add @shelchin/vendor-pool
# or
npm install @shelchin/vendor-pool
```

## 快速开始

```typescript
import { Pool, Vendor } from '@shelchin/vendor-pool';

// 1. 定义供应商
class OpenAIVendor extends Vendor<ChatInput, ChatResponse> {
  readonly id = 'openai';

  async execute(input: ChatInput): Promise<ChatResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

// 2. 创建池
const pool = new Pool([
  new OpenAIVendor(),
  new AnthropicVendor(),
  new GeminiVendor(),
]);

// 3. 下达指令
const result = await pool.do({ messages: [{ role: 'user', content: 'Hello' }] });
console.log(result.result); // ChatResponse
console.log(result.vendorId); // 'openai' | 'anthropic' | 'gemini'
```

## 运行示例

```bash
cd packages/vendor-pool

# 基础用法
bun run example:basic

# 故障转移演示 - 供应商失败自动切换
bun run example:failover

# 限流与自适应调速 - 慢启动探测，撞墙锁定
bun run example:rate-limit

# 人工干预升级 - EscalationError 和 LogicError
bun run example:escalation

# 权重优先级 - 高权重供应商优先，故障时降级
bun run example:weight

# 并发与负载分布 - 高并发时任务自动分散
bun run example:concurrent

# 状态持久化 - 重启后恢复最优速率
bun run example:persistence

# 错误类型 - RATE_LIMIT/SERVER_ERROR/LOGIC_ERROR 区别
bun run example:error-types

# 超时机制 - 全局超时和 TimeoutError
bun run example:timeout

# 自定义错误分类 - 重写 classifyError() 方法
bun run example:custom-classifier
```

### 示例说明

| 示例 | 功能 |
|------|------|
| `basic` | 最简单的使用方式 |
| `failover` | 供应商故障时自动切换到备用 |
| `rate-limit` | 自适应限流：从保守速率开始，逐步探测，撞墙后锁定 |
| `escalation` | 所有供应商都失败时触发人工干预 |
| `weight` | 权重决定选择优先级（不是负载均衡比例） |
| `concurrent` | 高并发时任务会溢出到多个供应商 |
| `persistence` | 使用 Storage 在重启后恢复最优配置 |
| `error-types` | 不同错误类型的冷冻策略 |
| `timeout` | 全局超时控制 |
| `custom-classifier` | 自定义 API 错误分类 |

## 核心概念

### Vendor (供应商)

继承 `Vendor` 抽象类来实现你的供应商：

```typescript
class MyVendor extends Vendor<TInput, TOutput> {
  readonly id = 'my-vendor';

  async execute(input: TInput): Promise<TOutput> {
    // 你的业务逻辑
  }

  // 可选：自定义错误分类
  classifyError(error: unknown): ErrorType {
    if (isRateLimitError(error)) return ErrorType.RATE_LIMIT;
    if (isAuthError(error)) return ErrorType.LOGIC_ERROR;
    return ErrorType.SERVER_ERROR;
  }
}
```

### Pool (调度中枢)

Pool 是任务主管，负责：

- **智能选人** - 选择最闲、未冷冻、信誉最高的供应商
- **死磕到底** - 自动重试直到成功或触发升级
- **异常归因** - 区分"供应商故障"和"参数错误"

```typescript
const pool = new Pool(vendors, {
  // 持久化（可选）
  storage: new LocalStorageAdapter(),

  // 人工干预回调（可选）
  onEscalate: async (context) => {
    await sendSlackAlert(context);
  },

  // 全局超时（默认 30s）
  timeout: 30_000,

  // 最大重试次数（默认 10）
  maxRetries: 10,
});
```

## 错误处理

```typescript
import { EscalationError, LogicError, TimeoutError } from '@shelchin/vendor-pool';

try {
  const result = await pool.do(task);
} catch (e) {
  if (e instanceof EscalationError) {
    // 所有供应商都失败，需要人工干预
    console.log(e.context.totalRetries);
    console.log(e.context.vendorStates);
  }

  if (e instanceof LogicError) {
    // 参数错误（400/401/403），不会重试
    console.log(e.vendorId);
    console.log(e.originalError);
  }

  if (e instanceof TimeoutError) {
    // 全局超时
    console.log(e.elapsedTime);
  }
}
```

## 自适应限流机制

```
初始状态: minTime = 500ms (2 QPS)
          isStable = false

成功执行 → minTime -= probeStep (提速)
         ↓
触发 429  → minTime *= 1.25 (降速)
           isStable = true (锁定)
         ↓
后续执行 → 保持当前速率，不再探测
```

## 梯度冷冻策略

| 错误类型 | HTTP 状态 | 冷冻时长 | 行为 |
|---------|----------|---------|------|
| RATE_LIMIT | 429 | 5-10 秒 | 软封禁，很快恢复 |
| SERVER_ERROR | 5xx, 超时 | 30-60 秒 | 硬封禁，较长恢复 |
| LOGIC_ERROR | 400, 401, 403 | 不冷冻 | 直接抛出，不重试 |

## 持久化适配器

内置两个适配器，也可以自定义：

```typescript
// 内存（默认，进程重启丢失）
import { MemoryStorageAdapter } from '@shelchin/vendor-pool';

// 浏览器 LocalStorage
import { LocalStorageAdapter } from '@shelchin/vendor-pool';

// 自定义（如 Redis）
class RedisStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  async keys(prefix?: string): Promise<string[]> { /* ... */ }
  async clear(prefix?: string): Promise<void> { /* ... */ }
}
```

## 配置选项

```typescript
interface PoolOptions {
  // 持久化适配器
  storage?: StorageAdapter;

  // 人工干预回调
  onEscalate?: (context: EscalationContext) => void | Promise<void>;

  // 最大总重试次数（默认 10）
  maxRetries?: number;

  // 最大连续失败次数（默认 5）
  maxConsecutiveFailures?: number;

  // 全局超时 ms（默认 30000）
  timeout?: number;

  // 初始 minTime ms（默认 500，即 2 QPS）
  initialMinTime?: number;

  // 每次成功减少的 minTime（默认 20）
  probeStep?: number;

  // 撞墙后的降速倍率（默认 1.25）
  rateLimitBackoff?: number;

  // 软冷冻时长范围 ms（默认 [5000, 10000]）
  softFreezeDuration?: [number, number];

  // 硬冷冻时长范围 ms（默认 [30000, 60000]）
  hardFreezeDuration?: [number, number];
}
```

## API 参考

### Pool

| 方法 | 描述 |
|------|------|
| `do(input)` | 执行任务，返回 `PoolResult<TOutput>` |
| `getVendorStates()` | 获取所有供应商当前状态 |
| `reset()` | 重置所有供应商到初始状态 |
| `clearStorage()` | 清除持久化的状态数据 |

### PoolResult

```typescript
interface PoolResult<T> {
  result: T;       // 执行结果
  vendorId: string; // 处理的供应商 ID
  retries: number;  // 重试次数
  duration: number; // 总耗时 ms
}
```

### VendorState

```typescript
interface VendorState {
  id: string;
  isStable: boolean;    // 是否已锁定速率
  minTime: number;      // 当前 minTime (ms)
  frozenUntil: number;  // 冷冻截止时间戳
  successCount: number;
  failureCount: number;
  lastError?: string;
  lastErrorAt?: number;
}
```

## 扩展：自定义供应商

### 基本模式

```typescript
class MyVendor extends Vendor<TInput, TOutput> {
  readonly id = 'my-vendor';
  readonly weight = 1; // 越高越优先（不是负载均衡比例）

  async execute(input: TInput): Promise<TOutput> {
    // 你的 API 调用
  }

  // 可选：自定义错误分类
  classifyError(error: unknown): ErrorType {
    const msg = (error as Error)?.message?.toLowerCase() || '';
    if (msg.includes('429') || msg.includes('rate limit')) return ErrorType.RATE_LIMIT;
    if (msg.includes('401') || msg.includes('403')) return ErrorType.LOGIC_ERROR;
    return ErrorType.SERVER_ERROR;
  }
}
```

### RPC 供应商示例

在项目中实际使用的模式（biubiu.tools 中的 RPC 查询）：

```typescript
import { Pool, Vendor, ErrorType } from '@shelchin/vendor-pool';
import { createPublicClient, http, type Chain } from 'viem';

class RPCVendor extends Vendor<{ address: string }, { balance: bigint }> {
  readonly id: string;
  private rpcUrl: string;
  private chain: Chain;

  constructor(id: string, rpcUrl: string, chain: Chain, weight = 1) {
    super({ weight });
    this.id = id;
    this.rpcUrl = rpcUrl;
    this.chain = chain;
  }

  async execute(input: { address: string }) {
    const client = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
    const balance = await client.getBalance({ address: input.address as `0x${string}` });
    return { balance };
  }
}

// 每个网络一个 Pool，主 RPC 权重最高
function createNetworkPool(rpcs: string[], chain: Chain) {
  const vendors = rpcs.map((rpc, i) => {
    const weight = i === 0 ? 3 : 1; // 主 RPC 优先
    return new RPCVendor(`rpc-${i}`, rpc, chain, weight);
  });

  return new Pool(vendors, {
    maxRetries: 3,
    timeout: 15000,
  });
}
```

### 与 TaskHub 集成

vendor-pool 处理单次调用的重试和故障转移，TaskHub 处理批量调度和持久化。两者配合使用：

```typescript
import { TaskSource, type JobContext } from '@shelchin/taskhub';
import { Pool } from '@shelchin/vendor-pool';

class BalanceQuerySource extends TaskSource<BalanceQuery, BalanceResult> {
  readonly type = 'deterministic';
  private pools: Map<string, Pool<RPCInput, RPCOutput>>;

  constructor(queries: BalanceQuery[], pools: Map<string, Pool<RPCInput, RPCOutput>>) {
    super();
    this.pools = pools;
  }

  getData() { return this.queries; }

  async handler(input: BalanceQuery, ctx: JobContext): Promise<BalanceResult> {
    const pool = this.pools.get(input.network)!;

    // vendor-pool 处理 RPC 故障转移
    // TaskHub 处理 job 重试和持久化
    const { result } = await pool.do({ address: input.address });

    return {
      address: input.address,
      network: input.network,
      balance: result.balance.toString(),
    };
  }
}
```

### 自定义存储适配器

```typescript
// 例如：Redis 适配器
class RedisStorageAdapter implements StorageAdapter {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const val = await this.redis.get(key);
    return val ? JSON.parse(val) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.redis.set(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
  async keys(prefix?: string): Promise<string[]> {
    return await this.redis.keys(`${prefix || ''}*`);
  }
  async clear(prefix?: string): Promise<void> {
    const keys = await this.keys(prefix);
    if (keys.length) await this.redis.del(...keys);
  }
}
```

## 注意事项

### weight 是优先级，不是比例

权重只在选择供应商时打破平局。如果供应商 A（weight=1）空闲，供应商 B（weight=3）有 1 个排队任务，A 仍然会被选中。只有两者都空闲时，B 才优先。

### 存储错误不阻塞执行

`saveVendorState()` 中的存储操作失败会被静默忽略。这是设计决定：持久化是非关键路径，不应影响任务执行。

### Promise.race 的正确处理

Pool 内部使用 `Promise.race([vendorPromise, timeoutPromise])` 实现超时。已正确处理三个陷阱：

1. 两个分支都 `clearTimeout()`
2. vendorPromise 加了 `.catch(() => {})` 抑制 unhandled rejection
3. race 不会取消失败方 — vendor 调用可能在超时后仍然完成

### LogicError 不重试

400/401/403 等逻辑错误（`ErrorType.LOGIC_ERROR`）会直接抛出，不冷冻供应商，不重试。这些是调用方的问题，不是供应商的问题。

### 冷冻时长是随机的

软冷冻 5-10 秒、硬冷冻 30-60 秒在范围内随机。这是为了避免多个供应商同时解冻导致的"惊群效应"。

### isStable 后不再探测

供应商第一次触发 429 后 `isStable = true`，之后不再加速（`minTime -= probeStep` 不生效）。即使环境改善了，速率也不会自动回升。需要手动 `pool.reset()` 重新探测。

### 并发安全的初始化

多个 `pool.do()` 并发调用时，只会初始化一次（Promise 缓存模式）。后续调用等待初始化完成。

### onEscalate 是同步等待的

升级回调 `onEscalate` 被 await 后才抛出 `EscalationError`。可以在里面做异步操作（发告警、创建工单），但不要太慢。

## License

MIT
