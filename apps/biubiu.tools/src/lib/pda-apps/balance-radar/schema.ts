import { z } from '@shelchin/pda';

export const tokenSpecSchema = z.object({
    kind: z.enum(['native', 'erc20']),
    address: z.string().optional().describe('ERC20 contract address (omit for native)'),
    symbol: z.string(),
    decimals: z.number(),
});

export const networkConfigSchema = z.object({
    name: z.string(),
    chainId: z.number(),
    rpcs: z.array(z.string()),
    symbol: z.string(),
    decimals: z.number().default(18),
    hasMulticall3: z.boolean().optional(),
});

export const inputSchema = z.object({
    addresses: z.string().describe('Wallet addresses (comma-separated)'),
    networks: z
        .array(z.string())
        .default(['ethereum'])
        .describe('Networks to query'),
    tokenSelections: z
        .array(
            z.object({
                network: z.string(),
                tokens: z.array(tokenSpecSchema),
            }),
        )
        .optional()
        .describe('Per-network token selection; omit to query native coins only'),
    customNetworks: z
        .array(networkConfigSchema)
        .optional()
        .describe('User-defined EVM networks to merge into the registry'),
});

export const outputSchema = z.object({
    results: z.array(
        z.object({
            address: z.string(),
            network: z.string(),
            symbol: z.string(),
            tokenAddress: z.string().optional(),
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
