import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type { Pool } from '@shelchin/vendor-pool';
import type { NetworkJob, NetworkJobResult } from '../types';
import { NETWORKS, CHAIN_MAP } from './networks';
import { createEVMPools } from '$lib/evm/network-pool';
import { createMulticallBalanceCall, createIndividualBalanceCall } from './multicall-balance';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { AddressBalance } from './multicall-balance';

export class BalanceQuerySource extends TaskSource<NetworkJob, NetworkJobResult> {
    readonly type = 'deterministic' as const;
    private pools: Map<string, Pool<EVMCall<AddressBalance[]>, AddressBalance[]>>;
    private jobs: NetworkJob[];

    constructor(addresses: string[], networks: string[], chunkSize: number = 100) {
        super();
        this.pools = createEVMPools<AddressBalance[]>(NETWORKS, CHAIN_MAP);
        this.jobs = this.buildJobs(addresses, networks, chunkSize);
    }

    private buildJobs(addresses: string[], networks: string[], chunkSize: number): NetworkJob[] {
        const jobs: NetworkJob[] = [];
        for (const network of networks) {
            const config = NETWORKS[network];
            if (!config) continue;

            for (let i = 0; i < addresses.length; i += chunkSize) {
                jobs.push({
                    network,
                    addresses: addresses.slice(i, i + chunkSize),
                });
            }
        }
        return jobs;
    }

    getData(): NetworkJob[] {
        return this.jobs;
    }

    async handler(input: NetworkJob, ctx: JobContext): Promise<NetworkJobResult> {
        const pool = this.pools.get(input.network);
        if (!pool) {
            throw new Error(`Unknown network: ${input.network}`);
        }

        const config = NETWORKS[input.network];
        const useMulticall = config.hasMulticall3 !== false;

        if (useMulticall) {
            // Single multicall RPC call for the entire chunk
            const call = createMulticallBalanceCall(input.addresses);
            const { result } = await pool.do(call);
            return { network: input.network, results: result };
        }

        // Fallback: sequential individual getBalance calls within the chunk
        const results: AddressBalance[] = [];
        for (const address of input.addresses) {
            const call = createIndividualBalanceCall(address);
            const { result } = await pool.do(call);
            results.push(...result);
        }
        return { network: input.network, results };
    }
}
