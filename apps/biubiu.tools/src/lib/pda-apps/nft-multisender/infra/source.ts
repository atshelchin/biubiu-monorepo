import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type {
    NftBatchInput,
    NftBatchOutput,
    WalletDeps,
    NftMultisenderNetworkConfig,
    NftType,
} from '../types';
import type { Address } from 'viem';
import {
    buildERC721BatchTransferTx,
    buildERC1155BatchTransferTx,
} from './contracts';

export class NftTransferBatchSource extends TaskSource<NftBatchInput, NftBatchOutput> {
    readonly type = 'deterministic' as const;

    private batches: NftBatchInput[];
    private wallet: WalletDeps;
    private networkConfig: NftMultisenderNetworkConfig;
    private nftType: NftType;
    private nftAddress: Address;

    constructor(
        batches: NftBatchInput[],
        wallet: WalletDeps,
        networkConfig: NftMultisenderNetworkConfig,
        nftType: NftType,
        nftAddress: Address,
    ) {
        super();
        this.batches = batches;
        this.wallet = wallet;
        this.networkConfig = networkConfig;
        this.nftType = nftType;
        this.nftAddress = nftAddress;
    }

    getData(): NftBatchInput[] {
        return this.batches;
    }

    async handler(input: NftBatchInput, _ctx: JobContext): Promise<NftBatchOutput> {
        // 1. Build the transaction based on NFT type
        const tx = this.nftType === 'erc721'
            ? buildERC721BatchTransferTx(
                this.networkConfig.erc721DistributionAddress,
                this.nftAddress,
                input,
            )
            : buildERC1155BatchTransferTx(
                this.networkConfig.erc1155DistributionAddress,
                this.nftAddress,
                input,
            );

        // 2. Send transaction
        const txHash = await this.wallet.sendTransaction(tx);

        // 3. Wait for receipt
        const receipt = await this.wallet.waitForTransactionReceipt(txHash);

        if (receipt.status === 'reverted') {
            throw new Error(
                `Transaction reverted: batch ${input.batchIndex}, tx ${txHash}`
            );
        }

        // 4. Return result
        const totalSent = this.nftType === 'erc721'
            ? input.recipients.length.toString()
            : (input.amounts ?? []).reduce(
                (sum, a) => sum + BigInt(a), 0n
            ).toString();

        return {
            batchIndex: input.batchIndex,
            txHash,
            successCount: input.recipients.length,
            failedIndices: [],
            failedTokenIds: [],
            totalSent,
            gasUsed: receipt.gasUsed.toString(),
        };
    }

    getJobId(input: NftBatchInput): string {
        const firstTokenId = input.tokenIds[0] ?? '0';
        return `nft-batch-${input.batchIndex}-${input.recipients.length}-${firstTokenId}`;
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
