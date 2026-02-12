#!/usr/bin/env bun
/**
 * 数据整理工具 - 格式化前的数据抢救
 *
 * 功能：
 * - 一体化扫描：边扫描边分析，不依赖 dir-scan
 * - 文件分类：照片、视频、文档、代码、压缩包等
 * - 敏感数据检测：助记词、私钥、密码、邮箱、API Key 等
 * - 大文件分析：找出占用空间的大文件，方便清理
 * - 批量导出：生成文件列表方便复制，敏感数据汇总到文档
 *
 * 用法：
 *   bun examples/data-finder.ts <目录路径> [选项]
 *
 * 选项：
 *   --fast           快速模式，跳过内容搜索
 *   --min-size=100MB 大文件阈值（默认 100MB）
 *   --output=<dir>   输出目录（默认 ./examples/results/data-finder）
 *
 * 示例：
 *   bun examples/data-finder.ts ~/Documents
 *   bun examples/data-finder.ts /Users/xxx --min-size=500MB
 */

import { createTaskHub, TaskSource, type JobContext } from '../src/index.js';
import { readdir, stat, mkdir, readFile, writeFile } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { existsSync, createWriteStream, type WriteStream } from 'fs';
import { c, header, section, success, error, info, warn, progressBar, formatSize, formatDate } from './utils.js';
import { wordlists } from 'bip39';

// 完整的 BIP39 英文词库 (2048 词)
const BIP39_WORDS = new Set(wordlists.english);

// ============================================================================
// 类型定义
// ============================================================================

interface FileInfo {
  path: string;
  name: string;
  ext: string;
  size: number;
  diskSize: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  mtime: number;
  category: FileCategory;
}

type FileCategory = 'photo' | 'video' | 'document' | 'audio' | 'archive' | 'code' | 'data' | 'other';

interface SensitiveMatch {
  type: SensitiveType;
  value: string;
  context: string;
  file: string;
  line: number;
}

type SensitiveType =
  | 'mnemonic'
  | 'private_key'
  | 'password'
  | 'credential'  // 账号密码对
  | 'email'
  | 'api_key'
  | 'credit_card'
  | 'bank_account'  // 银行卡号
  | 'id_card'       // 身份证
  | 'passport'      // 护照
  | 'phone'
  | 'address'       // 地址
  | 'custom';

interface ScanJob {
  path: string;
  depth: number;
}

interface ScanResult {
  files: FileInfo[];
  sensitiveMatches: SensitiveMatch[];
}

interface CategoryStats {
  count: number;
  size: number;
  files: string[];
}

// ============================================================================
// 文件分类配置
// ============================================================================

const FILE_CATEGORIES: Record<FileCategory, Set<string>> = {
  photo: new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif',
    '.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2', '.pef',
    '.tiff', '.tif', '.ico', '.svg', '.psd', '.ai', '.eps',
  ]),
  video: new Set([
    '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v',
    '.mpeg', '.mpg', '.3gp', '.3g2', '.mts', '.m2ts', '.vob', '.ogv',
  ]),
  audio: new Set([
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus',
    '.aiff', '.ape', '.alac',
  ]),
  document: new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.txt', '.md', '.markdown',
    '.pages', '.numbers', '.key', '.epub', '.mobi',
  ]),
  archive: new Set([
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz',
    '.tar.gz', '.tar.bz2', '.dmg', '.iso',
  ]),
  code: new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw', '.java', '.kt', '.scala', '.go', '.rs', '.rb',
    '.php', '.swift', '.m', '.mm', '.c', '.cpp', '.cc', '.h', '.hpp',
    '.cs', '.vb', '.fs', '.clj', '.ex', '.exs', '.erl', '.hs',
    '.lua', '.r', '.R', '.pl', '.pm', '.sh', '.bash', '.zsh', '.fish',
    '.sql', '.graphql', '.gql', '.vue', '.svelte',
  ]),
  data: new Set([
    '.json', '.jsonl', '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv',
    '.sqlite', '.db', '.sql', '.log', '.env', '.ini', '.cfg', '.conf',
  ]),
  other: new Set([]),
};

function getFileCategory(ext: string): FileCategory {
  const lowerExt = ext.toLowerCase();
  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if (extensions.has(lowerExt)) {
      return category as FileCategory;
    }
  }
  return 'other';
}

// ============================================================================
// 敏感数据检测模式
// ============================================================================

