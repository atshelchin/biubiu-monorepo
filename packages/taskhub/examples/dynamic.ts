#!/usr/bin/env bun
/**
 * Dynamic Example - 动态/流式任务演示
 *
 * 演示：
 * - 动态任务 (dynamic) 的特点
 * - 使用 AsyncIterable 流式产生数据
 * - 适合未知数量或持续产生的数据
 * - 内存高效处理大数据集
 *
 * 运行: bun examples/dynamic.ts
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import { header, section, success, info, warn, metrics, progress, sleep, formatNumber } from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-dynamic.db');

// 模拟分页 API 响应
interface PageData {
  page: number;
  items: string[];
}

// 动态数据源 - 模拟分页 API
class PaginatedAPISource extends TaskSource<{ page: number; item: string }, { processed: string }> {
  readonly type = 'dynamic' as const;
  readonly id = 'paginated-api'; // 动态任务需要唯一 ID

  private totalPages: number;
  private itemsPerPage: number;

  constructor(totalPages: number, itemsPerPage: number) {
    super();
    this.totalPages = totalPages;
    this.itemsPerPage = itemsPerPage;
  }

  // 使用 AsyncIterable 流式产生数据
  async *getData(): AsyncIterable<{ page: number; item: string }> {
    for (let page = 1; page <= this.totalPages; page++) {
      // 模拟 API 请求延迟
      await sleep(50);

      // 模拟获取一页数据
      const items = Array.from({ length: this.itemsPerPage }, (_, i) => `item-${page}-${i + 1}`);

      // 逐个 yield 数据项
      for (const item of items) {
        yield { page, item };
      }

      info(`  获取第 ${page}/${this.totalPages} 页数据...`);
    }
  }

  async handler(input: { page: number; item: string }, ctx: JobContext): Promise<{ processed: string }> {
    await sleep(20 + Math.random() * 30);
    return { processed: input.item.toUpperCase() };
  }
}

// 另一个动态源 - 模拟文件行读取
class FileLineSource extends TaskSource<{ lineNum: number; content: string }, { wordCount: number }> {
  readonly type = 'dynamic' as const;
  readonly id = 'file-lines';

  private lines: string[];

  constructor(lines: string[]) {
    super();
    this.lines = lines;
  }

  async *getData(): AsyncIterable<{ lineNum: number; content: string }> {
    for (let i = 0; i < this.lines.length; i++) {
      // 模拟读取延迟
      if (i % 100 === 0) {
        await sleep(10);
      }
      yield { lineNum: i + 1, content: this.lines[i] };
    }
  }

  async handler(input: { lineNum: number; content: string }): Promise<{ wordCount: number }> {
    return { wordCount: input.content.split(/\s+/).length };
  }
}

async function main() {
  header('🌊 TaskHub - Dynamic Task Example');

  section('动态任务 vs 确定性任务');
  info('确定性任务 (deterministic):');
  info('  - getData() 返回数组');
  info('  - 预先知道所有数据');
  info('  - 有 Merkle Root 指纹');
  info('');
  info('动态任务 (dynamic):');
  info('  - getData() 返回 AsyncIterable');
  info('  - 流式产生数据');
  info('  - 无 Merkle Root');
  info('  - 需要提供唯一 id');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // ========================================
  // 场景 1: 分页 API
  // ========================================
  section('场景 1: 分页 API 数据采集');
  info('模拟从分页 API 获取数据:');
  info('  - 总共 5 页');
  info('  - 每页 10 条数据');
  info('  - 边获取边处理');
  console.log();

  const apiSource = new PaginatedAPISource(5, 10);
  const apiTask = await hub.createTask({
    name: 'api-collector',
    source: apiSource,
    concurrency: { min: 1, max: 5, initial: 3 },
  });

  info('开始获取和处理数据...');
  console.log();

  const startTime1 = Date.now();

  apiTask.on('progress', (p) => {
    if (p.completed % 10 === 0 || p.completed === p.total) {
      progress(p.completed, p.total, `并发: ${p.concurrency}`);
    }
  });

  await apiTask.start();
  const duration1 = Date.now() - startTime1;

  console.log();
  success('API 数据采集完成！');
  metrics({
    总数据量: apiTask.totalJobs,
    成功: apiTask.completedJobs,
    失败: apiTask.failedJobs,
    耗时: `${(duration1 / 1000).toFixed(2)}s`,
    'Merkle Root': apiTask.merkleRoot ?? '无 (动态任务)',
  });

  // ========================================
  // 场景 2: 大文件处理
  // ========================================
  section('场景 2: 大文件流式处理');
  info('模拟处理大文件:');
  info('  - 1000 行数据');
  info('  - 流式读取，边读边处理');
  info('  - 内存占用恒定');
  console.log();

  // 生成模拟的大文件内容
  const lines = Array.from({ length: 1000 }, (_, i) =>
    `Line ${i + 1}: ${Array.from({ length: 5 + Math.floor(Math.random() * 10) }, () => 'word').join(' ')}`
  );

  const fileSource = new FileLineSource(lines);
  const fileTask = await hub.createTask({
    name: 'file-processor',
    source: fileSource,
    concurrency: { min: 1, max: 10, initial: 5 },
  });

  const startTime2 = Date.now();
  let lastLog = 0;

  fileTask.on('progress', (p) => {
    if (p.completed - lastLog >= 100 || p.completed === p.total) {
      progress(p.completed, p.total);
      lastLog = p.completed;
    }
  });

  await fileTask.start();
  const duration2 = Date.now() - startTime2;

  success('文件处理完成！');

  // 统计结果
  const results = await fileTask.getResults({ status: 'completed', limit: 1000 });
  const totalWords = results.reduce((sum, r) => sum + (r.output?.wordCount ?? 0), 0);

  metrics({
    总行数: fileTask.totalJobs,
    总词数: formatNumber(totalWords),
    平均词数: (totalWords / fileTask.totalJobs).toFixed(1),
    耗时: `${(duration2 / 1000).toFixed(2)}s`,
  });

  // ========================================
  // 内存效率说明
  // ========================================
  section('内存效率');
  info('动态任务的内存优势:');
  info('');
  info('  确定性任务 (deterministic):');
  info('    - 所有数据预先加载到内存');
  info('    - 内存占用 = O(数据量)');
  info('');
  info('  动态任务 (dynamic):');
  info('    - 数据按需产生');
  info('    - 内存占用 = O(并发数)');
  info('');
  info('适用场景:');
  info('  - 分页 API 数据采集');
  info('  - 大文件逐行处理');
  info('  - 数据库游标遍历');
  info('  - 消息队列消费');
  info('  - 任何数据量未知或超大的场景');

  section('📊 总结');
  metrics({
    '场景1 (API)': `${apiTask.totalJobs} 条`,
    '场景2 (文件)': `${fileTask.totalJobs} 行`,
    '总处理': `${apiTask.totalJobs + fileTask.totalJobs} 项`,
    '总耗时': `${((duration1 + duration2) / 1000).toFixed(2)}s`,
  });

  // 清理
  await apiTask.destroy();
  await fileTask.destroy();
  await hub.close();

  try {
    await unlink(DB_PATH);
    await unlink(DB_PATH + '-wal');
    await unlink(DB_PATH + '-shm');
  } catch {}

  console.log();
}

main().catch(console.error);
