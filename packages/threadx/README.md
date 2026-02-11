# @shelchin/threadx

Seamless Worker communication - call Workers like async functions.

## Features

- **Transparent RPC** - Call Worker methods like regular async functions
- **Streaming Support** - Use generators for streaming results with `for await`
- **Zero-Copy Transfer** - Transfer ArrayBuffers without copying
- **Type Safe** - Full TypeScript support with automatic type inference
- **Cancellation** - Break out of streams to cancel Worker operations
- **Cross-Platform** - Works in Browser, Bun, and Deno

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

### Main Thread

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

## API

### Main Thread

#### `wrap<T>(worker, options?)`

Wrap a Worker for seamless RPC.

```typescript
const api = wrap<typeof WorkerMethods>(new Worker('./worker.js'), {
  timeout: 30000,  // Default timeout in ms
  name: 'calc'     // Debug name
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

| Platform | Support |
|----------|---------|
| Browser | Native Worker |
| Bun | Native Worker |
| Deno | Native Worker |
| Node.js | Not supported |
| Cloudflare Workers | Not supported |

## License

MIT