interface SensitivePattern {
  type: SensitiveType;
  name: string;
  pattern: RegExp;
  validate?: (match: string) => boolean;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // 密码模式 (带关键字)
  {
    type: 'password',
    name: '密码',
    pattern: /(?:password|passwd|pwd|pass|secret|密码|口令)\s*[=:：]\s*["']?([^\s"']{4,})["']?/gi,
  },
  // 邮箱地址
  {
    type: 'email',
    name: '邮箱',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  // API Key (常见格式)
  {
    type: 'api_key',
    name: 'API Key',
    pattern: /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer)\s*[=:]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
  },
  // AWS Access Key
  {
    type: 'api_key',
    name: 'AWS Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  // GitHub Token
  {
    type: 'api_key',
    name: 'GitHub Token',
    pattern: /gh[pso]_[a-zA-Z0-9]{36,}/g,
  },
  // OpenAI API Key
  {
    type: 'api_key',
    name: 'OpenAI Key',
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
  },
  // 中国身份证号 (18位)
  {
    type: 'id_card',
    name: '身份证号',
    pattern: /(?:^|[^0-9])([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])(?:[^0-9]|$)/g,
    validate: (match) => {
      // 简单校验：检查校验位
      const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
      const checkCodes = '10X98765432';
      let sum = 0;
      for (let i = 0; i < 17; i++) {
        sum += parseInt(match[i]) * weights[i];
      }
      const checkCode = checkCodes[sum % 11];
      return match[17].toUpperCase() === checkCode;
    },
  },
  // 护照号码
  {
    type: 'passport',
    name: '护照号',
    pattern: /(?:passport|护照)[号]?\s*[=:：]?\s*([A-Z][0-9]{8}|[EGS]\d{8})/gi,
  },
  // 银行卡号 (16-19位)
  {
    type: 'bank_account',
    name: '银行卡号',
    pattern: /(?:^|[^0-9])([456][0-9]{15,18})(?:[^0-9]|$)/g,
    validate: (match) => {
      // Luhn 算法验证
      const digits = match.replace(/\s/g, '');
      if (digits.length < 16 || digits.length > 19) return false;
      let sum = 0;
      let isEven = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let d = parseInt(digits[i]);
        if (isEven) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        sum += d;
        isEven = !isEven;
      }
      return sum % 10 === 0;
    },
  },
  // 信用卡号 (16位，带分隔符)
  {
    type: 'credit_card',
    name: '信用卡号',
    pattern: /(?:^|[^0-9])([0-9]{4}[- ][0-9]{4}[- ][0-9]{4}[- ][0-9]{4})(?:[^0-9]|$)/g,
  },
  // 手机号 (中国大陆)
  {
    type: 'phone',
    name: '手机号',
    pattern: /(?:^|[^0-9])(1[3-9][0-9]{9})(?:[^0-9]|$)/g,
  },
];

// 私钥检测：必须有明确的私钥关键字
const PRIVATE_KEY_KEYWORDS = [
  'private_key', 'privatekey', 'priv_key', 'privkey',
  'private key', 'secret key', 'secret_key', 'secretkey',
  '私钥', '密钥',
];

// 排除的上下文（交易哈希、地址、合约等）
const PRIVATE_KEY_EXCLUDE_KEYWORDS = [
  'tx', 'hash', 'transaction', '交易', 'txhash', 'txid', 'tx_hash',
  'etherscan', 'bscscan', 'polygonscan', 'arbiscan', 'basescan',
  'block', 'explorer', '区块',
  'address', 'addr', 'contract', 'token', '地址', '合约',
  'from', 'to', 'sender', 'receiver', // 交易发送方/接收方
  '/tx/', '/address/', '/token/', // URL路径
];

/**
 * 检测私钥（严格模式：必须有明确的私钥关键字）
 */
