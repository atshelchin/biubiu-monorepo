#!/usr/bin/env bun
/**
 * 目录扫描工具
 *
 * 功能：
 * - 递归扫描指定目录
 * - 获取所有文件的元信息
 * - 使用 TaskHub 并发处理
 * - 流式输出避免 OOM
 *
 * 用法：
 *   bun examples/dir-scan.ts <目录路径>
 *   bun examples/dir-scan.ts <目录路径> --fast    # 快速模式（跳过 stat）
 *
 * 快速模式：跳过 stat() 调用，不获取文件大小，速度提升 10x+
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import { readdir, stat, mkdir } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { existsSync, createWriteStream, type WriteStream } from 'fs';
import { c, header, section, success, error, info, progressBar, formatSize, formatDate } from './utils.js';


// ============================================================================
// 类型定义
// ============================================================================

export interface FileInfo {
  path: string;
  name: string;
  ext: string;
  size: number;       // 逻辑大小（快速模式为 0）
  diskSize: number;   // 实际磁盘占用（快速模式为 0）
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  mtime: number;      // 修改时间戳（快速模式为 0）
}

interface ScanJob {
  path: string;
  depth: number;
}

interface ScanConfig {
  fastMode: boolean;
  outputStream: WriteStream | null;
}

// 全局配置
let scanConfig: ScanConfig = {
  fastMode: false,
  outputStream: null,
};

// 全局统计（只保留聚合数据，不存文件列表）
const globalStats = {
  files: 0,
  dirs: 0,
  totalSize: 0,
  extStats: new Map<string, { count: number; size: number }>(),
  largestFiles: [] as FileInfo[],
  recentFiles: [] as FileInfo[],
};

// ============================================================================
// 文件扫描 TaskSource
// ============================================================================

class DirectoryScanSource extends TaskSource<ScanJob, number> {
  readonly type = 'dynamic' as const;
  readonly id = 'dir-scan';

  private rootPath: string;
  private maxDepth: number;
  private excludePatterns: RegExp[];
  private discoveredCount = 0;
  private onDiscovery?: (discovered: number, currentPath: string) => void;

  constructor(
    rootPath: string,
    options: {
      maxDepth?: number;
      exclude?: string[];
      onDiscovery?: (discovered: number, currentPath: string) => void;
    } = {}
  ) {
    super();
    this.rootPath = rootPath;
    this.maxDepth = options.maxDepth ?? 100;
    this.onDiscovery = options.onDiscovery;
    // 更全面的排除规则
    this.excludePatterns = (options.exclude ?? [
      'node_modules',
      '\\.git$',
      '\\.next$',
      '\\.cache',
      '__pycache__',
      '\\.Trash',
      'Library/Caches',
      'Library/Application Support/.*Cache',
      '\\.npm',
      '\\.pnpm',
      '\\.yarn',
      'venv',
      '\\.venv',
      'Pods',
      '\\.gradle',
      'build$',
      'dist$',
      '\\.DS_Store',
    ]).map((p) => new RegExp(p));
  }

  async *getData(): AsyncIterable<ScanJob> {
    yield* this.walkDirectory(this.rootPath, 0);
  }

  private async *walkDirectory(dirPath: string, depth: number): AsyncIterable<ScanJob> {
    if (depth > this.maxDepth) return;

    const dirName = basename(dirPath);
    if (this.excludePatterns.some((p) => p.test(dirName))) {
      return;
    }

    this.discoveredCount++;
    if (this.onDiscovery) {
      this.onDiscovery(this.discoveredCount, dirPath);
    }

    yield { path: dirPath, depth };

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !this.excludePatterns.some((p) => p.test(entry.name))) {
          const subPath = join(dirPath, entry.name);
          yield* this.walkDirectory(subPath, depth + 1);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  /**
   * 处理单个目录
   * 返回该目录中的文件数量
   */
  async handler(input: ScanJob, ctx: JobContext): Promise<number> {
    let fileCount = 0;

    try {
      const entries = await readdir(input.path, { withFileTypes: true });

      if (scanConfig.fastMode) {
        // 快速模式：不调用 stat，直接使用 dirent 信息
        for (const entry of entries) {
          if (this.excludePatterns.some((p) => p.test(entry.name))) continue;

          const file: FileInfo = {
            path: join(input.path, entry.name),
            name: entry.name,
            ext: extname(entry.name).toLowerCase(),
            size: 0,
            diskSize: 0,
            isFile: entry.isFile(),
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
            mtime: 0,
          };

          this.processFile(file);
          fileCount++;
        }
      } else {
        // 完整模式：批量 stat 获取详细信息
        const statPromises = entries
          .filter((entry) => !this.excludePatterns.some((p) => p.test(entry.name)))
          .map(async (entry) => {
            const fullPath = join(input.path, entry.name);
            try {
              const stats = await stat(fullPath);
              return {
                path: fullPath,
                name: entry.name,
                ext: extname(entry.name).toLowerCase(),
                size: stats.size,
                diskSize: stats.blocks * 512,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                isSymlink: entry.isSymbolicLink(),
                mtime: stats.mtimeMs,
              } as FileInfo;
            } catch {
              return null;
            }
          });

        const results = await Promise.all(statPromises);

        for (const file of results) {
          if (file) {
            this.processFile(file);
            fileCount++;
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }

    return fileCount;
  }

  private processFile(file: FileInfo) {
    // 流式写入
    if (scanConfig.outputStream) {
      scanConfig.outputStream.write(JSON.stringify(file) + '\n');
    }

    // 更新全局统计
    if (file.isFile) {
      globalStats.files++;
      globalStats.totalSize += file.diskSize;

      // 扩展名统计
      const ext = file.ext || '(无扩展名)';
      const extStat = globalStats.extStats.get(ext) || { count: 0, size: 0 };
      extStat.count++;
      extStat.size += file.diskSize;
      globalStats.extStats.set(ext, extStat);

      // Top 10 最大文件
      if (!scanConfig.fastMode) {
        this.updateTopList(globalStats.largestFiles, file, 10, (a, b) => b.diskSize - a.diskSize);
        this.updateTopList(globalStats.recentFiles, file, 10, (a, b) => b.mtime - a.mtime);
      }
    } else if (file.isDirectory) {
      globalStats.dirs++;
    }
  }

  private updateTopList(
    list: FileInfo[],
    item: FileInfo,
    maxSize: number,
    compareFn: (a: FileInfo, b: FileInfo) => number
  ) {
    if (list.length >= maxSize && compareFn(item, list[list.length - 1]) >= 0) {
      return;
    }
    list.push(item);
    list.sort(compareFn);
    if (list.length > maxSize) {
      list.pop();
    }
  }
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  header('📂 目录扫描工具');

  // 解析参数
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const targetDir = args[0];
  const fastMode = process.argv.includes('--fast');
  const outputFile = `./examples/results/dir-scan.${fastMode ? 'fast.' : ''}jsonl`;

  if (!targetDir) {
    error('请指定要扫描的目录');
    console.log();
    console.log(`  用法: ${c.cyan}bun examples/dir-scan.ts <目录路径> [--fast]${c.reset}`);
    console.log();
    console.log(`  选项:`);
    console.log(`    ${c.yellow}--fast${c.reset}  快速模式，跳过 stat()，不获取文件大小`);
    console.log();
    console.log(`  示例:`);
    console.log(`    ${c.dim}bun examples/dir-scan.ts ~/Documents${c.reset}`);
    console.log(`    ${c.dim}bun examples/dir-scan.ts /Users/xxx --fast${c.reset}`);
    console.log();
    process.exit(1);
  }

  if (!existsSync(targetDir)) {
    error(`目录不存在: ${targetDir}`);
    process.exit(1);
  }

  section('扫描配置');

  console.log(`  ${c.dim}目标目录:${c.reset} ${c.bold}${targetDir}${c.reset}`);
  console.log(`  ${c.dim}输出文件:${c.reset} ${c.bold}${outputFile}${c.reset}`);
  console.log(`  ${c.dim}扫描模式:${c.reset} ${c.bold}${fastMode ? '快速（跳过 stat）' : '完整（获取文件大小）'}${c.reset}`);

  // 配置
  scanConfig.fastMode = fastMode;
  await mkdir(dirname(outputFile), { recursive: true });
  scanConfig.outputStream = createWriteStream(outputFile);

  section('开始扫描');

  // 使用内存模式：不写 SQLite，节省 I/O；完成后自动清理 job 数据
  const hub = await createTaskHub({ storage: 'memory' });

  // 发现阶段进度显示
  let lastDiscoveryUpdate = 0;

  const source = new DirectoryScanSource(targetDir, {
    maxDepth: 50,
    onDiscovery: (count, currentPath) => {
      const now = Date.now();
      if (now - lastDiscoveryUpdate >= 100) {
        const displayPath = currentPath.length > 50 ? '...' + currentPath.slice(-47) : currentPath;
        process.stdout.write(
          `\r  ${c.dim}发现目录:${c.reset} ${c.bold}${count}${c.reset} ${c.dim}${displayPath.padEnd(50)}${c.reset}`
        );
        lastDiscoveryUpdate = now;
      }
    },
  });

  info('开始扫描目录...');
  const startTime = Date.now(); // 从发现阶段开始计时

  const task = await hub.createTask({
    name: 'dir-scan',
    source,
    concurrency: {
      min: 10,
      max: 100,
      initial: 50,
    },
  });

  let discoveryCleared = false;
  let lastUpdate = Date.now();

  task.on('progress', (p) => {
    const now = Date.now();
    if (!discoveryCleared) {
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
      discoveryCleared = true;
    }
    if (now - lastUpdate > 100 || p.completed === p.total) {
      const extra = `${globalStats.files.toLocaleString()} 文件 | ${formatSize(globalStats.totalSize)}`;
      progressBar(p.completed, p.total, '扫描中', extra);
      lastUpdate = now;
    }
  });

  await task.start();

  // 关闭输出流（flush 数据到磁盘）
  if (scanConfig.outputStream) {
    await new Promise<void>((resolve) => scanConfig.outputStream!.end(resolve));
  }

  const duration = Date.now() - startTime; // 包含发现+执行+写入全过程

  console.log();
  success('扫描完成！');

  section('扫描结果');

  console.log(`  ${c.dim}扫描目录数:${c.reset} ${c.bold}${task.totalJobs.toLocaleString()}${c.reset}`);
  console.log(`  ${c.dim}发现文件:${c.reset} ${c.bold}${globalStats.files.toLocaleString()}${c.reset}`);
  console.log(`  ${c.dim}发现子目录:${c.reset} ${c.bold}${globalStats.dirs.toLocaleString()}${c.reset}`);
  if (!fastMode) {
    console.log(`  ${c.dim}总大小:${c.reset} ${c.bold}${formatSize(globalStats.totalSize)}${c.reset} (实际磁盘占用)`);
  }
  console.log(`  ${c.dim}扫描耗时:${c.reset} ${c.bold}${(duration / 1000).toFixed(2)}s${c.reset}`);
  console.log(`  ${c.dim}速度:${c.reset} ${c.bold}${Math.round(globalStats.files / (duration / 1000)).toLocaleString()}${c.reset} 文件/秒`);

  // 文件类型统计
  section('文件类型统计');

  const sortedExts = [...globalStats.extStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  console.log(`  ${c.dim}${'扩展名'.padEnd(14)}${'数量'.padStart(10)}${fastMode ? '' : '大小'.padStart(12)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(fastMode ? 24 : 36)}${c.reset}`);

  for (const [ext, extStat] of sortedExts) {
    const extStr = ext.padEnd(14);
    const countStr = extStat.count.toLocaleString().padStart(10);
    const sizeStr = fastMode ? '' : formatSize(extStat.size).padStart(12);
    console.log(`  ${c.cyan}${extStr}${c.reset}${countStr}${c.dim}${sizeStr}${c.reset}`);
  }

  if (!fastMode && globalStats.largestFiles.length > 0) {
    section('最大文件 (Top 10)');
    for (const file of globalStats.largestFiles) {
      const size = formatSize(file.diskSize).padStart(10);
      const name = file.name.length > 45 ? file.name.slice(0, 42) + '...' : file.name;
      console.log(`  ${c.yellow}${size}${c.reset}  ${name}`);
    }

    section('最近修改 (Top 10)');
    for (const file of globalStats.recentFiles) {
      const date = formatDate(new Date(file.mtime));
      const name = file.name.length > 40 ? file.name.slice(0, 37) + '...' : file.name;
      console.log(`  ${c.green}${date}${c.reset}  ${name}`);
    }
  }

  section('输出信息');
  success(`JSONL 已保存: ${outputFile}`);
  info('格式: 每行一个 JSON 对象，可流式读取，避免 OOM');

  await hub.close();
  console.log();
}

main().catch((err) => {
  error(err.message);
  console.error(err);
  process.exit(1);
});
