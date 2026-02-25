import { createApp, z } from '@shelchin/pda';
import { createExecutor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';
import type { WalletDeps } from './types.js';

export function createTokenMultisenderApp(wallet: WalletDeps) {
    return createApp({
        id: 'token-multisender',
        name: 'Token Multisender',
        description: 'Distribute native tokens or ERC20 tokens to multiple recipients in batches',
        version: '1.0.0',
        inputSchema,
        outputSchema,
        executor: createExecutor(wallet),
    });
}

export type { WalletDeps } from './types.js';
export type TokenMultisenderInput = z.infer<typeof inputSchema>;
export type TokenMultisenderOutput = z.infer<typeof outputSchema>;
