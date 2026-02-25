# @shelchin/taskhub

自适应批量任务处理引擎。AIMD 并发控制、智能重试、崩溃恢复，跨 Node.js / Bun / 浏览器运行。

## 特性

- **AIMD 并发控制** — 基于成功/限流自动调节并发：成功加速，限流减速
- **智能重试** — 指数退避 + 延迟调度（不阻塞槽位）
- **崩溃恢复** — SQLite 持久化，进程重启后继续未完成任务
- **Merkle Root** — 确定性任务通过输入指纹去重
- **多平台存储** — Bun SQLite / Node.js SQLite / 浏览器 OPFS / IndexedDB / 内存
- **泛型类型安全** — `TaskSource<TInput, TOutput>` 全链路类型

## 安装

```bash
bun add @shelchin/taskhub

# Node.js 需额外安装
npm install better-sqlite3
```

## 快速开始

```typescript
import { createTaskHub, TaskSource, type JobContext } from '@shelchin/taskhub';

// 1. 定义 TaskSource
class DataProcessor extends TaskSource<string, number> {
  readonly type = 'deterministic';

  getData() {
    return ['item1', 'item2', 'item3'];
  }

  async handler(input: string, ctx: JobContext): Promise<number> {
    return input.length;
  }
}

// 2. 创建 Hub 和 Task
const hub = await createTaskHub();
const task = await hub.createTask({
  name: 'my-task',
  source: new DataProcessor(),
});

// 3. 监听事件
task.on('progress', (p) => {
  console.log(`${p.completed}/${p.total} (并发: ${p.concurrency})`);
});

task.on('job:complete', (job) => {
  console.log(`完成: ${job.input} → ${job.output}`);
});

// 4. 执行
await task.start();

// 5. 获取结果
const results = await task.getResults({ status: 'completed' });

// 6. 清理
await hub.close();
```

## 两种任务类型

### 确定性任务（Deterministic）

数据预先确定，生成 Merkle Root 指纹用于去重：

```typescript
class BatchQuery extends TaskSource<Address, Balance> {
  readonly type = 'deterministic';

  getData() {
    return this.addresses; // 返回数组
  }

  async handler(input: Address, ctx: JobContext): Promise<Balance> {
    return await queryBalance(input);
  }
}
```

**去重机制：** 相同输入数据集 → 相同 Merkle Root → `hub.findTaskByMerkleRoot()` 找到已有任务 → 跳过已完成的 job，只执行剩余的。

### 动态任务（Dynamic）

数据流式产生，无法预知总量：

```typescript
class PageCrawler extends TaskSource<PageItem, CrawlResult> {
  readonly type = 'dynamic';
  readonly id = 'page-crawler'; // 动态任务必须提供 id

  async *getData() {
    for (let page = 1; ; page++) {
      const items = await fetchPage(page);
      if (items.length === 0) break;
      for (const item of items) {
        yield item;
      }
    }
  }

  async handler(input: PageItem, ctx: JobContext): Promise<CrawlResult> {
    return await crawl(input);
  }
}
```

## AIMD 并发控制

```
初始并发: 5
    │
    ▼
 10 次连续成功 → 并发 +1 (加法增长)
    │
    ▼
 检测到 429   → 并发 ×0.5 (乘法减少)
    │
    ▼
 继续监测，自动适应
```

```typescript
await hub.createTask({
  name: 'my-task',
  source,
  concurrency: {
    min: 1,       // 最低并发
    max: 50,      // 最高并发
    initial: 5,   // 初始并发
  },
});
```

## Job 生命周期

```
pending ──[被 claim]──> active ──[成功]──> completed
                          │
                          ├──[可重试]──> pending (带 scheduledAt 延迟)
                          │
                          └──[不可重试 / 达到上限]──> failed
```

## 重试配置

```typescript
await hub.createTask({
  source,
  retry: {
    maxAttempts: 3,     // 最多 3 次（含首次）
    baseDelay: 1000,    // 首次重试延迟 1 秒
    maxDelay: 30000,    // 最大延迟 30 秒
  },
  timeout: 30000,       // 单个 job 超时 30 秒
});
```

**退避公式：** `delay = min(baseDelay × 2^(attempt-1), maxDelay)`

