# @shelchin/threadx

Worker 透明 RPC 通信库。像调用普通异步函数一样调用 Worker 方法，支持流式返回、零拷贝传输、自动取消。

## 特性

- **函数式调用** — `await worker.add(1, 2)` 代替 `postMessage` / `onmessage`
- **流式返回** — Generator 自动转为 `for await` 可迭代
- **零拷贝传输** — `t(buffer)` 标记 ArrayBuffer 避免复制开销
- **自动取消** — `break` 跳出循环自动发送 CANCEL 给 Worker
- **类型安全** — 方法签名自动推导，完整 TypeScript 支持
- **跨平台** — Browser、Node.js、Bun、Deno
- **零依赖** — 纯原生 API 实现

## 安装

```bash
bun add @shelchin/threadx
```

## 快速开始

### Worker 端

```typescript
// calc.worker.ts
import { expose } from '@shelchin/threadx/worker';

expose({
  // 同步方法 → 主线程拿到 Promise<number>
  add(a: number, b: number) {
    return a + b;
  },

  // 异步方法 → 主线程拿到 Promise<Data>
  async fetchData(url: string) {
    return await fetch(url).then((r) => r.json());
  },

  // Generator → 主线程拿到 AsyncIterable<number>
  *progress(total: number) {
    for (let i = 0; i <= total; i++) {
      yield Math.round((i / total) * 100);
    }
  },

  // AsyncGenerator → 主线程拿到 AsyncIterable<Page>
  async *fetchPages(urls: string[]) {
    for (const url of urls) {
      yield await fetch(url).then((r) => r.json());
    }
  },
});
```

### 主线程 — Web Worker（Browser / Bun / Deno）

```typescript
// main.ts
import { wrap, t, kill } from '@shelchin/threadx';
import type * as CalcMethods from './calc.worker';

const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'));

// 普通 RPC 调用
const sum = await calc.add(1, 2); // 3

// 流式读取
for await (const percent of calc.progress(100)) {
  console.log(`${percent}%`);
}

// 零拷贝传输
const buffer = new ArrayBuffer(1024 * 1024);
await calc.processBuffer(t(buffer));
// buffer.byteLength 现在是 0（已转移）

// 销毁 Worker
kill(calc);
```

### 主线程 — Node.js worker_threads

```typescript
import { Worker } from 'worker_threads';
import { wrap } from '@shelchin/threadx';
import type * as CalcMethods from './calc.worker';

// 用 Node.js Worker 代替 Web Worker，其他 API 完全一样
const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'));
const sum = await calc.add(1, 2);
kill(calc);
```

## 零拷贝传输

大数据通过 `t()` 标记后零拷贝传输，不经过序列化：

```typescript
import { t } from '@shelchin/threadx';

// 单个 Transferable（自动检测）
await api.process(t(buffer));

// 对象 + 指定 transferables 列表
await api.process(t({ image: buffer, meta: info }, [buffer]));
```

Worker 端返回也支持零拷贝：

```typescript
import { expose, t } from '@shelchin/threadx/worker';

expose({
  createBuffer(): ArrayBuffer {
    const buffer = new ArrayBuffer(1024);
    return t(buffer); // 零拷贝返回主线程
  },
});
```

**可传输类型：** ArrayBuffer、MessagePort、ImageBitmap、OffscreenCanvas

## 流式与取消

Generator 自动流式传输，`break` 自动取消 Worker 端：

```typescript
// 无限流 — break 时自动发送 CANCEL
for await (const n of api.infiniteCounter()) {
  if (n >= 100) break; // Worker 端的 generator 被 return()
}
```

## API 参考

### 主线程

| API | 说明 |
|-----|------|
| `wrap<T>(worker, options?)` | 包装 Worker 为 RPC 代理 |
| `t(value, transferables?)` | 标记零拷贝传输 |
| `kill(proxy)` | 终止 Worker |
| `detectRuntime()` | 检测运行时：`'web'` / `'node'` / `'bun'` / `'deno'` |
| `isWorkerContext()` | 当前是否在 Worker 上下文中 |

**wrap 选项：**

```typescript
wrap<T>(worker, {
  timeout: 30000, // 默认超时 30 秒
  name: 'calc',   // 调试名称
});
```

**状态属性：**

```typescript
api.$state;   // 'init' → 'ready' → 'dead'
api.$pending; // 进行中的调用/流数量
api.$worker;  // 原始 Worker 实例
```

