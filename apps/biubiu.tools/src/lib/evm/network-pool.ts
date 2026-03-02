import type { Chain } from 'viem';
import { Pool } from '@shelchin/vendor-pool';
import { RPCVendor, type RPCInput, type RPCOutput } from './rpc-vendor';
import { EVMVendor, type EVMCall } from './evm-vendor';

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

export function createEVMPools<TResult>(
    networks: Record<string, NetworkConfig>,
    chainMap: Record<number, Chain>,
    options: CreateNetworkPoolsOptions = {}
): Map<string, Pool<EVMCall<TResult>, TResult>> {
    const { maxRetries = 3, timeout = 15000 } = options;
    const pools = new Map<string, Pool<EVMCall<TResult>, TResult>>();

    for (const [networkName, config] of Object.entries(networks)) {
        const chain = chainMap[config.chainId];
        if (!chain) continue;

        const vendors = config.rpcs.map((rpc, idx) => {
            const weight = idx === 0 ? 3 : 1;
            return new EVMVendor<TResult>(`${networkName}-evm-${idx}`, rpc, chain, weight);
        });

        const pool = new Pool<EVMCall<TResult>, TResult>(vendors, {
            maxRetries,
            timeout,
        });

        pools.set(networkName, pool);
    }

    return pools;
}
