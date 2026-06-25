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

const ERC20_ABI = [
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }],
	},
	{
		name: 'symbol',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'string' }],
	},
	{
		name: 'decimals',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
	},
] as const;

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

export interface AddressBalance {
	address: string;
	/**
	 * Raw balance as a decimal string, or `null` when the per-address sub-call
	 * FAILED (revert / transient RPC error / partial multicall response). `null`
	 * must NOT be conflated with a real zero balance — a balance-reporting tool
	 * surfacing a failed read as "0" would silently hide funds. Downstream
	 * (flattenJobResult) routes null entries to failures, not results.
	 */
	balance: string | null;
}

export interface TokenMetadata {
	symbol: string;
	decimals: number;
}

/**
 * Multicall3 path: batch N addresses into 1 RPC call via getEthBalance.
 */
export function createMulticallBalanceCall(addresses: string[]): EVMCall<AddressBalance[]> {
	return {
		execute: async (client: PublicClient) => {
			const results = await client.multicall({
				// Pass the canonical Multicall3 address explicitly so viem does NOT try to
				// resolve it from chain.contracts.multicall3 — which throws
				// ChainDoesNotSupportContract for user-added (custom) networks.
				multicallAddress: MULTICALL3_ADDRESS,
				contracts: addresses.map((addr) => ({
					address: MULTICALL3_ADDRESS,
					abi: MULTICALL3_BALANCE_ABI,
					functionName: 'getEthBalance' as const,
					args: [addr as Address],
				})),
				allowFailure: true,
				batchSize: 0,
			});

			// A failed sub-call yields balance:null (distinct from a real '0'), so the
			// UI/CSV can report "failed to read" instead of silently showing no funds.
			return addresses.map((addr, i) => ({
				address: addr,
				balance: results[i].status === 'success' ? (results[i].result as bigint).toString() : null,
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

/**
 * Multicall3 path for ERC20: batch N addresses into 1 RPC call via balanceOf.
 */
export function createErc20BalanceCall(
	addresses: string[],
	tokenAddress: string,
): EVMCall<AddressBalance[]> {
	return {
		execute: async (client: PublicClient) => {
			const results = await client.multicall({
				// Explicit Multicall3 address — see createMulticallBalanceCall above.
				multicallAddress: MULTICALL3_ADDRESS,
				contracts: addresses.map((addr) => ({
					address: tokenAddress as Address,
					abi: ERC20_ABI,
					functionName: 'balanceOf' as const,
					args: [addr as Address],
				})),
				allowFailure: true,
				batchSize: 0,
			});

			// Failed sub-call → balance:null (see createMulticallBalanceCall) so a
			// reverting token / partial response is not misreported as a zero balance.
			return addresses.map((addr, i) => ({
				address: addr,
				balance: results[i].status === 'success' ? (results[i].result as bigint).toString() : null,
			}));
		},
	};
}

/**
 * Fallback path for ERC20: individual balanceOf for chains without Multicall3.
 */
export function createIndividualErc20BalanceCall(
	address: string,
	tokenAddress: string,
): EVMCall<AddressBalance[]> {
	return {
		execute: async (client: PublicClient) => {
			const balance = (await client.readContract({
				address: tokenAddress as Address,
				abi: ERC20_ABI,
				functionName: 'balanceOf',
				args: [address as Address],
			})) as bigint;
			return [{ address, balance: balance.toString() }];
		},
	};
}

/**
 * Read ERC20 symbol + decimals in parallel. Used to auto-fill metadata when a
 * user adds a custom token by contract address.
 */
export function createTokenMetadataCall(tokenAddress: string): EVMCall<TokenMetadata> {
	return {
		execute: async (client: PublicClient) => {
			const [symbol, decimals] = await Promise.all([
				client.readContract({
					address: tokenAddress as Address,
					abi: ERC20_ABI,
					functionName: 'symbol',
				}) as Promise<string>,
				client.readContract({
					address: tokenAddress as Address,
					abi: ERC20_ABI,
					functionName: 'decimals',
				}) as Promise<number>,
			]);
			return { symbol, decimals: Number(decimals) };
		},
	};
}
