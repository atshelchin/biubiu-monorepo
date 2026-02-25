/**
 * OPFS SQLite Worker
 * Runs sqlite3 WASM in a dedicated Worker so SAH Pool VFS works
 * without COOP/COEP headers.
 */

// Resolve paths relative to this worker's location
const baseDir = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);

// 1. Pre-config: MUST set proxyUri BEFORE importScripts
self.sqlite3JsConfig = {
  proxyUri: baseDir + 'sqlite3-opfs-async-proxy.js'
};

// 2. Load sqlite3.js
importScripts(baseDir + 'sqlite3.js');

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
  completed_at INTEGER,
  scheduled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_task_status ON jobs(task_id, status);
`;

let db = null;

// Row converters
function rowToTaskMeta(row) {
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

function rowToJob(row) {
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

function queryRows(sql, bind) {
  const results = [];
  db.exec({
    sql,
    bind,
    rowMode: 'object',
    callback: (row) => { results.push(row); }
  });
  return results;
}

// StorageAdapter method implementations
const methods = {
  async init() {
    const sqlite3 = await sqlite3InitModule();

    // Try SAH Pool first (works in Worker without COOP/COEP)
    const installFn = sqlite3.installOpfsSAHPoolVfs || sqlite3.installOpfsSAHPool;

    if (typeof installFn === 'function') {
      try {
        const poolUtil = await installFn();
        db = new sqlite3.oo1.DB({
          filename: '/' + DB_NAME,
          vfs: poolUtil.vfsName
        });
      } catch (e) {
        // SAH Pool failed, try OpfsDb (requires isolated context)
        if (sqlite3.oo1.OpfsDb) {
          db = new sqlite3.oo1.OpfsDb('/' + DB_NAME, 'c');
        } else {
          throw new Error('OPFS SQLite not available: ' + e.message);
        }
      }
    } else if (sqlite3.oo1.OpfsDb) {
      db = new sqlite3.oo1.OpfsDb('/' + DB_NAME, 'c');
    } else {
      throw new Error('OPFS SQLite not available');
    }

    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec(CREATE_TABLES_SQL);
  },

  close() {
    if (db) {
      db.close();
      db = null;
    }
  },

  // Task operations
  createTask(meta) {
    db.exec({
      sql: `INSERT INTO tasks (id, name, type, merkle_root, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [meta.id, meta.name, meta.type, meta.merkleRoot, meta.status, meta.totalJobs, meta.completedJobs, meta.failedJobs, meta.createdAt, meta.updatedAt]
    });
  },

  getTask(taskId) {
    const rows = queryRows('SELECT * FROM tasks WHERE id = ?', [taskId]);
    return rows.length > 0 ? rowToTaskMeta(rows[0]) : null;
  },

  updateTask(taskId, updates) {
    const fields = [];
    const values = [];

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
  },

  deleteTask(taskId) {
    db.exec({ sql: 'DELETE FROM tasks WHERE id = ?', bind: [taskId] });
  },

  listTasks() {
    return queryRows('SELECT * FROM tasks ORDER BY created_at DESC', []).map(rowToTaskMeta);
  },

  // Job operations
  createJobs(jobs) {
    if (jobs.length === 0) return;

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const job of jobs) {
        db.exec({
          sql: `INSERT INTO jobs (id, task_id, input, output, error, status, attempts, created_at, started_at, completed_at, scheduled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            job.id, job.taskId,
            JSON.stringify(job.input),
            job.output !== undefined ? JSON.stringify(job.output) : null,
            job.error ?? null,
            job.status, job.attempts, job.createdAt,
            job.startedAt ?? null, job.completedAt ?? null, job.scheduledAt ?? null
          ]
        });
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  },

  getJob(jobId) {
    const rows = queryRows('SELECT * FROM jobs WHERE id = ?', [jobId]);
    return rows.length > 0 ? rowToJob(rows[0]) : null;
  },

  getJobsByTask(taskId, status, limit, offset) {
    let sql = 'SELECT * FROM jobs WHERE task_id = ?';
    const bind = [taskId];
    if (status) { sql += ' AND status = ?'; bind.push(status); }
    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    bind.push(limit ?? 100, offset ?? 0);
    return queryRows(sql, bind).map(rowToJob);
  },

  getJobCounts(taskId) {
    const rows = queryRows(
      'SELECT status, COUNT(*) as count FROM jobs WHERE task_id = ? GROUP BY status',
      [taskId]
    );
    const counts = { pending: 0, active: 0, completed: 0, failed: 0 };
    for (const row of rows) { counts[row.status] = row.count; }
    return counts;
  },

  claimJobs(taskId, limit) {
    const now = Date.now();
    db.exec('BEGIN TRANSACTION;');
    try {
      const jobs = queryRows(
        `SELECT * FROM jobs
         WHERE task_id = ? AND status = 'pending'
           AND (scheduled_at IS NULL OR scheduled_at <= ?)
         LIMIT ?`,
        [taskId, now, limit]
      );

      if (jobs.length === 0) {
        db.exec('COMMIT;');
        return [];
      }

      for (const j of jobs) {
        db.exec({
          sql: `UPDATE jobs SET status = 'active', started_at = ?, attempts = attempts + 1, scheduled_at = NULL WHERE id = ?`,
          bind: [now, j.id]
        });
      }
      db.exec('COMMIT;');

      return jobs.map(row => ({
        ...rowToJob(row),
        status: 'active',
        startedAt: now,
        attempts: row.attempts + 1,
        scheduledAt: undefined,
      }));
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  },

  completeJob(jobId, output) {
    db.exec({
      sql: `UPDATE jobs SET status = 'completed', output = ?, completed_at = ? WHERE id = ?`,
      bind: [JSON.stringify(output), Date.now(), jobId]
    });
  },

  failJob(jobId, error, canRetry, retryAfterMs) {
    const newStatus = canRetry ? 'pending' : 'failed';
    if (canRetry) {
      const scheduledAt = retryAfterMs ? Date.now() + retryAfterMs : null;
      db.exec({
        sql: `UPDATE jobs SET status = ?, error = ?, started_at = NULL, scheduled_at = ? WHERE id = ?`,
        bind: [newStatus, error, scheduledAt, jobId]
      });
    } else {
      db.exec({
        sql: `UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?`,
        bind: [newStatus, error, Date.now(), jobId]
      });
    }
  },

  resetActiveJobs(taskId) {
    const rows = queryRows(
      `SELECT COUNT(*) as count FROM jobs WHERE task_id = ? AND status = 'active'`,
      [taskId]
    );
    const count = rows[0]?.count ?? 0;
    db.exec({
      sql: `UPDATE jobs SET status = 'pending', started_at = NULL WHERE task_id = ? AND status = 'active'`,
      bind: [taskId]
    });
    return count;
  },

  resetFailedJobs(taskId) {
    const rows = queryRows(
      `SELECT COUNT(*) as count FROM jobs WHERE task_id = ? AND status = 'failed'`,
      [taskId]
    );
    const count = rows[0]?.count ?? 0;
    db.exec({
      sql: `UPDATE jobs SET status = 'pending', error = NULL, completed_at = NULL, attempts = 0
            WHERE task_id = ? AND status = 'failed'`,
      bind: [taskId]
    });
    if (count > 0) {
      db.exec({
        sql: `UPDATE tasks SET failed_jobs = failed_jobs - ?, updated_at = ? WHERE id = ?`,
        bind: [count, Date.now(), taskId]
      });
    }
    return count;
  },

  deleteJobsByTask(taskId) {
    db.exec({ sql: 'DELETE FROM jobs WHERE task_id = ?', bind: [taskId] });
  },
};

// RPC message handler
self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    const fn = methods[method];
    if (!fn) throw new Error(`Unknown method: ${method}`);
    const result = await fn(...(args || []));
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
