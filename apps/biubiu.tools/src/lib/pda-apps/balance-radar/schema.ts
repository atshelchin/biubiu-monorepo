import { z } from '@shelchin/pda';

export const inputSchema = z.object({
    addresses: z.string().describe('Wallet addresses (comma-separated)'),
    networks: z
        .array(z.string())
        .default(['ethereum'])
        .describe('Networks to query'),
});

export const outputSchema = z.object({
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
});