function detectPrivateKey(content: string, filePath: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineLower = line.toLowerCase();

    // 检查是否有排除关键字（在当前行）
    if (PRIVATE_KEY_EXCLUDE_KEYWORDS.some((kw) => lineLower.includes(kw))) {
      continue;
    }

    // 检查 64 位十六进制
    const hexPattern = /(?:^|[^a-fA-F0-9])([a-fA-F0-9]{64})(?:[^a-fA-F0-9]|$)/g;
    let match;
    while ((match = hexPattern.exec(line)) !== null) {
      const value = match[1];

      // 排除全0、全f等无效值
      if (/^0+$/.test(value) || /^f+$/i.test(value)) continue;

      // 排除：如果该 hex 前面有 0x 且在 URL 或地址上下文中
      const hexIndex = line.indexOf(value);
      const beforeHex = line.slice(Math.max(0, hexIndex - 10), hexIndex).toLowerCase();
      if (beforeHex.includes('0x') && (lineLower.includes('http') || lineLower.includes('.io') || lineLower.includes('.com'))) {
        continue;
      }

      // 严格检查：当前行或上下2行必须有明确的私钥关键字
      const contextStart = Math.max(0, lineNum - 2);
      const contextEnd = Math.min(lines.length, lineNum + 3);
      const contextLines = lines.slice(contextStart, contextEnd).join(' ').toLowerCase();

      const hasPrivateKeyContext = PRIVATE_KEY_KEYWORDS.some((kw) => contextLines.includes(kw));

      // 也检查文件名
      const fileNameLower = filePath.toLowerCase();
      const hasFileNameContext = PRIVATE_KEY_KEYWORDS.some((kw) => fileNameLower.includes(kw));

      // 再次检查上下文没有排除关键字
      const contextHasExclude = PRIVATE_KEY_EXCLUDE_KEYWORDS.some((kw) => contextLines.includes(kw));
      if (contextHasExclude) continue;

      if (hasPrivateKeyContext || hasFileNameContext) {
        matches.push({
          type: 'private_key',
          value: value.slice(0, 10) + '...' + value.slice(-6),
          context: line.trim().slice(0, 100),
          file: filePath,
          line: lineNum + 1,
        });
      }
    }
  }

  return matches;
}

/**
 * 检测账号密码对（可能分布在不同行）
 * 支持格式：
 * 1. 同行: password: 123456 或 密码=123456
 * 2. 跨行: 密码\n123456 （关键字在一行，值在下一行）
 */
