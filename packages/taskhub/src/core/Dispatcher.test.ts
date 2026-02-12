/**
 * Dispatcher Tests - AIMD Algorithm
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Dispatcher, type DispatcherConfig } from './Dispatcher.js';
import { BunSQLiteAdapter } from '../storage/BunSQLiteAdapter.js';
import type { Job, TaskSource, JobContext, TaskMeta } from '../types.js';
import { unlink } from 'fs/promises';

const TEST_DB = 'test-dispatcher.db';

class TestSource implements TaskSource<number, number> {
  readonly type = 'deterministic' as const;
  handler: (input: number, ctx: JobContext) => Promise<number>;
  isRetryableFn?: (error: unknown) => boolean;
  isRateLimitedFn?: (error: unknown) => boolean;

  constructor(handler?: (input: number, ctx: JobContext) => Promise<number>) {
    this.handler = handler ?? (async (input) => input * 2);
  }

  getData() {
    return [1, 2, 3];
  }

  isRetryable(error: unknown) {
    return this.isRetryableFn?.(error) ?? false;
  }

  isRateLimited(error: unknown) {
    return this.isRateLimitedFn?.(error) ?? false;
  }
}

describe('Dispatcher', () => {
  let adapter: BunSQLiteAdapter;
  const taskId = 'test-task';

  beforeEach(async () => {
    try { await unlink(TEST_DB); } catch {}
    adapter = new BunSQLiteAdapter(TEST_DB);
    await adapter.initialize();

    // Create test task
    await adapter.createTask({
      id: taskId,
      name: 'Test Task',
      type: 'deterministic',
      merkleRoot: null,
      status: 'running',
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(async () => {
    await adapter.close();
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
  });

  const createDispatcher = (source?: TestSource): Dispatcher => {
    const config: DispatcherConfig = {
      taskId,
      source: source ?? new TestSource(),
      storage: adapter,
      aimd: {
        initialConcurrency: 2,
        minConcurrency: 1,
        maxConcurrency: 10,
        additiveIncrease: 1,
        multiplicativeDecrease: 0.5,
        successThreshold: 3,
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
      },
      timeout: 5000,
    };
    return new Dispatcher(config);
  };

  const createJobs = async (count: number): Promise<void> => {
    const jobs: Job[] = [];
    for (let i = 0; i < count; i++) {
      jobs.push({
        id: `job-${i}`,
        taskId,
        input: i,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      });
    }
    await adapter.createJobs(jobs);
  };

  describe('start', () => {
    test('processes all pending jobs', async () => {
      await createJobs(5);
      const dispatcher = createDispatcher();

      await dispatcher.start();

      const counts = await adapter.getJobCounts(taskId);
      expect(counts.completed).toBe(5);
      expect(counts.pending).toBe(0);
    });

    test('completes jobs with correct output', async () => {
      await createJobs(3);
      const dispatcher = createDispatcher();

      await dispatcher.start();

      const job = await adapter.getJob('job-2');
      expect(job?.output).toBe(4); // 2 * 2
    });

    test('emits job:start event', async () => {
      await createJobs(1);
      const dispatcher = createDispatcher();
      const handler = mock(() => {});

      dispatcher.on('job:start', handler);
      await dispatcher.start();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits job:complete event', async () => {
      await createJobs(2);
      const dispatcher = createDispatcher();
      const handler = mock(() => {});

      dispatcher.on('job:complete', handler);
      await dispatcher.start();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    test('is idempotent when already running', async () => {
      await createJobs(3);
      const dispatcher = createDispatcher();

      // Start multiple times
      const p1 = dispatcher.start();
      const p2 = dispatcher.start();

      await Promise.all([p1, p2]);

      const counts = await adapter.getJobCounts(taskId);
      expect(counts.completed).toBe(3);
    });
  });

  describe('pause and resume', () => {
    test('pause stops claiming new jobs', async () => {
      await createJobs(10);
      const source = new TestSource(async (input) => {
        await new Promise(r => setTimeout(r, 50));
        return input * 2;
      });
      const dispatcher = createDispatcher(source);

      // Start and immediately pause
      const startPromise = dispatcher.start();
      await new Promise(r => setTimeout(r, 10));
      dispatcher.pause();

      expect(dispatcher.isPaused).toBe(true);

      // Let active jobs complete
      await new Promise(r => setTimeout(r, 100));

      const counts = await adapter.getJobCounts(taskId);
      // Some jobs should still be pending
      expect(counts.pending).toBeGreaterThan(0);

      // Resume and complete
      await dispatcher.resume();
      await startPromise;

      const finalCounts = await adapter.getJobCounts(taskId);
      expect(finalCounts.completed).toBe(10);
    });

    test('resume continues from paused state', async () => {
      await createJobs(5);
      const dispatcher = createDispatcher();

      dispatcher.pause();
      expect(dispatcher.isPaused).toBe(true);

      await dispatcher.resume();
      expect(dispatcher.isPaused).toBe(false);
    });
  });

  describe('stop', () => {
    test('cancels active jobs', async () => {
      await createJobs(5);
      const source = new TestSource(async (input, ctx) => {
        // Long running job that checks signal
        for (let i = 0; i < 100; i++) {
          if (ctx.signal.aborted) throw new Error('Aborted');
          await new Promise(r => setTimeout(r, 10));
        }
        return input * 2;
      });
      const dispatcher = createDispatcher(source);

      const startPromise = dispatcher.start();
      await new Promise(r => setTimeout(r, 50));

      await dispatcher.stop();
      expect(dispatcher.isStopped).toBe(true);

      // Should not hang
      await Promise.race([
        startPromise,
        new Promise(r => setTimeout(r, 500)),
      ]);
    });

    test('activeCount drops to zero after stop', async () => {
      await createJobs(10);
      const source = new TestSource(async (input) => {
        await new Promise(r => setTimeout(r, 100));
        return input * 2;
      });
      const dispatcher = createDispatcher(source);

      dispatcher.start();
      await new Promise(r => setTimeout(r, 50));

      expect(dispatcher.activeCount).toBeGreaterThan(0);

      await dispatcher.stop();
      expect(dispatcher.activeCount).toBe(0);
    });
  });

  describe('AIMD Algorithm', () => {
    test('increases concurrency after successive successes', async () => {
      await createJobs(10);
      const dispatcher = createDispatcher();
      let maxConcurrency = 0;

      dispatcher.on('concurrency-change', (c) => {
        maxConcurrency = Math.max(maxConcurrency, c);
      });

      await dispatcher.start();

      // Should have increased from initial 2
      expect(maxConcurrency).toBeGreaterThan(2);
    });

    test('decreases concurrency on rate limit', async () => {
      await createJobs(5);
      let callCount = 0;
      const source = new TestSource(async (input) => {
        callCount++;
        if (callCount === 3) {
          const err = new Error('Rate limited');
          (err as any).status = 429;
          throw err;
        }
        return input * 2;
      });
      source.isRateLimitedFn = (err) => {
        return (err as any)?.status === 429;
      };
      source.isRetryableFn = () => true;

      const dispatcher = createDispatcher(source);
      const rateLimitEvents: number[] = [];

      dispatcher.on('rate-limited', (c) => {
        rateLimitEvents.push(c);
      });

      await dispatcher.start();

      // Should have received rate-limited event
      expect(rateLimitEvents.length).toBeGreaterThan(0);
      // Concurrency should have decreased
      expect(rateLimitEvents[0]).toBeLessThan(2);
    });

    test('respects min concurrency', async () => {
      await createJobs(10);
      let callCount = 0;
      const source = new TestSource(async (input) => {
        callCount++;
        // Always rate limit to push concurrency to minimum
        if (callCount <= 5) {
          throw { status: 429 };
        }
        return input * 2;
      });
      source.isRateLimitedFn = (err) => (err as any)?.status === 429;
      source.isRetryableFn = () => true;

      const dispatcher = createDispatcher(source);

      await dispatcher.start();

      // Should not go below minimum
      expect(dispatcher.currentConcurrency).toBeGreaterThanOrEqual(1);
    });

    test('respects max concurrency', async () => {
      await createJobs(100);
      const dispatcher = createDispatcher();
      let maxSeen = 0;

      dispatcher.on('concurrency-change', (c) => {
        maxSeen = Math.max(maxSeen, c);
      });

      await dispatcher.start();

      expect(maxSeen).toBeLessThanOrEqual(10);
    });
  });

  describe('Retry behavior', () => {
    test('retries failed jobs up to maxAttempts', async () => {
      let attempts = 0;
      const source = new TestSource(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 42;
      });
      source.isRetryableFn = () => true;

      await adapter.createJobs([{
        id: 'job-retry',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const dispatcher = createDispatcher(source);
      await dispatcher.start();

      const job = await adapter.getJob('job-retry');
      expect(job?.status).toBe('completed');
      expect(attempts).toBe(3);
    });

    test('marks job as failed after maxAttempts exhausted', async () => {
      const source = new TestSource(async () => {
        throw new Error('Always fails');
      });
      source.isRetryableFn = () => true;

      await adapter.createJobs([{
        id: 'job-fail',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const dispatcher = createDispatcher(source);
      const failEvents: Job[] = [];

      dispatcher.on('job:failed', ({ job }) => {
        failEvents.push(job);
      });

      await dispatcher.start();

      const job = await adapter.getJob('job-fail');
      expect(job?.status).toBe('failed');
      expect(failEvents.length).toBe(1);
    });

    test('emits job:retry event', async () => {
      let attempts = 0;
      const source = new TestSource(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Retry me');
        }
        return 42;
      });
      source.isRetryableFn = () => true;

      await adapter.createJobs([{
        id: 'job-1',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const dispatcher = createDispatcher(source);
      const retryEvents: number[] = [];

      dispatcher.on('job:retry', ({ attempt }) => {
        retryEvents.push(attempt);
      });

      await dispatcher.start();

      expect(retryEvents.length).toBeGreaterThan(0);
    });

    test('non-retryable errors fail immediately', async () => {
      const source = new TestSource(async () => {
        throw new Error('Fatal error');
      });
      source.isRetryableFn = () => false;

      await adapter.createJobs([{
        id: 'job-1',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const dispatcher = createDispatcher(source);
      await dispatcher.start();

      const job = await adapter.getJob('job-1');
      expect(job?.status).toBe('failed');
      expect(job?.attempts).toBe(1); // Only one attempt
    });
  });

  describe('Timeout handling', () => {
    test('times out long-running jobs', async () => {
      const source = new TestSource(async () => {
        await new Promise(r => setTimeout(r, 10000)); // 10s
        return 42;
      });
      source.isRetryableFn = () => false;

      await adapter.createJobs([{
        id: 'job-timeout',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      // Create dispatcher with short timeout
      const config: DispatcherConfig = {
        taskId,
        source,
        storage: adapter,
        aimd: {
          initialConcurrency: 1,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
        timeout: 100, // 100ms timeout
      };
      const dispatcher = new Dispatcher(config);

      await dispatcher.start();

      const job = await adapter.getJob('job-timeout');
      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('timeout');
    });
  });

  describe('Default rate limit detection', () => {
    test('detects 429 in error message', async () => {
      // Use a plain object without isRateLimited method to test default detection
      const minimalSource = {
        type: 'deterministic' as const,
        getData: () => [1],
        handler: async (): Promise<number> => {
          throw new Error('Server returned 429 Too Many Requests');
        },
        // No isRateLimited defined - will use default detection
      };

      await adapter.createJobs([{
        id: 'job-1',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const config: DispatcherConfig = {
        taskId,
        source: minimalSource as TaskSource,
        storage: adapter,
        aimd: {
          initialConcurrency: 2,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 3, baseDelay: 10, maxDelay: 100 },
        timeout: 5000,
      };
      const dispatcher = new Dispatcher(config);
      const rateLimitEvents: number[] = [];
      dispatcher.on('rate-limited', (c) => rateLimitEvents.push(c));

      await dispatcher.start();

      expect(rateLimitEvents.length).toBeGreaterThan(0);
    });

    test('detects 503 in error message', async () => {
      const minimalSource = {
        type: 'deterministic' as const,
        getData: () => [1],
        handler: async (): Promise<number> => {
          throw new Error('503 Service Unavailable');
        },
      };

      await adapter.createJobs([{
        id: 'job-1',
        taskId,
        input: 1,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      }]);

      const config: DispatcherConfig = {
        taskId,
        source: minimalSource as TaskSource,
        storage: adapter,
        aimd: {
          initialConcurrency: 2,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 3, baseDelay: 10, maxDelay: 100 },
        timeout: 5000,
      };
      const dispatcher = new Dispatcher(config);
      const rateLimitEvents: number[] = [];
      dispatcher.on('rate-limited', (c) => rateLimitEvents.push(c));

      await dispatcher.start();

      expect(rateLimitEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Getters', () => {
    test('currentConcurrency returns current value', () => {
      const dispatcher = createDispatcher();
      expect(dispatcher.currentConcurrency).toBe(2); // Initial
    });

    test('activeCount tracks active jobs', async () => {
      await createJobs(5);
      const source = new TestSource(async (input) => {
        await new Promise(r => setTimeout(r, 50));
        return input * 2;
      });
      const dispatcher = createDispatcher(source);

      expect(dispatcher.activeCount).toBe(0);

      dispatcher.start();
      await new Promise(r => setTimeout(r, 20));

      expect(dispatcher.activeCount).toBeGreaterThan(0);

      await dispatcher.stop();
    });

    test('isPaused reflects state', () => {
      const dispatcher = createDispatcher();
      expect(dispatcher.isPaused).toBe(false);

      dispatcher.pause();
      expect(dispatcher.isPaused).toBe(true);
    });

    test('isStopped reflects state', async () => {
      const dispatcher = createDispatcher();
      expect(dispatcher.isStopped).toBe(false);

      await dispatcher.stop();
      expect(dispatcher.isStopped).toBe(true);
    });
  });

  // Bug fix: Dispatcher should gracefully handle database closure during execution
  // This was discovered when hub.close() was called while tasks were running,
  // causing "Database closed" errors that crashed the application.
  describe('graceful database closure handling', () => {
    test('handles storage close during job processing', async () => {
      await createJobs(10);
      const source = new TestSource(async (input) => {
        await new Promise(r => setTimeout(r, 50));
        return input * 2;
      });
      const dispatcher = createDispatcher(source);

      // Start processing
      const startPromise = dispatcher.start();

      // Close storage while processing
      await new Promise(r => setTimeout(r, 30));
      await adapter.close();

      // Should not throw, should exit gracefully
      await expect(startPromise).resolves.toBeUndefined();

      // Dispatcher should be stopped
      expect(dispatcher.isStopped).toBe(true);
    });

    test('handles storage close during claimJobs', async () => {
      await createJobs(5);
      let claimCount = 0;

      // Create a mock storage that closes mid-operation
      // Note: Must bind all methods that might be called
      const mockStorage = {
        claimJobs: async (tid: string, limit: number) => {
          claimCount++;
          if (claimCount > 2) {
            throw new Error('Database closed');
          }
          return adapter.claimJobs(tid, limit);
        },
        completeJob: adapter.completeJob.bind(adapter),
        failJob: adapter.failJob.bind(adapter),
      };

      const config: DispatcherConfig = {
        taskId,
        source: new TestSource(),
        storage: mockStorage as unknown as typeof adapter,
        aimd: {
          initialConcurrency: 2,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
        timeout: 5000,
      };

      const dispatcher = new Dispatcher(config);

      // Should not throw
      await expect(dispatcher.start()).resolves.toBeUndefined();
    });

    test('handles storage close during completeJob', async () => {
      await createJobs(3);
      let completeCount = 0;

      // Create a mock storage that fails on completeJob
      const mockStorage = {
        claimJobs: adapter.claimJobs.bind(adapter),
        completeJob: async (jobId: string, output: unknown) => {
          completeCount++;
          if (completeCount > 1) {
            throw new Error('Database closed');
          }
          return adapter.completeJob(jobId, output);
        },
        failJob: adapter.failJob.bind(adapter),
        getJobCounts: adapter.getJobCounts.bind(adapter),
      };

      const config: DispatcherConfig = {
        taskId,
        source: new TestSource(),
        storage: mockStorage as unknown as typeof adapter,
        aimd: {
          initialConcurrency: 1,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
        timeout: 5000,
      };

      const dispatcher = new Dispatcher(config);

      // Should not throw
      await expect(dispatcher.start()).resolves.toBeUndefined();
    });

    test('handles storage close during failJob', async () => {
      await createJobs(3);

      const source = new TestSource(async () => {
        throw new Error('Always fails');
      });
      source.isRetryableFn = () => false;

      let failCount = 0;
      const mockStorage = {
        claimJobs: adapter.claimJobs.bind(adapter),
        completeJob: adapter.completeJob.bind(adapter),
        failJob: async (jobId: string, error: string, canRetry: boolean, retryAfterMs?: number) => {
          failCount++;
          if (failCount > 1) {
            throw new Error('Database closed');
          }
          return adapter.failJob(jobId, error, canRetry, retryAfterMs);
        },
        getJobCounts: adapter.getJobCounts.bind(adapter),
      };

      const config: DispatcherConfig = {
        taskId,
        source,
        storage: mockStorage as unknown as typeof adapter,
        aimd: {
          initialConcurrency: 1,
          minConcurrency: 1,
          maxConcurrency: 10,
          additiveIncrease: 1,
          multiplicativeDecrease: 0.5,
          successThreshold: 3,
        },
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
        timeout: 5000,
      };

      const dispatcher = new Dispatcher(config);

      // Should not throw
      await expect(dispatcher.start()).resolves.toBeUndefined();
    });
  });
});
