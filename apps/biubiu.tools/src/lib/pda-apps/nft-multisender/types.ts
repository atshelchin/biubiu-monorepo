import type { Address, Hex } from 'viem';

// ── Network Config ──────────────────────────────────────────────────────

export interface NftMultisenderNetworkConfig {
    name: string;
    chainId: number;
    rpcs: string[];
    symbol: string;
    erc721DistributionAddress: Address;
    erc1155DistributionAddress: Address;
    explorerUrl: string;
}

// ── Input Types ─────────────────────────────────────────────────────────

export type NftType = 'erc721' | 'erc1155';

export interface NftRecipient {
    address: Address;
    tokenId: string;
    /** Only for ERC1155 */
    amount?: string;
}

export interface ValidatedInput {
    recipients: NftRecipient[];
    network: string;
    nftType: NftType;
    nftAddress: Address;
    batchSize: number;
    batches: NftBatchInput[];
}

// ── Batch Types (TaskHub job input/output) ──────────────────────────────

export interface NftBatchInput {
    batchIndex: number;
    recipients: Address[];
    tokenIds: string[];
    /** Only present for ERC1155 */
    amounts?: string[];
}

export interface NftBatchOutput {
    batchIndex: number;
    txHash: Hex;
    successCount: number;
    failedIndices: number[];
    /** ERC721 only: token IDs that failed to transfer */
    failedTokenIds?: string[];
    /** ERC721: equals successCount; ERC1155: sum of amounts sent */
    totalSent: string;
    gasUsed?: string;
}

// ── Result Types ────────────────────────────────────────────────────────

export interface BatchFailure {
    batchIndex: number;
    error: string;
}

export interface RunResult {
    batchResults: NftBatchOutput[];
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
