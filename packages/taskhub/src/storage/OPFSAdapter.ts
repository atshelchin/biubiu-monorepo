/**
 * OPFS SQLite Storage Adapter
 * Uses sqlite3.wasm with SAH Pool for high-performance browser storage
 * Does NOT require Cross-Origin Isolation headers
 */

import type { StorageAdapter, Job, JobStatus, TaskMeta } from '../types.js';

// SQLite WASM types (simplified)
interface SQLite3 {
  oo1: {
    DB: new (filename: string, mode?: string) => SQLiteDB;
    OpfsDb?: new (filename: string, mode?: string) => SQLiteDB;
  };
  installOpfsSAHPoolVfs?: () => Promise<{ vfsName: string }>;
  installOpfsSAHPool?: () => Promise<{ vfsName: string }>;
}

interface SQLiteDB {
  exec(sql: string | { sql: string; bind?: unknown[]; returnValue?: string; rowMode?: string; callback?: (row: Record<string, unknown>) => void }): unknown[];
  prepare(sql: string): SQLiteStatement;
  selectValue(sql: string): unknown;
  close(): void;
}

interface SQLiteStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  finalize(): void;
  getColumnNames(): string[];
  step(): boolean;
}

declare function sqlite3InitModule(config?: { print?: (msg: string) => void; printErr?: (msg: string) => void }): Promise<SQLite3>;

