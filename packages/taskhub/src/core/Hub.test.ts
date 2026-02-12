/**
 * Hub and Task Integration Tests
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hub, createTaskHub } from './Hub.js';
import { Task } from './Task.js';
import { BunSQLiteAdapter } from '../storage/BunSQLiteAdapter.js';
import { TaskSource, type JobContext } from '../types.js';
import { unlink } from 'fs/promises';

const TEST_DB = 'test-hub.db';

class SimpleSource extends TaskSource<string, number> {
  readonly type = 'deterministic' as const;
  private data: string[];

  constructor(data: string[]) {
    super();
    this.data = data;
  }

  getData() {
    return this.data;
  }

  async handler(input: string): Promise<number> {
    return input.length;
  }
}

class AsyncSource extends TaskSource<number, number> {
  readonly type = 'dynamic' as const;
  readonly id = 'async-source';
  private data: number[];

  constructor(data: number[]) {
    super();
    this.data = data;
  }

  async *getData() {
    for (const item of this.data) {
      yield item;
    }
  }

  async handler(input: number): Promise<number> {
    return input * 2;
  }
}

class SlowSource extends TaskSource<number, number> {
  readonly type = 'deterministic' as const;
  private data: number[];
  private delay: number;

  constructor(data: number[], delay = 50) {
    super();
    this.data = data;
    this.delay = delay;
  }

  getData() {
    return this.data;
  }

  async handler(input: number, ctx: JobContext): Promise<number> {
    await new Promise(r => setTimeout(r, this.delay));
    if (ctx.signal.aborted) throw new Error('Aborted');
    return input * 2;
  }
}

class FailingSource extends TaskSource<number, number> {
  readonly type = 'deterministic' as const;
  private data: number[];
  private failCount: number;
  private currentFails = 0;

  constructor(data: number[], failCount = 1) {
    super();
    this.data = data;
    this.failCount = failCount;
  }

  getData() {
    return this.data;
  }

  async handler(input: number): Promise<number> {
    this.currentFails++;
    if (this.currentFails <= this.failCount) {
      throw new Error('Intentional failure');
    }
    return input * 2;
  }

  isRetryable() {
    return true;
  }
}

describe('Hub', () => {
  let adapter: BunSQLiteAdapter;
  let hub: Hub;

  beforeEach(async () => {
    // Clean up all database files before each test
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
    adapter = new BunSQLiteAdapter(TEST_DB);
    hub = new Hub(adapter);
    await hub.initialize();
  });

  afterEach(async () => {
    await hub.close();
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
  });

  describe('initialize', () => {
    test('initializes storage', async () => {
      // Already initialized in beforeEach
      // Verify by creating a task
      const task = await hub.createTask({ name: 'test' });
      expect(task.id).toBeDefined();
    });

    test('is idempotent', async () => {
      await hub.initialize();
      await hub.initialize();
      // Should not throw
    });
  });

  describe('createTask', () => {
    test('creates task with deterministic source', async () => {
      const source = new SimpleSource(['a', 'bb', 'ccc']);
      const task = await hub.createTask({
        name: 'test-task',
        source,
      });

      expect(task.name).toBe('test-task');
      expect(task.totalJobs).toBe(3);
      expect(task.merkleRoot).toBeDefined();
    });

    test('creates task with dynamic source', async () => {
      const source = new AsyncSource([1, 2, 3, 4, 5]);
      const task = await hub.createTask({
        name: 'dynamic-task',
        source,
      });

      expect(task.totalJobs).toBe(5);
    });

    test('creates task without source', async () => {
      const task = await hub.createTask({ name: 'empty-task' });
      expect(task.totalJobs).toBe(0);
      expect(task.status).toBe('idle');
    });

    test('same deterministic data produces same merkle root', async () => {
      const source1 = new SimpleSource(['a', 'b', 'c']);
      const source2 = new SimpleSource(['a', 'b', 'c']);

      const task1 = await hub.createTask({ name: 'task1', source: source1 });
      // Use different name to avoid duplicate ID
      const task2 = await hub.createTask({ name: 'task2', source: source2 });

      // Same data should produce same merkle root regardless of task name
      expect(task1.merkleRoot).toBe(task2.merkleRoot);
    });

    test('rolls back on source failure', async () => {
      class BrokenSource extends TaskSource<number, number> {
        readonly type = 'deterministic' as const;
        getData() {
          throw new Error('getData failed');
        }
        async handler(input: number) {
          return input;
        }
      }

      await expect(hub.createTask({
        name: 'broken-task',
        source: new BrokenSource(),
      })).rejects.toThrow('getData failed');

      // Task should not exist
      const tasks = await hub.listTasks();
      expect(tasks.find(t => t.name === 'broken-task')).toBeUndefined();
    });
  });

  describe('getTask', () => {
    test('returns existing task', async () => {
      const created = await hub.createTask({ name: 'my-task' });
      const retrieved = await hub.getTask(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('my-task');
    });

    test('returns null for non-existent task', async () => {
      const task = await hub.getTask('non-existent');
      expect(task).toBeNull();
    });
  });

  describe('listTasks', () => {
    test('returns empty array when no tasks', async () => {
      const tasks = await hub.listTasks();
      expect(tasks).toEqual([]);
    });

    test('returns all tasks', async () => {
      await hub.createTask({ name: 'task1' });
      await hub.createTask({ name: 'task2' });
      await hub.createTask({ name: 'task3' });

      const tasks = await hub.listTasks();
      expect(tasks).toHaveLength(3);
    });
  });

  describe('deleteTask', () => {
    test('deletes task and its jobs', async () => {
      const source = new SimpleSource(['a', 'b']);
      const task = await hub.createTask({ name: 'delete-me', source });

      await hub.deleteTask(task.id);

      const retrieved = await hub.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    test('handles non-existent task', async () => {
      // Should not throw
      await hub.deleteTask('non-existent');
    });
  });

  describe('findTaskByMerkleRoot', () => {
    test('finds task with matching merkle root', async () => {
      const source = new SimpleSource(['a', 'b', 'c']);
      const created = await hub.createTask({ name: 'findable', source });

      const found = await hub.findTaskByMerkleRoot(created.merkleRoot!);
      expect(found?.id).toBe(created.id);
    });

    test('returns null when no match', async () => {
      const found = await hub.findTaskByMerkleRoot('non-existent-root');
      expect(found).toBeNull();
    });
  });

  describe('close', () => {
    test('closes storage connection', async () => {
      await hub.close();
      // Re-initialize should work
      await hub.initialize();
    });
  });
});

describe('Task', () => {
  let adapter: BunSQLiteAdapter;
  let hub: Hub;

  beforeEach(async () => {
    // Clean up all database files before each test
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
    adapter = new BunSQLiteAdapter(TEST_DB);
    hub = new Hub(adapter);
    await hub.initialize();
  });

  afterEach(async () => {
    await hub.close();
    try { await unlink(TEST_DB); } catch {}
    try { await unlink(TEST_DB + '-wal'); } catch {}
    try { await unlink(TEST_DB + '-shm'); } catch {}
  });

  describe('setSource', () => {
    test('ingests deterministic data', async () => {
      const task = await hub.createTask({ name: 'test' });
      await task.setSource(new SimpleSource(['a', 'b', 'c']));

      expect(task.totalJobs).toBe(3);
    });

    test('ingests async data', async () => {
      const task = await hub.createTask({ name: 'test' });
      await task.setSource(new AsyncSource([1, 2, 3, 4]));

      expect(task.totalJobs).toBe(4);
    });

    test('throws if task is not idle', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });
      await task.start();

      await expect(task.setSource(new SimpleSource(['b']))).rejects.toThrow();
    });
  });

  describe('start', () => {
    test('processes all jobs', async () => {
      const source = new SimpleSource(['hello', 'world']);
      const task = await hub.createTask({ name: 'test', source });

      await task.start();

      expect(task.status).toBe('completed');
      expect(task.completedJobs).toBe(2);
    });

    test('emits progress events', async () => {
      // Use more jobs with longer delay and lower concurrency to ensure execution > 1s
      // With concurrency=2 and 10 jobs at 300ms each: 10/2 * 300ms = 1500ms
      const data = Array.from({ length: 10 }, (_, i) => i);
      const source = new SlowSource(data, 300);
      const task = await hub.createTask({
        name: 'test',
        source,
        concurrency: { min: 1, max: 2, initial: 2 },
      });
      const progressEvents: number[] = [];

      task.on('progress', (p) => {
        progressEvents.push(p.completed);
      });

      await task.start();

      // With concurrency=2 and 10 jobs at 300ms each: 5 batches * 300ms = 1.5s
      // Progress interval is 1000ms, so we should get at least 1 event
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    test('emits job:complete events', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });
      const completedJobs: string[] = [];

      task.on('job:complete', (job) => {
        completedJobs.push(job.id);
      });

      await task.start();

      expect(completedJobs).toHaveLength(1);
    });

    test('emits completed event', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });
      const handler = mock(() => {});

      task.on('completed', handler);
      await task.start();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('throws if no source set', async () => {
      const task = await hub.createTask({ name: 'test' });
      await expect(task.start()).rejects.toThrow('No source set');
    });

    test('throws if already completed', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });
      await task.start();

      await expect(task.start()).rejects.toThrow('already completed');
    });
  });

  describe('pause', () => {
    test('pauses execution', async () => {
      const source = new SlowSource([1, 2, 3, 4, 5], 50);
      const task = await hub.createTask({ name: 'test', source });

      const startPromise = task.start();
      await new Promise(r => setTimeout(r, 30));
      task.pause();

      expect(task.status).toBe('paused');

      // Let the test complete
      await task.resume();
      await startPromise;
    });

    test('does nothing if not running', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });

      task.pause(); // Should not throw
      expect(task.status).toBe('idle');
    });
  });

  describe('resume', () => {
    test('resumes paused task', async () => {
      const source = new SlowSource([1, 2, 3], 30);
      const task = await hub.createTask({ name: 'test', source });

      const startPromise = task.start();
      await new Promise(r => setTimeout(r, 20));
      task.pause();

      await new Promise(r => setTimeout(r, 50));

      await task.resume();
      await startPromise;

      expect(task.status).toBe('completed');
    });

    test('starts idle task', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });

      await task.resume();

      expect(task.status).toBe('completed');
    });
  });

  describe('stop', () => {
    test('stops and resets active jobs', async () => {
      const source = new SlowSource([1, 2, 3, 4, 5], 100);
      const task = await hub.createTask({ name: 'test', source });

      const startPromise = task.start();
      await new Promise(r => setTimeout(r, 50));

      await task.stop();
      expect(task.status).toBe('paused');

      // Verify active jobs are reset
      const progress = await task.getProgress();
      expect(progress.active).toBe(0);
    });
  });

  describe('destroy', () => {
    test('removes task and all data', async () => {
      const source = new SimpleSource(['a', 'b']);
      const task = await hub.createTask({ name: 'test', source });
      const taskId = task.id;

      await task.destroy();

      const retrieved = await hub.getTask(taskId);
      expect(retrieved).toBeNull();
    });
  });

  describe('getProgress', () => {
    test('returns progress information', async () => {
      const source = new SimpleSource(['a', 'b', 'c']);
      const task = await hub.createTask({ name: 'test', source });

      const progress = await task.getProgress();

      expect(progress.taskId).toBe(task.id);
      expect(progress.total).toBe(3);
      expect(progress.pending).toBe(3);
      expect(progress.completed).toBe(0);
    });

    test('updates during execution', async () => {
      const source = new SlowSource([1, 2, 3, 4, 5], 30);
      const task = await hub.createTask({ name: 'test', source });

      const startPromise = task.start();
      await new Promise(r => setTimeout(r, 100));

      const progress = await task.getProgress();
      expect(progress.completed).toBeGreaterThan(0);

      await startPromise;
    });
  });

  describe('getResults', () => {
    test('returns completed jobs', async () => {
      const source = new SimpleSource(['hello', 'world']);
      const task = await hub.createTask({ name: 'test', source });
      await task.start();

      const results = await task.getResults({ status: 'completed' });

      expect(results).toHaveLength(2);
      expect(results[0].output).toBe(5); // 'hello'.length
    });

    test('respects limit', async () => {
      const source = new SimpleSource(['a', 'b', 'c', 'd', 'e']);
      const task = await hub.createTask({ name: 'test', source });
      await task.start();

      const results = await task.getResults({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    test('filters by status', async () => {
      const source = new FailingSource([1, 2, 3], 1);
      const task = await hub.createTask({
        name: 'test',
        source,
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
      });
      await task.start();

      const failed = await task.getResults({ status: 'failed' });
      expect(failed.length).toBe(1);
    });
  });

  describe('Getters', () => {
    test('id returns task id', async () => {
      const task = await hub.createTask({ name: 'test' });
      expect(typeof task.id).toBe('string');
      expect(task.id.length).toBeGreaterThan(0);
    });

    test('name returns task name', async () => {
      const task = await hub.createTask({ name: 'my-task' });
      expect(task.name).toBe('my-task');
    });

    test('status returns current status', async () => {
      const task = await hub.createTask({ name: 'test' });
      expect(task.status).toBe('idle');
    });

    test('totalJobs returns count', async () => {
      const source = new SimpleSource(['a', 'b', 'c']);
      const task = await hub.createTask({ name: 'test', source });
      expect(task.totalJobs).toBe(3);
    });

    test('completedJobs returns count', async () => {
      const source = new SimpleSource(['a']);
      const task = await hub.createTask({ name: 'test', source });

      expect(task.completedJobs).toBe(0);
      await task.start();
      expect(task.completedJobs).toBe(1);
    });

    test('failedJobs returns count', async () => {
      const source = new FailingSource([1], 10); // Always fail
      const task = await hub.createTask({
        name: 'test',
        source,
        retry: { maxAttempts: 1, baseDelay: 10, maxDelay: 100 },
      });

      await task.start();
      expect(task.failedJobs).toBe(1);
    });
  });
});

describe('createTaskHub', () => {
  const FACTORY_DB_1 = 'test-hub-factory-1.db';
  const FACTORY_DB_2 = 'test-hub-factory-2.db';

  test('creates hub with auto storage detection', async () => {
    const hub = await createTaskHub({ storage: 'auto', dbPath: FACTORY_DB_1 });

    const task = await hub.createTask({ name: 'test' });
    expect(task.id).toBeDefined();

    await hub.close();
    try { await unlink(FACTORY_DB_1); } catch {}
    try { await unlink(FACTORY_DB_1 + '-wal'); } catch {}
    try { await unlink(FACTORY_DB_1 + '-shm'); } catch {}
  });

  test('creates hub with bun-sqlite storage', async () => {
    const hub = await createTaskHub({ storage: 'bun-sqlite', dbPath: FACTORY_DB_2 });

    const task = await hub.createTask({ name: 'test' });
    expect(task.id).toBeDefined();

    await hub.close();
    try { await unlink(FACTORY_DB_2); } catch {}
    try { await unlink(FACTORY_DB_2 + '-wal'); } catch {}
    try { await unlink(FACTORY_DB_2 + '-shm'); } catch {}
  });
});
