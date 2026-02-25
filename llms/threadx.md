# ThreadX - 无感知 Worker 通信库

## 设计规范文档 v1.0

---

## 1. 设计哲学

> **把复杂的逻辑留给库，把简单的接口留给开发者，把确定性的结果交给老板。**

### 核心原则

| 原则               | 说明                                                     |
| ------------------ | -------------------------------------------------------- |
| **无感知**   | 调用 Worker 就像调用普通异步函数，开发者无需关心底层通信 |
| **确定性**   | 显式优于隐式，Transfer 需明确标记，行为可预测            |
| **原语对齐** | RPC →`Promise`，流式 → `AsyncIterable`，不造轮子   |
| **职责单一** | 只做点对点通信，不做池化调度                             |

### 设计目标

```typescript
// 这是我们追求的开发体验
// 你能看出这是在调用 Worker 吗？

const api = wrap(new Worker('./calc.js'))

const sum = await api.add(1, 2)

for await (const progress of api.process(data)) {
  console.log(`${progress}%`)
}
```

---

## 2. 核心 API

### 2.1 API 总览

```typescript
// 主线程
wrap<T>(worker)        // 包装 Worker，返回类型安全的代理
t(value)               // 标记为 Transferable
kill(proxy)            // 终止 Worker

// Worker 侧
expose(methods)        // 暴露方法给主线程

// 状态钩子
proxy.$state           // 'init' | 'ready' | 'dead'
proxy.$pending         // 当前挂起的调用数量
proxy.$worker          // 原始 Worker 实例

// 错误类型
WorkerError            // Worker 内部执行错误
TimeoutError           // 调用超时
InitError              // Worker 初始化失败
```

### 2.2 主线程 API

#### `wrap<T>(worker, options?)`

包装原生 Worker，返回类型化代理。

```typescript
import { wrap } from 'threadx'
import type * as CalcMethods from './calc.worker'

const calc = wrap<typeof CalcMethods>(
  new Worker('./calc.worker.js')
)

// 现在可以像调用本地函数一样使用
const result = await calc.add(1, 2)
```

**参数：**

| 参数                | 类型       | 说明                           |
| ------------------- | ---------- | ------------------------------ |
| `worker`          | `Worker` | 原生 Worker 实例               |
| `options.timeout` | `number` | 默认调用超时（ms），默认 30000 |
| `options.name`    | `string` | 调试用名称                     |

**返回：** `WrappedWorker<T>` - 类型安全的代理对象

---

#### `t(value, transferables?)`

标记值为 Transferable，所有权转移到 Worker。

```typescript
import { t } from 'threadx'

const buffer = new ArrayBuffer(1024 * 1024)

// 转移 buffer 所有权（零拷贝）
await calc.process(t(buffer))

// 此时 buffer.byteLength === 0（已被转移）
```

**重载形式：**

```typescript
// 形式 1：单个 Transferable
t(buffer: ArrayBuffer): Transferable

// 形式 2：对象 + 指定 transferables
t(data: any, transferables: Transferable[]): Transferable

// 示例
t({ image: buffer, meta: info }, [buffer])
```

---

#### `kill(proxy)`

终止 Worker。

```typescript
import { kill } from 'threadx'

kill(calc)

// 或者
calc.$worker.terminate()  // 直接访问原生方法
```

---

### 2.3 Worker 侧 API

#### `expose(methods)`

暴露方法对象给主线程。

```typescript
// calc.worker.ts
import { expose } from 'threadx/worker'

expose({
  add(a: number, b: number) {
    return a + b
  },

  async heavyTask(data: ArrayBuffer) {
    // 耗时计算...
    return result
  },

  // Generator 自动转为 AsyncIterable
  *progress(total: number) {
    for (let i = 0; i <= total; i++) {
      yield i
      // 可以 await
    }
  }
})
```

**支持的返回类型：**

