#!/usr/bin/env bun
/**
 * 以太坊余额批量查询工具
 *
 * 功能：
 * - 从配置文件读取地址、网络、代币信息
 * - 批量查询 ETH 和 ERC20 代币余额
 * - 使用 TaskHub 管理并发和重试
 * - 美观的 TUI 展示
 *
 * 用法：
 *   bun examples/eth-balance.ts [config.json]
 *
 * 配置文件格式见: examples/eth-balance.config.json
 */

import { createTaskHub, TaskSource, type JobContext, computeMerkleRoot, generateTaskId } from '../src/index.js';
import { createPublicClient, http, formatUnits, type Address, type PublicClient } from 'viem';
import { mainnet, polygon, arbitrum, optimism, bsc, base, avalanche } from 'viem/chains';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { c, header, section, success, error, warn, info, progress } from './utils.js';

// 数据库目录
const DB_DIR = join(dirname(new URL(import.meta.url).pathname), 'db');
const DB_PATH = join(DB_DIR, 'eth-balance.db');

// ============================================================================
// 类型定义
// ============================================================================

interface NetworkConfig {
  name: string;
  chainId: number;
  rpc: string;
  symbol: string;
  decimals: number;
}

interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}

interface Config {
  networks: Record<string, NetworkConfig>;
  tokens: Record<string, TokenConfig[]>;
  addresses: string[];
}

interface BalanceQuery {
  address: string;
  network: string;
  token: 'native' | TokenConfig;
}

interface BalanceResult {
  address: string;
  network: string;
  symbol: string;
  balance: string;
  balanceRaw: string;
}

// ============================================================================
// 网络配置
// ============================================================================

const CHAIN_MAP: Record<number, typeof mainnet> = {
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  56: bsc,
  8453: base,
  43114: avalanche,
};

// ERC20 ABI (只需要 balanceOf)
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================================
// 余额查询 TaskSource
// ============================================================================

class BalanceQuerySource extends TaskSource<BalanceQuery, BalanceResult> {
  readonly type = 'deterministic' as const;
  private queries: BalanceQuery[];
  private clients: Map<string, PublicClient> = new Map();
  private config: Config;

  constructor(config: Config) {
    super();
    this.config = config;
    this.queries = this.buildQueries();
  }

  private buildQueries(): BalanceQuery[] {
    const queries: BalanceQuery[] = [];

    for (const address of this.config.addresses) {
      for (const [networkName, networkConfig] of Object.entries(this.config.networks)) {
        // 原生代币查询
        queries.push({
          address,
          network: networkName,
          token: 'native',
        });

        // ERC20 代币查询
        const tokens = this.config.tokens[networkName] || [];
        for (const token of tokens) {
          queries.push({
            address,
            network: networkName,
            token,
          });
        }
      }
    }

    return queries;
  }

  getData() {
    return this.queries;
  }

  getJobId(input: BalanceQuery): string {
    const tokenId = input.token === 'native' ? 'native' : input.token.address;
    return `${input.network}:${input.address}:${tokenId}`;
  }

  private getClient(network: string): PublicClient {
    if (!this.clients.has(network)) {
      const networkConfig = this.config.networks[network];
      const chain = CHAIN_MAP[networkConfig.chainId];

      const client = createPublicClient({
        chain: chain || {
          id: networkConfig.chainId,
          name: networkConfig.name,
          nativeCurrency: {
            name: networkConfig.symbol,
            symbol: networkConfig.symbol,
            decimals: networkConfig.decimals,
          },
          rpcUrls: {
            default: { http: [networkConfig.rpc] },
          },
        },
        transport: http(networkConfig.rpc),
      });

      this.clients.set(network, client);
    }
    return this.clients.get(network)!;
  }

  async handler(input: BalanceQuery, ctx: JobContext): Promise<BalanceResult> {
    const client = this.getClient(input.network);
    const networkConfig = this.config.networks[input.network];

    let balanceRaw: bigint;
    let symbol: string;
    let decimals: number;

    if (input.token === 'native') {
      // 查询原生代币余额
      balanceRaw = await client.getBalance({
        address: input.address as Address,
      });
      symbol = networkConfig.symbol;
      decimals = networkConfig.decimals;
    } else {
      // 查询 ERC20 代币余额
      balanceRaw = await client.readContract({
        address: input.token.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [input.address as Address],
      });
      symbol = input.token.symbol;
      decimals = input.token.decimals;
    }

    const balance = formatUnits(balanceRaw, decimals);

    return {
      address: input.address,
      network: input.network,
      symbol,
      balance,
      balanceRaw: balanceRaw.toString(),
    };
  }

  isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // 网络错误可重试
      return (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('rate') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('fetch') ||
        msg.includes('socket') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused')
      );
    }
    return true;
  }

  isRateLimited(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('429') || msg.includes('rate');
    }
    return false;
  }
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: Config = {
  networks: {
    ethereum: {
      name: 'Ethereum',
      chainId: 1,
      rpc: 'https://eth.llamarpc.com',
      symbol: 'ETH',
      decimals: 18,
    },
    polygon: {
      name: 'Polygon',
      chainId: 137,
      rpc: 'https://polygon.llamarpc.com',
      symbol: 'MATIC',
      decimals: 18,
    },
    arbitrum: {
      name: 'Arbitrum',
      chainId: 42161,
      rpc: 'https://arbitrum.llamarpc.com',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  tokens: {
    ethereum: [
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    ],
    polygon: [
      { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC', decimals: 6 },
    ],
    arbitrum: [
      { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
      { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
    ],
  },
  addresses: [
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
    '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', // Binance
  ],
};

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  header('💰 以太坊余额批量查询工具');

  // 解析参数（跳过 flags）
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const configPath = args[0] || './examples/config/eth-balance.config.json';

  // 加载或创建配置
  let config: Config;

  section('加载配置');

  if (existsSync(configPath)) {
    info(`读取配置文件: ${configPath}`);
    const content = await readFile(configPath, 'utf-8');
    config = JSON.parse(content);
    success('配置加载成功');
  } else {
    warn(`配置文件不存在: ${configPath}`);
    info('使用默认配置（示例地址）');
    config = DEFAULT_CONFIG;

    // 保存默认配置供参考
    await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    info(`已生成示例配置文件: ${configPath}`);
  }

  // 显示配置摘要
  const networkCount = Object.keys(config.networks).length;
  const addressCount = config.addresses.length;
  let tokenCount = 0;
  for (const tokens of Object.values(config.tokens)) {
    tokenCount += tokens.length;
  }

  console.log();
  console.log(`  ${c.dim}网络:${c.reset} ${c.bold}${networkCount}${c.reset} 个`);
  console.log(`  ${c.dim}地址:${c.reset} ${c.bold}${addressCount}${c.reset} 个`);
  console.log(`  ${c.dim}代币:${c.reset} ${c.bold}${tokenCount}${c.reset} 种 (不含原生代币)`);

  // 计算总查询数
  const totalQueries = addressCount * networkCount * (1 + tokenCount / networkCount);
  console.log(`  ${c.dim}预计查询:${c.reset} ${c.bold}${Math.round(totalQueries)}${c.reset} 次`);

  section('创建任务');

  // 确保数据库目录存在
  await mkdir(DB_DIR, { recursive: true });

  const hub = await createTaskHub({ dbPath: DB_PATH });
  const source = new BalanceQuerySource(config);

  // 先尝试获取已存在的任务（支持断点续传）
  const taskOptions = {
    name: 'eth-balance-query',
    source,
    concurrency: {
      min: 1,
      max: 5,      // 降低最大并发，避免 RPC 拒绝连接
      initial: 2,  // 初始并发也降低
    },
    retry: {
      maxAttempts: 5,     // 增加重试次数
      baseDelay: 2000,    // 基础延迟 2 秒
      maxDelay: 15000,    // 最大延迟 15 秒
    },
    timeout: 30000,
  };

  // 计算任务ID（与 createTask 使用相同的逻辑）
  const jobIds = source.getData().map((d) => source.getJobId(d));
  const merkleRoot = await computeMerkleRoot(jobIds);
  const taskIdPreview = await generateTaskId('eth-balance-query', merkleRoot);

  // 检查命令行参数
  const retryFailed = process.argv.includes('--retry-failed');

  // 尝试恢复任务
  let task = await hub.resumeTask<BalanceQuery, BalanceResult>(taskIdPreview, source);
  let isResumed = false;

  if (task) {
    const p = task.getProgress();
    const remaining = p.total - p.completed - p.failed;

    if (remaining > 0) {
      // 有未完成的任务，继续执行
      isResumed = true;
      success(`恢复任务: ${task.id.slice(0, 12)}...`);
      info(`已完成: ${p.completed}, 剩余: ${remaining}`);
    } else if (retryFailed && p.failed > 0) {
      // --retry-failed: 重试失败的任务
      isResumed = true;
      success(`重试失败任务: ${task.id.slice(0, 12)}...`);
      info(`已完成: ${p.completed}, 将重试: ${p.failed} 个失败任务`);
      // 将失败的任务重置为 pending
      await hub.resetFailedJobs(taskIdPreview);
    } else {
      // 任务已完全完成（没有失败或不重试），删除旧任务并创建新任务
      info(`任务已完成，重新开始...`);
      await hub.deleteTask(taskIdPreview);
      task = null;
    }
  }

  if (!task) {
    task = await hub.createTask(taskOptions);
    info(`任务ID: ${task.id.slice(0, 12)}...`);
    info(`总查询数: ${task.totalJobs}`);
  }

  section('执行查询');

  const results: BalanceResult[] = [];
  const failedJobs: Array<{
    input: BalanceQuery;
    error: string;
    attempts: number;
  }> = [];
  const retryCountMap = new Map<string, number>(); // jobId -> retry count
  let lastProgress = 0;
  let currentProgress = { completed: 0, failed: 0, total: task.totalJobs, concurrency: 2, pending: task.totalJobs, active: 0 };

  task.on('job:complete', (job) => {
    results.push(job.output!);
  });

  task.on('job:failed', (job, err) => {
    // 静默记录失败任务详情，不在过程中输出（避免破坏阅读体验）
    failedJobs.push({
      input: job.input,
      error: err.message,
      attempts: job.attempts,
    });
  });

  task.on('job:retry', (job, attempt) => {
    const currentRetries = retryCountMap.get(job.id) || 0;
    retryCountMap.set(job.id, currentRetries + 1);
    // 不打印每次重试，避免刷屏
  });

  task.on('progress', (p) => {
    currentProgress = p;
    // 进度 = 已完成 + 已失败（都算处理完了）
    const processed = p.completed + p.failed;
    if (processed !== lastProgress) {
      lastProgress = processed;
    }
  });

  task.on('rate-limited', (newConcurrency) => {
    warn(`检测到限流，并发降至 ${newConcurrency}`);
  });

  // 定时刷新进度显示（即使没有任务完成也会更新）
  const startTime = Date.now();
  const progressTimer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const processed = currentProgress.completed + currentProgress.failed;
    const extra = `并发: ${currentProgress.concurrency} | ${elapsed}s`;
    progress(processed, currentProgress.total, extra);
  }, 1000);

  await task.start();
  clearInterval(progressTimer);
  const duration = Date.now() - startTime;

  // 最终进度显示
  progress(task.totalJobs, task.totalJobs, `完成 | ${(duration / 1000).toFixed(2)}s`);

  // 统计数据直接使用事件收集的结果（避免 getProgress 时序问题）
  const totalJobs = task.totalJobs;
  const successCount = results.length;
  const failedCount = failedJobs.length;
  const totalRetries = Array.from(retryCountMap.values()).reduce((a, b) => a + b, 0);

  section('查询结果');

  // 按地址和网络组织结果
  const resultsByAddress = new Map<string, Map<string, BalanceResult[]>>();

  for (const result of results) {
    if (!resultsByAddress.has(result.address)) {
      resultsByAddress.set(result.address, new Map());
    }
    const networkMap = resultsByAddress.get(result.address)!;
    if (!networkMap.has(result.network)) {
      networkMap.set(result.network, []);
    }
    networkMap.get(result.network)!.push(result);
  }

  // 显示结果
  for (const [address, networkMap] of resultsByAddress) {
    console.log();
    console.log(`  ${c.bold}${c.cyan}${address.slice(0, 6)}...${address.slice(-4)}${c.reset}`);

    for (const [network, balances] of networkMap) {
      console.log(`    ${c.dim}${network}${c.reset}`);

      for (const bal of balances) {
        const value = parseFloat(bal.balance);
        const color = value > 0 ? c.green : c.dim;
        const formattedBalance = value > 0 ? value.toFixed(6) : '0';
        console.log(`      ${color}${bal.symbol.padEnd(6)}${c.reset} ${formattedBalance}`);
      }
    }
  }

  section('统计');

  console.log(`  ${c.dim}总查询:${c.reset} ${c.bold}${totalJobs}${c.reset}`);
  console.log(`  ${c.dim}成功:${c.reset} ${c.green}${successCount}${c.reset}`);
  console.log(`  ${c.dim}失败:${c.reset} ${failedCount > 0 ? c.red : c.dim}${failedCount}${c.reset}`);
  if (totalRetries > 0) {
    console.log(`  ${c.dim}总重试:${c.reset} ${c.yellow}${totalRetries}${c.reset} 次`);
  }
  console.log(`  ${c.dim}耗时:${c.reset} ${c.bold}${(duration / 1000).toFixed(2)}s${c.reset}`);

  // 保存成功结果 (JSON)
  const outputPath = './examples/results/eth-balance.result.json';
  await writeFile(outputPath, JSON.stringify(results, null, 2));
  success(`结果已保存: ${outputPath}`);

  // 保存失败结果 (JSON)
  if (failedJobs.length > 0) {
    const failedOutputPath = './examples/results/eth-balance.failed.json';
    await writeFile(failedOutputPath, JSON.stringify(failedJobs, null, 2));
    warn(`失败任务已保存: ${failedOutputPath} (${failedJobs.length} 个)`);
  }

  // 生成 CSV 报告 (详细数据)
  const csvPath = './examples/results/eth-balance.csv';
  const csvHeader = 'Address,Network,Token,Balance,BalanceRaw,Status\n';
  const csvRows = results.map(r =>
    `"${r.address}","${r.network}","${r.symbol}","${r.balance}","${r.balanceRaw}","success"`
  );
  const csvFailedRows = failedJobs.map(f =>
    `"${f.input.address}","${f.input.network}","${f.input.token === 'native' ? 'native' : f.input.token.symbol}","","","failed (${f.attempts} attempts)"`
  );
  await writeFile(csvPath, csvHeader + [...csvRows, ...csvFailedRows].join('\n'));
  success(`CSV报告已保存: ${csvPath}`);

  // 生成 HTML 报告 (可打印为PDF)
  const htmlPath = './examples/results/eth-balance.html';
  const htmlContent = generateHtmlReport({
    timestamp: new Date().toISOString(),
    duration: duration / 1000,
    stats: {
      total: totalJobs,
      success: successCount,
      failed: failedCount,
      retries: totalRetries,
    },
    results,
    failedJobs,
    config,
  });
  await writeFile(htmlPath, htmlContent);
  success(`HTML报告已保存: ${htmlPath} (可在浏览器中打开并打印为PDF)`);

  // 生成 Markdown 报告
  const mdPath = './examples/results/eth-balance.md';
  const mdContent = generateMarkdownReport({
    timestamp: new Date().toISOString(),
    duration: duration / 1000,
    stats: {
      total: totalJobs,
      success: successCount,
      failed: failedCount,
      retries: totalRetries,
    },
    results,
    failedJobs,
    config,
  });
  await writeFile(mdPath, mdContent);
  success(`Markdown报告已保存: ${mdPath}`);

  // 关闭数据库连接（保留数据）
  await hub.close();

  info(`数据库已保存: ${DB_PATH}`);
  info(`可使用 hub.resumeTask() 查询历史结果`);

  console.log();
}

// ============================================================================
// 报告生成
// ============================================================================

interface ReportData {
  timestamp: string;
  duration: number;
  stats: {
    total: number;
    success: number;
    failed: number;
    retries: number;
  };
  results: BalanceResult[];
  failedJobs: Array<{ input: BalanceQuery; error: string; attempts: number }>;
  config: Config;
}

function generateHtmlReport(data: ReportData): string {
  const { timestamp, duration, stats, results, failedJobs, config } = data;

  // 按地址组织结果
  const byAddress = new Map<string, Map<string, BalanceResult[]>>();
  for (const r of results) {
    if (!byAddress.has(r.address)) byAddress.set(r.address, new Map());
    const networkMap = byAddress.get(r.address)!;
    if (!networkMap.has(r.network)) networkMap.set(r.network, []);
    networkMap.get(r.network)!.push(r);
  }

  let addressHtml = '';
  for (const [address, networkMap] of byAddress) {
    let networksHtml = '';
    for (const [network, balances] of networkMap) {
      const balanceRows = balances.map(b => `
        <tr>
          <td>${b.symbol}</td>
          <td class="${parseFloat(b.balance) > 0 ? 'positive' : ''}">${parseFloat(b.balance).toFixed(6)}</td>
        </tr>
      `).join('');
      networksHtml += `
        <div class="network">
          <h4>${network}</h4>
          <table>
            <tr><th>代币</th><th>余额</th></tr>
            ${balanceRows}
          </table>
        </div>
      `;
    }
    addressHtml += `
      <div class="address-card">
        <h3>${address}</h3>
        ${networksHtml}
      </div>
    `;
  }

  const failedHtml = failedJobs.length > 0 ? `
    <h2>失败任务</h2>
    <table class="failed-table">
      <tr><th>地址</th><th>网络</th><th>代币</th><th>尝试次数</th><th>错误</th></tr>
      ${failedJobs.map(f => `
        <tr>
          <td>${f.input.address.slice(0, 10)}...</td>
          <td>${f.input.network}</td>
          <td>${f.input.token === 'native' ? 'native' : f.input.token.symbol}</td>
          <td>${f.attempts}</td>
          <td class="error-msg">${f.error.split('\n')[0].slice(0, 50)}...</td>
        </tr>
      `).join('')}
    </table>
  ` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>以太坊余额查询报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 1200px; margin: 0 auto; color: #333; }
    h1 { margin-bottom: 10px; }
    .meta { color: #666; margin-bottom: 30px; }
    .stats { display: flex; gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #f5f5f5; padding: 20px; border-radius: 8px; min-width: 120px; }
    .stat-card .value { font-size: 28px; font-weight: bold; }
    .stat-card .label { color: #666; font-size: 14px; }
    .stat-card.success .value { color: #22c55e; }
    .stat-card.failed .value { color: #ef4444; }
    h2 { margin: 30px 0 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .address-card { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .address-card h3 { font-family: monospace; font-size: 14px; margin-bottom: 15px; color: #0066cc; }
    .network { margin-bottom: 15px; }
    .network h4 { font-size: 14px; color: #666; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f0f0f0; font-weight: 500; }
    .positive { color: #22c55e; font-weight: 500; }
    .failed-table { font-size: 13px; }
    .error-msg { color: #ef4444; font-size: 12px; }
    @media print { body { padding: 20px; } .stat-card { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>💰 以太坊余额查询报告</h1>
  <p class="meta">生成时间: ${new Date(timestamp).toLocaleString('zh-CN')} | 耗时: ${duration.toFixed(2)}s</p>

  <div class="stats">
    <div class="stat-card"><div class="value">${stats.total}</div><div class="label">总查询数</div></div>
    <div class="stat-card success"><div class="value">${stats.success}</div><div class="label">成功</div></div>
    <div class="stat-card failed"><div class="value">${stats.failed}</div><div class="label">失败</div></div>
    <div class="stat-card"><div class="value">${stats.retries}</div><div class="label">重试次数</div></div>
  </div>

  <h2>查询结果</h2>
  ${addressHtml}

  ${failedHtml}

  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
    Generated by TaskHub | Networks: ${Object.keys(config.networks).join(', ')}
  </footer>
</body>
</html>`;
}

function generateMarkdownReport(data: ReportData): string {
  const { timestamp, duration, stats, results, failedJobs, config } = data;

  // 按地址组织结果
  const byAddress = new Map<string, Map<string, BalanceResult[]>>();
  for (const r of results) {
    if (!byAddress.has(r.address)) byAddress.set(r.address, new Map());
    const networkMap = byAddress.get(r.address)!;
    if (!networkMap.has(r.network)) networkMap.set(r.network, []);
    networkMap.get(r.network)!.push(r);
  }

  let addressMd = '';
  for (const [address, networkMap] of byAddress) {
    addressMd += `\n### ${address}\n\n`;
    for (const [network, balances] of networkMap) {
      addressMd += `**${network}**\n\n`;
      addressMd += '| 代币 | 余额 |\n|------|------|\n';
      for (const b of balances) {
        addressMd += `| ${b.symbol} | ${parseFloat(b.balance).toFixed(6)} |\n`;
      }
      addressMd += '\n';
    }
  }

  let failedMd = '';
  if (failedJobs.length > 0) {
    failedMd = `\n## 失败任务\n\n| 地址 | 网络 | 代币 | 尝试次数 |\n|------|------|------|----------|\n`;
    for (const f of failedJobs) {
      failedMd += `| ${f.input.address.slice(0, 10)}... | ${f.input.network} | ${f.input.token === 'native' ? 'native' : f.input.token.symbol} | ${f.attempts} |\n`;
    }
  }

  return `# 💰 以太坊余额查询报告

**生成时间**: ${new Date(timestamp).toLocaleString('zh-CN')}
**耗时**: ${duration.toFixed(2)}s

## 统计

| 指标 | 数值 |
|------|------|
| 总查询数 | ${stats.total} |
| 成功 | ${stats.success} |
| 失败 | ${stats.failed} |
| 重试次数 | ${stats.retries} |

## 查询结果
${addressMd}
${failedMd}

---
*Generated by TaskHub | Networks: ${Object.keys(config.networks).join(', ')}*
`;
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
