#!/usr/bin/env bun
/**
 * AIMD Example - 自适应并发控制演示
 *
 * 演示：
 * - AIMD (Additive Increase / Multiplicative Decrease) 算法
 * - 成功时逐步增加并发 (Additive Increase)
 * - 遇到限流时快速降低并发 (Multiplicative Decrease)
 * - 自动找到最优并发数
 *
 * 运行: bun examples/aimd.ts
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
  progress,
  concurrencyIndicator,
  sleep,
  formatDuration,
} from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-aimd.db');

// 模拟有速率限制的 API
class RateLimitedAPI extends TaskSource<number, string> {
  readonly type = 'deterministic' as const;
  private data: number[];
  private maxConcurrent: number;
  private currentConcurrent = 0;
  private peakConcurrent = 0;
  public rateLimitHits = 0;
  public successCount = 0;

  constructor(data: number[], maxConcurrent: number) {
    super();
    this.data = data;
    this.maxConcurrent = maxConcurrent;
  }

  getData() {
    return this.data;
  }

  async handler(input: number, ctx: JobContext): Promise<string> {
    this.currentConcurrent++;
    this.peakConcurrent = Math.max(this.peakConcurrent, this.currentConcurrent);

    try {
      // 检查是否超过并发限制
      if (this.currentConcurrent > this.maxConcurrent) {
        this.rateLimitHits++;
        throw new Error('HTTP 429 Too Many Requests - Concurrent limit exceeded');
      }

      // 模拟 API 处理时间
      await sleep(50 + Math.random() * 50);
      this.successCount++;

      return `Processed: ${input}`;
    } finally {
      this.currentConcurrent--;
    }
  }

  // 自定义限流检测
  isRateLimited(error: unknown): boolean {
    return error instanceof Error && error.message.includes('429');
  }

  getPeakConcurrent(): number {
    return this.peakConcurrent;
  }
}

async function main() {
  header('⚡ TaskHub - AIMD Adaptive Concurrency Example');

  section('场景说明');
  info('模拟一个有并发限制的 API:');
  info('  - 实际并发限制: 8 个同时请求');
  info('  - 初始并发设置: 2 (保守启动)');
  info('  - 最大并发限制: 20');
  info('');
  info('AIMD 算法会自动探测并适应实际限制:');
  info('  - 连续成功 10 次后: 并发 +1 (Additive Increase)');
  info('  - 遇到 429 错误后: 并发 ×0.5 (Multiplicative Decrease)');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  section('创建任务');

  // 生成 100 个任务
  const data = Array.from({ length: 100 }, (_, i) => i + 1);
  const source = new RateLimitedAPI(data, 8); // 实际限制 8 并发

  const task = await hub.createTask({
    name: 'aimd-demo',
    source,
    concurrency: {
      min: 1,
      max: 20,
      initial: 2, // 从保守值开始
    },
  });

  info(`创建了 ${task.totalJobs} 个任务`);

  // 跟踪并发变化
  const concurrencyHistory: { time: number; concurrency: number }[] = [];
  const startTime = Date.now();

  task.on('progress', (p) => {
    concurrencyHistory.push({
      time: Date.now() - startTime,
      concurrency: p.concurrency,
    });
  });

  task.on('rate-limited', (newConcurrency) => {
    warn(`触发限流！并发降至 ${newConcurrency} (Multiplicative Decrease)`);
  });

  section('执行任务 (观察并发自适应)');

  let lastProgress = 0;
  task.on('progress', (p) => {
    if (p.completed !== lastProgress) {
      progress(p.completed, p.total);
      concurrencyIndicator(p.concurrency, 20);
      lastProgress = p.completed;
    }
  });

  await task.start();
  const duration = Date.now() - startTime;

  section('并发变化历史');

  // 分析并发变化
  const uniqueConcurrencies = [...new Set(concurrencyHistory.map((h) => h.concurrency))];
  info('并发变化轨迹:');
  metrics({
    初始: uniqueConcurrencies[0] || 2,
    峰值: Math.max(...uniqueConcurrencies),
    最终: concurrencyHistory[concurrencyHistory.length - 1]?.concurrency || 0,
  });

  // 显示并发变化图
  console.log();
  info('并发变化曲线 (时间 → 并发数):');
  const segments = 10;
  const segmentSize = Math.ceil(concurrencyHistory.length / segments);
  for (let i = 0; i < segments && i * segmentSize < concurrencyHistory.length; i++) {
    const idx = Math.min(i * segmentSize, concurrencyHistory.length - 1);
    const h = concurrencyHistory[idx];
    if (h) {
      const bar = '█'.repeat(h.concurrency);
      const pad = ' '.repeat(20 - h.concurrency);
      info(`  ${formatDuration(h.time).padStart(6)} │${bar}${pad}│ ${h.concurrency}`);
    }
  }

  section('性能分析');

  // 对比理论性能
  const avgJobTime = 75; // 平均处理时间
  const theoreticalSerial = data.length * avgJobTime;
  const theoreticalOptimal = (data.length / 8) * avgJobTime; // 以实际限制 8 计算

  metrics({
    '实际耗时': formatDuration(duration),
    '理论串行': formatDuration(theoreticalSerial),
    '理论最优': formatDuration(theoreticalOptimal),
    '加速比': `${(theoreticalSerial / duration).toFixed(2)}x`,
  });

  console.log();
  metrics({
    '总请求': data.length,
    '成功': source.successCount,
    '限流次数': source.rateLimitHits,
    '峰值并发': source.getPeakConcurrent(),
  });

  section('📊 AIMD 算法总结');

  if (source.rateLimitHits > 0) {
    success('AIMD 自适应成功！');
    info('');
    info('观察点:');
    info('  1. 并发从保守值 (2) 开始，逐步探测');
    info('  2. 连续成功后，并发逐步增加 (Additive Increase)');
    info('  3. 触发 429 后，并发快速减半 (Multiplicative Decrease)');
    info('  4. 最终稳定在接近实际限制的水平');
    info('');
    info('这就是 TCP 拥塞控制的经典算法！');
  } else {
    info('本次运行未触发限流，并发持续增长');
    info('可以尝试降低 maxConcurrent 参数来观察限流行为');
  }

  // 清理
  await task.destroy();
  await hub.close();

  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
