import type { Chain } from 'viem';
import { Pool } from '@shelchin/vendor-pool';
import { RPCVendor, type RPCInput, type RPCOutput } from './rpc-vendor';

interface NetworkConfig {
    chainId: number;
    rpcs: string[];
}

export interface CreateNetworkPoolsOptions {
    maxRetries?: number;
    timeout?: number;
}

export function createNetworkPools(
    networks: Record<string, NetworkConfig>,
    chainMap: Record<number, Chain>,
    options: CreateNetworkPoolsOptions = {}
): Map<string, Pool<RPCInput, RPCOutput>> {
    const { maxRetries = 3, timeout = 15000 } = options;
    const pools = new Map<string, Pool<RPCInput, RPCOutput>>();

    for (const [networkName, config] of Object.entries(networks)) {
        const chain = chainMap[config.chainId];
        if (!chain) continue;

        const vendors = config.rpcs.map((rpc, idx) => {
            const weight = idx === 0 ? 3 : 1;
            return new RPCVendor(`${networkName}-rpc-${idx}`, rpc, chain, weight);
        });

        const pool = new Pool<RPCInput, RPCOutput>(vendors, {
            maxRetries,
            timeout,
        });

        pools.set(networkName, pool);
    }

    return pools;
}
