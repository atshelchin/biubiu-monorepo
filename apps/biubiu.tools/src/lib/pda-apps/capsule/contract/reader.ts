/**
 * Read Forever notes from contract STATE via paginated view calls (eth_call).
 * No event-log scraping or indexer — getEntriesDesc/getEntries/entryCount are read directly.
 */
import { type Address, type Hex, decodeFunctionResult, encodeFunctionData, hexToBytes } from 'viem';
import { FOREVER_ABI } from './abi.js';
import { FOREVER_ADDRESS } from './address.js';
import { rpcCall } from './rpc.js';

export interface ForeverEntry {
	/** Unix seconds the note was sealed (unique per author given the 12h cooldown — used as key). */
	createdAt: number;
	/** Ciphertext bytes (decrypt client-side). */
	payload: Uint8Array;
}

/** Shape of an Entry tuple as decoded by viem from the contract. */
interface RawEntry {
	createdAt: bigint;
	payload: Hex;
}

/** Convert a decoded contract Entry tuple into a client ForeverEntry. */
export function toEntry(raw: RawEntry): ForeverEntry {
	return {
		createdAt: Number(raw.createdAt),
		payload: hexToBytes(raw.payload)
	};
}

/**
 * Make a view call and decode it. `empty` is returned when the node replies with `0x`
 * (no return data) — which happens when the Capsule contract isn't deployed on this chain,
 * so there's nothing to read. Decoding `0x` would otherwise throw "Cannot decode zero data".
 */
async function ethCall<T>(network: string, functionName: string, args: unknown[], empty: T): Promise<T> {
	const data = encodeFunctionData({ abi: FOREVER_ABI, functionName, args } as never);
	const result = await rpcCall<Hex>(network, 'eth_call', [{ to: FOREVER_ADDRESS, data }, 'latest']);
	if (!result || result === '0x') return empty;
	return decodeFunctionResult({ abi: FOREVER_ABI, functionName, data: result } as never) as T;
}

/** Total number of notes an author has sealed on a network (0 if the contract isn't there). */
export async function entryCount(network: string, author: Address): Promise<number> {
	return Number(await ethCall<bigint>(network, 'entryCount', [author], 0n));
}

/** Seconds remaining on the author's per-chain cooldown (0 = can write now). */
export async function cooldownRemaining(network: string, author: Address): Promise<number> {
	return Number(await ethCall<bigint>(network, 'cooldownRemaining', [author], 0n));
}

/**
 * A page of notes. `desc` (default) returns newest-first; `desc=false` returns oldest-first.
 * `offset` skips that many from the chosen end, so pagination works in either direction.
 */
export async function fetchEntriesPage(
	network: string,
	author: Address,
	offset: number,
	limit: number,
	desc = true
): Promise<ForeverEntry[]> {
	const raw = await ethCall<readonly RawEntry[]>(
		network,
		desc ? 'getEntriesDesc' : 'getEntries',
		[author, BigInt(offset), BigInt(limit)],
		[]
	);
	return raw.map(toEntry);
}
