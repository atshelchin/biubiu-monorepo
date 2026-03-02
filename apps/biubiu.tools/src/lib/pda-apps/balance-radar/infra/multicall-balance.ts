import type { Address, PublicClient } from 'viem';
import type { EVMCall } from '$lib/evm/evm-vendor';

const MULTICALL3_BALANCE_ABI = [
	{
		name: 'getEthBalance',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'addr', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }],
	},
] as const;

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

export interface AddressBalance {
	address: string;
	balance: string;
}

/**
 * Multicall3 path: batch N addresses into 1 RPC call via getEthBalance.
 */
export function createMulticallBalanceCall(addresses: string[]): EVMCall<AddressBalance[]> {
	return {
		execute: async (client: PublicClient) => {
			const results = await client.multicall({
				contracts: addresses.map((addr) => ({
					address: MULTICALL3_ADDRESS,
					abi: MULTICALL3_BALANCE_ABI,
					functionName: 'getEthBalance' as const,
					args: [addr as Address],
				})),
				allowFailure: true,
			});

			return addresses.map((addr, i) => ({
				address: addr,
				balance: results[i].status === 'success' ? (results[i].result as bigint).toString() : '0',
			}));
		},
	};
}

/**
 * Fallback path: individual getBalance for chains without Multicall3.
 * Returns AddressBalance[] (length 1) to match multicall signature.
 */
export function createIndividualBalanceCall(address: string): EVMCall<AddressBalance[]> {
	return {
		execute: async (client: PublicClient) => {
			const balance = await client.getBalance({ address: address as Address });
			return [{ address, balance: balance.toString() }];
		},
	};
}
