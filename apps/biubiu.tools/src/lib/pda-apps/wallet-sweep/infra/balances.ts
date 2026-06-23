/**
 * Preflight balances — native + selected ERC20s for every EOA, via Multicall3.
 * Used to show "what will be swept" and to skip empty EOAs.
 */
import { type Address } from 'viem';
import { makePublicClient } from './viem-chain.js';
import type { SweepNetwork } from '../types.js';

const MULTICALL3_GET_ETH_BALANCE = [
	{
		name: 'getEthBalance',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'addr', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }],
	},
] as const;

const ERC20_BALANCE_OF = [
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }],
	},
] as const;

export interface EoaBalances {
	address: Address;
	native: bigint;
	/** tokenAddress(lowercase) → raw balance. */
	tokens: Record<string, bigint>;
}

/**
 * Fetch native + ERC20 balances for all addresses in a single Multicall3 batch.
 * Failures fall back to 0 (allowFailure) so one bad token/address never throws.
 */
export async function fetchBalances(
	network: SweepNetwork,
	rpcUrl: string,
	addresses: Address[],
	erc20s: Address[],
): Promise<EoaBalances[]> {
	if (addresses.length === 0) return [];
	const client = makePublicClient(network, rpcUrl);

	type Call = { address: Address; abi: typeof MULTICALL3_GET_ETH_BALANCE | typeof ERC20_BALANCE_OF; functionName: 'getEthBalance' | 'balanceOf'; args: readonly [Address] };
	const calls: Call[] = [];

	// Native first (one per address), then each token per address.
	for (const a of addresses) {
		calls.push({
			address: network.multicall3,
			abi: MULTICALL3_GET_ETH_BALANCE,
			functionName: 'getEthBalance',
			args: [a],
		});
	}
	for (const token of erc20s) {
		for (const a of addresses) {
			calls.push({ address: token, abi: ERC20_BALANCE_OF, functionName: 'balanceOf', args: [a] });
		}
	}

	const results = await client.multicall({ contracts: calls, allowFailure: true, batchSize: 0 });

	const out: EoaBalances[] = addresses.map((address) => ({ address, native: 0n, tokens: {} }));
	const idx = (i: number) => (results[i]?.status === 'success' ? (results[i].result as bigint) : 0n);

	let cursor = 0;
	for (let a = 0; a < addresses.length; a++) out[a].native = idx(cursor++);
	for (const token of erc20s) {
		const key = token.toLowerCase();
		for (let a = 0; a < addresses.length; a++) out[a].tokens[key] = idx(cursor++);
	}
	return out;
}
