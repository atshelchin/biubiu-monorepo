#!/usr/bin/env bun
/**
 * 内容搜索工具
 *
 * 功能：
 * - 读取 dir-scan 的扫描结果 (JSONL 格式) 作为数据源
 * - 并发打开每个可读文件
 * - 搜索用户指定的关键字
 * - 显示匹配结果和上下文
 *
 * 用法：
 *   bun examples/content-search.ts <扫描结果JSONL> <关键字1> [关键字2] ...
 *
 * 示例：
 *   bun examples/content-search.ts ./examples/results/dir-scan.jsonl "password" "secret"
 *   bun examples/content-search.ts scan.jsonl "TODO" "FIXME" "HACK"
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { FileInfo } from './dir-scan.js';
import { c, header, section, success, error, warn, info, progressBar } from './utils.js';

// ============================================================================
// 类型定义
// ============================================================================

interface SearchMatch {
  line: number;
  column: number;
  keyword: string;
  context: string;
  lineContent: string;
}

interface SearchResult {
  file: FileInfo;
  matches: SearchMatch[];
  error?: string;
}

interface SearchJob {
  file: FileInfo;
  keywords: string[];
}

// ============================================================================
// 可搜索文件类型
// ============================================================================

const SEARCHABLE_EXTENSIONS = new Set([
  // 代码文件
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.swift',
  '.m', '.mm',
  '.scala',
  '.clj', '.cljs',
  '.lua',
  '.r', '.R',
  '.pl', '.pm',
  '.sh', '.bash', '.zsh', '.fish',
  '.ps1', '.psm1',
  '.sql',
  '.graphql', '.gql',

  // 配置文件
  '.json', '.jsonc', '.json5',
  '.yaml', '.yml',
  '.toml',
  '.xml',
  '.ini', '.cfg', '.conf',
  '.env', '.env.local', '.env.example',
  '.properties',
  '.editorconfig',
  '.gitignore', '.gitattributes',
  '.npmrc', '.nvmrc',
  '.prettierrc', '.eslintrc',

  // 文档文件
  '.md', '.markdown', '.mdx',
  '.txt', '.text',
  '.rst',
  '.adoc', '.asciidoc',
  '.tex',
  '.org',

  // Web 文件
  '.html', '.htm', '.xhtml',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.vue', '.svelte',

  // 数据文件
  '.csv', '.tsv',
  '.log',

  // 其他
  '.dockerfile', '.containerfile',
  '.makefile',
  '.gitignore',
]);

function isSearchable(file: FileInfo): boolean {
  if (!file.isFile) return false;
  if (file.size === 0) return false;
  if (file.size > 10 * 1024 * 1024) return false; // 跳过大于 10MB 的文件

  const ext = file.ext.toLowerCase();
  if (SEARCHABLE_EXTENSIONS.has(ext)) return true;

  // 无扩展名的特殊文件
  const name = file.name.toLowerCase();
  const specialFiles = [
    'dockerfile', 'containerfile', 'makefile', 'gemfile',
    'rakefile', 'procfile', 'vagrantfile', 'brewfile',
    'readme', 'license', 'changelog', 'authors', 'contributing',
  ];
  if (specialFiles.some((f) => name === f || name.startsWith(f + '.'))) {
    return true;
  }

  return false;
}

// ============================================================================
// 内容搜索 TaskSource
// ============================================================================

class ContentSearchSource extends TaskSource<SearchJob, SearchResult> {
  readonly type = 'deterministic' as const;

  private jobs: SearchJob[];
  private caseSensitive: boolean;

  constructor(files: FileInfo[], keywords: string[], caseSensitive = false) {
    super();
    this.jobs = files
      .filter(isSearchable)
      .map((file) => ({ file, keywords }));
    this.caseSensitive = caseSensitive;
  }

  getData(): SearchJob[] {
    return this.jobs;
  }

  async handler(input: SearchJob, ctx: JobContext): Promise<SearchResult> {
    const { file, keywords } = input;
    const matches: SearchMatch[] = [];

    try {
      const content = await readFile(file.path, 'utf-8');
      const lines = content.split('\n');

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const searchLine = this.caseSensitive ? line : line.toLowerCase();

        for (const keyword of keywords) {
          const searchKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();
          let col = 0;
          let pos: number;

          while ((pos = searchLine.indexOf(searchKeyword, col)) !== -1) {
            // 获取上下文（前后各取一些字符）
            const contextStart = Math.max(0, pos - 30);
            const contextEnd = Math.min(line.length, pos + keyword.length + 30);
            let context = line.slice(contextStart, contextEnd);

            if (contextStart > 0) context = '...' + context;
            if (contextEnd < line.length) context = context + '...';

            matches.push({
              line: lineNum + 1,
              column: pos + 1,
              keyword,
              context: context.trim(),
              lineContent: line.trim(),
            });

            col = pos + keyword.length;
          }
        }
      }

      return { file, matches };
    } catch (err) {
      return {
        file,
        matches: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ============================================================================
// 高亮关键字
// ============================================================================

function highlightKeyword(text: string, keywords: string[], caseSensitive = false): string {
  let result = text;

  for (const keyword of keywords) {
    const regex = new RegExp(
      keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      caseSensitive ? 'g' : 'gi'
    );
    result = result.replace(regex, `${c.bgYellow}${c.bold}$&${c.reset}`);
  }

  return result;
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  header('🔍 内容搜索工具');

  // 解析参数
  const args = process.argv.slice(2);

  if (args.length < 2) {
    error('参数不足');
    console.log();
    console.log(`  用法: ${c.cyan}bun examples/content-search.ts <扫描结果JSONL> <关键字1> [关键字2] ...${c.reset}`);
    console.log();
    console.log(`  示例:`);
    console.log(`    ${c.dim}bun examples/content-search.ts ./examples/results/dir-scan.jsonl "password"${c.reset}`);
    console.log(`    ${c.dim}bun examples/content-search.ts scan.jsonl "TODO" "FIXME" "HACK"${c.reset}`);
    console.log();
    console.log(`  选项:`);
    console.log(`    ${c.dim}--case-sensitive${c.reset}  区分大小写`);
    console.log();
    process.exit(1);
  }

  const scanResultFile = args[0];
  const caseSensitive = args.includes('--case-sensitive');
  const keywords = args.slice(1).filter((a) => !a.startsWith('--'));

  if (keywords.length === 0) {
    error('请至少指定一个关键字');
    process.exit(1);
  }

  section('搜索配置');

  console.log(`  ${c.dim}扫描结果:${c.reset} ${c.bold}${scanResultFile}${c.reset}`);
  console.log(`  ${c.dim}关键字:${c.reset} ${c.bold}${keywords.map((k) => `"${k}"`).join(', ')}${c.reset}`);
  console.log(`  ${c.dim}大小写:${c.reset} ${c.bold}${caseSensitive ? '区分' : '不区分'}${c.reset}`);

  // 读取扫描结果 (JSONL 格式：每行一个 FileInfo)
  section('加载扫描结果');

  const files: FileInfo[] = [];
  try {
    const rl = createInterface({
      input: createReadStream(scanResultFile),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        files.push(JSON.parse(line));
      }
    }

    success(`加载成功: ${files.length} 个文件`);
  } catch (err) {
    error(`无法读取扫描结果: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // 筛选可搜索文件
  const searchableFiles = files.filter(isSearchable);
  info(`可搜索文件: ${searchableFiles.length} 个`);

  if (searchableFiles.length === 0) {
    warn('没有可搜索的文件');
    process.exit(0);
  }

  section('开始搜索');

  // 使用内存模式，不写磁盘
  const hub = await createTaskHub({ storage: 'memory' });

  const source = new ContentSearchSource(files, keywords, caseSensitive);

  const task = await hub.createTask({
    name: 'content-search',
    source,
    concurrency: {
      min: 5,
      max: 30,
      initial: 15,
    },
  });

  info(`搜索 ${task.totalJobs} 个文件...`);

  const allResults: SearchResult[] = [];
  let filesWithMatches = 0;
  let totalMatches = 0;
  let errorCount = 0;
  let lastUpdate = Date.now();

  task.on('job:complete', (job) => {
    const result = job.output;
    if (result) {
      allResults.push(result);
      if (result.matches.length > 0) {
        filesWithMatches++;
        totalMatches += result.matches.length;
      }
      if (result.error) {
        errorCount++;
      }
    }
  });

  task.on('progress', (p) => {
    const now = Date.now();
    if (now - lastUpdate > 100 || p.completed === p.total) {
      progressBar(p.completed, p.total, '搜索中', `已找到 ${totalMatches} 处匹配`);
      lastUpdate = now;
    }
  });

  const startTime = Date.now();
  await task.start();
  const duration = Date.now() - startTime;

  console.log(); // 换行（清除进度条）

  success('搜索完成！');

  section('搜索结果');

  console.log(`  ${c.dim}搜索文件:${c.reset} ${c.bold}${task.totalJobs}${c.reset}`);
  console.log(`  ${c.dim}匹配文件:${c.reset} ${c.bold}${filesWithMatches}${c.reset}`);
  console.log(`  ${c.dim}总匹配数:${c.reset} ${c.bold}${totalMatches}${c.reset}`);
  console.log(`  ${c.dim}读取错误:${c.reset} ${c.bold}${errorCount}${c.reset}`);
  console.log(`  ${c.dim}搜索耗时:${c.reset} ${c.bold}${(duration / 1000).toFixed(2)}s${c.reset}`);

  // 显示匹配详情
  if (totalMatches > 0) {
    section('匹配详情');

    // 按匹配数排序
    const resultsWithMatches = allResults
      .filter((r) => r.matches.length > 0)
      .sort((a, b) => b.matches.length - a.matches.length);

    let displayedMatches = 0;
    const maxDisplayMatches = 100;

    for (const result of resultsWithMatches) {
      if (displayedMatches >= maxDisplayMatches) {
        console.log();
        warn(`显示已达上限 (${maxDisplayMatches})，省略其余匹配`);
        break;
      }

      // 文件路径
      const displayPath = result.file.path;
      console.log();
      console.log(`${c.bold}${c.cyan}📄 ${displayPath}${c.reset} ${c.dim}(${result.matches.length} 处匹配)${c.reset}`);

      // 显示每个匹配
      const matchesToShow = result.matches.slice(0, 10);
      for (const match of matchesToShow) {
        displayedMatches++;
        const lineInfo = `${c.yellow}L${match.line}:${match.column}${c.reset}`;
        const highlighted = highlightKeyword(match.context, keywords, caseSensitive);
        console.log(`   ${lineInfo}  ${highlighted}`);
      }

      if (result.matches.length > 10) {
        console.log(`   ${c.dim}... 还有 ${result.matches.length - 10} 处匹配${c.reset}`);
      }
    }
  }

  // 按关键字统计
  section('关键字统计');

  const keywordStats = new Map<string, { files: Set<string>; count: number }>();
  for (const keyword of keywords) {
    keywordStats.set(keyword, { files: new Set(), count: 0 });
  }

  for (const result of allResults) {
    for (const match of result.matches) {
      const stats = keywordStats.get(match.keyword);
      if (stats) {
        stats.files.add(result.file.path);
        stats.count++;
      }
    }
  }

  console.log(`  ${c.dim}${'关键字'.padEnd(20)}${'文件数'.padStart(8)}${'匹配数'.padStart(10)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(38)}${c.reset}`);

  for (const [keyword, stats] of keywordStats) {
    const keywordStr = `"${keyword}"`.padEnd(20);
    const filesStr = stats.files.size.toString().padStart(8);
    const countStr = stats.count.toString().padStart(10);
    console.log(`  ${c.cyan}${keywordStr}${c.reset}${filesStr}${c.dim}${countStr}${c.reset}`);
  }

  // 按文件类型统计
  section('文件类型统计');

  const extStats = new Map<string, { files: number; matches: number }>();
  for (const result of allResults) {
    if (result.matches.length === 0) continue;

    const ext = result.file.ext || '(无扩展名)';
    const stats = extStats.get(ext) || { files: 0, matches: 0 };
    stats.files++;
    stats.matches += result.matches.length;
    extStats.set(ext, stats);
  }

  const sortedExtStats = [...extStats.entries()]
    .sort((a, b) => b[1].matches - a[1].matches)
    .slice(0, 10);

  console.log(`  ${c.dim}${'扩展名'.padEnd(12)}${'文件数'.padStart(8)}${'匹配数'.padStart(10)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(30)}${c.reset}`);

  for (const [ext, stats] of sortedExtStats) {
    const extStr = ext.padEnd(12);
    const filesStr = stats.files.toString().padStart(8);
    const matchesStr = stats.matches.toString().padStart(10);
    console.log(`  ${c.cyan}${extStr}${c.reset}${filesStr}${c.dim}${matchesStr}${c.reset}`);
  }

  await hub.close();

  console.log();
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
