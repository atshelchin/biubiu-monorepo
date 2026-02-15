/**
 * TaskHub - Browser bundle
 * Use this entry point for browser environments
 */

// Core
export { Hub } from './core/Hub.js';
export type { CreateTaskOptions } from './core/Hub.js';
export { Task } from './core/Task.js';
export { Dispatcher } from './core/Dispatcher.js';
export type { DispatcherEvents, DispatcherConfig } from './core/Dispatcher.js';
export { EventEmitter } from './core/EventEmitter.js';
export { computeMerkleRoot, generateJobId, generateTaskId } from './core/MerkleTree.js';

// Browser Storage
export { OPFSAdapter } from './storage/OPFSAdapter.js';
export type { OPFSAdapterConfig } from './storage/OPFSAdapter.js';
export { IndexedDBAdapter } from './storage/IndexedDBAdapter.js';

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
