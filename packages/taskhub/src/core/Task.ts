/**
 * Task - Main task entity with state machine
 */

import type {
  TaskMeta,
  TaskStatus,
  TaskSource,
  TaskConfig,
  TaskProgress,
  TaskEvents,
  StorageAdapter,
  Job,
  JobStatus,
  AIMDConfig,
  RetryConfig,
  ConcurrencyConfig,
  DEFAULT_AIMD_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CONCURRENCY_CONFIG,
} from '../types.js';
import { EventEmitter } from './EventEmitter.js';
import { Dispatcher } from './Dispatcher.js';
import { computeMerkleRoot, generateJobId, generateTaskId } from './MerkleTree.js';

export class Task<TInput = unknown, TOutput = unknown> extends EventEmitter<TaskEvents<TInput, TOutput>> {
  private meta: TaskMeta;
  private storage: StorageAdapter;
  private source: TaskSource<TInput, TOutput> | null = null;
  private dispatcher: Dispatcher | null = null;
  private config: Required<TaskConfig>;
  private startTime: number = 0;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    meta: TaskMeta,
    storage: StorageAdapter,
    config: TaskConfig
  ) {
    super();
    this.meta = meta;
    this.storage = storage;
    this.config = {
      name: config.name,
      concurrency: {
        min: config.concurrency?.min ?? 1,
        max: config.concurrency?.max ?? 50,
        initial: config.concurrency?.initial ?? 5,
      },
      retry: {
        maxAttempts: config.retry?.maxAttempts ?? 3,
        baseDelay: config.retry?.baseDelay ?? 1000,
        maxDelay: config.retry?.maxDelay ?? 30000,
      },
      timeout: config.timeout ?? 30000,
    };
  }

  // =========================================================================
  // Getters
  // =========================================================================

  get id(): string {
    return this.meta.id;
  }

  get name(): string {
    return this.meta.name;
  }

  get status(): TaskStatus {
    return this.meta.status;
  }

  get totalJobs(): number {
    return this.meta.totalJobs;
  }

  get completedJobs(): number {
    return this.meta.completedJobs;
  }

  get failedJobs(): number {
    return this.meta.failedJobs;
  }

  get merkleRoot(): string | null {
    return this.meta.merkleRoot;
  }

  get currentConcurrency(): number {
    return this.dispatcher?.currentConcurrency ?? 0;
  }

  // =========================================================================
  // Source Management
  // =========================================================================

  /**
   * Set the task source and ingest jobs
   */
  async setSource(source: TaskSource<TInput, TOutput>): Promise<void> {
    if (this.meta.status !== 'idle') {
      throw new Error('Cannot set source on a non-idle task');
    }

    this.source = source;
    this.meta.type = source.type;

    const data = source.getData();

    if (Array.isArray(data)) {
      // Deterministic task - compute merkle root
      await this.ingestDeterministicData(data);
    } else {
      // Dynamic task - stream ingest
      await this.ingestDynamicData(data);
    }

    await this.storage.updateTask(this.meta.id, {
      type: this.meta.type,
      totalJobs: this.meta.totalJobs,
      merkleRoot: this.meta.merkleRoot,
    });
  }

  private async ingestDeterministicData(data: TInput[]): Promise<void> {
    const jobIdsForMerkle: string[] = [];
    const now = Date.now();

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 1000;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const batchJobs: Job<TInput, TOutput>[] = [];

      for (const input of batch) {
        // Job ID for merkle root (only based on input data)
        const inputHash = this.source?.getJobId?.(input) ?? await generateJobId(input);
        jobIdsForMerkle.push(inputHash);

        // Job ID for storage includes task ID to ensure uniqueness across tasks
        const jobId = `${this.meta.id}:${inputHash}`;

        batchJobs.push({
          id: jobId,
          taskId: this.meta.id,
          input,
          status: 'pending',
          attempts: 0,
          createdAt: now,
        });
      }

      // Write batch to storage immediately (don't accumulate in memory)
      await this.storage.createJobs(batchJobs as Job[]);
    }

    // Compute merkle root from input hashes (not storage job IDs)
    this.meta.merkleRoot = await computeMerkleRoot(jobIdsForMerkle);
    this.meta.totalJobs = data.length;
  }

  private async ingestDynamicData(data: AsyncIterable<TInput>): Promise<void> {
    const now = Date.now();
    let batch: Job<TInput, TOutput>[] = [];
    let count = 0;
    const BATCH_SIZE = 1000;

    for await (const input of data) {
      const inputHash = this.source?.getJobId?.(input) ?? await generateJobId(input);
      // Job ID includes task ID to ensure uniqueness across tasks
      const jobId = `${this.meta.id}:${inputHash}`;

      batch.push({
        id: jobId,
        taskId: this.meta.id,
        input,
        status: 'pending',
        attempts: 0,
        createdAt: now,
      });

      count++;

      if (batch.length >= BATCH_SIZE) {
        await this.storage.createJobs(batch as Job[]);
        batch = [];
      }
    }

    // Write remaining
    if (batch.length > 0) {
      await this.storage.createJobs(batch as Job[]);
    }

    this.meta.totalJobs = count;
  }

  // =========================================================================
  // Execution Control
  // =========================================================================

  /**
   * Start processing the task
   */
  async start(): Promise<void> {
    if (this.meta.status === 'running') {
      return; // Already running
    }

    if (this.meta.status === 'completed') {
      throw new Error('Task already completed');
    }

    if (!this.source) {
      throw new Error('No source set. Call setSource() first.');
    }

    // Reset stopped flag for new start
    this.stopped = false;

    // Reset any active jobs from previous crash
    await this.storage.resetActiveJobs(this.meta.id);

    // Update status
    this.meta.status = 'running';
    await this.storage.updateTask(this.meta.id, { status: 'running' });

    this.startTime = Date.now();

    // Create dispatcher
    this.dispatcher = new Dispatcher({
      taskId: this.meta.id,
      source: this.source as TaskSource,
      storage: this.storage,
      aimd: {
        initialConcurrency: this.config.concurrency.initial ?? this.config.concurrency.min,
        minConcurrency: this.config.concurrency.min,
        maxConcurrency: this.config.concurrency.max,
        additiveIncrease: 1,
        multiplicativeDecrease: 0.5,
        successThreshold: 10,
      },
      retry: this.config.retry,
      timeout: this.config.timeout,
    });

    // Wire up events
    this.dispatcher.on('job:start', (job) => {
      this.emit('job:start', job as Job<TInput, TOutput>);
    });

    this.dispatcher.on('job:complete', (job) => {
      this.meta.completedJobs++;
      // Fire and forget - don't await to avoid blocking the dispatcher
      this.updateJobCounts().catch(() => {});
      this.emit('job:complete', job as Job<TInput, TOutput>);
    });

    this.dispatcher.on('job:failed', ({ job, error }) => {
      this.meta.failedJobs++;
      // Fire and forget - don't await to avoid blocking the dispatcher
      this.updateJobCounts().catch(() => {});
      this.emit('job:failed', job as Job<TInput, TOutput>, error);
    });

    this.dispatcher.on('job:retry', ({ job, attempt }) => {
      this.emit('job:retry', job as Job<TInput, TOutput>, attempt);
    });

    this.dispatcher.on('rate-limited', (concurrency) => {
      this.emit('rate-limited', concurrency);
    });

    // Start progress reporting
    this.startProgressReporting();

    // Start processing
    await this.dispatcher.start();

    // Processing complete - but check if we were stopped during processing
    this.stopProgressReporting();

    // If stopped externally, don't update final status (stop() handles it)
    if (this.stopped) {
      return;
    }

    // Update final status
    try {
      const counts = await this.storage.getJobCounts(this.meta.id);
      this.meta.completedJobs = counts.completed;
      this.meta.failedJobs = counts.failed;

      if (counts.pending === 0 && counts.active === 0) {
        this.meta.status = counts.failed > 0 && counts.completed === 0 ? 'failed' : 'completed';
      }

      await this.storage.updateTask(this.meta.id, {
        status: this.meta.status,
        completedJobs: this.meta.completedJobs,
        failedJobs: this.meta.failedJobs,
      });

      this.emit('completed');
    } catch (error) {
      // Storage closed during shutdown, state will be recovered on restart
      if (error instanceof Error && error.message.includes('closed')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Pause processing
   */
  pause(): void {
    if (this.meta.status !== 'running') {
      return;
    }

    this.dispatcher?.pause();
    this.meta.status = 'paused';

    // Don't await, just fire and forget for non-critical state update
    this.storage.updateTask(this.meta.id, { status: 'paused' }).catch(() => {});

    this.stopProgressReporting();
  }

  /**
   * Resume processing
   */
  async resume(): Promise<void> {
    if (this.meta.status !== 'paused') {
      if (this.meta.status === 'idle' || this.meta.status === 'failed') {
        // Start from beginning
        return this.start();
      }
      return;
    }

    // Create dispatcher if it doesn't exist (crash recovery case)
    if (!this.dispatcher) {
      if (!this.source) {
        throw new Error('No source set. Call setSourceForResume() first.');
      }

      // Reset stopped flag for resume
      this.stopped = false;

      // Reset any active jobs from previous crash (only for crash recovery!)
      await this.storage.resetActiveJobs(this.meta.id);

      this.meta.status = 'running';
      await this.storage.updateTask(this.meta.id, { status: 'running' });

      this.startTime = Date.now();
      this.dispatcher = new Dispatcher({
        taskId: this.meta.id,
        source: this.source as TaskSource,
        storage: this.storage,
        aimd: {
          initialConcurrency: this.config.concurrency.initial ?? this.config.concurrency.min,
          minConcurrency: this.config.concurrency.min,
          maxConcurrency: this.config.concurrency.max,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 10,
        },
        retry: this.config.retry,
        timeout: this.config.timeout,
      });

      // Wire up events
      this.dispatcher.on('job:start', (job) => {
        this.emit('job:start', job as Job<TInput, TOutput>);
      });

      this.dispatcher.on('job:complete', (job) => {
        this.meta.completedJobs++;
        this.updateJobCounts().catch(() => {});
        this.emit('job:complete', job as Job<TInput, TOutput>);
      });

      this.dispatcher.on('job:failed', ({ job, error }) => {
        this.meta.failedJobs++;
        this.updateJobCounts().catch(() => {});
        this.emit('job:failed', job as Job<TInput, TOutput>, error);
      });

      this.dispatcher.on('job:retry', ({ job, attempt }) => {
        this.emit('job:retry', job as Job<TInput, TOutput>, attempt);
      });

      this.dispatcher.on('rate-limited', (concurrency) => {
        this.emit('rate-limited', concurrency);
      });

      this.startProgressReporting();

      // Start processing (for crash recovery)
      await this.dispatcher.start();

      // Processing complete
      this.stopProgressReporting();

      if (this.stopped) {
        return;
      }

      // Update final status
      try {
        const counts = await this.storage.getJobCounts(this.meta.id);
        this.meta.completedJobs = counts.completed;
        this.meta.failedJobs = counts.failed;

        if (counts.pending === 0 && counts.active === 0) {
          this.meta.status = counts.failed > 0 && counts.completed === 0 ? 'failed' : 'completed';
        }

        await this.storage.updateTask(this.meta.id, {
          status: this.meta.status,
          completedJobs: this.meta.completedJobs,
          failedJobs: this.meta.failedJobs,
        });

        this.emit('completed');
      } catch (error) {
        if (error instanceof Error && error.message.includes('closed')) {
          return;
        }
        throw error;
      }
    } else {
      // Dispatcher exists - just resume (pause/resume in same session)
      // Note: Don't reset active jobs here - they're still being processed!
      // Note: Don't reset startTime - it was set when start() was called
      this.meta.status = 'running';
      await this.storage.updateTask(this.meta.id, { status: 'running' });

      this.startProgressReporting();
      await this.dispatcher.resume();
    }
  }

  /**
   * Stop processing and cancel active jobs
   */
  async stop(): Promise<void> {
    if (this.meta.status !== 'running' && this.meta.status !== 'paused') {
      return;
    }

    this.stopped = true;
    await this.dispatcher?.stop();
    this.stopProgressReporting();

    // Reset active jobs to pending
    await this.storage.resetActiveJobs(this.meta.id);

    // Update counts from storage
    const counts = await this.storage.getJobCounts(this.meta.id);
    this.meta.completedJobs = counts.completed;
    this.meta.failedJobs = counts.failed;
    this.meta.status = 'paused';

    await this.storage.updateTask(this.meta.id, {
      status: 'paused',
      completedJobs: this.meta.completedJobs,
      failedJobs: this.meta.failedJobs,
    });
  }

  /**
   * Destroy task and clean up all data
   */
  async destroy(): Promise<void> {
    await this.stop();
    await this.storage.deleteJobsByTask(this.meta.id);
    await this.storage.deleteTask(this.meta.id);
    this.removeAllListeners();
  }

  // =========================================================================
  // Results & Progress
  // =========================================================================

  /**
   * Get task progress
   */
  async getProgress(): Promise<TaskProgress> {
    const counts = await this.storage.getJobCounts(this.meta.id);
    const elapsed = this.startTime > 0 ? Date.now() - this.startTime : 0;

    // Estimate remaining time
    let estimatedRemaining: number | null = null;
    if (counts.completed > 0 && this.meta.status === 'running') {
      const avgTimePerJob = elapsed / counts.completed;
      const remaining = counts.pending + counts.active;
      estimatedRemaining = Math.round(avgTimePerJob * remaining);
    }

    return {
      taskId: this.meta.id,
      total: this.meta.totalJobs,
      completed: counts.completed,
      failed: counts.failed,
      pending: counts.pending,
      active: counts.active,
      concurrency: this.dispatcher?.currentConcurrency ?? 0,
      elapsed,
      estimatedRemaining,
    };
  }

  /**
   * Get results
   */
  async getResults(options: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<Job<TInput, TOutput>[]> {
    const jobs = await this.storage.getJobsByTask(
      this.meta.id,
      options.status,
      options.limit ?? 100,
      options.offset ?? 0
    );
    return jobs as Job<TInput, TOutput>[];
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private startProgressReporting(): void {
    if (this.progressInterval) return;

    this.progressInterval = setInterval(async () => {
      try {
        const progress = await this.getProgress();
        this.emit('progress', progress);
      } catch {
        // Ignore progress reporting errors
      }
    }, 1000);
  }

  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private async updateJobCounts(): Promise<void> {
    try {
      await this.storage.updateTask(this.meta.id, {
        completedJobs: this.meta.completedJobs,
        failedJobs: this.meta.failedJobs,
      });
    } catch {
      // Non-critical, ignore errors
    }
  }

  /**
   * Restore task source for resuming
   */
  setSourceForResume(source: TaskSource<TInput, TOutput>): void {
    this.source = source;
  }
}
