#!/usr/bin/env bun
/**
 * Retry Example - 错误处理与重试机制演示
 *
 * 演示：
 * - 自动重试失败的作业
 * - 指数退避策略
 * - 自定义可重试错误判断
 * - 最大重试次数限制
 *
 * 运行: bun examples/retry.ts
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import {
  header,
  section,
  success,
  error,
  warn,
  info,
  metrics,
  jobStatus,
  sleep,
  formatDuration,
} from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-retry.db');

// 模拟不稳定的 API
class UnstableAPI extends TaskSource<{ id: number; failTimes: number }, { id: number; success: boolean }> {
  readonly type = 'deterministic' as const;
  private data: { id: number; failTimes: number }[];
  private attemptCounts: Map<number, number> = new Map();

  constructor(data: { id: number; failTimes: number }[]) {
    super();
    this.data = data;
  }

  getData() {
    return this.data;
  }

  async handler(
    input: { id: number; failTimes: number },
    ctx: JobContext
  ): Promise<{ id: number; success: boolean }> {
    const attempts = (this.attemptCounts.get(input.id) ?? 0) + 1;
    this.attemptCounts.set(input.id, attempts);

    await sleep(50);

    // 前 N 次故意失败
    if (attempts <= input.failTimes) {
      const errorType = Math.random() > 0.5 ? 'network' : '5xx';
      if (errorType === 'network') {
        throw new Error(`Network error: Connection reset`);
      } else {
        throw new Error(`HTTP 503 Service Unavailable`);
      }
    }

    return { id: input.id, success: true };
  }

  // 自定义可重试错误判断
  isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // 网络错误和 5xx 错误可重试
      return msg.includes('network') || msg.includes('5') || msg.includes('timeout');
    }
    return false;
  }

  getAttempts(id: number): number {
    return this.attemptCounts.get(id) ?? 0;
  }
}

// 模拟永久失败的任务
class PermanentFailureAPI extends TaskSource<number, string> {
  readonly type = 'deterministic' as const;
  private data: number[];

  constructor(data: number[]) {
    super();
    this.data = data;
  }

  getData() {
    return this.data;
  }

  async handler(input: number): Promise<string> {
    await sleep(30);
    // 永久失败 - 400 错误不可重试
    throw new Error(`HTTP 400 Bad Request: Invalid input ${input}`);
  }

  // 4xx 错误不可重试
  isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      return !error.message.includes('400') && !error.message.includes('4');
    }
    return true;
  }
}

async function main() {
  header('🔄 TaskHub - Retry Mechanism Example');

  section('重试机制说明');
  info('TaskHub 的智能重试策略:');
  info('');
  info('  1. 可重试错误判断 (isRetryable)');
  info('     - 网络错误: 可重试');
  info('     - 5xx 服务器错误: 可重试');
  info('     - 4xx 客户端错误: 不可重试');
  info('');
  info('  2. 指数退避 (Exponential Backoff)');
  info('     - 第1次重试: baseDelay × 2^0 = 1s');
  info('     - 第2次重试: baseDelay × 2^1 = 2s');
  info('     - 第3次重试: baseDelay × 2^2 = 4s');
  info('     - 最大不超过 maxDelay');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // ========================================
  // 场景 1: 暂时性失败后成功
  // ========================================
  section('场景 1: 暂时性失败 (最终成功)');
  info('模拟不稳定的 API:');
  info('  - Job 1: 失败 0 次 (立即成功)');
  info('  - Job 2: 失败 1 次后成功');
  info('  - Job 3: 失败 2 次后成功');
  info('  - Job 4: 失败 3 次后成功 (达到重试上限)');
  console.log();

  const unstableData = [
    { id: 1, failTimes: 0 },
    { id: 2, failTimes: 1 },
    { id: 3, failTimes: 2 },
    { id: 4, failTimes: 3 },
  ];

  const source1 = new UnstableAPI(unstableData);
  const task1 = await hub.createTask({
    name: 'unstable-api',
    source: source1,
    concurrency: { min: 1, max: 2, initial: 1 },
    retry: {
      maxAttempts: 4,
      baseDelay: 100, // 演示用短延迟
      maxDelay: 500,
    },
  });

  // 监听事件
  task1.on('job:start', (job) => {
    const attempt = source1.getAttempts(job.input.id);
    if (attempt > 0) {
      jobStatus('retry', `Job ${job.input.id}`, `第 ${attempt + 1} 次尝试`);
    } else {
      jobStatus('start', `Job ${job.input.id}`);
    }
  });

  task1.on('job:complete', (job) => {
    const attempts = source1.getAttempts(job.input.id);
    jobStatus('complete', `Job ${job.input.id}`, attempts > 1 ? `重试 ${attempts - 1} 次后成功` : '一次成功');
  });

  task1.on('job:retry', (job, attempt) => {
    warn(`  ↻ Job ${job.input.id} 将重试 (第 ${attempt} 次失败)`);
  });

  const startTime1 = Date.now();
  await task1.start();
  const duration1 = Date.now() - startTime1;

  console.log();
  success('所有任务最终都成功了！');
  metrics({
    总任务: task1.totalJobs,
    成功: task1.completedJobs,
    失败: task1.failedJobs,
    耗时: formatDuration(duration1),
  });

  // 显示每个作业的重试次数
  console.log();
  info('各作业重试情况:');
  for (const item of unstableData) {
    metrics({
      ['Job ' + item.id]: `重试 ${source1.getAttempts(item.id) - 1} 次`,
    });
  }

  // ========================================
  // 场景 2: 永久性失败
  // ========================================
  section('场景 2: 永久性失败 (不可重试)');
  info('模拟 400 Bad Request 错误:');
  info('  - 4xx 错误被判定为不可重试');
  info('  - 立即标记为失败，不浪费重试次数');
  console.log();

  const source2 = new PermanentFailureAPI([1, 2, 3]);
  const task2 = await hub.createTask({
    name: 'permanent-failure',
    source: source2,
    concurrency: { min: 1, max: 3, initial: 2 },
    retry: {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 500,
    },
  });

  task2.on('job:failed', (job, err) => {
    error(`Job ${job.input} 永久失败: ${err.message}`);
  });

  await task2.start();

  console.log();
  metrics({
    总任务: task2.totalJobs,
    成功: task2.completedJobs,
    失败: task2.failedJobs,
  });

  info('');
  info('4xx 错误直接失败，无重试 (节省时间和资源)');

  // ========================================
  // 场景 3: 超出重试次数
  // ========================================
  section('场景 3: 超出最大重试次数');
  info('模拟总是失败的情况:');
  info('  - 设置失败 10 次');
  info('  - 最大重试 3 次');
  info('  - 第 4 次后放弃');
  console.log();

  const source3 = new UnstableAPI([{ id: 1, failTimes: 10 }]);
  const task3 = await hub.createTask({
    name: 'max-retries',
    source: source3,
    concurrency: { min: 1, max: 1, initial: 1 },
    retry: {
      maxAttempts: 3,
      baseDelay: 50,
      maxDelay: 200,
    },
  });

  let retryCount = 0;
  task3.on('job:retry', () => {
    retryCount++;
    warn(`  ↻ 重试第 ${retryCount} 次...`);
  });

  task3.on('job:failed', (job, err) => {
    error(`最终失败: 已达最大重试次数 (${retryCount + 1}/${3})`);
  });

  await task3.start();

  console.log();
  metrics({
    尝试次数: source3.getAttempts(1),
    最大允许: 3,
    最终状态: '失败',
  });

  // ========================================
  // 总结
  // ========================================
  section('📊 重试策略总结');

  console.log('  ┌─────────────────┬────────────────────────────────┐');
  console.log('  │ 配置项          │ 说明                           │');
  console.log('  ├─────────────────┼────────────────────────────────┤');
  console.log('  │ maxAttempts     │ 最大尝试次数 (含首次)          │');
  console.log('  │ baseDelay       │ 基础延迟 (毫秒)                │');
  console.log('  │ maxDelay        │ 最大延迟上限 (毫秒)            │');
  console.log('  │ isRetryable()   │ 自定义错误是否可重试           │');
  console.log('  └─────────────────┴────────────────────────────────┘');

  console.log();
  info('最佳实践:');
  info('  1. 区分临时错误和永久错误');
  info('  2. 使用指数退避避免雪崩');
  info('  3. 设置合理的 maxDelay 防止等待过长');
  info('  4. 监控重试率，过高可能表示上游问题');

  // 清理
  await task1.destroy();
  await task2.destroy();
  await task3.destroy();
  await hub.close();

  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
