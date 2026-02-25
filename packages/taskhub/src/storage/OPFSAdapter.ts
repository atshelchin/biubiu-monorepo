/**
 * OPFS SQLite Storage Adapter
 *
 * Runs sqlite3 WASM inside a dedicated Web Worker so that SAH Pool VFS
 * works without COOP/COEP headers. All DB operations are proxied via
 * postMessage RPC.
 */

import type { StorageAdapter, Job, JobStatus, TaskMeta } from '../types.js';

export interface OPFSAdapterConfig {
  /** URL of the opfs-worker.js file (default: /lib/sqlite3/opfs-worker.js) */
  workerUrl?: string;
}

export class OPFSAdapter implements StorageAdapter {
  private worker: Worker | null = null;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private config: OPFSAdapterConfig;
  private callId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(config: OPFSAdapterConfig = {}) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    if (!navigator?.storage?.getDirectory) {
      throw new Error('OPFS is not supported in this browser');
    }

    const workerUrl = this.config.workerUrl ?? '/lib/sqlite3/opfs-worker.js';

    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (error) {
        p.reject(new Error(error));
      } else {
        p.resolve(result);
      }
    };

    // Init sqlite3 inside the Worker
    await this.call('init');
    this.initialized = true;
  }

  private call(method: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }
      const id = ++this.callId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.call('close').catch(() => {});
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.initializePromise = null;
      this.pending.clear();
    }
  }

  // Task operations
  async createTask(meta: TaskMeta): Promise<void> {
    await this.call('createTask', meta);
  }

  async getTask(taskId: string): Promise<TaskMeta | null> {
    return this.call('getTask', taskId) as Promise<TaskMeta | null>;
  }

  async updateTask(taskId: string, updates: Partial<TaskMeta>): Promise<void> {
    await this.call('updateTask', taskId, updates);
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.call('deleteTask', taskId);
  }

  async listTasks(): Promise<TaskMeta[]> {
    return this.call('listTasks') as Promise<TaskMeta[]>;
  }

  // Job operations
  async createJobs(jobs: Job[]): Promise<void> {
    await this.call('createJobs', jobs);
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.call('getJob', jobId) as Promise<Job | null>;
  }

  async getJobsByTask(taskId: string, status?: JobStatus, limit = 100, offset = 0): Promise<Job[]> {
    return this.call('getJobsByTask', taskId, status, limit, offset) as Promise<Job[]>;
  }

  async getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }> {
    return this.call('getJobCounts', taskId) as Promise<{ pending: number; active: number; completed: number; failed: number }>;
  }

  async claimJobs(taskId: string, limit: number): Promise<Job[]> {
    return this.call('claimJobs', taskId, limit) as Promise<Job[]>;
  }

  async completeJob(jobId: string, output: unknown): Promise<void> {
    await this.call('completeJob', jobId, output);
  }

  async failJob(jobId: string, error: string, canRetry: boolean, retryAfterMs?: number): Promise<void> {
    await this.call('failJob', jobId, error, canRetry, retryAfterMs);
  }

  async resetActiveJobs(taskId: string): Promise<number> {
    return this.call('resetActiveJobs', taskId) as Promise<number>;
  }

  async resetFailedJobs(taskId: string): Promise<number> {
    return this.call('resetFailedJobs', taskId) as Promise<number>;
  }

  async deleteJobsByTask(taskId: string): Promise<void> {
    await this.call('deleteJobsByTask', taskId);
  }
}
