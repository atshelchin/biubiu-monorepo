import { createApp, z } from '@shelchin/pda';
import { createExecutor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';
import type { TaskHubDeps } from './types.js';

export function createBalanceRadarApp(deps: TaskHubDeps) {
    return createApp({
        id: 'balance-radar',
        name: 'Balance Radar',
        description: 'Query ETH balances for multiple wallet addresses across different chains',
        version: '1.0.0',
        inputSchema,
        outputSchema,
        executor: createExecutor(deps),
    });
}

export type BalanceRadarInput = z.infer<typeof inputSchema>;
export type BalanceRadarOutput = z.infer<typeof outputSchema>;
