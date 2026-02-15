/**
 * Send Transaction - PDA Application Definition
 *
 * Demonstrates a transaction sending flow with:
 * - Network selection (built-in + custom networks)
 * - Token selection (native + ERC20 tokens)
 * - Address input with validation
 * - Amount input with balance checking
 */

import { createApp, z } from '@shelchin/pda';

// ============================================================================
// Types & Schemas
// ============================================================================

export const networkSchema = z.object({
  chainId: z.number(),
  name: z.string(),
  rpcUrls: z.array(z.string().url()).min(1), // Support multiple RPCs
  nativeSymbol: z.string(),
  explorerUrl: z.string().url().optional(),
  // Optional: required contracts that must be deployed
  requiredContracts: z
    .array(
      z.object({
        name: z.string(),
        address: z.string(),
        // bytecode hash to verify deployment
        bytecodeHash: z.string().optional(),
      })
    )
    .optional(),
});

export const tokenSchema = z.object({
  type: z.enum(['native', 'erc20']),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  contractAddress: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type NetworkConfig = z.infer<typeof networkSchema>;
export type TokenConfig = z.infer<typeof tokenSchema>;

// ============================================================================
// Network Validation Utilities
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: unknown;
}

export interface ContractDeploymentStatus {
  name: string;
  address: string;
  deployed: boolean;
  bytecodeMatch?: boolean;
}

/**
 * Verify RPC endpoint returns the expected chainId
 */
export async function verifyRpcChainId(rpcUrl: string, expectedChainId: number): Promise<ValidationResult> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      return { valid: false, error: `RPC request failed: ${response.status}` };
    }

    const data = await response.json();
    if (data.error) {
      return { valid: false, error: data.error.message };
    }

    const actualChainId = parseInt(data.result, 16);
    if (actualChainId !== expectedChainId) {
      return {
        valid: false,
        error: `Chain ID mismatch: expected ${expectedChainId}, got ${actualChainId}`,
        data: { actualChainId },
      };
    }

    return { valid: true, data: { chainId: actualChainId } };
  } catch (error) {
    return { valid: false, error: `RPC connection failed: ${(error as Error).message}` };
  }
}

/**
 * Check if a contract is deployed at the given address
 */
export async function checkContractDeployed(
  rpcUrl: string,
  address: string,
  expectedBytecodeHash?: string
): Promise<ValidationResult> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [address, 'latest'],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error) {
      return { valid: false, error: data.error.message };
    }

    const code = data.result;
    if (code === '0x' || code === '0x0') {
      return { valid: false, error: 'No contract deployed at this address' };
    }

    // If bytecode hash is provided, verify it matches
    if (expectedBytecodeHash) {
      const actualHash = await hashBytecode(code);
      if (actualHash !== expectedBytecodeHash) {
        return {
          valid: false,
          error: 'Contract bytecode does not match expected',
          data: { actualHash },
        };
      }
    }

    return { valid: true, data: { codeLength: code.length } };
  } catch (error) {
    return { valid: false, error: `Contract check failed: ${(error as Error).message}` };
  }
}

/**
 * Fetch ERC20 token metadata from contract
 */
export async function fetchERC20Metadata(
  rpcUrl: string,
  contractAddress: string
): Promise<ValidationResult & { data?: { name: string; symbol: string; decimals: number } }> {
  try {
    // ERC20 function selectors
    const NAME_SELECTOR = '0x06fdde03'; // name()
    const SYMBOL_SELECTOR = '0x95d89b41'; // symbol()
    const DECIMALS_SELECTOR = '0x313ce567'; // decimals()

    const [nameResult, symbolResult, decimalsResult] = await Promise.all([
      callContract(rpcUrl, contractAddress, NAME_SELECTOR),
      callContract(rpcUrl, contractAddress, SYMBOL_SELECTOR),
      callContract(rpcUrl, contractAddress, DECIMALS_SELECTOR),
    ]);

    if (!nameResult.valid || !symbolResult.valid || !decimalsResult.valid) {
      return { valid: false, error: 'Not a valid ERC20 token (missing required methods)' };
    }

    const name = decodeString(nameResult.data as string);
    const symbol = decodeString(symbolResult.data as string);
    const decimals = parseInt(decimalsResult.data as string, 16);

    if (!name || !symbol || isNaN(decimals)) {
      return { valid: false, error: 'Failed to decode ERC20 metadata' };
    }

    return {
      valid: true,
      data: { name, symbol, decimals },
    };
  } catch (error) {
    return { valid: false, error: `ERC20 validation failed: ${(error as Error).message}` };
  }
}

// Helper: Call a contract method
async function callContract(
  rpcUrl: string,
  to: string,
  data: string
): Promise<ValidationResult> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
        id: 1,
      }),
    });

    const result = await response.json();
    if (result.error) {
      return { valid: false, error: result.error.message };
    }

    if (result.result === '0x' || !result.result) {
      return { valid: false, error: 'Empty response' };
    }

    return { valid: true, data: result.result };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

