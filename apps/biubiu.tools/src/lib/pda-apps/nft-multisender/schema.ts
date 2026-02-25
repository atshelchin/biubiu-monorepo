import { z } from '@shelchin/pda';

export const inputSchema = z.object({
    recipients: z.string().describe(
        'Recipients list: "address,tokenId" per line (ERC721) or "address,tokenId,amount" per line (ERC1155)'
    ),
    network: z.string().default('ethereum').describe('Network to send on'),
    nftType: z.enum(['erc721', 'erc1155']).default('erc721').describe('NFT standard type'),
    nftAddress: z.string().describe('NFT collection contract address'),
    batchSize: z.number().min(1).max(200).default(50).describe(
        'Recipients per transaction batch'
    ),
});

export const outputSchema = z.object({
    batches: z.array(
        z.object({
            batchIndex: z.number(),
            txHash: z.string(),
            successCount: z.number(),
            failedCount: z.number(),
            totalSent: z.string(),
            explorerUrl: z.string().optional(),
        })
    ),
    stats: z.object({
        totalBatches: z.number(),
        successBatches: z.number(),
        failedBatches: z.number(),
        totalRecipients: z.number(),
        totalSuccessCount: z.number(),
        totalFailedIndices: z.number(),
        totalSent: z.string(),
        duration: z.number(),
    }),
});
