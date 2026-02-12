# @shelchin/taskhub

Adaptive batch task processing engine with intelligent concurrency control.

## Features

- **Adaptive Concurrency (AIMD)** - Automatically adjusts concurrency based on rate limits using Additive Increase / Multiplicative Decrease algorithm
- **Intelligent Retry** - Exponential backoff with configurable retry policies
- **Crash Recovery** - SQLite-backed persistence for reliable recovery
- **Multi-Platform** - Works on Node.js, Bun, and browsers
- **Type-Safe** - Full TypeScript support with generics
- **Merkle Root Fingerprinting** - Deterministic task identification for deduplication

## Installation

```bash
# Bun
bun add @shelchin/taskhub

# npm
npm install @shelchin/taskhub

# For Node.js, also install:
npm install better-sqlite3
```

## Quick Start

```typescript
import { createTaskHub, TaskSource, type JobContext } from '@shelchin/taskhub';

// 1. Define your task source
class MyProcessor extends TaskSource<string, number> {
  readonly type = 'deterministic';

  getData() {
    return ['item1', 'item2', 'item3'];
  }

  async handler(input: string, ctx: JobContext): Promise<number> {
    // Process each item
    return input.length;
  }
}

// 2. Create hub and task
const hub = await createTaskHub();
const task = await hub.createTask({
  name: 'my-task',
  source: new MyProcessor(),
});

// 3. Monitor progress
task.on('progress', (p) => {
  console.log(`${p.completed}/${p.total} (concurrency: ${p.concurrency})`);
});

// 4. Execute
await task.start();

// 5. Get results
const results = await task.getResults({ status: 'completed' });
console.log(results);

// 6. Cleanup
await hub.close();
```

## Core Concepts

### Task Types

| Type | getData() Returns | Merkle Root | Use Case |
|------|------------------|-------------|----------|
| **deterministic** | `TInput[]` | Yes | Known dataset, deduplication needed |
| **dynamic** | `AsyncIterable<TInput>` | No | Streaming data, unknown size |

### Deterministic Tasks

Pre-defined data with Merkle root fingerprinting:

```typescript
class BatchProcessor extends TaskSource<number, string> {
  readonly type = 'deterministic';

  getData() {
    return [1, 2, 3, 4, 5]; // Array
  }

  async handler(input: number) {
    return `Processed: ${input}`;
  }
}
```

### Dynamic Tasks

Streaming data with async iterables:

```typescript
class StreamProcessor extends TaskSource<PageItem, Result> {
  readonly type = 'dynamic';
  readonly id = 'my-stream'; // Required for dynamic tasks

  async *getData() {
    for (let page = 1; page <= 100; page++) {
      const items = await fetchPage(page);
      for (const item of items) {
        yield item;
      }
    }
  }

  async handler(input: PageItem) {
    return processItem(input);
  }
}
```

### AIMD Algorithm

Adaptive concurrency control that automatically adjusts based on success/failure patterns:

```
Initial: 5 concurrent jobs
    │
    ▼
┌─────────────────┐
│ 10 consecutive  │──────▶ Increase by 1
│ successes       │        (Additive Increase)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Rate limit      │──────▶ Multiply by 0.5
│ detected (429)  │        (Multiplicative Decrease)
└─────────────────┘
```

### Job Lifecycle

```
pending ──▶ active ──▶ completed
              │
              ▼
           failed (if non-retryable or max attempts reached)
              │
              ▼
           pending (if retryable)
```

## API Reference

### createTaskHub(config?)

Creates a TaskHub instance with auto-detected storage.

```typescript
const hub = await createTaskHub({
  storage: 'auto',     // 'auto' | 'memory' | 'bun-sqlite' | 'better-sqlite3' | 'opfs' | 'indexeddb'
  dbPath: 'tasks.db',  // SQLite database path
});
```

### Hub Methods

| Method | Description |
|--------|-------------|
| `createTask(options)` | Create a new task |
| `getTask(taskId)` | Get existing task by ID |
| `listTasks()` | List all tasks |
| `deleteTask(taskId)` | Delete task and its jobs |
| `resumeTask(taskId, source)` | Resume task after crash |
| `resetFailedJobs(taskId)` | Reset failed jobs to pending |
| `close()` | Close hub and release resources |

### Task Options

```typescript
await hub.createTask({
  name: 'my-task',
  source: new MySource(),
  concurrency: {
    min: 1,      // Minimum concurrent jobs
    max: 50,     // Maximum concurrent jobs
    initial: 5,  // Starting concurrency
  },
  retry: {
    maxAttempts: 3,     // Max retry attempts
    baseDelay: 1000,    // Initial retry delay (ms)
    maxDelay: 30000,    // Maximum retry delay (ms)
  },
  timeout: 30000,  // Job timeout (ms)
});
```

