/**
 * IndexedDB Storage Adapter
 * Fallback for browsers without OPFS support
 */

import type { StorageAdapter, Job, JobStatus, TaskMeta } from '../types.js';

const DB_NAME = 'taskhub';
const DB_VERSION = 1;
const TASKS_STORE = 'tasks';
const JOBS_STORE = 'jobs';

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  private doInitialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Tasks store
        if (!db.objectStoreNames.contains(TASKS_STORE)) {
          const tasksStore = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
          tasksStore.createIndex('status', 'status', { unique: false });
          tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Jobs store
        if (!db.objectStoreNames.contains(JOBS_STORE)) {
          const jobsStore = db.createObjectStore(JOBS_STORE, { keyPath: 'id' });
          jobsStore.createIndex('taskId', 'taskId', { unique: false });
          jobsStore.createIndex('status', 'status', { unique: false });
          jobsStore.createIndex('taskId_status', ['taskId', 'status'], { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.initialized = true;
        resolve();
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.initializePromise = null;
    }
  }

  private getDb(): IDBDatabase {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private promisifyTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  // =========================================================================
  // Task Operations
  // =========================================================================

  async createTask(meta: TaskMeta): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(TASKS_STORE, 'readwrite');
    const store = tx.objectStore(TASKS_STORE);
    store.add(meta);
    await this.promisifyTransaction(tx);
  }

  async getTask(taskId: string): Promise<TaskMeta | null> {
    const db = this.getDb();
    const tx = db.transaction(TASKS_STORE, 'readonly');
    const store = tx.objectStore(TASKS_STORE);
    const result = await this.promisify(store.get(taskId));
    return result ?? null;
  }

  async updateTask(taskId: string, updates: Partial<TaskMeta>): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(TASKS_STORE, 'readwrite');
    const store = tx.objectStore(TASKS_STORE);

    const existing = await this.promisify(store.get(taskId));
    if (!existing) return;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    store.put(updated);
    await this.promisifyTransaction(tx);
  }

  async deleteTask(taskId: string): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(TASKS_STORE, 'readwrite');
    const store = tx.objectStore(TASKS_STORE);
    store.delete(taskId);
    await this.promisifyTransaction(tx);
  }

  async listTasks(): Promise<TaskMeta[]> {
    const db = this.getDb();
    const tx = db.transaction(TASKS_STORE, 'readonly');
    const store = tx.objectStore(TASKS_STORE);
    const tasks = await this.promisify(store.getAll());
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  // =========================================================================
  // Job Operations
  // =========================================================================

  async createJobs(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;

    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);

    for (const job of jobs) {
      store.add(job);
    }

    await this.promisifyTransaction(tx);
  }

  async getJob(jobId: string): Promise<Job | null> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readonly');
    const store = tx.objectStore(JOBS_STORE);
    const result = await this.promisify(store.get(jobId));
    return result ?? null;
  }

  async getJobsByTask(taskId: string, status?: JobStatus, limit = 100, offset = 0): Promise<Job[]> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readonly');
    const store = tx.objectStore(JOBS_STORE);

    let jobs: Job[];

    if (status) {
      const index = store.index('taskId_status');
      jobs = await this.promisify(index.getAll([taskId, status]));
    } else {
      const index = store.index('taskId');
      jobs = await this.promisify(index.getAll(taskId));
    }

    // Sort by createdAt and apply pagination
    return jobs
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(offset, offset + limit);
  }

  async getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readonly');
    const store = tx.objectStore(JOBS_STORE);
    const index = store.index('taskId');

    const jobs = await this.promisify(index.getAll(taskId));

    const counts = { pending: 0, active: 0, completed: 0, failed: 0 };
    for (const job of jobs) {
      counts[job.status]++;
    }
    return counts;
  }

  async claimJobs(taskId: string, limit: number): Promise<Job[]> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);
    const index = store.index('taskId_status');

    const pendingJobs = await this.promisify(index.getAll([taskId, 'pending']));

    const now = Date.now();
    const claimed: Job[] = [];

    for (const job of pendingJobs.slice(0, limit)) {
      const updated: Job = {
        ...job,
        status: 'active',
        startedAt: now,
        attempts: job.attempts + 1,
      };
      store.put(updated);
      claimed.push(updated);
    }

    await this.promisifyTransaction(tx);
    return claimed;
  }

  async completeJob(jobId: string, output: unknown): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);

    const job = await this.promisify(store.get(jobId));
    if (!job) return;

    const updated: Job = {
      ...job,
      status: 'completed',
      output,
      completedAt: Date.now(),
    };
    store.put(updated);
    await this.promisifyTransaction(tx);
  }

  async failJob(jobId: string, error: string, canRetry: boolean): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);

    const job = await this.promisify(store.get(jobId));
    if (!job) return;

    const updated: Job = {
      ...job,
      status: canRetry ? 'pending' : 'failed',
      error,
      // Don't set completedAt for retryable failures - job will be retried
      ...(canRetry ? { startedAt: undefined } : { completedAt: Date.now() }),
    };
    store.put(updated);
    await this.promisifyTransaction(tx);
  }

  async resetActiveJobs(taskId: string): Promise<number> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);
    const index = store.index('taskId_status');

    const activeJobs = await this.promisify(index.getAll([taskId, 'active']));

    for (const job of activeJobs) {
      const updated: Job = {
        ...job,
        status: 'pending',
        startedAt: undefined,
      };
      store.put(updated);
    }

    await this.promisifyTransaction(tx);
    return activeJobs.length;
  }

  async resetFailedJobs(taskId: string): Promise<number> {
    const db = this.getDb();
    const tx = db.transaction([JOBS_STORE, TASKS_STORE], 'readwrite');
    const jobsStore = tx.objectStore(JOBS_STORE);
    const tasksStore = tx.objectStore(TASKS_STORE);
    const index = jobsStore.index('taskId_status');

    const failedJobs = await this.promisify(index.getAll([taskId, 'failed']));

    for (const job of failedJobs) {
      const updated: Job = {
        ...job,
        status: 'pending',
        error: undefined,
        completedAt: undefined,
        attempts: 0,
      };
      jobsStore.put(updated);
    }

    // Update task counters
    if (failedJobs.length > 0) {
      const task = await this.promisify(tasksStore.get(taskId));
      if (task) {
        task.failedJobs = Math.max(0, task.failedJobs - failedJobs.length);
        task.updatedAt = Date.now();
        tasksStore.put(task);
      }
    }

    await this.promisifyTransaction(tx);
    return failedJobs.length;
  }

  async deleteJobsByTask(taskId: string): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    const store = tx.objectStore(JOBS_STORE);
    const index = store.index('taskId');

    const jobs = await this.promisify(index.getAll(taskId));

    for (const job of jobs) {
      store.delete(job.id);
    }

    await this.promisifyTransaction(tx);
  }
}