| 返回类型              | 主线程接收           |
| --------------------- | -------------------- |
| `T`                 | `Promise<T>`       |
| `Promise<T>`        | `Promise<T>`       |
| `Generator<T>`      | `AsyncIterable<T>` |
| `AsyncGenerator<T>` | `AsyncIterable<T>` |

---

### 2.4 状态钩子

```typescript
const calc = wrap(new Worker('./calc.js'))

// 当前状态
calc.$state    // 'init' | 'ready' | 'dead'

// 挂起的调用数量
calc.$pending  // number

// 原始 Worker（逃生舱口）
calc.$worker   // Worker
```

**用途：** 便于第三方实现池化、负载均衡等高级功能。

---

### 2.5 错误类型

```typescript
import { WorkerError, TimeoutError, InitError } from 'threadx'

try {
  await calc.riskyOperation()
} catch (e) {
  if (e instanceof WorkerError) {
    // Worker 内部抛出的错误
    console.log(e.message)      // 错误消息
    console.log(e.workerStack)  // Worker 侧的完整堆栈
  }
  
  if (e instanceof TimeoutError) {
    // 调用超时
  }
  
  if (e instanceof InitError) {
    // Worker 初始化失败
  }
}
```

---

## 3. 通信协议

### 3.1 消息格式

#### 主线程 → Worker

```typescript
interface CallMessage {
  $type: 'CALL'
  $id: number          // 自增 ID
  method: string       // 方法名
  args: any[]          // 参数
}

interface CancelMessage {
  $type: 'CANCEL'
  $id: number          // 要取消的调用 ID
}
```

#### Worker → 主线程

```typescript
interface ReadyMessage {
  $type: 'READY'
  methods: string[]    // 暴露的方法列表
}

interface ResolveMessage {
  $type: 'RESOLVE'
  $id: number
  value: any
}

interface RejectMessage {
  $type: 'REJECT'
  $id: number
  error: SerializedError
}

// 流式消息
interface YieldMessage {
  $type: 'YIELD'
  $id: number
  value: any
}

interface DoneMessage {
  $type: 'DONE'
  $id: number
}
```

### 3.2 序列化错误格式

```typescript
interface SerializedError {
  name: string
  message: string
  stack?: string
}
```

### 3.3 通信时序

#### RPC 调用

```
Main                          Worker
  │                              │
  │──── CALL {id:1, add, [1,2]} ─────>│
  │                              │ execute add(1, 2)
  │<──── RESOLVE {id:1, value:3} ─────│
  │                              │
```

#### 流式调用

```
Main                          Worker
  │                              │
  │──── CALL {id:2, progress} ───────>│
  │                              │ yield 0
  │<──── YIELD {id:2, value:0} ───────│
  │                              │ yield 50
  │<──── YIELD {id:2, value:50} ──────│
  │                              │ yield 100
  │<──── YIELD {id:2, value:100} ─────│
  │<──── DONE {id:2} ─────────────────│
  │                              │
```

#### 取消流式调用

```
Main                          Worker
  │                              │
  │──── CALL {id:3, stream} ─────────>│
  │<──── YIELD {id:3, value} ─────────│
  │                              │
  │──── CANCEL {id:3} ───────────────>│ cleanup
  │                              │
```

---

## 4. 类型系统

### 4.1 类型转换

```typescript
// 核心类型：将同步/异步方法转为 Promise/AsyncIterable
type Promisify<T> = T extends (...args: infer A) => Generator<infer Y, any, any>
  ? (...args: A) => AsyncIterable<Y>
  : T extends (...args: infer A) => AsyncGenerator<infer Y, any, any>
  ? (...args: A) => AsyncIterable<Y>
  : T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never

// 将整个模块类型转换
type WrapModule<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: Promisify<T[K]>
}

// WrappedWorker 类型
type WrappedWorker<T> = WrapModule<T> & {
  $state: 'init' | 'ready' | 'dead'
  $pending: number
  $worker: Worker
}
```

### 4.2 使用示例

