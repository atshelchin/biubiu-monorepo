/**
 * AIMD Dispatcher
 * Adaptive concurrency control using Additive Increase / Multiplicative Decrease
 */

import type { AIMDConfig, Job, JobContext, StorageAdapter, TaskSource, RetryConfig, DEFAULT_RETRY_CONFIG } from '../types.js';
import { EventEmitter } from './EventEmitter.js';

export interface DispatcherEvents {
  'job:start': (job: Job) => void;
  'job:complete': (job: Job) => void;
  'job:failed': (data: { job: Job; error: Error }) => void;
  'job:retry': (data: { job: Job; attempt: number }) => void;
  'rate-limited': (concurrency: number) => void;
  'concurrency-change': (concurrency: number) => void;
}

export interface DispatcherConfig {
  taskId: string;
  source: TaskSource;
  storage: StorageAdapter;
  aimd: AIMDConfig;
  retry: RetryConfig;
  timeout: number;
}

export class Dispatcher extends EventEmitter<DispatcherEvents> {
  private config: DispatcherConfig;
  private concurrency: number;
  private consecutiveSuccesses = 0;
  private activeJobs = new Map<string, AbortController>();
  private paused = false;
  private stopped = false;
  private processingPromise: Promise<void> | null = null;

  constructor(config: DispatcherConfig) {
    super();
    this.config = config;
    this.concurrency = config.aimd.initialConcurrency;
  }

  get currentConcurrency(): number {
    return this.concurrency;
  }

  get activeCount(): number {
    return this.activeJobs.size;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Start processing jobs
   */
  async start(): Promise<void> {
    if (this.processingPromise) return this.processingPromise;

    this.paused = false;
    this.stopped = false;
    this.processingPromise = this.processLoop();

    return this.processingPromise;
  }

  /**
   * Pause processing (active jobs will complete)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume processing
   */
  async resume(): Promise<void> {
    if (!this.paused) return;
    this.paused = false;

    if (!this.processingPromise) {
      this.processingPromise = this.processLoop();
    }

    return this.processingPromise;
  }

  /**
   * Stop processing and cancel all active jobs
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.paused = false;

    // Cancel all active jobs
    for (const [, controller] of this.activeJobs) {
      controller.abort();
    }

    // Wait for all active jobs to finish
    while (this.activeJobs.size > 0) {
      await this.sleep(50);
    }

    this.processingPromise = null;
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    while (!this.stopped) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      // Calculate how many jobs we can start
      const slotsAvailable = this.concurrency - this.activeJobs.size;

      if (slotsAvailable <= 0) {
        await this.sleep(10);
        continue;
      }

      // Claim jobs from storage
      let jobs: Job[];
      try {
        jobs = await this.config.storage.claimJobs(this.config.taskId, slotsAvailable);
      } catch (error) {
        // Storage might be closed (e.g., during shutdown or crash)
        if (error instanceof Error && error.message.includes('closed')) {
          this.stopped = true;
          break;
        }
        throw error;
      }

      if (jobs.length === 0) {
        // No more jobs to process
        if (this.activeJobs.size === 0) {
          // All done
          break;
        }
        // Wait for active jobs to complete
        await this.sleep(50);
        continue;
      }

      // Start processing jobs
      for (const job of jobs) {
        this.processJob(job);
      }

      // Small yield to prevent blocking
      await this.sleep(0);
    }

    // Wait for all remaining jobs to complete
    while (this.activeJobs.size > 0) {
      await this.sleep(50);
    }

    this.processingPromise = null;
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    const controller = new AbortController();
    this.activeJobs.set(job.id, controller);

    this.emit('job:start', job);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const context: JobContext = {
        signal: controller.signal,
        attempt: job.attempts,
        jobId: job.id,
      };

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Job timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      // Execute handler with timeout
      const handlerPromise = this.config.source.handler(job.input, context);
      handlerPromise.catch(() => {}); // Suppress unhandled rejection

      const result = await Promise.race([handlerPromise, timeoutPromise]);

      clearTimeout(timeoutId);

      // Job succeeded
      try {
        await this.config.storage.completeJob(job.id, result);
      } catch (storageError) {
        // Storage closed during shutdown, job state will be recovered on restart
        if (storageError instanceof Error && storageError.message.includes('closed')) {
          return;
        }
        throw storageError;
      }

      const completedJob: Job = { ...job, status: 'completed', output: result, completedAt: Date.now() };
      this.emit('job:complete', completedJob);

      // AIMD: Additive Increase
      this.onSuccess();

    } catch (error) {
      clearTimeout(timeoutId);

      const err = error instanceof Error ? error : new Error(String(error));

      // Check if rate limited
      const isRateLimited = this.config.source.isRateLimited?.(error) ?? this.defaultIsRateLimited(error);

      if (isRateLimited) {
        // AIMD: Multiplicative Decrease
        this.onRateLimited();
      }

      // Check if retryable
      const isRetryable = this.config.source.isRetryable?.(error) ?? this.defaultIsRetryable(error);
      const canRetry = isRetryable && job.attempts < this.config.retry.maxAttempts;

      try {
        await this.config.storage.failJob(job.id, err.message, canRetry);
      } catch (storageError) {
        // Storage closed during shutdown, job state will be recovered on restart
        if (storageError instanceof Error && storageError.message.includes('closed')) {
          return;
        }
        throw storageError;
      }

      if (canRetry) {
        this.emit('job:retry', { job, attempt: job.attempts });

        // Exponential backoff delay
        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, job.attempts - 1),
          this.config.retry.maxDelay
        );
        await this.sleep(delay);
      } else {
        const failedJob: Job = { ...job, status: 'failed', error: err.message, completedAt: Date.now() };
        this.emit('job:failed', { job: failedJob, error: err });
      }

    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * AIMD: Handle successful job
   */
  private onSuccess(): void {
    this.consecutiveSuccesses++;

    if (this.consecutiveSuccesses >= this.config.aimd.successThreshold) {
      this.consecutiveSuccesses = 0;

      const newConcurrency = Math.min(
        this.concurrency + this.config.aimd.additiveIncrease,
        this.config.aimd.maxConcurrency
      );

      if (newConcurrency !== this.concurrency) {
        this.concurrency = newConcurrency;
        this.emit('concurrency-change', this.concurrency);
      }
    }
  }

  /**
   * AIMD: Handle rate limiting
   */
  private onRateLimited(): void {
    this.consecutiveSuccesses = 0;

    const newConcurrency = Math.max(
      Math.floor(this.concurrency * this.config.aimd.multiplicativeDecrease),
      this.config.aimd.minConcurrency
    );

    if (newConcurrency !== this.concurrency) {
      this.concurrency = newConcurrency;
      this.emit('rate-limited', this.concurrency);
      this.emit('concurrency-change', this.concurrency);
    }
  }

  /**
   * Default rate limit detection
   */
  private defaultIsRateLimited(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('429') || message.includes('503') || message.includes('rate limit')) {
        return true;
      }
    }

    // Check for Response-like objects
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      return status === 429 || status === 503;
    }

    return false;
  }

  /**
   * Default retryable detection
   */
  private defaultIsRetryable(error: unknown): boolean {
    // Rate limited errors are retryable
    if (this.defaultIsRateLimited(error)) {
      return true;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (message.includes('network') ||
          message.includes('fetch') ||
          message.includes('timeout') ||
          message.includes('econnreset') ||
          message.includes('econnrefused')) {
        return true;
      }

      // Server errors (5xx)
      if (message.includes('500') ||
          message.includes('502') ||
          message.includes('504')) {
        return true;
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
