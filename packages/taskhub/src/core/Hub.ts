/**
 * TaskHub - Main entry point
 */

import type { HubConfig, StorageAdapter, TaskConfig, TaskMeta, TaskSource } from '../types.js';
import { Task } from './Task.js';
import { generateTaskId, computeMerkleRoot, generateJobId } from './MerkleTree.js';

export interface CreateTaskOptions<TInput = unknown, TOutput = unknown> extends TaskConfig {
  source?: TaskSource<TInput, TOutput>;
}

export class Hub {
  private storage: StorageAdapter;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  /**
   * Initialize the hub
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.storage.initialize();
    await this.initializePromise;
    this.initialized = true;
  }

  /**
   * Close the hub and release resources
   */
  async close(): Promise<void> {
    await this.storage.close();
    this.initialized = false;
    this.initializePromise = null;
  }

  /**
   * Create a new task
   * Ensures atomic creation - if source ingestion fails, task is cleaned up
   */
  async createTask<TInput = unknown, TOutput = unknown>(
    options: CreateTaskOptions<TInput, TOutput>
  ): Promise<Task<TInput, TOutput>> {
    await this.initialize();

    // Generate task ID
    let merkleRoot: string | null = null;
    let taskType: 'deterministic' | 'dynamic' = 'dynamic';

    if (options.source) {
      const data = options.source.getData();
      if (Array.isArray(data)) {
        // Deterministic: compute merkle root from data
        const jobIds: string[] = [];
        for (const input of data) {
          const jobId = options.source.getJobId?.(input) ?? await generateJobId(input);
          jobIds.push(jobId);
        }
        merkleRoot = await computeMerkleRoot(jobIds);
        taskType = 'deterministic';
      }
    }

    const taskId = await generateTaskId(options.name, merkleRoot ?? undefined);
    const now = Date.now();

    const meta: TaskMeta = {
      id: taskId,
      name: options.name,
      type: taskType,
      merkleRoot,
      status: 'idle',
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.createTask(meta);

    const task = new Task<TInput, TOutput>(meta, this.storage, options);

    if (options.source) {
      try {
        await task.setSource(options.source);
      } catch (error) {
        // Rollback: clean up task and any jobs that were created
        await this.storage.deleteJobsByTask(taskId);
        await this.storage.deleteTask(taskId);
        throw error;
      }
    }

    return task;
  }

  /**
   * Get an existing task by ID
   */
  async getTask<TInput = unknown, TOutput = unknown>(taskId: string): Promise<Task<TInput, TOutput> | null> {
    await this.initialize();

    const meta = await this.storage.getTask(taskId);
    if (!meta) return null;

    return new Task<TInput, TOutput>(meta, this.storage, { name: meta.name });
  }

  /**
   * List all tasks
   */
  async listTasks(): Promise<TaskMeta[]> {
    await this.initialize();
    return this.storage.listTasks();
  }

  /**
   * Delete a task and all its jobs
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.initialize();
    await this.storage.deleteJobsByTask(taskId);
    await this.storage.deleteTask(taskId);
  }

  /**
   * Find task by merkle root (for deterministic tasks)
   */
  async findTaskByMerkleRoot(merkleRoot: string): Promise<Task | null> {
    await this.initialize();

    const tasks = await this.storage.listTasks();
    const found = tasks.find(t => t.merkleRoot === merkleRoot);

    if (!found) return null;

    return new Task(found, this.storage, { name: found.name });
  }

  /**
   * Resume a task with a source (for crash recovery)
   * Resets any active jobs to pending and returns the task
   *
   * @param taskId - The task ID to resume
   * @param source - The task source (must match the original source)
   * @param config - Optional config overrides (concurrency, retry, timeout)
   */
  async resumeTask<TInput = unknown, TOutput = unknown>(
    taskId: string,
    source: TaskSource<TInput, TOutput>,
    config?: Omit<TaskConfig, 'name'>
  ): Promise<Task<TInput, TOutput> | null> {
    await this.initialize();

    const meta = await this.storage.getTask(taskId);
    if (!meta) return null;

    // Reset any active jobs to pending (crash recovery)
    await this.storage.resetActiveJobs(taskId);

    // Update task status if it was running
    if (meta.status === 'running') {
      meta.status = 'paused';
      await this.storage.updateTask(taskId, { status: 'paused' });
    }

    const task = new Task<TInput, TOutput>(meta, this.storage, {
      name: meta.name,
      ...config,
    });
    task.setSourceForResume(source);

    return task;
  }

  /**
   * Reset failed jobs to pending (for retrying failed jobs)
   * Returns the number of jobs reset
   */
  async resetFailedJobs(taskId: string): Promise<number> {
    await this.initialize();
    return this.storage.resetFailedJobs(taskId);
  }
}

/**
 * Create a TaskHub instance with auto-detected storage
 */
export async function createTaskHub(config: HubConfig = { storage: 'auto' }): Promise<Hub> {
  const storage = await createStorageAdapter(config);
  const hub = new Hub(storage);
  await hub.initialize();
  return hub;
}

/**
 * Create storage adapter based on config and environment
 */
async function createStorageAdapter(config: HubConfig): Promise<StorageAdapter> {
  const dbPath = config.dbPath ?? 'taskhub.db';

  switch (config.storage) {
    case 'memory': {
      const { MemoryAdapter } = await import('../storage/MemoryAdapter.js');
      return new MemoryAdapter();
    }

    case 'bun-sqlite': {
      const { BunSQLiteAdapter } = await import('../storage/BunSQLiteAdapter.js');
      return new BunSQLiteAdapter(dbPath);
    }

    case 'better-sqlite3': {
      const { NodeSQLiteAdapter } = await import('../storage/NodeSQLiteAdapter.js');
      return new NodeSQLiteAdapter(dbPath);
    }

    case 'opfs': {
      const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
      return new OPFSAdapter();
    }

    case 'indexeddb': {
      const { IndexedDBAdapter } = await import('../storage/IndexedDBAdapter.js');
      return new IndexedDBAdapter();
    }

    case 'auto':
    default:
      return autoDetectStorage(dbPath);
  }
}

/**
 * Auto-detect the best storage adapter for the current environment
 */
async function autoDetectStorage(dbPath: string): Promise<StorageAdapter> {
  // Check if running in Bun
  if (typeof Bun !== 'undefined') {
    const { BunSQLiteAdapter } = await import('../storage/BunSQLiteAdapter.js');
    return new BunSQLiteAdapter(dbPath);
  }

  // Check if running in Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { NodeSQLiteAdapter } = await import('../storage/NodeSQLiteAdapter.js');
    return new NodeSQLiteAdapter(dbPath);
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    // Try OPFS first
    if (navigator?.storage?.getDirectory) {
      try {
        const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
        return new OPFSAdapter();
      } catch {
        // OPFS not available, fall through to IndexedDB
      }
    }

    // Fall back to IndexedDB
    if (typeof indexedDB !== 'undefined') {
      const { IndexedDBAdapter } = await import('../storage/IndexedDBAdapter.js');
      return new IndexedDBAdapter();
    }

    throw new Error('No supported storage adapter available in this browser');
  }

  throw new Error('Unable to detect environment for storage adapter');
}
