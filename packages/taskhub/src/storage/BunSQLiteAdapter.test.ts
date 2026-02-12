/**
 * BunSQLiteAdapter Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BunSQLiteAdapter } from './BunSQLiteAdapter.js';
import type { Job, TaskMeta } from '../types.js';
import { unlink } from 'fs/promises';

const TEST_DB = 'test-taskhub.db';

describe('BunSQLiteAdapter', () => {
  let adapter: BunSQLiteAdapter;

  beforeEach(async () => {
    // Clean up any existing test database
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}

    adapter = new BunSQLiteAdapter(TEST_DB);
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
  });

  describe('initialize', () => {
    test('creates database and tables', async () => {
      // Already initialized in beforeEach
      // Try to create a task to verify tables exist
      const task: TaskMeta = {
        id: 'test-task',
        name: 'Test Task',
        type: 'deterministic',
        merkleRoot: 'abc123',
        status: 'idle',
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.createTask(task);
      const retrieved = await adapter.getTask('test-task');
      expect(retrieved).toBeTruthy();
    });

    test('is idempotent', async () => {
      // Initialize again should not throw
      await adapter.initialize();
      await adapter.initialize();
    });

    test('handles concurrent initialization', async () => {
      const adapter2 = new BunSQLiteAdapter(TEST_DB + '2');

      // Start multiple initializations concurrently
      await Promise.all([
        adapter2.initialize(),
        adapter2.initialize(),
        adapter2.initialize(),
      ]);

      await adapter2.close();
      try { await unlink(TEST_DB + '2'); } catch {}
    });
  });

  describe('Task operations', () => {
    const sampleTask: TaskMeta = {
      id: 'task-1',
      name: 'Sample Task',
      type: 'deterministic',
      merkleRoot: 'root123',
      status: 'idle',
      totalJobs: 10,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };

    describe('createTask', () => {
      test('creates task successfully', async () => {
        await adapter.createTask(sampleTask);
        const task = await adapter.getTask('task-1');
        expect(task).toEqual(sampleTask);
      });

      test('handles null merkle root', async () => {
        const task = { ...sampleTask, merkleRoot: null };
        await adapter.createTask(task);
        const retrieved = await adapter.getTask('task-1');
        expect(retrieved?.merkleRoot).toBeNull();
      });
    });

    describe('getTask', () => {
      test('returns null for non-existent task', async () => {
        const task = await adapter.getTask('non-existent');
        expect(task).toBeNull();
      });

      test('returns task with all fields', async () => {
        await adapter.createTask(sampleTask);
        const task = await adapter.getTask('task-1');

        expect(task?.id).toBe('task-1');
        expect(task?.name).toBe('Sample Task');
        expect(task?.type).toBe('deterministic');
        expect(task?.merkleRoot).toBe('root123');
        expect(task?.status).toBe('idle');
        expect(task?.totalJobs).toBe(10);
      });
    });

    describe('updateTask', () => {
      test('updates single field', async () => {
        await adapter.createTask(sampleTask);
        await adapter.updateTask('task-1', { status: 'running' });

        const task = await adapter.getTask('task-1');
        expect(task?.status).toBe('running');
      });

      test('updates multiple fields', async () => {
        await adapter.createTask(sampleTask);
        await adapter.updateTask('task-1', {
          status: 'completed',
          completedJobs: 10,
          failedJobs: 0,
        });

        const task = await adapter.getTask('task-1');
        expect(task?.status).toBe('completed');
        expect(task?.completedJobs).toBe(10);
      });

      test('updates updatedAt timestamp', async () => {
        await adapter.createTask(sampleTask);
        await new Promise(r => setTimeout(r, 10));
        await adapter.updateTask('task-1', { status: 'running' });

        const task = await adapter.getTask('task-1');
        expect(task?.updatedAt).toBeGreaterThan(sampleTask.updatedAt);
      });

      test('does nothing with empty updates', async () => {
        await adapter.createTask(sampleTask);
        await adapter.updateTask('task-1', {});

        const task = await adapter.getTask('task-1');
        expect(task?.status).toBe('idle');
      });
    });

    describe('deleteTask', () => {
      test('deletes existing task', async () => {
        await adapter.createTask(sampleTask);
        await adapter.deleteTask('task-1');

        const task = await adapter.getTask('task-1');
        expect(task).toBeNull();
      });

      test('does nothing for non-existent task', async () => {
        // Should not throw
        await adapter.deleteTask('non-existent');
      });
    });

    describe('listTasks', () => {
      test('returns empty array when no tasks', async () => {
        const tasks = await adapter.listTasks();
        expect(tasks).toEqual([]);
      });

      test('returns all tasks sorted by created_at desc', async () => {
        await adapter.createTask({ ...sampleTask, id: 'task-1', createdAt: 1000 });
        await adapter.createTask({ ...sampleTask, id: 'task-2', createdAt: 2000 });
        await adapter.createTask({ ...sampleTask, id: 'task-3', createdAt: 1500 });

        const tasks = await adapter.listTasks();

        expect(tasks).toHaveLength(3);
        expect(tasks[0].id).toBe('task-2');
        expect(tasks[1].id).toBe('task-3');
        expect(tasks[2].id).toBe('task-1');
      });
    });
  });

  describe('Job operations', () => {
    const taskId = 'test-task';

    beforeEach(async () => {
      await adapter.createTask({
        id: taskId,
        name: 'Test Task',
        type: 'deterministic',
        merkleRoot: null,
        status: 'idle',
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const createJob = (id: string, status: 'pending' | 'active' | 'completed' | 'failed' = 'pending'): Job => ({
      id,
      taskId,
      input: { value: id },
      status,
      attempts: 0,
      createdAt: Date.now(),
    });

    describe('createJobs', () => {
      test('creates single job', async () => {
        const job = createJob('job-1');
        await adapter.createJobs([job]);

        const retrieved = await adapter.getJob('job-1');
        expect(retrieved?.id).toBe('job-1');
        expect(retrieved?.input).toEqual({ value: 'job-1' });
      });

      test('creates multiple jobs in batch', async () => {
        const jobs = [
          createJob('job-1'),
          createJob('job-2'),
          createJob('job-3'),
        ];
        await adapter.createJobs(jobs);

        const counts = await adapter.getJobCounts(taskId);
        expect(counts.pending).toBe(3);
      });

      test('handles empty array', async () => {
        await adapter.createJobs([]);
        const counts = await adapter.getJobCounts(taskId);
        expect(counts.pending).toBe(0);
      });

      test('handles large batches', async () => {
        const jobs = Array.from({ length: 1000 }, (_, i) => createJob(`job-${i}`));
        await adapter.createJobs(jobs);

        const counts = await adapter.getJobCounts(taskId);
        expect(counts.pending).toBe(1000);
      });
    });

    describe('getJob', () => {
      test('returns null for non-existent job', async () => {
        const job = await adapter.getJob('non-existent');
        expect(job).toBeNull();
      });

      test('returns job with all fields', async () => {
        const job: Job = {
          id: 'job-1',
          taskId,
          input: { data: 'test' },
          output: { result: 42 },
          error: 'test error',
          status: 'failed',
          attempts: 3,
          createdAt: 1000,
          startedAt: 1100,
          completedAt: 1200,
        };
        await adapter.createJobs([job]);

        const retrieved = await adapter.getJob('job-1');
        expect(retrieved).toEqual(job);
      });
    });

    describe('getJobsByTask', () => {
      beforeEach(async () => {
        const jobs = [
          { ...createJob('job-1', 'pending'), createdAt: 1000 },
          { ...createJob('job-2', 'active'), createdAt: 2000 },
          { ...createJob('job-3', 'completed'), createdAt: 3000 },
          { ...createJob('job-4', 'failed'), createdAt: 4000 },
          { ...createJob('job-5', 'pending'), createdAt: 5000 },
        ];
        await adapter.createJobs(jobs);
      });

      test('returns all jobs for task', async () => {
        const jobs = await adapter.getJobsByTask(taskId);
        expect(jobs).toHaveLength(5);
      });

      test('filters by status', async () => {
        const pending = await adapter.getJobsByTask(taskId, 'pending');
        expect(pending).toHaveLength(2);

        const completed = await adapter.getJobsByTask(taskId, 'completed');
        expect(completed).toHaveLength(1);
      });

      test('respects limit', async () => {
        const jobs = await adapter.getJobsByTask(taskId, undefined, 3);
        expect(jobs).toHaveLength(3);
      });

      test('respects offset', async () => {
        const jobs = await adapter.getJobsByTask(taskId, undefined, 100, 2);
        expect(jobs).toHaveLength(3);
        expect(jobs[0].id).toBe('job-3');
      });

      test('returns jobs sorted by createdAt asc', async () => {
        const jobs = await adapter.getJobsByTask(taskId);
        expect(jobs[0].createdAt).toBeLessThan(jobs[1].createdAt);
      });
    });

    describe('getJobCounts', () => {
      test('returns zero counts for empty task', async () => {
        const counts = await adapter.getJobCounts(taskId);
        expect(counts).toEqual({ pending: 0, active: 0, completed: 0, failed: 0 });
      });

      test('returns correct counts', async () => {
        await adapter.createJobs([
          createJob('job-1', 'pending'),
          createJob('job-2', 'pending'),
          createJob('job-3', 'active'),
          createJob('job-4', 'completed'),
          createJob('job-5', 'failed'),
        ]);

        const counts = await adapter.getJobCounts(taskId);
        expect(counts).toEqual({ pending: 2, active: 1, completed: 1, failed: 1 });
      });
    });

    describe('claimJobs', () => {
      beforeEach(async () => {
        await adapter.createJobs([
          createJob('job-1', 'pending'),
          createJob('job-2', 'pending'),
          createJob('job-3', 'pending'),
          createJob('job-4', 'completed'),
        ]);
      });

      test('claims pending jobs', async () => {
        const claimed = await adapter.claimJobs(taskId, 2);
        expect(claimed).toHaveLength(2);
        expect(claimed.every(j => j.status === 'active')).toBe(true);
      });

      test('updates job status to active', async () => {
        await adapter.claimJobs(taskId, 1);
        const counts = await adapter.getJobCounts(taskId);
        expect(counts.active).toBe(1);
        expect(counts.pending).toBe(2);
      });

      test('increments attempts', async () => {
        const claimed = await adapter.claimJobs(taskId, 1);
        expect(claimed[0].attempts).toBe(1);
      });

      test('sets startedAt', async () => {
        const before = Date.now();
        const claimed = await adapter.claimJobs(taskId, 1);
        const after = Date.now();

        expect(claimed[0].startedAt).toBeGreaterThanOrEqual(before);
        expect(claimed[0].startedAt).toBeLessThanOrEqual(after);
      });

      test('returns empty array when no pending jobs', async () => {
        await adapter.claimJobs(taskId, 10); // Claim all
        const claimed = await adapter.claimJobs(taskId, 10);
        expect(claimed).toHaveLength(0);
      });

      test('respects limit', async () => {
        const claimed = await adapter.claimJobs(taskId, 1);
        expect(claimed).toHaveLength(1);
      });

      test('is atomic', async () => {
        // Run multiple claims concurrently
        const results = await Promise.all([
          adapter.claimJobs(taskId, 2),
          adapter.claimJobs(taskId, 2),
        ]);

        const totalClaimed = results[0].length + results[1].length;
        expect(totalClaimed).toBe(3); // Only 3 pending jobs total
      });
    });

    describe('completeJob', () => {
      test('sets status to completed', async () => {
        await adapter.createJobs([createJob('job-1')]);
        await adapter.completeJob('job-1', { result: 'success' });

        const job = await adapter.getJob('job-1');
        expect(job?.status).toBe('completed');
      });

      test('stores output', async () => {
        await adapter.createJobs([createJob('job-1')]);
        await adapter.completeJob('job-1', { result: 42, data: ['a', 'b'] });

        const job = await adapter.getJob('job-1');
        expect(job?.output).toEqual({ result: 42, data: ['a', 'b'] });
      });

      test('sets completedAt', async () => {
        await adapter.createJobs([createJob('job-1')]);
        const before = Date.now();
        await adapter.completeJob('job-1', null);
        const after = Date.now();

        const job = await adapter.getJob('job-1');
        expect(job?.completedAt).toBeGreaterThanOrEqual(before);
        expect(job?.completedAt).toBeLessThanOrEqual(after);
      });
    });

    describe('failJob', () => {
      test('sets status to failed when canRetry is false', async () => {
        await adapter.createJobs([createJob('job-1')]);
        await adapter.failJob('job-1', 'Test error', false);

        const job = await adapter.getJob('job-1');
        expect(job?.status).toBe('failed');
        expect(job?.error).toBe('Test error');
      });

      test('sets status to pending when canRetry is true', async () => {
        await adapter.createJobs([createJob('job-1')]);
        await adapter.failJob('job-1', 'Temporary error', true);

        const job = await adapter.getJob('job-1');
        expect(job?.status).toBe('pending');
        expect(job?.error).toBe('Temporary error');
      });

      test('sets completedAt', async () => {
        await adapter.createJobs([createJob('job-1')]);
        await adapter.failJob('job-1', 'Error', false);

        const job = await adapter.getJob('job-1');
        expect(job?.completedAt).toBeDefined();
      });
    });

    describe('resetActiveJobs', () => {
      test('resets active jobs to pending', async () => {
        await adapter.createJobs([
          createJob('job-1', 'active'),
          createJob('job-2', 'active'),
          createJob('job-3', 'pending'),
          createJob('job-4', 'completed'),
        ]);

        const count = await adapter.resetActiveJobs(taskId);
        expect(count).toBe(2);

        const counts = await adapter.getJobCounts(taskId);
        expect(counts.active).toBe(0);
        expect(counts.pending).toBe(3);
      });

      test('clears startedAt', async () => {
        const job: Job = {
          ...createJob('job-1', 'active'),
          startedAt: Date.now(),
        };
        await adapter.createJobs([job]);

        await adapter.resetActiveJobs(taskId);

        const retrieved = await adapter.getJob('job-1');
        expect(retrieved?.startedAt).toBeUndefined();
      });

      test('returns 0 when no active jobs', async () => {
        await adapter.createJobs([createJob('job-1', 'pending')]);
        const count = await adapter.resetActiveJobs(taskId);
        expect(count).toBe(0);
      });
    });

    describe('deleteJobsByTask', () => {
      test('deletes all jobs for task', async () => {
        await adapter.createJobs([
          createJob('job-1'),
          createJob('job-2'),
          createJob('job-3'),
        ]);

        await adapter.deleteJobsByTask(taskId);

        const counts = await adapter.getJobCounts(taskId);
        expect(counts.pending + counts.active + counts.completed + counts.failed).toBe(0);
      });

      test('does not affect other tasks', async () => {
        const otherTaskId = 'other-task';
        await adapter.createTask({
          id: otherTaskId,
          name: 'Other Task',
          type: 'dynamic',
          merkleRoot: null,
          status: 'idle',
          totalJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await adapter.createJobs([
          createJob('job-1'),
          { ...createJob('job-2'), taskId: otherTaskId },
        ]);

        await adapter.deleteJobsByTask(taskId);

        const job = await adapter.getJob('job-2');
        expect(job).toBeTruthy();
      });
    });
  });

  describe('close', () => {
    test('closes database connection', async () => {
      await adapter.close();

      // Attempting to use after close should throw
      await expect(adapter.getTask('test')).rejects.toThrow();
    });

    test('is idempotent', async () => {
      await adapter.close();
      await adapter.close();
    });

    test('allows re-initialization after close', async () => {
      await adapter.close();
      await adapter.initialize();

      // Should work again
      const task = await adapter.getTask('test');
      expect(task).toBeNull();
    });
  });
});
