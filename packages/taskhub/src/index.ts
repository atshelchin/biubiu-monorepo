/**
 * TaskHub - Adaptive batch task processing engine
 *
 * @example
 * ```typescript
 * import { createTaskHub, TaskSource } from '@shelchin/taskhub';
 *
 * class MySource extends TaskSource<string, number> {
 *   readonly type = 'deterministic';
 *   getData() { return ['item1', 'item2', 'item3']; }
 *   async handler(input: string) { return input.length; }
 * }
 *
 * const hub = await createTaskHub();
 * const task = await hub.createTask({ name: 'my-task', source: new MySource() });
 *
 * task.on('progress', (p) => console.log(`${p.completed}/${p.total}`));
 * await task.start();
 * ```
 */

// Core
export { Hub, createTaskHub } from './core/Hub.js';
export type { CreateTaskOptions } from './core/Hub.js';
export { Task } from './core/Task.js';
export { Dispatcher } from './core/Dispatcher.js';
export type { DispatcherEvents, DispatcherConfig } from './core/Dispatcher.js';
export { EventEmitter } from './core/EventEmitter.js';
export { computeMerkleRoot, generateJobId, generateTaskId } from './core/MerkleTree.js';

// Storage
export { BunSQLiteAdapter } from './storage/BunSQLiteAdapter.js';
export { NodeSQLiteAdapter } from './storage/NodeSQLiteAdapter.js';

// Types
export {
  TaskSource,
  type Job,
  type JobStatus,
  type JobContext,
  type TaskMeta,
  type TaskStatus,
  type TaskType,
  type TaskConfig,
  type TaskProgress,
  type TaskEvents,
  type HubConfig,
  type StorageAdapter,
  type ConcurrencyConfig,
  type RetryConfig,
  type AIMDConfig,
  DEFAULT_AIMD_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CONCURRENCY_CONFIG,
} from './types.js';
