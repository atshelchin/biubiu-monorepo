/**
 * Error classification for determining retry/freeze behavior
 */
export enum ErrorType {
  /** Rate limit hit (429) - soft freeze 5-10s */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Server error (5xx) or network timeout - hard freeze 30-60s */
  SERVER_ERROR = 'SERVER_ERROR',
  /** Logic error (bad params, auth) - no retry, propagate immediately */
  LOGIC_ERROR = 'LOGIC_ERROR',
  /** Unknown error - treat as server error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Vendor state persisted to storage
 */
export interface VendorState {
  /** Unique vendor identifier */
  id: string;
  /** Whether the vendor has hit its ceiling and is locked */
  isStable: boolean;
  /** Current optimal minTime in ms (lower = faster) */
  minTime: number;
  /** Last successful minTime before rate limit hit (for backoff calculation) */
  lastSuccessMinTime: number;
  /** Timestamp when vendor can accept new tasks (0 = not frozen) */
  frozenUntil: number;
  /** Total successful executions */
  successCount: number;
  /** Total failed executions */
  failureCount: number;
  /** Last error message if any */
  lastError?: string;
  /** Last error timestamp */
  lastErrorAt?: number;
}

/**
 * Context provided to escalation handlers
 */
export interface EscalationContext {
  /** Total retry attempts across all vendors */
  totalRetries: number;
  /** Consecutive failures count */
  consecutiveFailures: number;
  /** Time elapsed since first attempt (ms) */
  elapsedTime: number;
  /** States of all vendors at escalation time */
  vendorStates: VendorState[];
  /** The last error that triggered escalation */
  lastError: Error;
  /** The original task input */
  taskInput: unknown;
}

/**
 * Pool configuration options
 */
export interface PoolOptions {
  /** Storage adapter for persisting vendor states (default: MemoryStorageAdapter) */
  storage?: StorageAdapter;

  /** Callback when escalation is triggered (before throwing EscalationError) */
  onEscalate?: (context: EscalationContext) => void | Promise<void>;

  /** Maximum total retries across all vendors before escalation (default: 10) */
  maxRetries?: number;

  /** Maximum consecutive failures before escalation (default: 5) */
  maxConsecutiveFailures?: number;

  /** Global timeout in ms - max time to keep retrying (default: 30000) */
  timeout?: number;

  /** Initial minTime for new vendors in ms (default: 500, meaning 2 QPS) */
  initialMinTime?: number;

  /** Amount to decrease minTime per success when probing (default: 20) */
  probeStep?: number;

  /** Multiplier to increase minTime when hitting rate limit (default: 1.25) */
  rateLimitBackoff?: number;

  /** Soft freeze duration range in ms for rate limit errors (default: [5000, 10000]) */
  softFreezeDuration?: [number, number];

  /** Hard freeze duration range in ms for server errors (default: [30000, 60000]) */
  hardFreezeDuration?: [number, number];
}

/**
 * Storage adapter interface for persisting vendor states
 */
export interface StorageAdapter {
  /** Get a value by key */
  get<T>(key: string): Promise<T | null>;

  /** Set a value by key */
  set<T>(key: string, value: T): Promise<void>;

  /** Delete a value by key */
  delete(key: string): Promise<void>;

  /** Get all keys matching a prefix */
  keys(prefix?: string): Promise<string[]>;

  /** Clear all values (optionally matching a prefix) */
  clear(prefix?: string): Promise<void>;
}

/**
 * Internal vendor metrics for selection algorithm
 */
export interface VendorMetrics {
  /** Current queue length */
  queueLength: number;
  /** Is currently frozen */
  isFrozen: boolean;
  /** Time until unfrozen (0 if not frozen) */
  frozenFor: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Result of a pool.do() operation
 */
export interface PoolResult<T> {
  /** The successful result */
  result: T;
  /** Which vendor handled the task */
  vendorId: string;
  /** Number of retries before success */
  retries: number;
  /** Total time taken in ms */
  duration: number;
}