```
第 1 次重试: 1s
第 2 次重试: 2s
第 3 次重试: 4s
...上限 30s
```

## 自定义错误分类

```typescript
class MySource extends TaskSource<Input, Output> {
  // 判断错误是否应该重试
  isRetryable(error: unknown): boolean {
    if (error instanceof AuthError) return false; // 认证错误不重试
    return true;
  }

  // 判断是否是限流（触发 AIMD 降速）
  isRateLimited(error: unknown): boolean {
    return (error as any)?.status === 429;
  }
}
```

## 控制流

```typescript
// 启动
await task.start();

// 暂停（进行中的 job 会完成，不再 claim 新的）
task.pause();

// 恢复
await task.resume();

// 停止（取消进行中的 job，重置为 pending）
await task.stop();

// 销毁（删除所有数据）
await task.destroy();
```

## 崩溃恢复

TaskHub 将所有状态持久化到 SQLite。进程崩溃后：

```typescript
const hub = await createTaskHub();
const tasks = await hub.listTasks();

for (const meta of tasks) {
  if (meta.status === 'running' || meta.status === 'paused') {
    // 必须重新提供 TaskSource（包含 handler 逻辑）
    const task = await hub.resumeTask(meta.id, new MySource());
    if (task) {
      await task.resume();
    }
  }
}
```

**恢复保证：**
- 崩溃时 active 状态的 job 自动重置为 pending
- 已 completed 的 job 不会重新执行
- failed 的 job 可通过 `hub.resetFailedJobs(taskId)` 手动重置

## Merkle Root 去重

适用于浏览器场景（页面刷新后恢复之前的查询）：

```typescript
import { Hub, IndexedDBAdapter, computeMerkleRoot, generateJobId } from '@shelchin/taskhub/browser';

// 计算输入数据的 Merkle Root
const jobIds = await Promise.all(queries.map((q) => generateJobId(q)));
const merkleRoot = await computeMerkleRoot(jobIds);

// 查找是否已有相同任务
const existing = await hub.findTaskByMerkleRoot(merkleRoot);

if (existing) {
  // 恢复：加载已完成的结果，只执行剩余的
  const task = await hub.resumeTask(existing.id, source);
  const completed = await task.getResults({ status: 'completed' });
  // ... 使用已有结果
  await task.resume();
} else {
  // 新建任务
  const task = await hub.createTask({ name: '...', source });
  await task.start();
}
```

## 事件

```typescript
task.on('progress', (p) => {
  // p.total, p.completed, p.failed, p.pending, p.active
  // p.concurrency, p.elapsed, p.estimatedRemaining
});

task.on('job:start', (job) => { /* job 开始执行 */ });
task.on('job:complete', (job) => { /* job 成功完成 */ });
task.on('job:failed', (job, error) => { /* job 最终失败 */ });
task.on('job:retry', (job, attempt) => { /* job 重试中 */ });
task.on('rate-limited', (concurrency) => { /* 限流降速 */ });
task.on('completed', () => { /* 全部完成 */ });
task.on('error', (error) => { /* 任务级错误 */ });
```

## 存储适配器

| 适配器 | 环境 | 持久化 | 说明 |
|--------|------|--------|------|
| `BunSQLiteAdapter` | Bun | ✅ | 原生 `bun:sqlite`，最快 |
| `NodeSQLiteAdapter` | Node.js | ✅ | 需安装 `better-sqlite3` |
| `OPFSAdapter` | 浏览器 | ✅ | sqlite3.wasm，需 Chrome/Edge |
| `IndexedDBAdapter` | 浏览器 | ✅ | 所有浏览器兼容 |
| `MemoryAdapter` | 任意 | ❌ | 测试和临时任务 |

```typescript
// 自动检测
const hub = await createTaskHub({ storage: 'auto' });

// 指定存储
const hub = await createTaskHub({ storage: 'bun-sqlite', dbPath: 'tasks.db' });

// 浏览器
import { Hub, IndexedDBAdapter } from '@shelchin/taskhub/browser';
const hub = new Hub(new IndexedDBAdapter());
await hub.initialize();
```

**自动检测逻辑：** Bun → BunSQLite → Node.js → NodeSQLite → 浏览器 → OPFS → IndexedDB

