/**
 * 内存存储适配器
 * 不写磁盘，适合不需要持久化的场景（如目录扫描）
 * 性能最佳，但不支持断点续传
 */

import type { StorageAdapter, TaskMeta, Job, JobStatus } from '../types.js';

export class MemoryAdapter implements StorageAdapter {
  private tasks = new Map<string, TaskMeta>();
  private jobs = new Map<string, Job>();
  private jobsByTask = new Map<string, Set<string>>();
  private cleanupCompleted: boolean;

  /**
   * @param cleanupCompleted - 是否在 job 完成后立即清理，节省内存（默认 false）
   */
  constructor(cleanupCompleted = false) {
    this.cleanupCompleted = cleanupCompleted;
  }

  async initialize(): Promise<void> {
    // 无需初始化
  }

  async close(): Promise<void> {
    this.tasks.clear();
    this.jobs.clear();
    this.jobsByTask.clear();
  }

  // Task 操作
  async createTask(meta: TaskMeta): Promise<void> {
    this.tasks.set(meta.id, { ...meta });
    this.jobsByTask.set(meta.id, new Set());
  }

  async getTask(taskId: string): Promise<TaskMeta | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async updateTask(taskId: string, updates: Partial<TaskMeta>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      Object.assign(task, updates, { updatedAt: Date.now() });
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
    this.jobsByTask.delete(taskId);
  }

  async listTasks(): Promise<TaskMeta[]> {
    return [...this.tasks.values()];
  }

  // Job 操作
  async createJob(meta: Job): Promise<void> {
    this.jobs.set(meta.id, { ...meta });
    const taskJobs = this.jobsByTask.get(meta.taskId);
    if (taskJobs) {
      taskJobs.add(meta.id);
    }
  }

  async createJobs(metas: Job[]): Promise<void> {
    for (const meta of metas) {
      await this.createJob(meta);
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async claimJobs(taskId: string, limit: number): Promise<Job[]> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (!taskJobs) return [];

    const claimed: Job[] = [];
    const now = Date.now();

    for (const jobId of taskJobs) {
      if (claimed.length >= limit) break;

      const job = this.jobs.get(jobId);
      if (job && job.status === 'pending') {
        job.status = 'active';
        job.startedAt = now;
        claimed.push({ ...job });
      }
    }

    return claimed;
  }

  async completeJob(jobId: string, output: unknown): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      // 更新任务计数
      const task = this.tasks.get(job.taskId);
      if (task) {
        task.completedJobs++;
        task.updatedAt = Date.now();
      }

      // 清理已完成的 job 节省内存
      if (this.cleanupCompleted) {
        const taskJobs = this.jobsByTask.get(job.taskId);
        taskJobs?.delete(jobId);
        this.jobs.delete(jobId);
      } else {
        job.status = 'completed';
        job.output = output;
        job.completedAt = Date.now();
      }
    }
  }

  async failJob(jobId: string, error: string, canRetry: boolean): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.attempts++;
      job.error = error;

      if (canRetry) {
        job.status = 'pending';
        job.startedAt = null;
      } else {
        // 更新任务计数
        const task = this.tasks.get(job.taskId);
        if (task) {
          task.failedJobs++;
          task.updatedAt = Date.now();
        }

        // 清理已失败的 job 节省内存
        if (this.cleanupCompleted) {
          const taskJobs = this.jobsByTask.get(job.taskId);
          taskJobs?.delete(jobId);
          this.jobs.delete(jobId);
        } else {
          job.status = 'failed';
          job.completedAt = Date.now();
        }
      }
    }
  }

  async getJobsByTask(taskId: string, status?: JobStatus, limit = 100, offset = 0): Promise<Job[]> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (!taskJobs) return [];

    let jobs = [...taskJobs]
      .map((id) => this.jobs.get(id)!)
      .filter(Boolean);

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    return jobs.slice(offset, offset + limit);
  }

  async getJobCounts(taskId: string): Promise<{ pending: number; active: number; completed: number; failed: number }> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (!taskJobs) return { pending: 0, active: 0, completed: 0, failed: 0 };

    const counts = { pending: 0, active: 0, completed: 0, failed: 0 };
    for (const jobId of taskJobs) {
      const job = this.jobs.get(jobId);
      if (job) {
        counts[job.status]++;
      }
    }
    return counts;
  }

  async deleteJobsByTask(taskId: string): Promise<void> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (taskJobs) {
      for (const jobId of taskJobs) {
        this.jobs.delete(jobId);
      }
      taskJobs.clear();
    }
  }

  async resetActiveJobs(taskId: string): Promise<number> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (!taskJobs) return 0;

    let count = 0;
    for (const jobId of taskJobs) {
      const job = this.jobs.get(jobId);
      if (job && job.status === 'active') {
        job.status = 'pending';
        job.startedAt = null;
        count++;
      }
    }
    return count;
  }

  async resetFailedJobs(taskId: string): Promise<number> {
    const taskJobs = this.jobsByTask.get(taskId);
    if (!taskJobs) return 0;

    let count = 0;
    const task = this.tasks.get(taskId);

    for (const jobId of taskJobs) {
      const job = this.jobs.get(jobId);
      if (job && job.status === 'failed') {
        job.status = 'pending';
        job.error = null;
        job.completedAt = null;
        job.attempts = 0;
        count++;
      }
    }

    if (task && count > 0) {
      task.failedJobs -= count;
      task.updatedAt = Date.now();
    }

    return count;
  }
}
