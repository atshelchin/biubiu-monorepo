#!/usr/bin/env bun
/**
 * Basic Example - 基础用法演示
 *
 * 演示：
 * - 创建 TaskSource 子类
 * - 创建任务并执行
 * - 监听进度和事件
 * - 获取执行结果
 *
 * 运行: bun examples/basic.ts
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import { header, section, success, info, metrics, progress, formatDuration, jobStatus } from './utils.js';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-basic.db');

// 定义一个简单的数据处理任务
class DataProcessor extends TaskSource<{ id: number; data: string }, { id: number; result: string }> {
  readonly type = 'deterministic' as const;
  private items: { id: number; data: string }[];

  constructor(items: { id: number; data: string }[]) {
    super();
    this.items = items;
  }

  getData() {
    return this.items;
  }

  async handler(input: { id: number; data: string }, ctx: JobContext) {
    // 模拟处理时间
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    // 处理数据
    return {
      id: input.id,
      result: input.data.toUpperCase(),
    };
  }
}

async function main() {
  header('🚀 TaskHub - Basic Example');

  section('1. 创建 TaskHub');
  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });
  info('TaskHub 已创建，使用 SQLite 存储');

  section('2. 准备数据');
  const data = [
    { id: 1, data: 'hello' },
    { id: 2, data: 'world' },
    { id: 3, data: 'taskhub' },
    { id: 4, data: 'demo' },
    { id: 5, data: 'example' },
  ];
  info(`准备了 ${data.length} 条数据待处理`);

  section('3. 创建任务');
  const source = new DataProcessor(data);
  const task = await hub.createTask({
    name: 'data-processor',
    source,
    concurrency: { min: 1, max: 5, initial: 2 },
  });

  metrics({
    任务ID: task.id.slice(0, 8) + '...',
    任务名: task.name,
    总任务数: task.totalJobs,
    'Merkle Root': task.merkleRoot?.slice(0, 16) + '...',
  });

  section('4. 监听事件');
  info('注册事件监听器...');

  task.on('job:start', (job) => {
    jobStatus('start', `Job ${job.input.id}`, job.input.data);
  });

  task.on('job:complete', (job) => {
    jobStatus('complete', `Job ${job.input.id}`, `→ ${job.output?.result}`);
  });

  task.on('progress', (p) => {
    progress(p.completed, p.total, `并发: ${p.concurrency}`);
  });

  section('5. 执行任务');
  const startTime = Date.now();
  await task.start();
  const duration = Date.now() - startTime;

  success('任务执行完成！');

  section('6. 获取结果');
  const results = await task.getResults({ status: 'completed' });

  info('处理结果:');
  for (const result of results) {
    metrics({
      ID: result.input.id,
      输入: result.input.data,
      输出: result.output?.result ?? 'N/A',
    });
  }

  section('📊 执行统计');
  metrics({
    总任务数: task.totalJobs,
    成功: task.completedJobs,
    失败: task.failedJobs,
    总耗时: formatDuration(duration),
    平均耗时: formatDuration(Math.round(duration / task.totalJobs)),
  });

  // 清理
  await task.destroy();
  await hub.close();

  // 删除测试数据库
  const { unlink } = await import('fs/promises');
  try {
    await unlink('example-basic.db');
    await unlink('example-basic.db-wal');
    await unlink('example-basic.db-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
