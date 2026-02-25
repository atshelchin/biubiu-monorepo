import { z } from '@shelchin/pda';

export const inputSchema = z.object({
    recipients: z.string().describe(
        'Recipients list: one "address,amount" per line'
    ),
    network: z.string().default('ethereum').describe('Network to send on'),
    tokenType: z.enum(['native', 'erc20']).default('native').describe('Token type'),
    tokenAddress: z.string().optional().describe('ERC20 token contract address'),
    distributionMode: z.enum(['specified', 'equal']).default('specified').describe(
        'specified: use amounts from input; equal: divide totalAmount equally'
    ),
    totalAmount: z.string().optional().describe(
        'Total amount to distribute equally (required for equal mode)'
    ),
    batchSize: z.number().min(1).max(500).default(200).describe(
        'Recipients per transaction batch'
    ),
});

export const outputSchema = z.object({
    batches: z.array(
        z.object({
            batchIndex: z.number(),
            txHash: z.string(),
            totalSent: z.string(),
            successCount: z.number(),
            failedCount: z.number(),
            explorerUrl: z.string().optional(),
        })
    ),
    stats: z.object({
        totalBatches: z.number(),
        successBatches: z.number(),
        failedBatches: z.number(),
        totalRecipients: z.number(),
        totalSent: z.string(),
        totalSuccessCount: z.number(),
        totalFailedIndices: z.number(),
        duration: z.number(),
    }),
});