const DB_NAME = 'taskhub.sqlite3';

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  merkle_root TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  total_jobs INTEGER NOT NULL DEFAULT 0,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_task_status ON jobs(task_id, status);
`;

export interface OPFSAdapterConfig {
  sqlite3Url?: string;
  proxyUrl?: string;
}

export class OPFSAdapter implements StorageAdapter {
  private db: SQLiteDB | null = null;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private config: OPFSAdapterConfig;

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
    // Check OPFS support
    if (!navigator?.storage?.getDirectory) {
      throw new Error('OPFS is not supported in this browser');
    }

    // Configure proxy for non-isolated environment
    if (this.config.proxyUrl) {
      (self as unknown as { sqlite3JsConfig: { proxyUri: string } }).sqlite3JsConfig = {
        proxyUri: this.config.proxyUrl
      };
    }

    // Load sqlite3.wasm
    if (this.config.sqlite3Url) {
      await this.loadScript(this.config.sqlite3Url);
    }

    if (typeof sqlite3InitModule !== 'function') {
      throw new Error('sqlite3InitModule not found. Please load sqlite3.js first.');
    }

    const sqlite3 = await sqlite3InitModule();

    // Try SAH Pool mode first (non-isolated, best performance)
    const installFn = sqlite3.installOpfsSAHPoolVfs || sqlite3.installOpfsSAHPool;

    if (typeof installFn === 'function') {
      try {
        const poolUtil = await installFn();
        this.db = new sqlite3.oo1.DB({
          filename: '/' + DB_NAME,
          vfs: poolUtil.vfsName
        } as unknown as string);
      } catch (err) {
        // SAH Pool failed, try OpfsDb
        if (sqlite3.oo1.OpfsDb) {
          this.db = new sqlite3.oo1.OpfsDb('/' + DB_NAME, 'c');
        } else {
          throw new Error('OPFS SQLite not available');
        }
      }
    } else if (sqlite3.oo1.OpfsDb) {
      this.db = new sqlite3.oo1.OpfsDb('/' + DB_NAME, 'c');
    } else {
      throw new Error('OPFS SQLite not available');
    }

    // Performance settings
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    // Create tables
    this.db.exec(CREATE_TABLES_SQL);

    this.initialized = true;
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
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

  private getDb(): SQLiteDB {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  // =========================================================================
  // Task Operations
  // =========================================================================

  async createTask(meta: TaskMeta): Promise<void> {
    const db = this.getDb();
    db.exec({
      sql: `INSERT INTO tasks (id, name, type, merkle_root, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [meta.id, meta.name, meta.type, meta.merkleRoot, meta.status, meta.totalJobs, meta.completedJobs, meta.failedJobs, meta.createdAt, meta.updatedAt]
    });
  }

  async getTask(taskId: string): Promise<TaskMeta | null> {
    const db = this.getDb();
    const results: Record<string, unknown>[] = [];
    db.exec({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      bind: [taskId],
      rowMode: 'object',
      callback: (row) => { results.push(row); }
    });
    return results.length > 0 ? this.rowToTaskMeta(results[0]) : null;
  }

  async updateTask(taskId: string, updates: Partial<TaskMeta>): Promise<void> {
    const db = this.getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.totalJobs !== undefined) { fields.push('total_jobs = ?'); values.push(updates.totalJobs); }
    if (updates.completedJobs !== undefined) { fields.push('completed_jobs = ?'); values.push(updates.completedJobs); }
    if (updates.failedJobs !== undefined) { fields.push('failed_jobs = ?'); values.push(updates.failedJobs); }
    if (updates.merkleRoot !== undefined) { fields.push('merkle_root = ?'); values.push(updates.merkleRoot); }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(taskId);

    db.exec({
      sql: `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
      bind: values
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const db = this.getDb();
    db.exec({ sql: 'DELETE FROM tasks WHERE id = ?', bind: [taskId] });
  }

  async listTasks(): Promise<TaskMeta[]> {
    const db = this.getDb();
    const results: Record<string, unknown>[] = [];
    db.exec({
      sql: 'SELECT * FROM tasks ORDER BY created_at DESC',
      rowMode: 'object',
      callback: (row) => { results.push(row); }
    });
    return results.map(row => this.rowToTaskMeta(row));
  }

  // =========================================================================
  // Job Operations
  // =========================================================================

  async createJobs(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;

    const db = this.getDb();

    // Batch insert with transactions
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const job of jobs) {
        db.exec({
          sql: `INSERT INTO jobs (id, task_id, input, output, error, status, attempts, created_at, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            job.id,
            job.taskId,
            JSON.stringify(job.input),
            job.output !== undefined ? JSON.stringify(job.output) : null,
            job.error ?? null,
            job.status,
            job.attempts,
            job.createdAt,
            job.startedAt ?? null,
            job.completedAt ?? null
          ]
        });
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    const db = this.getDb();
    const results: Record<string, unknown>[] = [];
    db.exec({
      sql: 'SELECT * FROM jobs WHERE id = ?',
      bind: [jobId],
      rowMode: 'object',
      callback: (row) => { results.push(row); }
    });
    return results.length > 0 ? this.rowToJob(results[0]) : null;
  }

  async getJobsByTask(taskId: string, status?: JobStatus, limit = 100, offset = 0): Promise<Job[]> {
    const db = this.getDb();
    const results: Record<string, unknown>[] = [];

    let sql = 'SELECT * FROM jobs WHERE task_id = ?';
    const bind: unknown[] = [taskId];

    if (status) {
      sql += ' AND status = ?';
      bind.push(status);
    }

    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    bind.push(limit, offset);

    db.exec({
      sql,
      bind,
      rowMode: 'object',
      callback: (row) => { results.push(row); }
    });

    return results.map(row => this.rowToJob(row));
  }

  async getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }> {
    const db = this.getDb();
    const results: { status: string; count: number }[] = [];
    db.exec({
      sql: 'SELECT status, COUNT(*) as count FROM jobs WHERE task_id = ? GROUP BY status',
      bind: [taskId],
      rowMode: 'object',
      callback: (row) => { results.push(row as { status: string; count: number }); }
    });

    const counts = { pending: 0, active: 0, completed: 0, failed: 0 };
    for (const row of results) {
      counts[row.status as JobStatus] = row.count;
    }
    return counts;
  }

  async claimJobs(taskId: string, limit: number): Promise<Job[]> {
    const db = this.getDb();
    const now = Date.now();

    db.exec('BEGIN TRANSACTION;');
    try {
      // Select pending jobs
      const jobs: Record<string, unknown>[] = [];
      db.exec({
        sql: `SELECT * FROM jobs WHERE task_id = ? AND status = 'pending' LIMIT ?`,
        bind: [taskId, limit],
        rowMode: 'object',
        callback: (row) => { jobs.push(row); }
      });

      if (jobs.length === 0) {
        db.exec('COMMIT;');
        return [];
      }

      // Update to active
      const ids = jobs.map(j => j.id);
      for (const id of ids) {
        db.exec({
          sql: `UPDATE jobs SET status = 'active', started_at = ?, attempts = attempts + 1 WHERE id = ?`,
          bind: [now, id]
        });
      }

      db.exec('COMMIT;');

      return jobs.map(row => ({
        ...this.rowToJob(row),
        status: 'active' as const,
        startedAt: now,
        attempts: (row.attempts as number) + 1,
      }));
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  async completeJob(jobId: string, output: unknown): Promise<void> {
    const db = this.getDb();
    db.exec({
      sql: `UPDATE jobs SET status = 'completed', output = ?, completed_at = ? WHERE id = ?`,
      bind: [JSON.stringify(output), Date.now(), jobId]
    });
  }

  async failJob(jobId: string, error: string, canRetry: boolean): Promise<void> {
    const db = this.getDb();
    const newStatus = canRetry ? 'pending' : 'failed';
    if (canRetry) {
      // Don't set completed_at for retryable failures - job will be retried
      db.exec({
        sql: `UPDATE jobs SET status = ?, error = ?, started_at = NULL WHERE id = ?`,
        bind: [newStatus, error, jobId]
      });
    } else {
      db.exec({
        sql: `UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?`,
        bind: [newStatus, error, Date.now(), jobId]
      });
    }
  }

  async resetActiveJobs(taskId: string): Promise<number> {
    const db = this.getDb();

    // Count first
    let count = 0;
    db.exec({
      sql: `SELECT COUNT(*) as count FROM jobs WHERE task_id = ? AND status = 'active'`,
      bind: [taskId],
      rowMode: 'object',
      callback: (row) => { count = row.count as number; }
    });

    // Then update
    db.exec({
      sql: `UPDATE jobs SET status = 'pending', started_at = NULL WHERE task_id = ? AND status = 'active'`,
      bind: [taskId]
    });

    return count;
  }

  async resetFailedJobs(taskId: string): Promise<number> {
    const db = this.getDb();

    // Count first
    let count = 0;
    db.exec({
      sql: `SELECT COUNT(*) as count FROM jobs WHERE task_id = ? AND status = 'failed'`,
      bind: [taskId],
      rowMode: 'object',
      callback: (row) => { count = row.count as number; }
    });

    // Then update jobs
    db.exec({
      sql: `UPDATE jobs SET status = 'pending', error = NULL, completed_at = NULL, attempts = 0
            WHERE task_id = ? AND status = 'failed'`,
      bind: [taskId]
    });

    // Update task counters
    if (count > 0) {
      db.exec({
        sql: `UPDATE tasks SET failed_jobs = failed_jobs - ?, updated_at = ? WHERE id = ?`,
        bind: [count, Date.now(), taskId]
      });
    }

    return count;
  }

  async deleteJobsByTask(taskId: string): Promise<void> {
    const db = this.getDb();
    db.exec({ sql: 'DELETE FROM jobs WHERE task_id = ?', bind: [taskId] });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private rowToTaskMeta(row: Record<string, unknown>): TaskMeta {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as 'deterministic' | 'dynamic',
      merkleRoot: row.merkle_root as string | null,
      status: row.status as TaskMeta['status'],
      totalJobs: row.total_jobs as number,
      completedJobs: row.completed_jobs as number,
      failedJobs: row.failed_jobs as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      input: JSON.parse(row.input as string),
      output: row.output ? JSON.parse(row.output as string) : undefined,
      error: (row.error as string) ?? undefined,
      status: row.status as JobStatus,
      attempts: row.attempts as number,
      createdAt: row.created_at as number,
      startedAt: (row.started_at as number) ?? undefined,
      completedAt: (row.completed_at as number) ?? undefined,
    };
  }
}
