import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type {
    BatchInput,
    BatchOutput,
    WalletDeps,
    MultisenderNetworkConfig,
    TokenType,
} from '../types';
import type { Address } from 'viem';
import {
    buildNativeDistributeTx,
    buildERC20DistributeTx,
} from './contracts';

export class TransferBatchSource extends TaskSource<BatchInput, BatchOutput> {
    readonly type = 'deterministic' as const;

    private batches: BatchInput[];
    private wallet: WalletDeps;
    private networkConfig: MultisenderNetworkConfig;
    private tokenType: TokenType;
    private tokenAddress: Address | null;

    constructor(
        batches: BatchInput[],
        wallet: WalletDeps,
        networkConfig: MultisenderNetworkConfig,
        tokenType: TokenType,
        tokenAddress: Address | null,
    ) {
        super();
        this.batches = batches;
        this.wallet = wallet;
        this.networkConfig = networkConfig;
        this.tokenType = tokenType;
        this.tokenAddress = tokenAddress;
    }

    getData(): BatchInput[] {
        return this.batches;
    }

    async handler(input: BatchInput, _ctx: JobContext): Promise<BatchOutput> {
        // 1. Build the transaction
        const tx = this.tokenType === 'native'
            ? buildNativeDistributeTx(this.networkConfig.ethDistributionAddress, input)
            : buildERC20DistributeTx(
                this.networkConfig.erc20DistributionAddress,
                this.tokenAddress!,
                input,
            );

        // 2. Send transaction (triggers wallet popup)
        const txHash = await this.wallet.sendTransaction(tx);

        // 3. Wait for receipt
        const receipt = await this.wallet.waitForTransactionReceipt(txHash);

        if (receipt.status === 'reverted') {
            throw new Error(
                `Transaction reverted: batch ${input.batchIndex}, tx ${txHash}`
            );
        }

        // 4. Return result
        return {
            batchIndex: input.batchIndex,
            txHash,
            totalSent: input.totalValue,
            successCount: input.recipients.length,
            failedIndices: [],
            gasUsed: receipt.gasUsed.toString(),
        };
    }

    getJobId(input: BatchInput): string {
        return `batch-${input.batchIndex}-${input.recipients.length}-${input.totalValue}`;
    }

    isRetryable(error: unknown): boolean {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
                return false;
            }
            if (msg.includes('reverted')) {
                return false;
            }
            if (msg.includes('timeout') || msg.includes('network')) {
                return true;
            }
        }
        return false;
    }

    isRateLimited(): boolean {
        return false;
    }
}