// Helper: Decode ABI-encoded string
function decodeString(hex: string): string {
  try {
    // Remove 0x prefix
    const data = hex.slice(2);

    // Check if it's a dynamic string (offset + length + data)
    if (data.length >= 128) {
      // Read offset (first 32 bytes)
      const offset = parseInt(data.slice(0, 64), 16) * 2;
      // Read length (32 bytes at offset)
      const length = parseInt(data.slice(offset, offset + 64), 16);
      // Read string data
      const stringData = data.slice(offset + 64, offset + 64 + length * 2);
      return hexToString(stringData);
    }

    // Try direct bytes32 encoding (some tokens use this)
    return hexToString(data).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function hexToString(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

// Helper: Simple hash for bytecode comparison
async function hashBytecode(bytecode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(bytecode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Built-in Networks
// ============================================================================

export const BUILTIN_NETWORKS: NetworkConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrls: [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
    ],
    nativeSymbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrls: [
      'https://polygon.llamarpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon-bor.publicnode.com',
    ],
    nativeSymbol: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
  },
  {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrls: [
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum-one.publicnode.com',
    ],
    nativeSymbol: 'ETH',
    explorerUrl: 'https://arbiscan.io',
  },
  {
    chainId: 10,
    name: 'Optimism',
    rpcUrls: [
      'https://optimism.llamarpc.com',
      'https://rpc.ankr.com/optimism',
      'https://optimism.publicnode.com',
    ],
    nativeSymbol: 'ETH',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  {
    chainId: 8453,
    name: 'Base',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base.publicnode.com',
    ],
    nativeSymbol: 'ETH',
    explorerUrl: 'https://basescan.org',
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc.publicnode.com',
    ],
    nativeSymbol: 'BNB',
    explorerUrl: 'https://bscscan.com',
  },
];

// ============================================================================
// Built-in Tokens (per network)
// ============================================================================

export const BUILTIN_TOKENS: Record<number, TokenConfig[]> = {
  // Ethereum
  1: [
    { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    {
      type: 'erc20',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      contractAddress: '0x6B175474E89094C44Da98b954EescdCF0E2D036',
    },
    {
      type: 'erc20',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  ],
  // Polygon
  137: [
    { type: 'native', symbol: 'MATIC', name: 'Polygon', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
  ],
  // Arbitrum
  42161: [
    { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    {
      type: 'erc20',
      symbol: 'ARB',
      name: 'Arbitrum',
      decimals: 18,
      contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    },
  ],
  // Optimism
  10: [
    { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    },
    {
      type: 'erc20',
      symbol: 'OP',
      name: 'Optimism',
      decimals: 18,
      contractAddress: '0x4200000000000000000000000000000000000042',
    },
  ],
  // Base
  8453: [
    { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  ],
  // BNB Chain
  56: [
    { type: 'native', symbol: 'BNB', name: 'BNB', decimals: 18 },
    {
      type: 'erc20',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    },
    {
      type: 'erc20',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    {
      type: 'erc20',
      symbol: 'BUSD',
      name: 'Binance USD',
      decimals: 18,
      contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    },
  ],
};

// ============================================================================
// PDA Application
// ============================================================================

// Combined config schema for network + token (enables linked renderer)
export const networkTokenConfigSchema = z.object({
  network: networkSchema,
  token: tokenSchema,
});

export type NetworkTokenConfig = z.infer<typeof networkTokenConfigSchema>;

export const sendTransactionApp = createApp({
  id: 'send-transaction',
  name: 'Send Transaction',
  description: 'Send native tokens or ERC20 tokens to any address',
  version: '1.0.0',

  inputSchema: z.object({
    // Combined field so renderer can manage network-token linkage
    config: networkTokenConfigSchema.describe('Network and token configuration'),
    recipient: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
      .describe('Recipient address'),
    amount: z.string().regex(/^\d+\.?\d*$/, 'Invalid amount format').describe('Amount to send'),
  }),

  outputSchema: z.object({
    txHash: z.string(),
    status: z.enum(['pending', 'confirmed', 'failed']),
    network: z.string(),
    token: z.string(),
    amount: z.string(),
    recipient: z.string(),
    explorerUrl: z.string().optional(),
    gasUsed: z.string().optional(),
    blockNumber: z.number().optional(),
  }),

  executor: async function* (input, ctx) {
    const { config, recipient, amount } = input;
    const { network, token } = config;

    ctx.info(`Preparing transaction on ${network.name}`);
    ctx.info(`Sending ${amount} ${token.symbol} to ${recipient.slice(0, 10)}...`);

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount: must be a positive number');
    }

    // Confirmation step
    const confirmed = yield* ctx.confirm(
      `Send ${amount} ${token.symbol} to ${recipient}?\n\nNetwork: ${network.name}\nToken: ${token.name}${token.type === 'erc20' ? `\nContract: ${token.contractAddress}` : ''}`
    );

    if (!confirmed) {
      throw new Error('Transaction cancelled by user');
    }

    ctx.progress(0, 100, 'Preparing transaction...');

    // Simulate transaction preparation
    await sleep(500);
    ctx.progress(20, 100, 'Estimating gas...');

    await sleep(300);
    const gasEstimate = token.type === 'native' ? '21000' : '65000';
    ctx.info(`Gas estimate: ${gasEstimate}`);
    ctx.progress(40, 100, 'Signing transaction...');

    await sleep(400);
    ctx.progress(60, 100, 'Broadcasting transaction...');

    // Simulate broadcasting
    await sleep(600);
    const txHash = `0x${generateRandomHex(64)}`;
    ctx.info(`Transaction broadcast: ${txHash}`);
    ctx.progress(80, 100, 'Waiting for confirmation...');

    // Simulate confirmation
    await sleep(800);
    const blockNumber = 19000000 + Math.floor(Math.random() * 100000);
    ctx.progress(100, 100, 'Transaction confirmed!');

    const explorerUrl = network.explorerUrl
      ? `${network.explorerUrl}/tx/${txHash}`
      : undefined;

    return {
      txHash,
      status: 'confirmed' as const,
      network: network.name,
      token: token.symbol,
      amount,
      recipient,
      explorerUrl,
      gasUsed: gasEstimate,
      blockNumber,
    };
  },
});

// Helper functions
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRandomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export type SendTransactionInput = z.infer<typeof sendTransactionApp.manifest.inputSchema>;
export type SendTransactionOutput = z.infer<typeof sendTransactionApp.manifest.outputSchema>;
