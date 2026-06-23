/**
 * ERC20 metadata lookup for the "add token" flow.
 */
import { type Address, isAddress } from 'viem';
import { makePublicClient } from './viem-chain.js';
import type { SweepNetwork, TokenSpec } from '../types.js';

const ERC20_META_ABI = [
	{ name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
	{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

export function isValidTokenAddress(addr: string): boolean {
	return isAddress(addr);
}

/** Read symbol + decimals for a token; throws if not a readable ERC20. */
export async function fetchTokenMetadata(
	network: SweepNetwork,
	rpcUrl: string,
	tokenAddress: Address,
): Promise<TokenSpec> {
	const client = makePublicClient(network, rpcUrl);
	const [symbol, decimals] = await Promise.all([
		client.readContract({ address: tokenAddress, abi: ERC20_META_ABI, functionName: 'symbol' }) as Promise<string>,
		client.readContract({ address: tokenAddress, abi: ERC20_META_ABI, functionName: 'decimals' }) as Promise<number>,
	]);
	return { kind: 'erc20', address: tokenAddress, symbol, decimals: Number(decimals) };
}