### Worker 端

| API | 说明 |
|-----|------|
| `expose(methods)` | 暴露方法给主线程 |
| `t(value, transferables?)` | 返回值零拷贝传输 |

### 错误类型

```typescript
import { WorkerError, TimeoutError, InitError } from '@shelchin/threadx';

try {
  await api.riskyMethod();
} catch (e) {
  if (e instanceof WorkerError) {
    e.message;      // 错误消息
    e.name;         // 原始类型：'TypeError' 等
    e.workerStack;  // Worker 端堆栈
  }

  if (e instanceof TimeoutError) {
    // 调用超时
  }

  if (e instanceof InitError) {
    // Worker 初始化失败或已被终止
  }
}
```

## 类型推导

| Worker 端返回类型 | 主线程拿到的类型 |
|------------------|----------------|
| `T` (同步) | `Promise<T>` |
| `Promise<T>` | `Promise<T>` |
| `Generator<T>` | `AsyncIterable<T>` |
| `AsyncGenerator<T>` | `AsyncIterable<T>` |

```typescript
// worker.ts
export function add(a: number, b: number): number { ... }
export function* count(n: number): Generator<number> { ... }

// main.ts — 自动推导
const api = wrap<typeof import('./worker')>(worker);
await api.add(1, 2);        // Promise<number> ✓
for await (const n of api.count(10)) {} // AsyncIterable<number> ✓
```

## 并发调用

同一 Worker 可并行处理多个调用：

```typescript
const [sum, product, fib] = await Promise.all([
  api.add(1, 2),
  api.multiply(3, 4),
  api.fibonacci(20),
]);
```

## 测试工具

```typescript
import { createMockWorker, createSlowStartWorker } from '@shelchin/threadx';

// 同线程模拟（不启动真实 Worker）
const mock = createMockWorker({
  add: (a: number, b: number) => a + b,
});
const api = wrap<API>(mock);
await api.add(1, 2); // 3

// 模拟慢启动
const slow = createSlowStartWorker(methods, 500);
```

## 平台支持

| 平台 | Worker 类型 | 支持 |
|------|-----------|------|
| Browser | Web Worker | ✅ |
| Bun | Web Worker | ✅ |
| Deno | Web Worker | ✅ |
| Node.js | worker_threads | ✅ |
| Cloudflare Workers | — | ❌ |

## 示例

```bash
# Web Worker 示例
bun examples/basic.main.ts
bun examples/streaming.main.ts
bun examples/transfer.main.ts
bun examples/error-handling.main.ts

# Node.js worker_threads 示例
bun examples/node/basic.main.ts
npx tsx examples/node/basic.main.ts
```

## 通信协议

理解内部协议有助于调试：

**主线程 → Worker：**
- `CALL` — `{ $type, $id, method, args }` 调用方法
- `CANCEL` — `{ $type, $id }` 取消流式调用

**Worker → 主线程：**
- `READY` — `{ $type, methods }` 初始化完成
- `RESOLVE` — `{ $type, $id, value }` 调用成功
- `REJECT` — `{ $type, $id, error }` 调用失败
- `YIELD` — `{ $type, $id, value }` 流式中间值
- `DONE` — `{ $type, $id }` 流式结束

## 注意事项

- **不支持循环引用** — 跨 Worker 传输依赖 structured clone，循环引用会报错
- **不能传函数和类实例** — 只有可序列化的数据能跨 Worker 传递
- **Worker 不能调主线程** — 通信是单向 RPC（主 → Worker），Worker 不能主动调用主线程方法
- **`t()` 后原数据失效** — transfer 后 ArrayBuffer 的 byteLength 变为 0，不要再访问
- **同一调用不能既 await 又 for await** — 返回值是双模式对象，但用了 `.then()` 就不能再 `for await`（会竞争）
- **超时按 yield 重置** — 流式调用的超时是相邻 yield 之间的间隔，不是整个流的总时间。如果一次 yield 到下一次 yield 之间有大量计算，超时不会生效
- **Worker 初始化有延迟** — 第一次调用会等 READY 消息，初始化期间的调用会排队。建议复用 Worker 而非频繁创建
- **取消是尽力而为** — `break` 发送 CANCEL 后 Worker 端 `gen.return()` 被调用，但不能保证立即停止。不要依赖取消做关键资源释放，用 try/finally
- **Worker 和主线程完全隔离** — 不共享内存、不共享对象引用、不共享 DOM
