/**
 * Batch Balance Query - PDA Application Definition
 *
 * This is the headless app logic that can be used with any adapter (GUI, CLI, MCP).
 * Uses TaskHub for job management and VendorPool for RPC failover.
 */

import { createApp, z } from '@shelchin/pda';
import { createPublicClient, http, formatUnits, defineChain, type Address } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';

// Define Endurance chain (not in viem's default chains)
const endurance = defineChain({
  id: 648,
  name: 'Endurance',
  nativeCurrency: { name: 'ACE', symbol: 'ACE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-endurance.fusionist.io'] },
  },
  blockExplorers: {
    default: { name: 'Endurance Explorer', url: 'https://explorer-endurance.fusionist.io' },
  },
});
import { Hub, IndexedDBAdapter, TaskSource, type Job, type JobContext } from '@shelchin/taskhub/browser';
import { Pool, Vendor, ErrorType } from '@shelchin/vendor-pool';

// ============================================================================
// Types & Config
// ============================================================================

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcs: string[]; // Multiple RPCs for failover
  symbol: string;
  decimals: number;
}

interface BalanceResult {
  address: string;
  network: string;
  symbol: string;
  balance: string;
  balanceRaw: string;
}

interface RPCInput {
  address: string;
  network: string;
}

interface RPCOutput {
  balance: bigint;
}

interface BalanceQuery {
  address: string;
  network: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcs: [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
    ],
    symbol: 'ETH',
    decimals: 18,
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpcs: [
      'https://polygon.llamarpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon-bor.publicnode.com',
    ],
    symbol: 'MATIC',
    decimals: 18,
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpcs: [
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum-one.publicnode.com',
    ],
    symbol: 'ETH',
    decimals: 18,
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpcs: [
      'https://optimism.llamarpc.com',
      'https://rpc.ankr.com/optimism',
      'https://optimism.publicnode.com',
    ],
    symbol: 'ETH',
    decimals: 18,
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcs: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base.publicnode.com',
    ],
    symbol: 'ETH',
    decimals: 18,
  },
  endurance: {
    name: 'Endurance',
    chainId: 648,
    rpcs: [
      'https://rpc-endurance.fusionist.io',
    ],
    symbol: 'ACE',
    decimals: 18,
  },
};

const CHAIN_MAP = {
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
  648: endurance,
} as const;

// ============================================================================
// RPC Vendor - Wraps a single RPC endpoint
// ============================================================================

class RPCVendor extends Vendor<RPCInput, RPCOutput> {
  readonly id: string;
  private rpcUrl: string;
  private chain: (typeof CHAIN_MAP)[keyof typeof CHAIN_MAP];

  constructor(
    id: string,
    rpcUrl: string,
    chain: (typeof CHAIN_MAP)[keyof typeof CHAIN_MAP],
    weight: number = 1
  ) {
    super({ weight });
    this.id = id;
    this.rpcUrl = rpcUrl;
    this.chain = chain;
  }

  async execute(input: RPCInput): Promise<RPCOutput> {
    const client = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    const balance = await client.getBalance({
      address: input.address as Address,
    });

    return { balance };
  }

  classifyError(error: unknown): ErrorType {
    if (!(error instanceof Error)) {
      return ErrorType.UNKNOWN;
    }
    const msg = error.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
      return ErrorType.RATE_LIMIT;
    }
    if (
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound')
    ) {
      return ErrorType.SERVER_ERROR;
    }
    return ErrorType.UNKNOWN;
  }
}

// ============================================================================
// Create VendorPools for each network
// ============================================================================

function createNetworkPools(): Map<string, Pool<RPCInput, RPCOutput>> {
  const pools = new Map<string, Pool<RPCInput, RPCOutput>>();

  for (const [networkName, config] of Object.entries(NETWORKS)) {
    const chain = CHAIN_MAP[config.chainId as keyof typeof CHAIN_MAP];
    const vendors = config.rpcs.map((rpc, idx) => {
      // Primary RPC has higher weight
      const weight = idx === 0 ? 3 : 1;
      return new RPCVendor(`${networkName}-rpc-${idx}`, rpc, chain, weight);
    });

    const pool = new Pool<RPCInput, RPCOutput>(vendors, {
      maxRetries: 3,
      timeout: 15000,
    });

    pools.set(networkName, pool);
  }

  return pools;
}

// ============================================================================
// Balance Query Task Source - Uses VendorPool for failover
// ============================================================================

class BalanceQuerySource extends TaskSource<BalanceQuery, BalanceResult> {
  readonly type = 'deterministic' as const;
  private pools: Map<string, Pool<RPCInput, RPCOutput>>;
  private queries: BalanceQuery[];

  constructor(queries: BalanceQuery[]) {
    super();
    this.queries = queries;
    this.pools = createNetworkPools();
  }

  getData(): BalanceQuery[] {
    return this.queries;
  }

  async handler(input: BalanceQuery, ctx: JobContext): Promise<BalanceResult> {
    const pool = this.pools.get(input.network);
    if (!pool) {
      throw new Error(`Unknown network: ${input.network}`);
    }

    const config = NETWORKS[input.network];
    const { result } = await pool.do({
      address: input.address,
      network: input.network,
    });

    return {
      address: input.address,
      network: input.network,
      symbol: config.symbol,
      balance: formatUnits(result.balance, config.decimals),
      balanceRaw: result.balance.toString(),
    };
  }
}

