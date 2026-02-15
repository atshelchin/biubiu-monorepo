/**
 * Batch Balance Query - PDA + TaskHub Integration Example
 *
 * 功能：
 * - 批量查询多个钱包在多条链上的余额
 * - 使用 PDA 的交互式流程处理 RPC 故障
 * - 智能故障检测：连续失败 N 次或失败率超阈值才提醒
 * - 支持暂停/恢复，断点续传
 *
 * 用法：
 *   bun packages/pda/examples/batch-balance.ts
 *
 * 交互式输入或命令行参数：
 *   bun packages/pda/examples/batch-balance.ts --addresses "0x123,0x456" --networks "ethereum,polygon"
 */

import { createApp, z } from '../src/index.js';
// Import from source for development (avoids browser build issue with crypto)
import {
  createTaskHub,
  TaskSource,
  type JobContext,
  type TaskProgress,
  type Job,
} from '../../taskhub/src/index.js';
import { createPublicClient, http, formatUnits, type Address, type PublicClient } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

interface NetworkConfig {
  name: string;
  chainId: number;
  rpc: string;
  symbol: string;
  decimals: number;
}

interface BalanceQuery {
  address: string;
  network: string;
}

interface BalanceResult {
  address: string;
  network: string;
  symbol: string;
  balance: string;
  balanceRaw: string;
}

// ============================================================================
// Network Configuration
// ============================================================================

const NETWORKS: Record<string, NetworkConfig> = {
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
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: 'https://optimism.llamarpc.com',
    symbol: 'ETH',
    decimals: 18,
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://base.llamarpc.com',
    symbol: 'ETH',
    decimals: 18,
  },
};

const CHAIN_MAP: Record<number, typeof mainnet> = {
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
};

// ============================================================================
// RPC Health Monitor
// ============================================================================

interface RPCHealth {
  network: string;
  consecutiveFailures: number;
  totalFailures: number;
  totalRequests: number;
  lastError?: string;
  lastFailureTime?: number;
}

class RPCHealthMonitor {
  private health: Map<string, RPCHealth> = new Map();

  // Thresholds for alerting
  private readonly CONSECUTIVE_FAILURE_THRESHOLD = 5;
  private readonly FAILURE_RATE_THRESHOLD = 0.5; // 50%
  private readonly MIN_REQUESTS_FOR_RATE_CHECK = 10;

  recordSuccess(network: string): void {
    const h = this.getOrCreate(network);
    h.consecutiveFailures = 0;
    h.totalRequests++;
  }

  recordFailure(network: string, error: string): void {
    const h = this.getOrCreate(network);
    h.consecutiveFailures++;
    h.totalFailures++;
    h.totalRequests++;
    h.lastError = error;
    h.lastFailureTime = Date.now();
  }

  /**
   * Check if we should alert the user about RPC issues
   * Returns the problematic networks (if any)
   */
  checkForAlerts(): RPCHealth[] {
    const problems: RPCHealth[] = [];

    for (const h of this.health.values()) {
      // Check consecutive failures
      if (h.consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD) {
        problems.push(h);
        continue;
      }

      // Check failure rate (only if enough requests)
      if (h.totalRequests >= this.MIN_REQUESTS_FOR_RATE_CHECK) {
        const failureRate = h.totalFailures / h.totalRequests;
        if (failureRate >= this.FAILURE_RATE_THRESHOLD) {
          problems.push(h);
        }
      }
    }

    return problems;
  }

  /**
   * Reset consecutive failure count after user acknowledges/changes RPC
   */
  acknowledgeAlert(network: string): void {
    const h = this.health.get(network);
    if (h) {
      h.consecutiveFailures = 0;
    }
  }

  getHealth(network: string): RPCHealth | undefined {
    return this.health.get(network);
  }

  private getOrCreate(network: string): RPCHealth {
    if (!this.health.has(network)) {
      this.health.set(network, {
        network,
        consecutiveFailures: 0,
        totalFailures: 0,
        totalRequests: 0,
      });
    }
    return this.health.get(network)!;
  }
}

// ============================================================================
// Balance Query TaskSource
// ============================================================================

class BalanceQuerySource extends TaskSource<BalanceQuery, BalanceResult> {
  readonly type = 'deterministic' as const;
  private queries: BalanceQuery[];
  private clients: Map<string, PublicClient> = new Map();
  private networkConfigs: Map<string, NetworkConfig>;
  public healthMonitor: RPCHealthMonitor;

  constructor(
    addresses: string[],
    networks: string[],
    customRPCs?: Record<string, string>
  ) {
    super();
    this.healthMonitor = new RPCHealthMonitor();
    this.networkConfigs = new Map();

    // Build network configs (with custom RPCs if provided)
    for (const networkName of networks) {
      const baseConfig = NETWORKS[networkName];
      if (baseConfig) {
        this.networkConfigs.set(networkName, {
          ...baseConfig,
          rpc: customRPCs?.[networkName] ?? baseConfig.rpc,
        });
      }
    }

    // Build queries
    this.queries = [];
    for (const address of addresses) {
      for (const network of networks) {
        if (this.networkConfigs.has(network)) {
          this.queries.push({ address, network });
        }
      }
    }
  }

