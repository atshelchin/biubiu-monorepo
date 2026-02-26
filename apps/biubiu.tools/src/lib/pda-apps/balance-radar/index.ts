import { createApp, z } from '@shelchin/pda';
import { executor, } from './executor.js';
import { inputSchema, outputSchema } from "./schema.js"

export const balanceRadarApp = createApp({
    id: 'balance-radar',
    name: 'Balance Radar',
    description: 'Query ETH balances for multiple wallet addresses across different chains',
    version: '1.0.0',
    inputSchema,
    outputSchema,
    executor,
});

export type BalanceRadarInput = z.infer<typeof balanceRadarApp.manifest.inputSchema>;
export type BalanceRadarOutput = z.infer<typeof balanceRadarApp.manifest.outputSchema>;