function detectCredentials(content: string, filePath: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  const lines = content.split('\n');

  // 账号关键字
  const usernameKeywords = [
    'username', 'user', 'account', 'login', 'email', 'mail', 'userid', 'user_id',
    '账号', '用户名', '登录名', '邮箱', '账户',
  ];

  // 密码关键字
  const passwordKeywords = [
    'password', 'passwd', 'pwd', 'pass', 'secret', 'credential',
    '密码', '口令',
  ];

  // 找到所有包含账号或密码关键字的行
  interface KeywordMatch {
    lineNum: number;
    type: 'username' | 'password';
    keyword: string;
    value: string;
    line: string;
  }

  const keywordMatches: KeywordMatch[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineLower = line.toLowerCase();
    const lineTrimmed = line.trim();

    // 检查账号关键字
    for (const kw of usernameKeywords) {
      if (lineLower.includes(kw)) {
        // 尝试提取值 - 同行格式
        const valueMatch = line.match(new RegExp(`${kw}\\s*[=:：]\\s*["']?([^\\s"'\\n]{2,})["']?`, 'i'));
        if (valueMatch) {
          keywordMatches.push({
            lineNum,
            type: 'username',
            keyword: kw,
            value: valueMatch[1],
            line: lineTrimmed,
          });
        } else {
          // 跨行格式：关键字单独一行，值在下一行
          const nextLine = lines[lineNum + 1]?.trim();
          if (nextLine && nextLine.length >= 2 && nextLine.length <= 100 && !/^[#\/\*]/.test(nextLine)) {
            keywordMatches.push({
              lineNum,
              type: 'username',
              keyword: kw,
              value: nextLine,
              line: `${lineTrimmed} → ${nextLine}`,
            });
          }
        }
      }
    }

    // 检查密码关键字
    for (const kw of passwordKeywords) {
      if (lineLower.includes(kw)) {
        // 同行格式
        const valueMatch = line.match(new RegExp(`${kw}\\s*[=:：]\\s*["']?([^\\s"'\\n]{2,})["']?`, 'i'));
        if (valueMatch) {
          keywordMatches.push({
            lineNum,
            type: 'password',
            keyword: kw,
            value: valueMatch[1],
            line: lineTrimmed,
          });
        } else {
          // 跨行格式：关键字单独一行，值在下一行
          const nextLine = lines[lineNum + 1]?.trim();
          if (nextLine && nextLine.length >= 2 && nextLine.length <= 100 && !/^[#\/\*]/.test(nextLine)) {
            // 排除明显不是密码的内容（比如又是一个关键字）
            const nextLower = nextLine.toLowerCase();
            const isAnotherKeyword = [...usernameKeywords, ...passwordKeywords].some(k => nextLower.includes(k));
            if (!isAnotherKeyword) {
              keywordMatches.push({
                lineNum,
                type: 'password',
                keyword: kw,
                value: nextLine,
                line: `${lineTrimmed} → ${nextLine}`,
              });
            }
          }
        }
      }
    }
  }

  // 配对：找邻近的 username + password 组合
  const PROXIMITY_LINES = 10; // 10行以内认为是一对

  for (let i = 0; i < keywordMatches.length; i++) {
    const m1 = keywordMatches[i];
    if (m1.type === 'username') {
      // 向下找密码
      for (let j = i + 1; j < keywordMatches.length; j++) {
        const m2 = keywordMatches[j];
        if (m2.type === 'password' && Math.abs(m2.lineNum - m1.lineNum) <= PROXIMITY_LINES) {
          matches.push({
            type: 'credential',
            value: `${m1.keyword}: ${m1.value} / ${m2.keyword}: ${m2.value}`,
            context: `L${m1.lineNum + 1}: ${m1.line.slice(0, 50)}... | L${m2.lineNum + 1}: ${m2.line.slice(0, 50)}...`,
            file: filePath,
            line: m1.lineNum + 1,
          });
          break;
        }
      }
    }
  }

  // 单独的密码（没有配对的账号）也要报告
  const pairedPasswordLines = new Set(matches.map(m => {
    const lineMatch = m.context.match(/L(\d+):/g);
    return lineMatch ? lineMatch[1] : null;
  }));

  for (const m of keywordMatches) {
    if (m.type === 'password' && !pairedPasswordLines.has(String(m.lineNum + 1))) {
      matches.push({
        type: 'password',
        value: m.value.slice(0, 30),
        context: m.line.slice(0, 100),
        file: filePath,
        line: m.lineNum + 1,
      });
    }
  }

  return matches;
}

// ============================================================================
// 全局状态
// ============================================================================

interface GlobalStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  categories: Map<FileCategory, CategoryStats>;
  largeFiles: FileInfo[];
  recentFiles: FileInfo[];
  sensitiveMatches: SensitiveMatch[];
}

const globalStats: GlobalStats = {
  totalFiles: 0,
  totalDirs: 0,
  totalSize: 0,
  categories: new Map(),
  largeFiles: [],
  recentFiles: [],
  sensitiveMatches: [],
};

// 配置
interface Config {
  fastMode: boolean;
  minLargeFileSize: number;
  outputDir: string;
  targetDir: string;
}

let config: Config = {
  fastMode: false,
  minLargeFileSize: 100 * 1024 * 1024, // 100MB
  outputDir: './data-finder-results',
  targetDir: '',
};

// 可搜索的文件扩展名
const SEARCHABLE_EXTENSIONS = new Set([
  ...FILE_CATEGORIES.code,
  ...FILE_CATEGORIES.data,
  '.txt', '.md', '.markdown', '.rtf',
  '.env', '.env.local', '.env.example',
  '.pem', '.key', '.crt', '.cer',
]);

function isSearchable(file: FileInfo): boolean {
  if (!file.isFile) return false;
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return false; // 跳过空文件和大于10MB的
  return SEARCHABLE_EXTENSIONS.has(file.ext.toLowerCase());
}

// ============================================================================
// 助记词检测
// ============================================================================

function detectMnemonic(content: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const words = line.toLowerCase().split(/\s+/);

    // 检查是否有连续的 BIP39 词
    let consecutiveCount = 0;
    let startIndex = 0;

    for (let i = 0; i < words.length; i++) {
      if (BIP39_WORDS.has(words[i])) {
        if (consecutiveCount === 0) startIndex = i;
        consecutiveCount++;
      } else {
        // 检查是否找到 12 或 24 个连续词
        if (consecutiveCount >= 12) {
          const mnemonicWords = words.slice(startIndex, startIndex + consecutiveCount);
          matches.push({
            type: 'mnemonic',
            value: mnemonicWords.join(' '),
            context: line.trim().slice(0, 100),
            file: '',
            line: lineNum + 1,
          });
        }
        consecutiveCount = 0;
      }
    }

    // 检查行尾
    if (consecutiveCount >= 12) {
      const mnemonicWords = words.slice(startIndex, startIndex + consecutiveCount);
      matches.push({
        type: 'mnemonic',
        value: mnemonicWords.join(' '),
        context: line.trim().slice(0, 100),
        file: '',
        line: lineNum + 1,
      });
    }
  }

  return matches;
}

// ============================================================================
// 目录扫描 + 敏感数据搜索 TaskSource
// ============================================================================

