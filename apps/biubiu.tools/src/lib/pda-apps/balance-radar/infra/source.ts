import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type { Pool } from '@shelchin/vendor-pool';
import type { NetworkConfig, NetworkJob, NetworkJobResult, TokenSpec } from '../types';
import { mergeNetworks } from './networks';
import { createEVMPools } from '$lib/evm/network-pool';
import {
    createMulticallBalanceCall,
    createIndividualBalanceCall,
    createErc20BalanceCall,
    createIndividualErc20BalanceCall,
} from './multicall-balance';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { AddressBalance } from './multicall-balance';

export class BalanceQuerySource extends TaskSource<NetworkJob, NetworkJobResult> {
    readonly type = 'deterministic' as const;
    private pools: Map<string, Pool<EVMCall<AddressBalance[]>, AddressBalance[]>>;
    private networks: Record<string, NetworkConfig>;
    private jobs: NetworkJob[];

    constructor(
        addresses: string[],
        tokensByNetwork: Record<string, TokenSpec[]>,
        customNetworks: NetworkConfig[] = [],
        chunkSize: number = 100,
    ) {
        super();
        const { networks, chainMap } = mergeNetworks(customNetworks);
        this.networks = networks;
        this.pools = createEVMPools<AddressBalance[]>(networks, chainMap);
        this.jobs = this.buildJobs(addresses, tokensByNetwork, chunkSize);
    }

    private buildJobs(
        addresses: string[],
        tokensByNetwork: Record<string, TokenSpec[]>,
        chunkSize: number,
    ): NetworkJob[] {
        const jobs: NetworkJob[] = [];
        for (const [network, tokens] of Object.entries(tokensByNetwork)) {
            if (!this.networks[network]) continue;

            for (const token of tokens) {
                for (let i = 0; i < addresses.length; i += chunkSize) {
                    jobs.push({
                        network,
                        token,
                        addresses: addresses.slice(i, i + chunkSize),
                    });
                }
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

        const config = this.networks[input.network];
        const useMulticall = config.hasMulticall3 !== false;
        const { token } = input;

        if (useMulticall) {
            // Single multicall RPC call for the entire chunk
            const call =
                token.kind === 'erc20'
                    ? createErc20BalanceCall(input.addresses, token.address!)
                    : createMulticallBalanceCall(input.addresses);
            const { result } = await pool.do(call);
            return { network: input.network, token, results: result };
        }

        // Fallback: sequential individual balance calls within the chunk
        const results: AddressBalance[] = [];
        for (const address of input.addresses) {
            const call =
                token.kind === 'erc20'
                    ? createIndividualErc20BalanceCall(address, token.address!)
                    : createIndividualBalanceCall(address);
            const { result } = await pool.do(call);
            results.push(...result);
        }
        return { network: input.network, token, results };
    }
}