```typescript
// worker.ts 导出的类型
export function add(a: number, b: number): number
export async function fetch(url: string): Promise<Response>
export function* count(n: number): Generator<number>

// 转换后的类型
type Wrapped = WrappedWorker<typeof import('./worker')>
// {
//   add(a: number, b: number): Promise<number>
//   fetch(url: string): Promise<Response>
//   count(n: number): AsyncIterable<number>
//   $state: 'init' | 'ready' | 'dead'
//   $pending: number
//   $worker: Worker
// }
```

---

## 5. 实现细节

### 5.1 Proxy 代理层

```typescript
function wrap<T>(worker: Worker, options?: WrapOptions): WrappedWorker<T> {
  const pending = new Map<number, PendingCall>()
  let id = 0
  let state: State = 'init'
  const queue: QueuedCall[] = []  // 初始化前的调用缓冲

  worker.onmessage = (e) => {
    const msg = e.data
  
    if (msg.$type === 'READY') {
      state = 'ready'
      flushQueue()  // 发送缓冲的调用
      return
    }
  
    const call = pending.get(msg.$id)
    if (!call) return
  
    switch (msg.$type) {
      case 'RESOLVE':
        call.resolve(msg.value)
        pending.delete(msg.$id)
        break
      case 'REJECT':
        call.reject(deserializeError(msg.error))
        pending.delete(msg.$id)
        break
      case 'YIELD':
        call.push(msg.value)
        break
      case 'DONE':
        call.done()
        pending.delete(msg.$id)
        break
    }
  }

  return new Proxy({} as WrappedWorker<T>, {
    get(_, prop: string) {
      // 状态钩子
      if (prop === '$state') return state
      if (prop === '$pending') return pending.size
      if (prop === '$worker') return worker

      // 方法调用
      return (...args: any[]) => {
        const currentId = ++id
      
        if (isGeneratorCall(prop)) {
          return createAsyncIterable(worker, currentId, prop, args, pending)
        }
      
        return createPromise(worker, currentId, prop, args, pending, state, queue)
      }
    }
  })
}
```

### 5.2 Worker 侧实现

```typescript
function expose(methods: Record<string, Function>) {
  const methodNames = Object.keys(methods)
  
  self.postMessage({ $type: 'READY', methods: methodNames })
  
  self.onmessage = async (e) => {
    const msg = e.data
  
    if (msg.$type === 'CALL') {
      const fn = methods[msg.method]
      if (!fn) {
        self.postMessage({
          $type: 'REJECT',
          $id: msg.$id,
          error: { name: 'Error', message: `Method ${msg.method} not found` }
        })
        return
      }
    
      try {
        const result = fn(...msg.args)
      
        // Generator → 流式发送
        if (isGenerator(result)) {
          for await (const value of result) {
            self.postMessage({ $type: 'YIELD', $id: msg.$id, value })
          }
          self.postMessage({ $type: 'DONE', $id: msg.$id })
        } else {
          // Promise/普通值 → 单次发送
          const value = await result
          self.postMessage({ $type: 'RESOLVE', $id: msg.$id, value })
        }
      } catch (err) {
        self.postMessage({
          $type: 'REJECT',
          $id: msg.$id,
          error: serializeError(err)
        })
      }
    }
  
    if (msg.$type === 'CANCEL') {
      // 取消逻辑（如果有活跃的 generator）
    }
  }
}
```

### 5.3 错误栈处理

```typescript
class WorkerError extends Error {
  workerStack?: string
  
  constructor(serialized: SerializedError, callSite: Error) {
    super(serialized.message)
    this.name = serialized.name
    this.workerStack = serialized.stack
  
    // 简洁模式：主线程堆栈为主
    this.stack = `${this.name}: ${this.message}\n` +
      `    at Worker\n` +
      callSite.stack?.split('\n').slice(1).join('\n')
  }
}
```

### 5.4 Transferable 处理

