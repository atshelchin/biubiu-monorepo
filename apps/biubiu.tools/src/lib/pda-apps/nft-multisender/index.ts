import { createApp, z } from '@shelchin/pda';
import { createExecutor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';
import type { WalletDeps } from './types.js';

export function createNftMultisenderApp(wallet: WalletDeps) {
    return createApp({
        id: 'nft-multisender',
        name: 'NFT Multisender',
        description: 'Distribute ERC721 and ERC1155 NFTs to multiple recipients in batches',
        version: '1.0.0',
        inputSchema,
        outputSchema,
        executor: createExecutor(wallet),
    });
}

export type { WalletDeps } from './types.js';
export type NftMultisenderInput = z.infer<typeof inputSchema>;
export type NftMultisenderOutput = z.infer<typeof outputSchema>;
