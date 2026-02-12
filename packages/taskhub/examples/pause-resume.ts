#!/usr/bin/env bun
/**
 * Pause & Resume Example - 任务生命周期控制演示
 *
 * 演示：
 * - 暂停 (pause) 正在执行的任务
 * - 恢复 (resume) 暂停的任务
 * - 停止 (stop) 任务并重置活跃作业
 * - 销毁 (destroy) 任务及其所有数据
 *
 * 运行: bun examples/pause-resume.ts
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import {
  header,
  section,
  success,
  info,
  warn,
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
const DB_PATH = join(DB_DIR, 'example-lifecycle.db');

// 慢速处理任务 (便于观察状态变化)
class SlowProcessor extends TaskSource<number, number> {
  readonly type = 'deterministic' as const;
  private data: number[];
  public processedCount = 0;

  constructor(count: number) {
    super();
    this.data = Array.from({ length: count }, (_, i) => i + 1);
  }

  getData() {
    return this.data;
  }

  async handler(input: number, ctx: JobContext): Promise<number> {
    // 检查是否被中止
    if (ctx.signal.aborted) {
      throw new Error('Job aborted');
    }

    // 模拟耗时处理
    await sleep(200);
    this.processedCount++;

    return input * 2;
  }
}

async function main() {
  header('⏯️ TaskHub - Pause & Resume Example');

  section('任务生命周期');
  info('任务状态流转:');
  info('');
  info('  idle → running → completed');
  info('           ↓  ↑');
  info('         paused');
  info('');
  info('API:');
  info('  - start()   : 开始执行');
  info('  - pause()   : 暂停 (活跃作业会完成)');
  info('  - resume()  : 恢复执行');
  info('  - stop()    : 停止 (活跃作业被取消)');
  info('  - destroy() : 销毁任务和数据');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // ========================================
  // 场景 1: 暂停和恢复
  // ========================================
  section('场景 1: 暂停和恢复');
  info('创建 20 个任务，执行过程中暂停再恢复');
  console.log();

  const source1 = new SlowProcessor(20);
  const task1 = await hub.createTask({
    name: 'pause-resume-demo',
    source: source1,
    concurrency: { min: 1, max: 3, initial: 2 },
  });

  taskStatus(task1.name, 'pending', `${task1.totalJobs} 个作业`);

  // 启动任务 (不等待完成)
  const startPromise1 = task1.start();
  taskStatus(task1.name, 'running', '开始执行...');

  // 等待一些作业完成
  await sleep(800);

  let progressInfo1 = await task1.getProgress();
  info(`已完成 ${progressInfo1.completed}/${progressInfo1.total}`);

  // 暂停
  info('');
  warn('>>> 暂停任务 <<<');
  task1.pause();
  taskStatus(task1.name, 'paused');

  await sleep(500);
  progressInfo1 = await task1.getProgress();
  metrics({
    状态: task1.status,
    已完成: progressInfo1.completed,
    待处理: progressInfo1.pending,
    活跃: progressInfo1.active,
  });

  info('');
  info('任务已暂停，活跃作业完成后停止调度新作业');
  await sleep(1000);

  // 恢复
  info('');
  success('>>> 恢复任务 <<<');
  await task1.resume();
  taskStatus(task1.name, 'running', '继续执行...');

  // 等待完成
  await startPromise1;

  taskStatus(task1.name, 'completed');
  metrics({
    总任务: task1.totalJobs,
    成功: task1.completedJobs,
    失败: task1.failedJobs,
  });

  // ========================================
  // 场景 2: 停止任务
  // ========================================
  section('场景 2: 停止任务');
  info('创建任务，执行过程中停止，然后重新开始');
  console.log();

  const source2 = new SlowProcessor(15);
  const task2 = await hub.createTask({
    name: 'stop-restart-demo',
    source: source2,
    concurrency: { min: 1, max: 3, initial: 2 },
  });

  taskStatus(task2.name, 'pending');

  // 启动
  const startPromise2 = task2.start();
  taskStatus(task2.name, 'running');

  await sleep(600);
  let progressInfo2 = await task2.getProgress();
  info(`进度: ${progressInfo2.completed}/${progressInfo2.total}`);

  // 停止
  warn('>>> 停止任务 <<<');
  await task2.stop();
  taskStatus(task2.name, 'paused', 'stop() 将状态设为 paused');

  progressInfo2 = await task2.getProgress();
  metrics({
    状态: task2.status,
    已完成: progressInfo2.completed,
    待处理: progressInfo2.pending,
    活跃: progressInfo2.active,
  });

  info('');
  info('stop() 与 pause() 的区别:');
  info('  - pause(): 等待活跃作业完成');
  info('  - stop(): 取消活跃作业，重置为 pending');

  await sleep(500);

  // 重新开始
  success('>>> 重新开始 <<<');
  await task2.resume();

  task2.on('progress', (p) => {
    progress(p.completed, p.total);
  });

  await task2.start();
  taskStatus(task2.name, 'completed');

  // ========================================
  // 场景 3: 销毁任务
  // ========================================
  section('场景 3: 销毁任务');
  info('创建任务后销毁，清理所有数据');
  console.log();

  const source3 = new SlowProcessor(10);
  const task3 = await hub.createTask({
    name: 'destroy-demo',
    source: source3,
  });

  const task3Id = task3.id;
  taskStatus(task3.name, 'pending', `ID: ${task3Id.slice(0, 8)}...`);

  // 验证任务存在
  const beforeDestroy = await hub.getTask(task3Id);
  info(`销毁前查找: ${beforeDestroy ? '存在' : '不存在'}`);

  // 销毁
  warn('>>> 销毁任务 <<<');
  await task3.destroy();

  // 验证任务已删除
  const afterDestroy = await hub.getTask(task3Id);
  info(`销毁后查找: ${afterDestroy ? '存在' : '不存在'}`);

  if (!afterDestroy) {
    success('任务及其数据已被完全清理');
  }

  section('📊 生命周期方法对比');

  console.log('  ┌─────────────┬─────────────────────────────────────┐');
  console.log('  │ 方法        │ 行为                                │');
  console.log('  ├─────────────┼─────────────────────────────────────┤');
  console.log('  │ pause()     │ 暂停调度，等待活跃作业完成          │');
  console.log('  │ resume()    │ 恢复调度，继续处理待处理作业        │');
  console.log('  │ stop()      │ 取消活跃作业，重置为 pending        │');
  console.log('  │ destroy()   │ 停止任务，删除所有数据              │');
  console.log('  └─────────────┴─────────────────────────────────────┘');

  section('使用建议');
  info('1. 临时中断用 pause() / resume()');
  info('   - 用户手动暂停');
  info('   - 系统负载过高时降级');
  info('');
  info('2. 紧急停止用 stop()');
  info('   - 检测到严重错误');
  info('   - 需要修改配置后重试');
  info('');
  info('3. 完全清理用 destroy()');
  info('   - 任务已完成，清理资源');
  info('   - 任务失败，放弃重试');

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
