/**
 * Read Forever notes + key envelopes from contract STATE via paginated view calls (eth_call).
 * No event-log scraping or indexer — getEntriesDesc/entryCount/getKeys are read directly.
 */
import { type Address, type Hex, decodeFunctionResult, encodeFunctionData, hexToBytes } from 'viem';
import { FOREVER_ABI } from './abi.js';
import { FOREVER_ADDRESS } from './address.js';
import { rpcCall } from './rpc.js';

export interface ForeverEntry {
	mode: number;
	/** Unix seconds the note was sealed (unique per author given the 24h cooldown — used as key). */
	createdAt: number;
	/** Unix seconds it unlocks (0 for private notes). */
	unlockAt: number;
	/** drand round (0 for private notes). */
	drandRound: bigint;
	beaconScheme: Hex;
	/** Ciphertext bytes (decrypt client-side). */
	payload: Uint8Array;
}

/** Shape of an Entry tuple as decoded by viem from the contract. */
interface RawEntry {
	createdAt: bigint;
	unlockAt: bigint;
	drandRound: bigint;
	mode: number;
	beaconScheme: Hex;
	payload: Hex;
}

/** Convert a decoded contract Entry tuple into a client ForeverEntry. */
export function toEntry(raw: RawEntry): ForeverEntry {
	return {
		mode: Number(raw.mode),
		createdAt: Number(raw.createdAt),
		unlockAt: Number(raw.unlockAt),
		drandRound: raw.drandRound,
		beaconScheme: raw.beaconScheme,
		payload: hexToBytes(raw.payload)
	};
}

async function ethCall<T>(network: string, functionName: string, args: unknown[]): Promise<T> {
	const data = encodeFunctionData({ abi: FOREVER_ABI, functionName, args } as never);
	const result = await rpcCall<Hex>(network, 'eth_call', [{ to: FOREVER_ADDRESS, data }, 'latest']);
	return decodeFunctionResult({ abi: FOREVER_ABI, functionName, data: result } as never) as T;
}

/** Total number of notes an author has sealed on a network. */
export async function entryCount(network: string, author: Address): Promise<number> {
	return Number(await ethCall<bigint>(network, 'entryCount', [author]));
}

/** A page of notes, newest first, skipping `offset` of the newest. */
export async function fetchEntriesPage(
	network: string,
	author: Address,
	offset: number,
	limit: number
): Promise<ForeverEntry[]> {
	const raw = await ethCall<readonly RawEntry[]>(network, 'getEntriesDesc', [author, BigInt(offset), BigInt(limit)]);
	return raw.map(toEntry);
}

/** All wrapped-DEK envelopes for an author (try each until one unwraps with the current PRF). */
export async function fetchKeys(network: string, author: Address): Promise<Uint8Array[]> {
	const raw = await ethCall<readonly Hex[]>(network, 'getKeys', [author]);
	return raw.map((h) => hexToBytes(h));
}
