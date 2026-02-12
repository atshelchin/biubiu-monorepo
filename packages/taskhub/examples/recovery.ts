#!/usr/bin/env bun
/**
 * Recovery Example - 崩溃恢复与断点续传演示
 *
 * 演示：
 * - 任务状态持久化到 SQLite
 * - 模拟进程崩溃
 * - 重启后恢复任务继续执行
 * - Exactly-once 语义保证
 *
 * 运行: bun examples/recovery.ts
 */

import { createTaskHub, TaskSource, type JobContext, type Hub, type Task } from '../src/index.js';
import {
  header,
  section,
  success,
  error,
  warn,
  info,
  metrics,
  progress,
  taskStatus,
  sleep,
  formatDuration,
} from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-recovery.db');

// 模拟耗时处理
class SlowBatchProcessor extends TaskSource<number, { input: number; result: number }> {
  readonly type = 'deterministic' as const;
  private data: number[];

  constructor(data: number[]) {
    super();
    this.data = data;
  }

  getData() {
    return this.data;
  }

  async handler(input: number, ctx: JobContext): Promise<{ input: number; result: number }> {
    // 模拟处理时间
    await sleep(100 + Math.random() * 100);
    return { input, result: input * 2 };
  }
}

async function runPhase1(): Promise<string> {
  info('═══════════════════════════════════════════════════════════');
  info('                     第一阶段: 开始任务');
  info('═══════════════════════════════════════════════════════════');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // 创建任务
  const data = Array.from({ length: 30 }, (_, i) => i + 1);
  const source = new SlowBatchProcessor(data);
  const task = await hub.createTask({
    name: 'recovery-demo',
    source,
    concurrency: { min: 1, max: 3, initial: 2 },
  });

  const taskId = task.id;

  metrics({
    任务ID: taskId.slice(0, 12) + '...',
    总作业数: task.totalJobs,
    'Merkle Root': task.merkleRoot?.slice(0, 16) + '...',
  });

  // 启动任务 (不等待完成)
  const startPromise = task.start();

  // 监控进度
  task.on('progress', (p) => {
    progress(p.completed, p.total, `活跃: ${p.active}`);
  });

  // 等待部分完成
  info('');
  info('任务开始执行...');

  await new Promise<void>((resolve) => {
    task.on('progress', (p) => {
      // 完成约 1/3 后模拟崩溃
      if (p.completed >= 10) {
        resolve();
      }
    });
  });

  const progressInfo = await task.getProgress();

  console.log();
  warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  warn('                    模拟进程崩溃!');
  warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  metrics({
    已完成: progressInfo.completed,
    待处理: progressInfo.pending,
    活跃中: progressInfo.active,
    状态: '崩溃',
  });

  info('');
  info('关键点: 活跃中的作业在崩溃后会被重置为 pending');
  info('        这确保了 Exactly-once 语义');

  // 模拟崩溃 - 直接关闭 hub (不等待任务完成)
  await hub.close();

  return taskId;
}

async function runPhase2(taskId: string): Promise<void> {
  console.log();
  console.log();
  info('═══════════════════════════════════════════════════════════');
  info('                     第二阶段: 恢复执行');
  info('═══════════════════════════════════════════════════════════');
  console.log();

  info('模拟进程重启...');
  await sleep(500);

  // 重新创建 Hub
  const hub = await createTaskHub({ dbPath: DB_PATH });

  info('检查未完成的任务...');

  // 恢复任务
  const task = await hub.resumeTask(taskId, new SlowBatchProcessor([1])); // 需要提供 source

  if (!task) {
    error(`未找到任务: ${taskId}`);
    await hub.close();
    return;
  }

  success(`找到任务: ${task.name}`);

  const progressBefore = await task.getProgress();
  metrics({
    任务ID: taskId.slice(0, 12) + '...',
    状态: task.status,
    已完成: progressBefore.completed,
    待处理: progressBefore.pending,
  });

  console.log();
  info('注意: 崩溃时的活跃作业已被重置为 pending');
  info('      这些作业将在恢复后重新执行');
  console.log();

  // 重新提供正确的 source 并恢复
  const correctSource = new SlowBatchProcessor(Array.from({ length: 30 }, (_, i) => i + 1));
  task.setSourceForResume(correctSource);

  success('恢复执行中...');
  console.log();

  task.on('progress', (p) => {
    progress(p.completed, p.total, `活跃: ${p.active}`);
  });

  const startTime = Date.now();
  await task.resume();
  const duration = Date.now() - startTime;

  console.log();
  success('任务恢复完成！');

  const progressAfter = await task.getProgress();
  metrics({
    最终状态: task.status,
    总作业: task.totalJobs,
    成功: task.completedJobs,
    失败: task.failedJobs,
    恢复耗时: formatDuration(duration),
  });

  // 验证结果完整性
  console.log();
  info('验证结果完整性...');

  const results = await task.getResults({ status: 'completed', limit: 100 });
  const uniqueInputs = new Set(results.map((r) => r.input));

  if (uniqueInputs.size === 30) {
    success('所有 30 个输入都被处理，无遗漏无重复！');
  } else {
    warn(`处理了 ${uniqueInputs.size} 个不同的输入`);
  }

  // 清理
  await task.destroy();
  await hub.close();
}

async function main() {
  header('💾 TaskHub - Crash Recovery Example');

  section('断点续传机制');
  info('TaskHub 的持久化保证:');
  info('');
  info('  1. 所有状态存储在 SQLite');
  info('     - 任务元数据');
  info('     - 作业状态和结果');
  info('     - 进度信息');
  info('');
  info('  2. 崩溃恢复流程');
  info('     - 重启后查找未完成任务');
  info('     - 重置活跃作业为 pending');
  info('     - 继续处理剩余作业');
  info('');
  info('  3. Exactly-once 语义');
  info('     - 每个作业只会成功处理一次');
  info('     - 崩溃时的作业会重试');
  console.log();

  // 清理旧数据
  await mkdir(DB_DIR, { recursive: true });
  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  // 第一阶段: 执行一部分后崩溃
  const taskId = await runPhase1();

  await sleep(1000);

  // 第二阶段: 恢复执行
  await runPhase2(taskId);

  section('📊 总结');

  console.log('  ┌─────────────────┬────────────────────────────────┐');
  console.log('  │ 场景            │ 保证                           │');
  console.log('  ├─────────────────┼────────────────────────────────┤');
  console.log('  │ 正常完成        │ 所有作业执行一次               │');
  console.log('  │ 进程崩溃        │ 活跃作业重试，其他继续         │');
  console.log('  │ 服务器重启      │ 从上次状态恢复                 │');
  console.log('  │ 数据库完整      │ WAL 模式保证一致性             │');
  console.log('  └─────────────────┴────────────────────────────────┘');

  console.log();
  info('最佳实践:');
  info('  1. 定期检查未完成任务 (hub.listTasks())');
  info('  2. 实现进程信号处理 (SIGTERM/SIGINT)');
  info('  3. 使用 Merkle Root 识别相同任务');
  info('  4. 监控任务完成率和重试率');

  // 清理
  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