class DataFinderSource extends TaskSource<ScanJob, ScanResult> {
  readonly type = 'dynamic' as const;
  readonly id = 'data-finder';

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
    this.excludePatterns = (options.exclude ?? [
      'node_modules',
      '\\.git$',
      '\\.next$',
      '\\.cache',
      '__pycache__',
      '\\.Trash',
      'Library/Caches',
      '\\.npm',
      '\\.pnpm',
      '\\.yarn',
      'venv',
      '\\.venv',
      'Pods',
      '\\.gradle',
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

  async handler(input: ScanJob, ctx: JobContext): Promise<ScanResult> {
    const files: FileInfo[] = [];
    const sensitiveMatches: SensitiveMatch[] = [];

    try {
      const entries = await readdir(input.path, { withFileTypes: true });

      // 批量 stat
      const statPromises = entries
        .filter((entry) => !this.excludePatterns.some((p) => p.test(entry.name)))
        .map(async (entry) => {
          const fullPath = join(input.path, entry.name);
          try {
            const stats = await stat(fullPath);
            const ext = extname(entry.name).toLowerCase();
            const fileInfo: FileInfo = {
              path: fullPath,
              name: entry.name,
              ext,
              size: stats.size,
              diskSize: stats.blocks * 512,
              isFile: stats.isFile(),
              isDirectory: stats.isDirectory(),
              isSymlink: entry.isSymbolicLink(),
              mtime: stats.mtimeMs,
              category: getFileCategory(ext),
            };
            return fileInfo;
          } catch {
            return null;
          }
        });

      const results = await Promise.all(statPromises);

      for (const file of results) {
        if (!file) continue;
        files.push(file);

        // 处理文件
        this.processFile(file);

        // 敏感数据搜索（非快速模式）
        if (!config.fastMode && isSearchable(file)) {
          try {
            const content = await readFile(file.path, 'utf-8');
            const matches = this.searchSensitiveData(content, file.path);
            sensitiveMatches.push(...matches);
          } catch {
            // 忽略读取错误
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }

    return { files, sensitiveMatches };
  }

  private processFile(file: FileInfo) {
    if (file.isFile) {
      globalStats.totalFiles++;
      globalStats.totalSize += file.diskSize;

      // 分类统计
      const cat = globalStats.categories.get(file.category) || { count: 0, size: 0, files: [] };
      cat.count++;
      cat.size += file.diskSize;
      // 只保留前 1000 个路径，避免内存爆炸
      if (cat.files.length < 1000) {
        cat.files.push(file.path);
      }
      globalStats.categories.set(file.category, cat);

      // 大文件
      if (file.diskSize >= config.minLargeFileSize) {
        globalStats.largeFiles.push(file);
        globalStats.largeFiles.sort((a, b) => b.diskSize - a.diskSize);
        if (globalStats.largeFiles.length > 100) {
          globalStats.largeFiles.pop();
        }
      }

      // 最近修改
      this.updateTopList(globalStats.recentFiles, file, 50, (a, b) => b.mtime - a.mtime);
    } else if (file.isDirectory) {
      globalStats.totalDirs++;
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

  private searchSensitiveData(content: string, filePath: string): SensitiveMatch[] {
    const matches: SensitiveMatch[] = [];

    // 检测助记词
    const mnemonicMatches = detectMnemonic(content);
    for (const m of mnemonicMatches) {
      m.file = filePath;
      matches.push(m);
    }

    // 检测私钥（使用上下文感知检测，排除交易哈希）
    const privateKeyMatches = detectPrivateKey(content, filePath);
    matches.push(...privateKeyMatches);

    // 检测账号密码对（跨行关联）
    const credentialMatches = detectCredentials(content, filePath);
    matches.push(...credentialMatches);

    // 检测其他模式
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of SENSITIVE_PATTERNS) {
        pattern.pattern.lastIndex = 0; // 重置正则状态
        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          const value = match[1] || match[0];
          if (pattern.validate && !pattern.validate(value)) continue;

          matches.push({
            type: pattern.type,
            value: value.slice(0, 50), // 截断敏感值
            context: line.trim().slice(0, 100),
            file: filePath,
            line: lineNum + 1,
          });
        }
      }
    }

    return matches;
  }
}

// ============================================================================
// 报告生成
// ============================================================================

async function generateReport() {
  await mkdir(config.outputDir, { recursive: true });

  // 1. 分类文件列表
  for (const [category, stats] of globalStats.categories) {
    if (stats.files.length > 0) {
      const filePath = join(config.outputDir, `${category}-files.txt`);
      await writeFile(filePath, stats.files.join('\n'));
    }
  }

  // 2. 大文件列表
  if (globalStats.largeFiles.length > 0) {
    const largeFilesContent = globalStats.largeFiles
      .map((f) => `${formatSize(f.diskSize).padStart(10)}  ${f.path}`)
      .join('\n');
    await writeFile(join(config.outputDir, 'large-files.txt'), largeFilesContent);
  }

  // 3. 敏感数据报告
  if (globalStats.sensitiveMatches.length > 0) {
    const sensitiveReport = generateSensitiveReport();
    await writeFile(join(config.outputDir, 'sensitive-findings.md'), sensitiveReport);
  }

  // 4. 汇总报告
  const summaryReport = generateSummaryReport();
  await writeFile(join(config.outputDir, 'summary.md'), summaryReport);

  // 5. 复制脚本
  const copyScript = generateCopyScript();
  await writeFile(join(config.outputDir, 'copy-files.sh'), copyScript);
}

function generateSensitiveReport(): string {
  const grouped = new Map<SensitiveType, SensitiveMatch[]>();
  for (const match of globalStats.sensitiveMatches) {
    const list = grouped.get(match.type) || [];
    list.push(match);
    grouped.set(match.type, list);
  }

  const typeNames: Record<SensitiveType, string> = {
    mnemonic: '助记词',
    private_key: '私钥',
    password: '密码',
    credential: '账号密码对',
    email: '邮箱',
    api_key: 'API Key',
    credit_card: '信用卡',
    bank_account: '银行卡号',
    id_card: '身份证号',
    passport: '护照号',
    phone: '手机号',
    address: '地址',
    custom: '自定义',
  };

  let report = `# 敏感数据发现报告

> 扫描时间: ${new Date().toLocaleString()}
> 扫描目录: ${config.targetDir}
> 发现数量: ${globalStats.sensitiveMatches.length}

---

`;

  for (const [type, matches] of grouped) {
    report += `## ${typeNames[type]} (${matches.length} 处)\n\n`;

    for (const match of matches) {
      report += `### ${match.file}:${match.line}\n\n`;
      report += `\`\`\`\n${match.context}\n\`\`\`\n\n`;
      if (match.type === 'mnemonic' || match.type === 'private_key') {
        report += `> ⚠️ 发现值: \`${match.value.slice(0, 20)}...${match.value.slice(-10)}\`\n\n`;
      }
      report += `---\n\n`;
    }
  }

  return report;
}

function generateSummaryReport(): string {
  const categoryNames: Record<FileCategory, string> = {
    photo: '照片',
    video: '视频',
    audio: '音频',
    document: '文档',
    archive: '压缩包',
    code: '代码',
    data: '数据文件',
    other: '其他',
  };

  let report = `# 数据整理报告

> 扫描时间: ${new Date().toLocaleString()}
> 扫描目录: ${config.targetDir}

## 总览

| 指标 | 数值 |
|------|------|
| 文件总数 | ${globalStats.totalFiles.toLocaleString()} |
| 目录总数 | ${globalStats.totalDirs.toLocaleString()} |
| 总大小 | ${formatSize(globalStats.totalSize)} |
| 敏感发现 | ${globalStats.sensitiveMatches.length} 处 |
| 大文件 (>${formatSize(config.minLargeFileSize)}) | ${globalStats.largeFiles.length} 个 |

## 文件分类统计

| 类型 | 数量 | 大小 | 文件列表 |
|------|------|------|----------|
`;

  for (const [category, stats] of globalStats.categories) {
    if (stats.count > 0) {
      report += `| ${categoryNames[category]} | ${stats.count.toLocaleString()} | ${formatSize(stats.size)} | [${category}-files.txt](${category}-files.txt) |\n`;
    }
  }

  if (globalStats.largeFiles.length > 0) {
    report += `
## 大文件 Top 20

| 大小 | 文件路径 |
|------|----------|
`;
    for (const file of globalStats.largeFiles.slice(0, 20)) {
      report += `| ${formatSize(file.diskSize)} | \`${file.path}\` |\n`;
    }
  }

  if (globalStats.sensitiveMatches.length > 0) {
    report += `
## 敏感数据

详见 [sensitive-findings.md](sensitive-findings.md)

| 类型 | 数量 |
|------|------|
`;
    const grouped = new Map<SensitiveType, number>();
    for (const match of globalStats.sensitiveMatches) {
      grouped.set(match.type, (grouped.get(match.type) || 0) + 1);
    }
    const typeNames: Record<SensitiveType, string> = {
      mnemonic: '助记词',
      private_key: '私钥',
      password: '密码',
      credential: '账号密码对',
      email: '邮箱',
      api_key: 'API Key',
      credit_card: '信用卡',
      bank_account: '银行卡号',
      id_card: '身份证号',
      passport: '护照号',
      phone: '手机号',
      address: '地址',
      custom: '自定义',
    };
    for (const [type, count] of grouped) {
      report += `| ${typeNames[type]} | ${count} |\n`;
    }
  }

  report += `
## 复制文件

使用以下脚本批量复制感兴趣的文件：

\`\`\`bash
# 复制照片
bash ${config.outputDir}/copy-files.sh photo /path/to/backup

# 复制视频
bash ${config.outputDir}/copy-files.sh video /path/to/backup

# 复制文档
bash ${config.outputDir}/copy-files.sh document /path/to/backup
\`\`\`

---
*Generated by TaskHub data-finder*
`;

  return report;
}

function generateCopyScript(): string {
  return `#!/bin/bash
# 批量复制文件脚本
# 用法: bash copy-files.sh <类型> <目标目录>
# 类型: photo, video, audio, document, archive, code, data

CATEGORY=$1
DEST=$2

if [ -z "$CATEGORY" ] || [ -z "$DEST" ]; then
  echo "用法: bash copy-files.sh <类型> <目标目录>"
  echo "类型: photo, video, audio, document, archive, code, data"
  exit 1
fi

FILE_LIST="${config.outputDir}/\${CATEGORY}-files.txt"

if [ ! -f "$FILE_LIST" ]; then
  echo "文件列表不存在: $FILE_LIST"
  exit 1
fi

mkdir -p "$DEST"

echo "开始复制 $CATEGORY 文件到 $DEST ..."

while IFS= read -r file; do
  if [ -f "$file" ]; then
    # 保持目录结构
    relative="\${file#${config.targetDir}/}"
    target_dir="$DEST/$(dirname "$relative")"
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
    echo "  复制: $relative"
  fi
done < "$FILE_LIST"

echo "完成！"
`;
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  header('🔍 数据整理工具');

  // 解析参数
  const args = process.argv.slice(2);
  const targetDir = args.find((arg) => !arg.startsWith('--'));

  if (!targetDir) {
    error('请指定要扫描的目录');
    console.log();
    console.log(`  用法: ${c.cyan}bun examples/data-finder.ts <目录路径> [选项]${c.reset}`);
    console.log();
    console.log(`  选项:`);
    console.log(`    ${c.yellow}--fast${c.reset}           快速模式，跳过敏感数据搜索`);
    console.log(`    ${c.yellow}--min-size=100MB${c.reset} 大文件阈值（默认 100MB）`);
    console.log(`    ${c.yellow}--output=<dir>${c.reset}   输出目录`);
    console.log();
    console.log(`  示例:`);
    console.log(`    ${c.dim}bun examples/data-finder.ts ~/Documents${c.reset}`);
    console.log(`    ${c.dim}bun examples/data-finder.ts /Users/xxx --fast${c.reset}`);
    console.log(`    ${c.dim}bun examples/data-finder.ts ~ --min-size=500MB${c.reset}`);
    console.log();
    process.exit(1);
  }

  if (!existsSync(targetDir)) {
    error(`目录不存在: ${targetDir}`);
    process.exit(1);
  }

  // 解析选项
  config.targetDir = targetDir;
  config.fastMode = args.includes('--fast');

  const minSizeArg = args.find((arg) => arg.startsWith('--min-size='));
  if (minSizeArg) {
    const sizeStr = minSizeArg.split('=')[1];
    const match = sizeStr.match(/^(\d+)(MB|GB|KB)?$/i);
    if (match) {
      const num = parseInt(match[1]);
      const unit = (match[2] || 'MB').toUpperCase();
      const multiplier = unit === 'GB' ? 1024 * 1024 * 1024 : unit === 'KB' ? 1024 : 1024 * 1024;
      config.minLargeFileSize = num * multiplier;
    }
  }

  const outputArg = args.find((arg) => arg.startsWith('--output='));
  if (outputArg) {
    config.outputDir = outputArg.split('=')[1];
  }

  section('扫描配置');

  console.log(`  ${c.dim}目标目录:${c.reset} ${c.bold}${targetDir}${c.reset}`);
  console.log(`  ${c.dim}输出目录:${c.reset} ${c.bold}${config.outputDir}${c.reset}`);
  console.log(`  ${c.dim}扫描模式:${c.reset} ${c.bold}${config.fastMode ? '快速（跳过内容搜索）' : '完整（含敏感数据搜索）'}${c.reset}`);
  console.log(`  ${c.dim}大文件阈值:${c.reset} ${c.bold}${formatSize(config.minLargeFileSize)}${c.reset}`);

  section('开始扫描');

  const hub = await createTaskHub({ storage: 'memory' });

  let lastDiscoveryUpdate = 0;
  const source = new DataFinderSource(targetDir, {
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

  info('开始扫描...');
  const startTime = Date.now();

  const task = await hub.createTask({
    name: 'data-finder',
    source,
    concurrency: {
      min: 10,
      max: config.fastMode ? 100 : 50, // 内容搜索时降低并发
      initial: 30,
    },
  });

  // 收集敏感数据
  task.on('job:complete', (job) => {
    const result = job.output as ScanResult;
    if (result?.sensitiveMatches) {
      globalStats.sensitiveMatches.push(...result.sensitiveMatches);
    }
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
      const extra = `${globalStats.totalFiles.toLocaleString()} 文件 | ${formatSize(globalStats.totalSize)}`;
      progressBar(p.completed, p.total, '扫描中', extra);
      lastUpdate = now;
    }
  });

  await task.start();
  const duration = Date.now() - startTime;

  console.log();
  success('扫描完成！');

  // 显示结果摘要
  section('扫描结果');

  console.log(`  ${c.dim}扫描目录数:${c.reset} ${c.bold}${task.totalJobs.toLocaleString()}${c.reset}`);
  console.log(`  ${c.dim}发现文件:${c.reset} ${c.bold}${globalStats.totalFiles.toLocaleString()}${c.reset}`);
  console.log(`  ${c.dim}发现子目录:${c.reset} ${c.bold}${globalStats.totalDirs.toLocaleString()}${c.reset}`);
  console.log(`  ${c.dim}总大小:${c.reset} ${c.bold}${formatSize(globalStats.totalSize)}${c.reset}`);
  console.log(`  ${c.dim}扫描耗时:${c.reset} ${c.bold}${(duration / 1000).toFixed(2)}s${c.reset}`);
  console.log(`  ${c.dim}速度:${c.reset} ${c.bold}${Math.round(globalStats.totalFiles / (duration / 1000)).toLocaleString()}${c.reset} 文件/秒`);

  // 分类统计
  section('文件分类');

  const categoryNames: Record<FileCategory, string> = {
    photo: '📷 照片',
    video: '🎬 视频',
    audio: '🎵 音频',
    document: '📄 文档',
    archive: '📦 压缩包',
    code: '💻 代码',
    data: '📊 数据',
    other: '📁 其他',
  };

  const sortedCategories = [...globalStats.categories.entries()].sort((a, b) => b[1].size - a[1].size);

  console.log(`  ${c.dim}${'类型'.padEnd(12)}${'数量'.padStart(10)}${'大小'.padStart(12)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(34)}${c.reset}`);

  for (const [category, stats] of sortedCategories) {
    if (stats.count > 0) {
      const name = categoryNames[category].padEnd(10);
      const countStr = stats.count.toLocaleString().padStart(10);
      const sizeStr = formatSize(stats.size).padStart(12);
      console.log(`  ${c.cyan}${name}${c.reset}${countStr}${c.dim}${sizeStr}${c.reset}`);
    }
  }

  // 大文件
  if (globalStats.largeFiles.length > 0) {
    section(`大文件 Top 10 (>${formatSize(config.minLargeFileSize)})`);

    for (const file of globalStats.largeFiles.slice(0, 10)) {
      const size = formatSize(file.diskSize).padStart(10);
      const name = file.name.length > 50 ? file.name.slice(0, 47) + '...' : file.name;
      console.log(`  ${c.yellow}${size}${c.reset}  ${name}`);
    }
  }

  // 敏感数据
  if (globalStats.sensitiveMatches.length > 0) {
    section('⚠️ 敏感数据发现');

    const grouped = new Map<SensitiveType, number>();
    for (const match of globalStats.sensitiveMatches) {
      grouped.set(match.type, (grouped.get(match.type) || 0) + 1);
    }

    const typeNames: Record<SensitiveType, string> = {
      mnemonic: '🔑 助记词',
      private_key: '🔐 私钥',
      password: '🔒 密码',
      credential: '🔓 账号密码',
      email: '📧 邮箱',
      api_key: '🗝️ API Key',
      credit_card: '💳 信用卡',
      bank_account: '💰 银行卡',
      id_card: '🪪 身份证',
      passport: '📘 护照',
      phone: '📱 手机号',
      address: '📍 地址',
      custom: '🏷️ 自定义',
    };

    for (const [type, count] of grouped) {
      console.log(`  ${c.red}${typeNames[type]}:${c.reset} ${c.bold}${count}${c.reset} 处`);
    }

    warn('请检查 sensitive-findings.md 获取详细信息');
  }

  // 生成报告
  section('生成报告');

  await generateReport();

  success(`报告已保存到: ${config.outputDir}`);
  info(`  - summary.md          汇总报告`);
  info(`  - large-files.txt     大文件列表`);
  if (globalStats.sensitiveMatches.length > 0) {
    info(`  - sensitive-findings.md  敏感数据报告`);
  }
  info(`  - <category>-files.txt   分类文件列表`);
  info(`  - copy-files.sh       批量复制脚本`);

  await hub.close();
  console.log();
}

main().catch((err) => {
  error(err.message);
  console.error(err);
  process.exit(1);
});