## Hub API

| 方法 | 说明 |
|------|------|
| `createTask(options)` | 创建新任务 |
| `getTask(taskId)` | 获取已有任务 |
| `listTasks()` | 列出所有任务 |
| `deleteTask(taskId)` | 删除任务及其所有 job |
| `findTaskByMerkleRoot(root)` | 通过 Merkle Root 查找任务 |
| `resumeTask(taskId, source)` | 恢复任务 |
| `resetFailedJobs(taskId)` | 重置失败 job 为 pending |
| `close()` | 关闭 Hub，释放资源 |

## 默认配置

```typescript
// AIMD
initialConcurrency: 5,
minConcurrency: 1,
maxConcurrency: 50,
additiveIncrease: 1,
multiplicativeDecrease: 0.5,
successThreshold: 10,

// 重试
maxAttempts: 3,
baseDelay: 1000,
maxDelay: 30000,

// 超时
timeout: 30000,
```

## 示例

```bash
bun examples/basic.ts          # 基础用法
bun examples/dynamic.ts        # 流式数据
bun examples/retry.ts          # 重试机制
bun examples/pause-resume.ts   # 暂停/恢复
bun examples/aimd.ts           # AIMD 演示
bun examples/recovery.ts       # 崩溃恢复
bun examples/deterministic.ts  # Merkle Root 去重
```

## 架构

```
┌──────────────────────────────┐
│             Hub              │
│  创建任务 · 管理存储生命周期     │
└──────────────┬───────────────┘
               │
    ┌──────────▼──────────┐
    │        Task         │
    │  状态机 · 事件中心     │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │     Dispatcher      │
    │  AIMD · 重试 · 超时  │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │     TaskSource      │
    │  getData() · handler() │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   StorageAdapter    │
    │  SQLite / IndexedDB │
    └─────────────────────┘
```

## 注意事项

### handler 必须是幂等的

崩溃恢复会将 active job 重置为 pending 重新执行。如果 handler 有副作用（发送邮件、转账），必须自行保证幂等性。

### claimJobs 返回空 ≠ 任务完成

`claimJobs()` 返回空有两种原因：

1. 所有 job 都完成了（应该退出）
2. 有 pending job 但 `scheduledAt` 还没到（应该等待）

Dispatcher 内部用 `getJobCounts()` 显式检查 `pending === 0 && active === 0` 来判断终止。

### 延迟重试不阻塞槽位

重试的 job 不是 `await sleep()` 后再执行（那样会占用并发槽位），而是写入 `scheduledAt` 后立即释放，调度器轮询时重新 claim。

### Promise.race 超时处理

Job 超时使用 `Promise.race([handler, timeout])`：

- handler 的 Promise 在超时后仍然在执行（race 不取消失败方）
- handler 需要检查 `ctx.signal.aborted` 来配合取消
- Dispatcher 已正确处理 `clearTimeout` 和 `.catch(() => {})`

### 动态任务没有 Merkle Root

只有 deterministic 任务生成 Merkle Root。Dynamic 任务的 `merkleRoot` 始终为 null，不能用 `findTaskByMerkleRoot` 查找。

### MemoryAdapter 注意内存

默认保留所有已完成的 job。大数据集用 `new MemoryAdapter(true)` 开启自动清理，或直接用 SQLite。

### Job ID 碰撞

默认用 `SHA256(JSON.stringify(input))` 生成 job ID。两个不同输入 hash 相同会被视为重复。需要时可覆盖 `TaskSource.getJobId()`。

### AIMD 起步较慢

从 5 开始，每 10 次成功 +1，到 50 需要 450 次成功。短任务可能还没达到最优并发就结束了。可以通过提高 `initial` 来加速。

### 浏览器 OPFS 兼容性

OPFS + sqlite3.wasm 只在 Chrome/Edge 等支持 SAH Pool 的浏览器可用。Firefox/Safari 会 fallback 到 IndexedDB。

### hub.close() 必须调用

不调用会导致 SQLite 连接泄漏。在 try/finally 中确保清理：

```typescript
const hub = await createTaskHub();
try {
  // ... 使用 hub
} finally {
  await hub.close();
}
```