// ============================================================================
// PDA Application
// ============================================================================

export const batchBalanceApp = createApp({
  id: 'batch-balance-query',
  name: 'Batch Balance Query',
  description: 'Query ETH balances for multiple wallet addresses across different chains',
  version: '1.0.0',

  inputSchema: z.object({
    addresses: z.string().describe('Wallet addresses (comma-separated)'),
    networks: z
      .array(z.string())
      .default(['ethereum'])
      .describe('Networks to query'),
  }),

  outputSchema: z.object({
    results: z.array(
      z.object({
        address: z.string(),
        network: z.string(),
        symbol: z.string(),
        balance: z.string(),
      })
    ),
    stats: z.object({
      total: z.number(),
      success: z.number(),
      failed: z.number(),
      duration: z.number(),
    }),
  }),

  executor: async function* (input, ctx) {
    const addresses = input.addresses
      .split(/[,\n]/)
      .map((a) => a.trim())
      .filter((a) => a.startsWith('0x') && a.length === 42);

    const networks = input.networks.filter((n) => NETWORKS[n]);

    if (addresses.length === 0) {
      throw new Error(
        'No valid addresses provided. Addresses must start with 0x and be 42 characters long.'
      );
    }

    if (networks.length === 0) {
      throw new Error('No valid networks selected.');
    }

    const totalQueries = addresses.length * networks.length;
    ctx.info(
      `Starting batch query: ${addresses.length} addresses × ${networks.length} networks = ${totalQueries} queries`
    );
    ctx.info(`Using TaskHub with IndexedDB storage and VendorPool for RPC failover`);

    const startTime = Date.now();

    // Generate all query jobs
    const queries: BalanceQuery[] = [];
    for (const address of addresses) {
      for (const networkName of networks) {
        queries.push({ address, network: networkName });
      }
    }

    // Create source with queries
    const source = new BalanceQuerySource(queries);

    // Initialize TaskHub with IndexedDB storage (browser-compatible)
    const storage = new IndexedDBAdapter();
    const hub = new Hub(storage);
    await hub.initialize();

    // Track results and failures
    const results: BalanceResult[] = [];
    const failures: Array<{ address: string; network: string; error: string }> = [];
    let completed = 0;
    const consecutiveNetworkFailures: Map<string, number> = new Map();
    const FAILURE_THRESHOLD = 3;

    // Create the task with source
    const task = await hub.createTask({
      name: `Balance Query - ${new Date().toISOString()}`,
      source,
      concurrency: { min: 1, max: 10, initial: 5 },
    });

    ctx.info(`Created task ${task.id} with ${queries.length} jobs`);

    // Listen to task events for progress tracking
    task.on('job:complete', (job: Job<BalanceQuery, BalanceResult>) => {
      completed++;
      const result = job.output;
      if (result) {
        results.push(result);
        consecutiveNetworkFailures.set(result.network, 0);
        ctx.progress(
          completed,
          totalQueries,
          `Queried ${result.network}: ${result.address.slice(0, 10)}...`
        );
      }
    });

    task.on('job:failed', (job: Job<BalanceQuery, BalanceResult>, error: Error) => {
      completed++;
      const jobInput = job.input;
      const errorMsg = error.message;
      failures.push({ address: jobInput.address, network: jobInput.network, error: errorMsg });

      // Track consecutive failures per network
      const count = (consecutiveNetworkFailures.get(jobInput.network) ?? 0) + 1;
      consecutiveNetworkFailures.set(jobInput.network, count);

      ctx.progress(
        completed,
        totalQueries,
        `Failed ${jobInput.network}: ${jobInput.address.slice(0, 10)}...`
      );
    });

    // Poll for network issues while running
    const pollInterval = setInterval(() => {
      for (const [network, count] of consecutiveNetworkFailures) {
        if (count >= FAILURE_THRESHOLD) {
          ctx.info(`High failure rate on ${network}: ${count} consecutive failures`, 'warning');
        }
      }
    }, 2000);

    try {
      // Start the task and wait for completion
      await task.start();
    } finally {
      clearInterval(pollInterval);
      await hub.close();
    }

    const duration = Date.now() - startTime;

    // Summary with user interaction
    if (failures.length > 0) {
      const showDetails = yield* ctx.confirm(`${failures.length} queries failed. Show details?`);

      if (showDetails) {
        for (const f of failures.slice(0, 5)) {
          ctx.info(`${f.network}:${f.address.slice(0, 10)}... - ${f.error}`, 'warning');
        }
        if (failures.length > 5) {
          ctx.info(`... and ${failures.length - 5} more failures`, 'warning');
        }
      }
    }

    ctx.info(
      `Completed in ${(duration / 1000).toFixed(2)}s: ${results.length} success, ${failures.length} failed`
    );

    return {
      results: results.map((r) => ({
        address: r.address,
        network: r.network,
        symbol: r.symbol,
        balance: r.balance,
      })),
      stats: {
        total: totalQueries,
        success: results.length,
        failed: failures.length,
        duration,
      },
    };
  },
});

export type BatchBalanceInput = z.infer<typeof batchBalanceApp.manifest.inputSchema>;
export type BatchBalanceOutput = z.infer<typeof batchBalanceApp.manifest.outputSchema>;
