#!/usr/bin/env bun
/**
 * Batch Processing Example - 大规模批处理演示
 *
 * 演示：
 * - 处理大量任务 (10,000+)
 * - 内存高效的批量写入
 * - 进度监控和统计
 * - 性能基准测试
 *
 * 运行: bun examples/batch.ts
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import {
  header,
  section,
  success,
  info,
  metrics,
  progress,
  formatDuration,
  formatNumber,
  spinner,
} from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-batch.db');

// 高性能数据处理任务
class DataTransformer extends TaskSource<
  { id: number; value: string },
  { id: number; hash: string; length: number }
> {
  readonly type = 'deterministic' as const;
  private data: { id: number; value: string }[];

  constructor(data: { id: number; value: string }[]) {
    super();
    this.data = data;
  }

  getData() {
    return this.data;
  }

  // 使用输入 ID 作为 Job ID (更快的 hash)
  getJobId(input: { id: number; value: string }): string {
    return `item-${input.id}`;
  }

  async handler(
    input: { id: number; value: string },
    ctx: JobContext
  ): Promise<{ id: number; hash: string; length: number }> {
    // 模拟计算密集型操作 (实际处理很快)
    const hash = Buffer.from(input.value).toString('base64');
    return {
      id: input.id,
      hash,
      length: input.value.length,
    };
  }
}

// 模拟 I/O 密集型任务
class IOIntensiveTask extends TaskSource<number, { id: number; data: string }> {
  readonly type = 'deterministic' as const;
  private count: number;

  constructor(count: number) {
    super();
    this.count = count;
  }

  getData() {
    return Array.from({ length: this.count }, (_, i) => i + 1);
  }

  async handler(input: number, ctx: JobContext): Promise<{ id: number; data: string }> {
    // 模拟 I/O 延迟 (5-15ms)
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
    return { id: input, data: `processed-${input}` };
  }
}

async function main() {
  header('📦 TaskHub - Large Batch Processing Example');

  section('批处理能力');
  info('TaskHub 针对大规模批处理进行了优化:');
  info('');
  info('  1. 批量数据写入 (每 1000 条一批)');
  info('  2. WAL 模式提升写入性能');
  info('  3. 内存优化的 Job 调度');
  info('  4. 高效的并发控制');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // ========================================
  // 场景 1: 快速批量处理
  // ========================================
  section('场景 1: 快速批量处理 (10,000 任务)');
  info('测试高吞吐量场景 - CPU 密集型任务');
  console.log();

  // 生成测试数据
  const sp1 = spinner('生成测试数据...');
  const data1 = Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    value: `data-item-${i + 1}-${Math.random().toString(36).slice(2)}`,
  }));
  sp1.stop();
  info(`生成了 ${formatNumber(data1.length)} 条测试数据`);

  // 创建任务
  const sp2 = spinner('创建任务...');
  const createStart = Date.now();
  const task1 = await hub.createTask({
    name: 'batch-fast',
    source: new DataTransformer(data1),
    concurrency: { min: 10, max: 100, initial: 50 },
  });
  const createDuration = Date.now() - createStart;
  sp2.stop();

  metrics({
    创建耗时: formatDuration(createDuration),
    写入速度: `${formatNumber(Math.round(data1.length / (createDuration / 1000)))} jobs/s`,
    总作业数: formatNumber(task1.totalJobs),
  });

  // 执行任务
  console.log();
  info('开始执行...');

  let lastUpdate = Date.now();
  let lastCompleted = 0;

  task1.on('progress', (p) => {
    const now = Date.now();
    if (now - lastUpdate >= 500 || p.completed === p.total) {
      const rate = Math.round((p.completed - lastCompleted) / ((now - lastUpdate) / 1000));
      progress(p.completed, p.total, `${formatNumber(rate)} jobs/s`);
      lastUpdate = now;
      lastCompleted = p.completed;
    }
  });

  const execStart1 = Date.now();
  await task1.start();
  const execDuration1 = Date.now() - execStart1;

  console.log();
  success('批处理完成！');
  metrics({
    总任务: formatNumber(task1.totalJobs),
    执行耗时: formatDuration(execDuration1),
    吞吐量: `${formatNumber(Math.round(task1.totalJobs / (execDuration1 / 1000)))} jobs/s`,
  });

  // ========================================
  // 场景 2: I/O 密集型批处理
  // ========================================
  section('场景 2: I/O 密集型批处理 (5,000 任务)');
  info('测试 I/O 密集场景 - 网络请求、文件操作等');
  info('每个任务有 5-15ms 的模拟 I/O 延迟');
  console.log();

  const task2 = await hub.createTask({
    name: 'batch-io',
    source: new IOIntensiveTask(5000),
    concurrency: { min: 50, max: 200, initial: 100 },
  });

  info('开始执行...');

  lastUpdate = Date.now();
  lastCompleted = 0;

  task2.on('progress', (p) => {
    const now = Date.now();
    if (now - lastUpdate >= 500 || p.completed === p.total) {
      const rate = Math.round((p.completed - lastCompleted) / ((now - lastUpdate) / 1000));
      progress(p.completed, p.total, `${formatNumber(rate)} jobs/s, 并发: ${p.concurrency}`);
      lastUpdate = now;
      lastCompleted = p.completed;
    }
  });

  const execStart2 = Date.now();
  await task2.start();
  const execDuration2 = Date.now() - execStart2;

  console.log();
  success('I/O 密集型批处理完成！');

  // 计算理论最优时间
  const avgIOTime = 10; // 平均 I/O 时间
  const maxConcurrency = 200;
  const theoreticalTime = (task2.totalJobs / maxConcurrency) * avgIOTime;

  metrics({
    总任务: formatNumber(task2.totalJobs),
    执行耗时: formatDuration(execDuration2),
    吞吐量: `${formatNumber(Math.round(task2.totalJobs / (execDuration2 / 1000)))} jobs/s`,
    理论最优: formatDuration(theoreticalTime),
    效率: `${Math.round((theoreticalTime / execDuration2) * 100)}%`,
  });

  // ========================================
  // 性能对比
  // ========================================
  section('📊 性能对比');

  const totalJobs = task1.totalJobs + task2.totalJobs;
  const totalDuration = execDuration1 + execDuration2;

  metrics({
    '总处理量': formatNumber(totalJobs),
    '总耗时': formatDuration(totalDuration),
    '平均吞吐': `${formatNumber(Math.round(totalJobs / (totalDuration / 1000)))} jobs/s`,
  });

  console.log();
  console.log('  ┌─────────────────┬───────────┬────────────┬──────────────┐');
  console.log('  │ 场景            │ 任务数    │ 耗时       │ 吞吐量       │');
  console.log('  ├─────────────────┼───────────┼────────────┼──────────────┤');
  console.log(`  │ CPU 密集型      │ ${formatNumber(task1.totalJobs).padStart(8)}  │ ${formatDuration(execDuration1).padStart(9)}  │ ${formatNumber(Math.round(task1.totalJobs / (execDuration1 / 1000))).padStart(8)} /s  │`);
  console.log(`  │ I/O 密集型      │ ${formatNumber(task2.totalJobs).padStart(8)}  │ ${formatDuration(execDuration2).padStart(9)}  │ ${formatNumber(Math.round(task2.totalJobs / (execDuration2 / 1000))).padStart(8)} /s  │`);
  console.log('  └─────────────────┴───────────┴────────────┴──────────────┘');

  section('优化建议');
  info('根据任务类型选择合适的并发配置:');
  info('');
  info('  CPU 密集型任务:');
  info('    - 并发数 ≈ CPU 核心数');
  info('    - 避免过高并发导致上下文切换');
  info('');
  info('  I/O 密集型任务:');
  info('    - 并发数可以更高 (50-200)');
  info('    - 受限于网络/磁盘带宽');
  info('    - 注意下游服务的承受能力');
  info('');
  info('  混合型任务:');
  info('    - 使用 AIMD 自动调节');
  info('    - 监控系统资源使用');

  // 清理
  await task1.destroy();
  await task2.destroy();
  await hub.close();

  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
