/**
 * TaskHub - Core Type Definitions
 */

// ============================================================================
// Job Types
// ============================================================================

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface Job<TInput = unknown, TOutput = unknown> {
  id: string;
  taskId: string;
  input: TInput;
  output?: TOutput;
  error?: string;
  status: JobStatus;
  attempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  scheduledAt?: number; // For delayed retry - job won't be claimed until this time
}

export interface JobRecord {
  id: string;
  task_id: string;
  input: string; // JSON serialized
  output: string | null;
  error: string | null;
  status: JobStatus;
  attempts: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  scheduled_at: number | null; // For delayed retry
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';
export type TaskType = 'deterministic' | 'dynamic';

export interface TaskMeta {
  id: string;
  name: string;
  type: TaskType;
  merkleRoot: string | null;
  status: TaskStatus;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRecord {
  id: string;
  name: string;
  type: TaskType;
  merkle_root: string | null;
  status: TaskStatus;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// TaskSource - Strategy Pattern
// ============================================================================

export interface JobContext {
  signal: AbortSignal;
  attempt: number;
  jobId: string;
}

export abstract class TaskSource<TInput = unknown, TOutput = unknown> {
  abstract readonly type: TaskType;

  /**
   * Optional custom ID for dynamic tasks
   */
  readonly id?: string;

  /**
   * Get data for deterministic tasks (array) or dynamic tasks (async generator)
   */
  abstract getData(): TInput[] | AsyncIterable<TInput>;

  /**
   * Process a single job
   */
  abstract handler(input: TInput, context: JobContext): Promise<TOutput>;

  /**
   * Optional: Generate a unique ID for each input
   * Default: JSON.stringify hash
   */
  getJobId?(input: TInput): string;

  /**
   * Optional: Determine if an error is retryable
   * Default: retry on network errors and 429/503
   */
  isRetryable?(error: unknown): boolean;

  /**
   * Optional: Determine if an error indicates rate limiting
   * Default: check for 429/503 status codes
   */
  isRateLimited?(error: unknown): boolean;
}

// ============================================================================
// Progress & Events
// ============================================================================

export interface TaskProgress {
  taskId: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  active: number;
  concurrency: number;
  elapsed: number; // ms since start
  estimatedRemaining: number | null; // ms
}

export interface TaskEvents<TInput = unknown, TOutput = unknown> {
  progress: (progress: TaskProgress) => void;
  'job:start': (job: Job<TInput, TOutput>) => void;
  'job:complete': (job: Job<TInput, TOutput>) => void;
  'job:failed': (job: Job<TInput, TOutput>, error: Error) => void;
  'job:retry': (job: Job<TInput, TOutput>, attempt: number) => void;
  'rate-limited': (concurrency: number) => void;
  completed: () => void;
  error: (error: Error) => void;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ConcurrencyConfig {
  min: number;
  max: number;
  initial?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
}

export interface TaskConfig {
  name: string;
  concurrency?: Partial<ConcurrencyConfig>;
  retry?: Partial<RetryConfig>;
  timeout?: number; // ms per job
}

export interface HubConfig {
  storage: 'auto' | 'memory' | 'bun-sqlite' | 'better-sqlite3' | 'opfs' | 'indexeddb';
  dbPath?: string; // For SQLite adapters
}

// ============================================================================
// Storage Interface
// ============================================================================

export interface StorageAdapter {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Task operations
  createTask(meta: TaskMeta): Promise<void>;
  getTask(taskId: string): Promise<TaskMeta | null>;
  updateTask(taskId: string, updates: Partial<TaskMeta>): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  listTasks(): Promise<TaskMeta[]>;

  // Job operations
  createJobs(jobs: Job[]): Promise<void>;
  getJob(jobId: string): Promise<Job | null>;
  getJobsByTask(taskId: string, status?: JobStatus, limit?: number, offset?: number): Promise<Job[]>;
  getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }>;

  // Atomic operations for dispatcher
  claimJobs(taskId: string, limit: number): Promise<Job[]>;
  completeJob(jobId: string, output: unknown): Promise<void>;
  failJob(jobId: string, error: string, canRetry: boolean, retryAfterMs?: number): Promise<void>;
  resetActiveJobs(taskId: string): Promise<number>; // For crash recovery
  resetFailedJobs(taskId: string): Promise<number>; // For retrying failed jobs

  // Batch operations
  deleteJobsByTask(taskId: string): Promise<void>;
}

// ============================================================================
// AIMD Config
// ============================================================================

export interface AIMDConfig {
  initialConcurrency: number;
  minConcurrency: number;
  maxConcurrency: number;
  additiveIncrease: number; // How much to increase on success
  multiplicativeDecrease: number; // Factor to multiply on failure (e.g., 0.5)
  successThreshold: number; // Number of consecutive successes before increasing
}

export const DEFAULT_AIMD_CONFIG: AIMDConfig = {
  initialConcurrency: 5,
  minConcurrency: 1,
  maxConcurrency: 50,
  additiveIncrease: 1,
  multiplicativeDecrease: 0.5,
  successThreshold: 10,
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  min: 1,
  max: 50,
  initial: 5,
};