  getData() {
    return this.queries;
  }

  getJobId(input: BalanceQuery): string {
    return `${input.network}:${input.address}`;
  }

  private getClient(network: string): PublicClient {
    if (!this.clients.has(network)) {
      const config = this.networkConfigs.get(network)!;
      const chain = CHAIN_MAP[config.chainId];

      const client = createPublicClient({
        chain: chain || {
          id: config.chainId,
          name: config.name,
          nativeCurrency: {
            name: config.symbol,
            symbol: config.symbol,
            decimals: config.decimals,
          },
          rpcUrls: { default: { http: [config.rpc] } },
        },
        transport: http(config.rpc),
      });

      this.clients.set(network, client);
    }
    return this.clients.get(network)!;
  }

  /**
   * Update RPC for a network (when user provides new RPC)
   */
  updateRPC(network: string, newRPC: string): void {
    const config = this.networkConfigs.get(network);
    if (config) {
      config.rpc = newRPC;
      // Clear cached client so it recreates with new RPC
      this.clients.delete(network);
      // Reset health monitor
      this.healthMonitor.acknowledgeAlert(network);
    }
  }

  async handler(input: BalanceQuery, ctx: JobContext): Promise<BalanceResult> {
    const client = this.getClient(input.network);
    const config = this.networkConfigs.get(input.network)!;

    try {
      const balanceRaw = await client.getBalance({
        address: input.address as Address,
      });

      this.healthMonitor.recordSuccess(input.network);

      return {
        address: input.address,
        network: input.network,
        symbol: config.symbol,
        balance: formatUnits(balanceRaw, config.decimals),
        balanceRaw: balanceRaw.toString(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.healthMonitor.recordFailure(input.network, errorMsg);
      throw error;
    }
  }

  isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('rate') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('fetch') ||
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
// PDA Application
// ============================================================================

const batchBalanceApp = createApp({
  id: 'batch-balance-query',
  name: 'Batch Balance Query',
  description: 'Query balances for multiple wallets across multiple chains with fault tolerance',
  version: '1.0.0',

  inputSchema: z.object({
    addresses: z
      .string()
      .describe('Wallet addresses (comma-separated)'),
    networks: z
      .string()
      .default('ethereum,polygon,arbitrum')
      .describe('Networks to query (comma-separated)'),
    customRPCs: z
      .string()
      .default('')
      .describe('Custom RPCs as JSON (e.g., {"ethereum":"https://..."})')
  }),

  outputSchema: z.object({
    results: z.array(z.object({
      address: z.string(),
      network: z.string(),
      symbol: z.string(),
      balance: z.string(),
    })),
    stats: z.object({
      total: z.number(),
      success: z.number(),
      failed: z.number(),
      duration: z.number(),
    }),
  }),

  executor: async function* (input, ctx) {
    // Parse inputs
    const addresses = input.addresses
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.startsWith('0x'));

    const networks = input.networks
      .split(',')
      .map((n) => n.trim().toLowerCase())
      .filter((n) => NETWORKS[n]);

    const customRPCs = input.customRPCs && input.customRPCs.trim()
      ? JSON.parse(input.customRPCs)
      : undefined;

    if (addresses.length === 0) {
      throw new Error('No valid addresses provided');
    }

    if (networks.length === 0) {
      throw new Error('No valid networks provided');
    }

    ctx.info(`Querying ${addresses.length} addresses on ${networks.length} networks`);

    // Initialize TaskHub
    const dbDir = join(dirname(new URL(import.meta.url).pathname), 'db');
    await mkdir(dbDir, { recursive: true });

    const hub = await createTaskHub({ dbPath: join(dbDir, 'batch-balance.db') });
    const source = new BalanceQuerySource(addresses, networks, customRPCs);

    const task = await hub.createTask({
      name: `batch-balance-${Date.now()}`,
      source,
      concurrency: { min: 1, max: 5, initial: 3 },
      retry: { maxAttempts: 3, baseDelay: 2000, maxDelay: 10000 },
      timeout: 30000,
    });

    const results: BalanceResult[] = [];
    const failedJobs: Array<{ input: BalanceQuery; error: string }> = [];
    let lastAlertCheck = 0;
    let lastProgressLog = 0;
    const ALERT_CHECK_INTERVAL = 5000; // Check every 5 seconds
    const PROGRESS_LOG_INTERVAL = 3000; // Log progress every 3 seconds

    // Event handlers
    task.on('job:complete', (job) => {
      results.push(job.output!);
    });

    task.on('job:failed', (job, err) => {
      failedJobs.push({ input: job.input, error: err.message });
    });

    task.on('progress', (p: TaskProgress) => {
      const processed = p.completed + p.failed;
      ctx.progress(processed, p.total, `${p.completed} ok, ${p.failed} err, ${p.active} active`);
    });

    task.on('rate-limited', (newConcurrency) => {
      ctx.info(`Rate limited, concurrency reduced to ${newConcurrency}`, 'warning');
    });

    ctx.info(`Starting batch query of ${task.totalJobs} tasks...`);

    // Start task (non-blocking)
    const taskPromise = task.start();

    // Monitor loop - check for RPC health issues periodically
    const startTime = Date.now();
    let taskDone = false;
    let rpcAlertHandled = new Set<string>();

    taskPromise.then(() => {
      taskDone = true;
    });

    while (!taskDone) {
      await new Promise((r) => setTimeout(r, 500));

      const now = Date.now();

      // Periodic progress logging (for long-running tasks)
      if (now - lastProgressLog > PROGRESS_LOG_INTERVAL) {
        lastProgressLog = now;
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        ctx.info(`Progress: ${results.length} completed, ${failedJobs.length} failed, ${elapsed}s elapsed`);
      }

      // Periodic health check
      if (now - lastAlertCheck > ALERT_CHECK_INTERVAL) {
        lastAlertCheck = now;

        const problems = source.healthMonitor.checkForAlerts();
        const newProblems = problems.filter((p) => !rpcAlertHandled.has(p.network));

        if (newProblems.length > 0) {
          // Pause task to get user input
          task.pause();

          for (const problem of newProblems) {
            const failureRate = problem.totalRequests > 0
              ? ((problem.totalFailures / problem.totalRequests) * 100).toFixed(1)
              : '0';

            ctx.info(
              `RPC issues detected on ${problem.network}: ${problem.consecutiveFailures} consecutive failures, ${failureRate}% failure rate`,
              'error'
            );

            // Ask user what to do
            const action = yield* ctx.select(
              `RPC for ${problem.network} appears to be failing. What would you like to do?`,
              [
                { value: 'continue', label: 'Continue anyway (skip failing jobs)' },
                { value: 'change', label: 'Provide a new RPC URL' },
                { value: 'remove', label: `Skip all ${problem.network} queries` },
              ]
            );

            if (action === 'change') {
              const newRPC = yield* ctx.prompt(
                `Enter new RPC URL for ${problem.network}:`,
                { placeholder: 'https://...' }
              );

              if (newRPC && newRPC.startsWith('http')) {
                source.updateRPC(problem.network, newRPC);
                ctx.info(`Updated RPC for ${problem.network}`, 'info');
              }
            }

            rpcAlertHandled.add(problem.network);
            source.healthMonitor.acknowledgeAlert(problem.network);
          }

          // Resume task
          task.resume();
        }
      }
    }

    const duration = Date.now() - startTime;

    // Close hub
    await hub.close();

    // Summary
    const stats = {
      total: task.totalJobs,
      success: results.length,
      failed: failedJobs.length,
      duration,
    };

    ctx.info(`Completed: ${stats.success} success, ${stats.failed} failed in ${(duration / 1000).toFixed(2)}s`);

    // If there are failed jobs, offer to show details
    if (failedJobs.length > 0) {
      const showFailed = yield* ctx.confirm(
        `${failedJobs.length} queries failed. Show details?`
      );

      if (showFailed) {
        for (const f of failedJobs.slice(0, 10)) {
          ctx.info(`${f.input.network}:${f.input.address.slice(0, 10)}... - ${f.error}`, 'warning');
        }
        if (failedJobs.length > 10) {
          ctx.info(`... and ${failedJobs.length - 10} more`, 'warning');
        }
      }
    }

    return {
      results: results.map((r) => ({
        address: r.address,
        network: r.network,
        symbol: r.symbol,
        balance: r.balance,
      })),
      stats,
    };
  },
});

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);

console.log('=== Batch Balance Query (PDA + TaskHub) ===\n');

// Show MCP tool definition
if (args.includes('--mcp')) {
  console.log('MCP Tool Definition:');
  console.log(JSON.stringify(batchBalanceApp.getMCPToolDefinition(), null, 2));
  process.exit(0);
}

// Default addresses for demo
if (!args.some((a) => a.startsWith('--addresses'))) {
  args.push(
    '--addresses',
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'
  );
}

batchBalanceApp.runCLI(args).then((result) => {
  if (result.success && result.data) {
    console.log('\n=== Balance Summary ===\n');

    // Group by address
    const byAddress = new Map<string, typeof result.data.results>();
    for (const r of result.data.results) {
      if (!byAddress.has(r.address)) {
        byAddress.set(r.address, []);
      }
      byAddress.get(r.address)!.push(r);
    }

    for (const [addr, balances] of byAddress) {
      console.log(`${addr.slice(0, 10)}...${addr.slice(-6)}`);
      for (const b of balances) {
        const value = parseFloat(b.balance);
        const display = value > 0 ? value.toFixed(6) : '0';
        console.log(`  ${b.network.padEnd(10)} ${b.symbol.padEnd(6)} ${display}`);
      }
      console.log();
    }
  }

  process.exit(result.success ? 0 : 1);
});
