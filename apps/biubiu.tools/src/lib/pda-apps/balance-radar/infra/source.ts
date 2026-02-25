import { formatUnits } from 'viem';
import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type { BalanceQuery, BalanceResult } from '../types';
import { NETWORKS, CHAIN_MAP } from './networks';
import { createNetworkPools } from '$lib/evm/network-pool';

export class BalanceQuerySource extends TaskSource<BalanceQuery, BalanceResult> {
    readonly type = 'deterministic' as const;
    private pools = createNetworkPools(NETWORKS, CHAIN_MAP);
    private queries: BalanceQuery[];

    constructor(queries: BalanceQuery[]) {
        super();
        this.queries = queries;
    }

    getData(): BalanceQuery[] {
        return this.queries;
    }

    async handler(input: BalanceQuery, ctx: JobContext): Promise<BalanceResult> {
        const pool = this.pools.get(input.network);
        if (!pool) {
            throw new Error(`Unknown network: ${input.network}`);
        }

        const config = NETWORKS[input.network];
        const { result } = await pool.do({
            address: input.address,
            network: input.network,
        });

        return {
            address: input.address,
            network: input.network,
            symbol: config.symbol,
            balance: formatUnits(result.balance, config.decimals),
            balanceRaw: result.balance.toString(),
        };
    }
}
