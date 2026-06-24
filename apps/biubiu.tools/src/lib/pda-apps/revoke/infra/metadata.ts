/**
 * Token / NFT metadata lookup for the "add custom" flow.
 */
import { isAddress, type Address } from 'viem';
import { makeClient } from './viem.js';
import { ERC20_ABI, NFT_ABI } from './abis.js';
import type { RevokeNetwork } from '../types.js';

export function isValidAddress(addr: string): boolean {
	return isAddress(addr.trim());
}

/** Read symbol + decimals (+ name) for an ERC20; throws if not a readable ERC20. */
export async function fetchErc20Meta(
	network: RevokeNetwork,
	address: Address,
): Promise<{ symbol: string; decimals: number; name?: string }> {
	const client = makeClient(network);
	const [symbol, decimals, name] = await Promise.all([
		client.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }) as Promise<string>,
		client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
		client
			.readContract({ address, abi: ERC20_ABI, functionName: 'name' })
			.then((n) => n as string)
			.catch(() => undefined),
	]);
	return { symbol, decimals: Number(decimals), name };
}

/** Best-effort symbol + name for an NFT collection (some collections omit symbol). */
export async function fetchNftMeta(
	network: RevokeNetwork,
	address: Address,
): Promise<{ symbol?: string; name?: string }> {
	const client = makeClient(network);
	const [symbol, name] = await Promise.all([
		client
			.readContract({ address, abi: NFT_ABI, functionName: 'symbol' })
			.then((s) => s as string)
			.catch(() => undefined),
		client
			.readContract({ address, abi: NFT_ABI, functionName: 'name' })
			.then((n) => n as string)
			.catch(() => undefined),
	]);
	return { symbol, name };
}
