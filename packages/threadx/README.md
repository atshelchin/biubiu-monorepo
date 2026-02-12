# @shelchin/threadx

Seamless Worker communication - call Workers like async functions.

## Features

- **Transparent RPC** - Call Worker methods like regular async functions
- **Streaming Support** - Use generators for streaming results with `for await`
- **Zero-Copy Transfer** - Transfer ArrayBuffers without copying
- **Type Safe** - Full TypeScript support with automatic type inference
- **Cancellation** - Break out of streams to cancel Worker operations
- **Cross-Platform** - Works in Browser, Bun, Deno, and Node.js

## Installation

```bash
bun add @shelchin/threadx
# or
npm install @shelchin/threadx
```

## Quick Start

### Worker Side

```typescript
// calc.worker.ts
import { expose } from '@shelchin/threadx/worker'

expose({
  add(a: number, b: number) {
    return a + b
  },

  async fetchData(url: string) {
    const res = await fetch(url)
    return res.json()
  },

  *progress(total: number) {
    for (let i = 0; i <= total; i++) {
      yield Math.round((i / total) * 100)
    }
  }
})
```

### Main Thread - Web Worker (Browser/Bun/Deno)

```typescript
// main.ts
import { wrap, t, kill } from '@shelchin/threadx'
import type * as CalcMethods from './calc.worker'

const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'))

// RPC call - just like a regular function
const sum = await calc.add(1, 2)  // 3

// Streaming with for-await
for await (const percent of calc.progress(100)) {
  console.log(`${percent}%`)
}

// Zero-copy transfer
const buffer = new ArrayBuffer(1024 * 1024)
await calc.processBuffer(t(buffer))
// buffer.byteLength is now 0 (transferred)

// Terminate worker
kill(calc)
```

### Main Thread - Node.js worker_threads

```typescript
// main.ts
import { Worker } from 'worker_threads'
import { wrap, t, kill } from '@shelchin/threadx'
import type * as CalcMethods from './calc.worker'

// Use Node.js Worker instead of Web Worker
const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'))

// Same API as Web Worker!
const sum = await calc.add(1, 2)

// Streaming works the same way
for await (const percent of calc.progress(100)) {
  console.log(`${percent}%`)
}

kill(calc)
```

## API

### Main Thread

#### `wrap<T>(worker, options?)`

Wrap a Worker for seamless RPC. Works with both Web Workers and Node.js worker_threads.

```typescript
// Web Worker
const api = wrap<typeof WorkerMethods>(new Worker('./worker.js'), {
  timeout: 30000,  // Default timeout in ms
})

// Node.js worker_threads
import { Worker } from 'worker_threads'
const api = wrap<typeof WorkerMethods>(new Worker('./worker.js'), {
  timeout: 30000,
})
```

#### `t(value, transferables?)`

Mark value for zero-copy transfer.

```typescript
// Single transferable
await api.process(t(buffer))

// Object with specified transferables
await api.process(t({ image: buffer, meta: info }, [buffer]))
```

#### `kill(proxy)`

Terminate the Worker.

```typescript
kill(api)
```

#### State Hooks

```typescript
api.$state    // 'init' | 'ready' | 'dead'
api.$pending  // Number of pending calls
api.$worker   // Original Worker instance
```

#### `detectRuntime()`

Detect the current runtime environment.

```typescript
import { detectRuntime } from '@shelchin/threadx'

const runtime = detectRuntime()  // 'web' | 'node' | 'bun' | 'deno'
```

### Worker Side

#### `expose(methods)`

Expose methods to main thread.

```typescript
import { expose } from '@shelchin/threadx/worker'

expose({
  // Sync function → Promise
  add: (a, b) => a + b,

  // Async function → Promise
  async fetch(url) {
    return await fetch(url).then(r => r.json())
  },

  // Generator → AsyncIterable
  *range(start, end) {
    for (let i = start; i <= end; i++) yield i
  },

  // Async Generator → AsyncIterable
  async *stream(urls) {
    for (const url of urls) {
      yield await fetch(url).then(r => r.json())
    }
  }
})
```

### Error Types

```typescript
import { WorkerError, TimeoutError, InitError } from '@shelchin/threadx'

try {
  await api.riskyMethod()
} catch (e) {
  if (e instanceof WorkerError) {
    console.log(e.message)      // Error message
    console.log(e.name)         // Original error name (e.g., 'TypeError')
    console.log(e.workerStack)  // Stack from Worker
  }
  if (e instanceof TimeoutError) {
    console.log('Call timed out')
  }
  if (e instanceof InitError) {
    console.log('Worker failed to initialize')
  }
}
```

## Streaming & Cancellation

Generators automatically stream values. Use `break` to cancel:

```typescript
for await (const chunk of api.longProcess()) {
  console.log(chunk)
  if (shouldStop) break  // Sends CANCEL to Worker
}
```

## Type Safety

Full type inference from Worker methods:

```typescript
// worker.ts
export function add(a: number, b: number): number { ... }
export function* count(n: number): Generator<number> { ... }

// main.ts
import type * as Methods from './worker'

const api = wrap<typeof Methods>(worker)

await api.add(1, 2)     // Promise<number>
api.count(10)           // AsyncIterable<number>
```

## Platform Support

| Platform | Support | Worker Type |
|----------|---------|-------------|
| Browser | ✅ | Web Worker |
| Bun | ✅ | Web Worker |
| Deno | ✅ | Web Worker |
| Node.js | ✅ | worker_threads |
| Cloudflare Workers | ❌ | Not supported |

## Examples

### Running Examples

```bash
# Web Worker examples (Browser/Bun)
bun examples/basic.main.ts
bun examples/streaming.main.ts
bun examples/transfer.main.ts
bun examples/error-handling.main.ts

# Node.js worker_threads examples
bun examples/node/basic.main.ts
bun examples/node/streaming.main.ts

# Or with Node.js directly
npx tsx examples/node/basic.main.ts
```

## License

MIT