```typescript
const TRANSFER = Symbol('transfer')

interface TransferDescriptor {
  [TRANSFER]: true
  value: any
  transferables: Transferable[]
}

function t(value: Transferable): TransferDescriptor
function t<T>(value: T, transferables: Transferable[]): TransferDescriptor
function t(value: any, transferables?: Transferable[]): TransferDescriptor {
  return {
    [TRANSFER]: true,
    value,
    transferables: transferables ?? [value]
  }
}

function prepareArgs(args: any[]): { args: any[], transfer: Transferable[] } {
  const transfer: Transferable[] = []
  const processedArgs = args.map(arg => {
    if (arg?.[TRANSFER]) {
      transfer.push(...arg.transferables)
      return arg.value
    }
    return arg
  })
  return { args: processedArgs, transfer }
}
```

---

## 6. 跨平台支持

### 6.1 运行时检测

```typescript
type Runtime = 'browser' | 'node' | 'bun' | 'deno' | 'unsupported'

function detectRuntime(): Runtime {
  if (typeof window !== 'undefined') return 'browser'
  if (typeof Bun !== 'undefined') return 'bun'
  if (typeof Deno !== 'undefined') return 'deno'
  if (typeof process !== 'undefined' && process.versions?.node) return 'node'
  return 'unsupported'
}
```

### 6.2 平台适配

| 平台       | Worker API         | 适配方式                         |
| ---------- | ------------------ | -------------------------------- |
| Browser    | `Worker`         | 原生                             |
| Node.js    | `worker_threads` | 包装为 Worker 接口               |
| Bun        | `Worker`         | 原生（Web API 兼容）             |
| Deno       | `Worker`         | 原生（Web API 兼容）             |
| Cloudflare | ❌                 | 抛出 `UnsupportedRuntimeError` |

### 6.3 Node.js 适配层

```typescript
// node/worker.ts
import { Worker as NodeWorker, parentPort } from 'worker_threads'

export class Worker {
  private worker: NodeWorker
  
  constructor(url: string | URL) {
    this.worker = new NodeWorker(url)
  }
  
  postMessage(data: any, transfer?: Transferable[]) {
    this.worker.postMessage(data, transfer)
  }
  
  set onmessage(handler: (e: MessageEvent) => void) {
    this.worker.on('message', (data) => {
      handler({ data } as MessageEvent)
    })
  }
  
  terminate() {
    this.worker.terminate()
  }
}
```

---

## 7. 项目结构

```
threadx/
├── src/
│   ├── index.ts              # 主入口 (wrap, t, kill)
│   ├── worker.ts             # Worker 入口 (expose)
│   ├── proxy.ts              # Proxy 代理实现
│   ├── protocol.ts           # 消息协议类型
│   ├── transfer.ts           # Transferable 处理
│   ├── errors.ts             # 错误类型定义
│   ├── async-iterable.ts     # AsyncIterable 实现
│   ├── runtime.ts            # 运行时检测
│   └── adapters/
│       ├── browser.ts        # 浏览器适配
│       ├── node.ts           # Node.js 适配
│       ├── bun.ts            # Bun 适配
│       └── deno.ts           # Deno 适配
├── package.json
└── tsconfig.json
```

### 导出结构

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./worker": "./dist/worker.js"
  }
}
```

---

## 8. 完整使用示例

### 8.1 基础 RPC

```typescript
// math.worker.ts
import { expose } from 'threadx/worker'

expose({
  add: (a: number, b: number) => a + b,
  multiply: (a: number, b: number) => a * b,
  
  async fetchData(url: string) {
    const res = await fetch(url)
    return res.json()
  }
})

// main.ts
import { wrap } from 'threadx'
import type * as MathWorker from './math.worker'

const math = wrap<typeof MathWorker>(new Worker('./math.worker.js'))

const sum = await math.add(1, 2)        // 3
const product = await math.multiply(3, 4) // 12
const data = await math.fetchData('/api') // {...}
```

### 8.2 流式返回

```typescript
// stream.worker.ts
import { expose } from 'threadx/worker'

expose({
  *countdown(from: number) {
    for (let i = from; i >= 0; i--) {
      yield i
    }
  },
  
  async *fetchPages(urls: string[]) {
    for (const url of urls) {
      const res = await fetch(url)
      yield await res.json()
    }
  }
})

