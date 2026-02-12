#!/usr/bin/env bun
/**
 * Deterministic Example - 确定性任务与 Merkle Root 演示
 *
 * 演示：
 * - 确定性任务 (deterministic) 的特点
 * - Merkle Root 用于任务指纹
 * - 相同数据产生相同 Merkle Root
 * - 可用于任务去重和验证
 *
 * 运行: bun examples/deterministic.ts
 */

import { createTaskHub, TaskSource, computeMerkleRoot } from '../src/index.js';
import { header, section, success, info, warn, metrics, sleep } from './utils.js';
import { mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'example-deterministic.db');

// 文件处理任务
class FileProcessor extends TaskSource<{ path: string; size: number }, { hash: string }> {
  readonly type = 'deterministic' as const;
  private files: { path: string; size: number }[];

  constructor(files: { path: string; size: number }[]) {
    super();
    this.files = files;
  }

  getData() {
    return this.files;
  }

  // 自定义 Job ID 生成 (可选，默认使用输入数据的 hash)
  getJobId(input: { path: string; size: number }): string {
    // 使用文件路径作为唯一标识
    return input.path;
  }

  async handler(input: { path: string; size: number }): Promise<{ hash: string }> {
    await sleep(30);
    // 模拟计算文件 hash
    const hash = `sha256:${Buffer.from(input.path + input.size).toString('base64').slice(0, 16)}`;
    return { hash };
  }
}

async function main() {
  header('🔐 TaskHub - Deterministic Task Example');

  section('Merkle Root 概念');
  info('Merkle Root 是任务的"指纹"，由所有输入数据计算得出');
  info('');
  info('特点:');
  info('  - 相同的输入数据 → 相同的 Merkle Root');
  info('  - 任何数据改变 → Merkle Root 改变');
  info('  - 可用于: 任务去重、数据完整性验证、分布式协调');
  console.log();

  await mkdir(DB_DIR, { recursive: true });
  const hub = await createTaskHub({ dbPath: DB_PATH });

  // 第一组文件
  const files1 = [
    { path: '/data/file1.txt', size: 1024 },
    { path: '/data/file2.txt', size: 2048 },
    { path: '/data/file3.txt', size: 4096 },
  ];

  // 第二组文件 (与第一组相同)
  const files2 = [
    { path: '/data/file1.txt', size: 1024 },
    { path: '/data/file2.txt', size: 2048 },
    { path: '/data/file3.txt', size: 4096 },
  ];

  // 第三组文件 (多一个文件)
  const files3 = [
    { path: '/data/file1.txt', size: 1024 },
    { path: '/data/file2.txt', size: 2048 },
    { path: '/data/file3.txt', size: 4096 },
    { path: '/data/file4.txt', size: 8192 },
  ];

  section('1. 创建第一个任务');
  const task1 = await hub.createTask({
    name: 'task-1',
    source: new FileProcessor(files1),
  });
  metrics({
    任务名: task1.name,
    文件数: task1.totalJobs,
    'Merkle Root': task1.merkleRoot ?? 'N/A',
  });

  section('2. 创建第二个任务 (相同数据)');
  const task2 = await hub.createTask({
    name: 'task-2',
    source: new FileProcessor(files2),
  });
  metrics({
    任务名: task2.name,
    文件数: task2.totalJobs,
    'Merkle Root': task2.merkleRoot ?? 'N/A',
  });

  section('3. 比较 Merkle Root');
  if (task1.merkleRoot === task2.merkleRoot) {
    success('Merkle Root 相同！相同数据产生相同指纹');
  } else {
    warn('Merkle Root 不同 (不应该发生)');
  }

  section('4. 创建第三个任务 (多一个文件)');
  const task3 = await hub.createTask({
    name: 'task-3',
    source: new FileProcessor(files3),
  });
  metrics({
    任务名: task3.name,
    文件数: task3.totalJobs,
    'Merkle Root': task3.merkleRoot ?? 'N/A',
  });

  section('5. 比较不同数据的 Merkle Root');
  if (task1.merkleRoot !== task3.merkleRoot) {
    success('Merkle Root 不同！数据变化导致指纹变化');
  } else {
    warn('Merkle Root 相同 (不应该发生)');
  }

  section('6. 手动计算 Merkle Root');
  info('可以在创建任务前预先计算 Merkle Root:');
  console.log();

  // 手动计算 - 注意要使用与 TaskSource.getJobId 相同的逻辑
  // FileProcessor 使用 input.path 作为 Job ID，所以这里也要用 path
  const source = new FileProcessor(files1);
  const jobIds = files1.map((f) => source.getJobId!(f));
  const manualMerkleRoot = await computeMerkleRoot(jobIds);

  metrics({
    '手动计算': manualMerkleRoot,
    '任务记录': task1.merkleRoot ?? 'N/A',
    '是否匹配': manualMerkleRoot === task1.merkleRoot ? '是 ✓' : '否 ✗',
  });

  section('应用场景');
  info('1. 任务去重');
  info('   - 检查 Merkle Root 是否已存在');
  info('   - 避免重复处理相同数据');
  info('');
  info('2. 数据完整性验证');
  info('   - 确保分布式系统中数据一致');
  info('   - 检测数据篡改或损坏');
  info('');
  info('3. 断点续传');
  info('   - 通过 Merkle Root 找到之前的任务');
  info('   - 继续未完成的处理');

  section('7. 演示任务去重');
  info('尝试查找已有相同 Merkle Root 的任务...');

  // 模拟查找
  const existingTasks = await hub.listTasks();
  const duplicates = existingTasks.filter((t) => t.merkleRoot === task1.merkleRoot);

  if (duplicates.length > 1) {
    warn(`发现 ${duplicates.length} 个相同数据的任务:`);
    for (const t of duplicates) {
      metrics({ 任务ID: t.id.slice(0, 8) + '...', 名称: t.name });
    }
    info('在生产环境中，可以直接复用已有任务的结果');
  }

  section('📊 总结');
  metrics({
    '任务1 Root': task1.merkleRoot?.slice(0, 20) + '...',
    '任务2 Root': task2.merkleRoot?.slice(0, 20) + '...',
    '任务3 Root': task3.merkleRoot?.slice(0, 20) + '...',
  });
  console.log();
  info('确定性任务的 Merkle Root 仅由输入数据决定');
  info('任务名称、创建时间等不影响 Merkle Root');

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