### Task Methods

| Method | Description |
|--------|-------------|
| `start()` | Start processing |
| `pause()` | Pause (active jobs complete) |
| `resume()` | Resume processing |
| `stop()` | Stop and cancel active jobs |
| `destroy()` | Delete task and all data |
| `getProgress()` | Get current progress |
| `getResults(options?)` | Get job results |

### Task Events

```typescript
task.on('progress', (progress) => {
  // { taskId, total, completed, failed, pending, active, concurrency, elapsed, estimatedRemaining }
});

task.on('job:start', (job) => {
  // Job started processing
});

task.on('job:complete', (job) => {
  // Job completed successfully
});

task.on('job:failed', (job, error) => {
  // Job failed permanently
});

task.on('job:retry', (job, attempt) => {
  // Job being retried
});

task.on('rate-limited', (newConcurrency) => {
  // Rate limit detected, concurrency reduced
});

task.on('completed', () => {
  // All jobs finished
});
```

### Custom Error Handling

Override default error classification:

```typescript
class MySource extends TaskSource<Input, Output> {
  // Determine if error should trigger retry
  isRetryable(error: unknown): boolean {
    if (error instanceof MyFatalError) return false;
    return true;
  }

  // Determine if error indicates rate limiting
  isRateLimited(error: unknown): boolean {
    return (error as any)?.status === 429;
  }
}
```

## Crash Recovery

TaskHub persists all state to SQLite, enabling recovery after crashes:

```typescript
// After restart, find and resume incomplete tasks
const hub = await createTaskHub();
const tasks = await hub.listTasks();

for (const taskMeta of tasks) {
  if (taskMeta.status === 'running' || taskMeta.status === 'paused') {
    const task = await hub.resumeTask(taskMeta.id, new MySource());
    if (task) {
      await task.resume();
    }
  }
}
```

### Recovery Guarantees

- Active jobs at crash time are reset to `pending`
- Completed jobs are never re-processed
- Failed jobs can be manually reset with `resetFailedJobs()`

## Storage Adapters

| Adapter | Environment | Persistence | Notes |
|---------|-------------|-------------|-------|
| `BunSQLiteAdapter` | Bun | Yes | Native, fastest |
| `NodeSQLiteAdapter` | Node.js | Yes | Requires better-sqlite3 |
| `OPFSAdapter` | Browser | Yes | Uses sqlite3.wasm |
| `IndexedDBAdapter` | Browser | Yes | Fallback |
| `MemoryAdapter` | Any | No | Testing, temporary tasks |

## Examples

See the [examples/](./examples/) directory:

| Example | Description |
|---------|-------------|
| [basic.ts](./examples/basic.ts) | Simple deterministic task |
| [dynamic.ts](./examples/dynamic.ts) | Streaming async iterable |
| [retry.ts](./examples/retry.ts) | Error handling and retries |
| [pause-resume.ts](./examples/pause-resume.ts) | Pause/resume control |
| [aimd.ts](./examples/aimd.ts) | AIMD algorithm demo |
| [recovery.ts](./examples/recovery.ts) | Crash recovery |
| [deterministic.ts](./examples/deterministic.ts) | Merkle root deduplication |

Run examples:
```bash
bun examples/basic.ts
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                    Hub                       │
│  - Task factory                             │
│  - Storage lifecycle                        │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   ┌─────────┐          ┌──────────┐
   │  Task   │          │ Storage  │
   │         │          │ Adapter  │
   │ - State │◀────────▶│          │
   │ - Events│          │ - SQLite │
   └────┬────┘          └──────────┘
        │
        ▼
   ┌──────────────┐
   │  Dispatcher  │
   │              │
   │ - AIMD       │
   │ - Retry      │
   │ - Timeout    │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  TaskSource  │
   │              │
   │ - handler()  │
   │ - getData()  │
   └──────────────┘
```

## Configuration Defaults

```typescript
// AIMD defaults
{
  initialConcurrency: 5,
  minConcurrency: 1,
  maxConcurrency: 50,
  additiveIncrease: 1,
  multiplicativeDecrease: 0.5,
  successThreshold: 10,
}

// Retry defaults
{
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
}

// Timeout default
timeout: 30000  // 30 seconds
```

## Best Practices

1. **Use deterministic tasks** when you need deduplication via Merkle root
2. **Use dynamic tasks** for streaming data or when memory is a concern
3. **Implement `isRetryable`** to avoid retrying fatal errors
4. **Implement `isRateLimited`** for accurate AIMD behavior
5. **Monitor events** for observability and debugging
6. **Handle graceful shutdown** by calling `hub.close()`
7. **Use `timeout`** to prevent hanging jobs

## License

MIT