// main.ts
const worker = wrap<typeof StreamWorker>(new Worker('./stream.worker.js'))

for await (const n of worker.countdown(10)) {
  console.log(n)  // 10, 9, 8, ... 0
}

for await (const page of worker.fetchPages(['/p1', '/p2', '/p3'])) {
  console.log(page)
}
```

### 8.3 大数据传输

```typescript
// image.worker.ts
import { expose } from 'threadx/worker'

expose({
  processImage(buffer: ArrayBuffer) {
    const view = new Uint8Array(buffer)
    // 图像处理...
    return view.buffer  // 返回处理后的 buffer
  }
})

// main.ts
import { wrap, t } from 'threadx'

const worker = wrap<typeof ImageWorker>(new Worker('./image.worker.js'))

const image = await loadImage()  // ArrayBuffer

// 零拷贝传输
const processed = await worker.processImage(t(image))

// image 已被转移，不可用
// processed 是新的处理后的 buffer
```

### 8.4 错误处理

```typescript
import { wrap, WorkerError, TimeoutError } from 'threadx'

const worker = wrap(new Worker('./worker.js'), {
  timeout: 5000  // 5 秒超时
})

try {
  await worker.riskyOperation()
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log('操作超时')
  }
  
  if (e instanceof WorkerError) {
    console.log('Worker 错误:', e.message)
    console.log('Worker 堆栈:', e.workerStack)
  }
}
```

### 8.5 配合第三方池化库

```typescript
// 利用 $state 和 $pending 实现简单池化
class WorkerPool<T> {
  private workers: WrappedWorker<T>[]
  
  constructor(factory: () => WrappedWorker<T>, size: number) {
    this.workers = Array.from({ length: size }, factory)
  }
  
  async exec<R>(fn: (w: WrappedWorker<T>) => Promise<R>): Promise<R> {
    // 找到最空闲的 worker
    const worker = this.workers
      .filter(w => w.$state === 'ready')
      .sort((a, b) => a.$pending - b.$pending)[0]
  
    if (!worker) throw new Error('No available worker')
  
    return fn(worker)
  }
}
```

---

## 9. 开发路线图

### Phase 1: MVP（核心 RPC）

* [ ] `wrap()` + Proxy 实现
* [ ] `expose()` + 消息处理
* [ ] 消息 ID 匹配机制
* [ ] 基础错误传递
* [ ] 隐式初始化缓冲

### Phase 2: 完整功能

* [ ] `t()` Transferable 标记
* [ ] Generator → AsyncIterable
* [ ] 取消订阅（CANCEL 消息）
* [ ] 超时处理
* [ ] 错误类型（WorkerError, TimeoutError, InitError）

### Phase 3: 跨平台

* [ ] Node.js worker_threads 适配
* [ ] Bun 测试 + 适配
* [ ] Deno 测试 + 适配
* [ ] Cloudflare 检测 + 报错

### Phase 4: 开发体验

* [ ] 完整 TypeScript 类型推导
* [ ] 调试工具（消息日志）
* [ ] 性能基准测试
* [ ] 文档 + 示例

---

## 10. API 速查表

```typescript
// === 主线程 ===
import { wrap, t, kill, WorkerError, TimeoutError, InitError } from 'threadx'

const w = wrap<T>(worker, options?)   // 包装 Worker
t(value)                              // 标记 Transferable
t(obj, [transferables])               // 复杂对象 + 指定 transferables
kill(w)                               // 终止 Worker

w.$state                              // 'init' | 'ready' | 'dead'
w.$pending                            // 挂起调用数
w.$worker                             // 原始 Worker

// === Worker 侧 ===
import { expose } from 'threadx/worker'

expose({
  method() { return value },          // → Promise<value>
  async method() { return value },    // → Promise<value>
  *method() { yield value },          // → AsyncIterable<value>
  async *method() { yield value },    // → AsyncIterable<value>
})
```
