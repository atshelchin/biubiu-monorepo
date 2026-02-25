import type { Address, Hex } from 'viem';

// ── Network Config ──────────────────────────────────────────────────────

export interface MultisenderNetworkConfig {
    name: string;
    chainId: number;
    rpcs: string[];
    symbol: string;
    decimals: number;
    ethDistributionAddress: Address;
    erc20DistributionAddress: Address;
    explorerUrl: string;
}

// ── Input Types ─────────────────────────────────────────────────────────

export type TokenType = 'native' | 'erc20';
export type DistributionMode = 'specified' | 'equal';

export interface Recipient {
    address: Address;
    amount: bigint;
}

export interface ValidatedInput {
    recipients: Recipient[];
    network: string;
    tokenType: TokenType;
    tokenAddress: Address | null;
    distributionMode: DistributionMode;
    totalAmount: bigint;
    batchSize: number;
    batches: BatchInput[];
}

// ── Batch Types (TaskHub job input/output) ──────────────────────────────

export interface BatchInput {
    batchIndex: number;
    recipients: Address[];
    /** Stored as hex strings for JSON serialization in TaskHub */
    amounts: string[];
    /** Stored as hex string for JSON serialization */
    totalValue: string;
}

export interface BatchOutput {
    batchIndex: number;
    txHash: Hex;
    totalSent: string;
    successCount: number;
    failedIndices: number[];
    gasUsed?: string;
}

// ── Result Types ────────────────────────────────────────────────────────

export interface BatchFailure {
    batchIndex: number;
    error: string;
}

export interface RunResult {
    batchResults: BatchOutput[];
    failures: BatchFailure[];
    duration: number;
}

// ── Wallet Dependency Injection ─────────────────────────────────────────

export interface TransactionRequest {
    to: Address;
    data: Hex;
    value?: bigint;
}

export interface TransactionReceipt {
    transactionHash: Hex;
    status: 'success' | 'reverted';
    gasUsed: bigint;
    blockNumber: bigint;
}

export interface ReadContractParams {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
}

export interface WalletDeps {
    account: Address;
    sendTransaction: (tx: TransactionRequest) => Promise<Hex>;
    waitForTransactionReceipt: (hash: Hex) => Promise<TransactionReceipt>;
    readContract: (params: ReadContractParams) => Promise<unknown>;
    getBalance: (address: Address) => Promise<bigint>;
}
