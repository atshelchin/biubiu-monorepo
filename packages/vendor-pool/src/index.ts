// Core classes
export { Pool } from './pool.js';
export { Vendor } from './vendor.js';

// Storage adapters
export { MemoryStorageAdapter, LocalStorageAdapter } from './storage/index.js';

// Errors
export {
  VendorPoolError,
  EscalationError,
  TimeoutError,
  LogicError,
  NoVendorAvailableError,
  VendorExecutionError,
} from './errors.js';

// Types
export {
  ErrorType,
  type VendorState,
  type EscalationContext,
  type PoolOptions,
  type StorageAdapter,
  type VendorMetrics,
  type PoolResult,
} from './types.js';

export type { VendorOptions } from './vendor.js';
