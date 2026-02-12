/**
 * Bun SQLite Storage Adapter
 * Uses bun:sqlite for maximum performance
 */

import { Database } from 'bun:sqlite';
import type { StorageAdapter, Job, JobStatus, TaskMeta, JobRecord, TaskRecord } from '../types.js';
import { CREATE_TASKS_TABLE, CREATE_JOBS_TABLE, CREATE_INDEXES, PRAGMA_SETTINGS } from './sql-schemas.js';

export class BunSQLiteAdapter implements StorageAdapter {
  private db: Database | null = null;
  private dbPath: string;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private closed = false;

  constructor(dbPath: string = 'taskhub.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    this.closed = false;
    this.db = new Database(this.dbPath);

    // Enable WAL mode and performance settings
    this.db.exec(PRAGMA_SETTINGS);

    // Create tables
    this.db.exec(CREATE_TASKS_TABLE);
    this.db.exec(CREATE_JOBS_TABLE);
    this.db.exec(CREATE_INDEXES);

    this.initialized = true;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.initializePromise = null;
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private getDb(): Database {
    if (this.closed) throw new Error('Database closed');
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  // =========================================================================
  // Task Operations
  // =========================================================================

  async createTask(meta: TaskMeta): Promise<void> {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO tasks (id, name, type, merkle_root, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      meta.id,
      meta.name,
      meta.type,
      meta.merkleRoot,
      meta.status,
      meta.totalJobs,
      meta.completedJobs,
      meta.failedJobs,
      meta.createdAt,
      meta.updatedAt
    );
  }

  async getTask(taskId: string): Promise<TaskMeta | null> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(taskId) as TaskRecord | null;
    return row ? this.rowToTaskMeta(row) : null;
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

    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);
  }

  async deleteTask(taskId: string): Promise<void> {
    const db = this.getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  async listTasks(): Promise<TaskMeta[]> {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as TaskRecord[];
    return rows.map(row => this.rowToTaskMeta(row));
  }

  // =========================================================================
  // Job Operations
  // =========================================================================

  async createJobs(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;

    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO jobs (id, task_id, input, output, error, status, attempts, created_at, started_at, completed_at, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((jobs: Job[]) => {
      for (const job of jobs) {
        stmt.run(
          job.id,
          job.taskId,
          JSON.stringify(job.input),
          job.output !== undefined ? JSON.stringify(job.output) : null,
          job.error ?? null,
          job.status,
          job.attempts,
          job.createdAt,
          job.startedAt ?? null,
          job.completedAt ?? null,
          job.scheduledAt ?? null
        );
      }
    });

    insertMany(jobs);
  }

  async getJob(jobId: string): Promise<Job | null> {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRecord | null;
    return row ? this.rowToJob(row) : null;
  }

  async getJobsByTask(taskId: string, status?: JobStatus, limit = 100, offset = 0): Promise<Job[]> {
    const db = this.getDb();
    let sql = 'SELECT * FROM jobs WHERE task_id = ?';
    const params: unknown[] = [taskId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as JobRecord[];
    return rows.map(row => this.rowToJob(row));
  }

  async getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }> {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM jobs WHERE task_id = ? GROUP BY status
    `).all(taskId) as { status: JobStatus; count: number }[];

    const counts = { pending: 0, active: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  async claimJobs(taskId: string, limit: number): Promise<Job[]> {
    const db = this.getDb();
    const now = Date.now();

    // Atomic: select and update in transaction
    // Only claim jobs that are ready (scheduled_at is null or in the past)
    const claimTransaction = db.transaction(() => {
      const rows = db.prepare(`
        SELECT * FROM jobs
        WHERE task_id = ? AND status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= ?)
        LIMIT ?
      `).all(taskId, now, limit) as JobRecord[];

      if (rows.length === 0) return [];

      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');

      db.prepare(`
        UPDATE jobs SET status = 'active', started_at = ?, attempts = attempts + 1, scheduled_at = NULL
        WHERE id IN (${placeholders})
      `).run(now, ...ids);

      return rows.map(row => ({
        ...this.rowToJob(row),
        status: 'active' as const,
        startedAt: now,
        attempts: row.attempts + 1,
        scheduledAt: undefined,
      }));
    });

    return claimTransaction();
  }

  async completeJob(jobId: string, output: unknown): Promise<void> {
    const db = this.getDb();
    db.prepare(`
      UPDATE jobs SET status = 'completed', output = ?, completed_at = ? WHERE id = ?
    `).run(JSON.stringify(output), Date.now(), jobId);
  }

  async failJob(jobId: string, error: string, canRetry: boolean, retryAfterMs?: number): Promise<void> {
    const db = this.getDb();
    const newStatus = canRetry ? 'pending' : 'failed';
    if (canRetry) {
      // Don't set completed_at for retryable failures - job will be retried
      // Set scheduled_at for delayed retry (exponential backoff)
      const scheduledAt = retryAfterMs ? Date.now() + retryAfterMs : null;
      db.prepare(`
        UPDATE jobs SET status = ?, error = ?, started_at = NULL, scheduled_at = ? WHERE id = ?
      `).run(newStatus, error, scheduledAt, jobId);
    } else {
      db.prepare(`
        UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?
      `).run(newStatus, error, Date.now(), jobId);
    }
  }

  async resetActiveJobs(taskId: string): Promise<number> {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE jobs SET status = 'pending', started_at = NULL WHERE task_id = ? AND status = 'active'
    `).run(taskId);
    return result.changes;
  }

  async resetFailedJobs(taskId: string): Promise<number> {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE jobs SET status = 'pending', error = NULL, completed_at = NULL, attempts = 0
      WHERE task_id = ? AND status = 'failed'
    `).run(taskId);

    // Also update task counters
    if (result.changes > 0) {
      db.prepare(`
        UPDATE tasks SET failed_jobs = failed_jobs - ?, updated_at = ? WHERE id = ?
      `).run(result.changes, Date.now(), taskId);
    }

    return result.changes;
  }

  async deleteJobsByTask(taskId: string): Promise<void> {
    const db = this.getDb();
    db.prepare('DELETE FROM jobs WHERE task_id = ?').run(taskId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private rowToTaskMeta(row: TaskRecord): TaskMeta {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      merkleRoot: row.merkle_root,
      status: row.status,
      totalJobs: row.total_jobs,
      completedJobs: row.completed_jobs,
      failedJobs: row.failed_jobs,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToJob(row: JobRecord): Job {
    return {
      id: row.id,
      taskId: row.task_id,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      scheduledAt: row.scheduled_at ?? undefined,
    };
  }
}
