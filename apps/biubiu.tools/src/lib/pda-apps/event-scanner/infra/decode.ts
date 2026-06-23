/**
 * Decode raw logs into named-arg event rows using the (implementation) ABI.
 * A log whose topic0 matches but whose ABI shape mismatches is skipped (not
 * fatal). All bigints are stringified for IndexedDB / JSON.
 */
import { type Abi, type Address, type Hex, decodeEventLog } from 'viem';
import type { DecodedEvent, RawLog } from '../types.js';

function stringifyArg(value: unknown): string {
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'string') return value;
	if (typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return JSON.stringify(value.map(serialize));
	if (value && typeof value === 'object') return JSON.stringify(serialize(value));
	return String(value);
}

function serialize(value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(serialize);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
		return out;
	}
	return value;
}

/** Decode a batch of raw logs into persistable event rows. */
export function decodeLogs(
	logs: RawLog[],
	abi: Abi,
	scanId: string,
	network: string,
	contract: Address,
	filterSetId: string,
): DecodedEvent[] {
	const out: DecodedEvent[] = [];
	for (const log of logs) {
		let eventName = 'Unknown';
		const args: Record<string, string> = {};
		try {
			const decoded = decodeEventLog({
				abi,
				data: log.data,
				topics: log.topics as [Hex, ...Hex[]],
			});
			eventName = decoded.eventName ?? 'Unknown';
			const a = decoded.args as Record<string, unknown> | readonly unknown[] | undefined;
			if (Array.isArray(a)) {
				a.forEach((v, i) => (args[`arg${i}`] = stringifyArg(v)));
			} else if (a && typeof a === 'object') {
				for (const [k, v] of Object.entries(a)) args[k] = stringifyArg(v);
			}
		} catch {
			// topic0 matched but ABI shape didn't — keep the raw topics so the row
			// is still downloadable/inspectable.
			log.topics.forEach((tp, i) => (args[`topic${i}`] = tp));
			args.data = log.data;
		}

		out.push({
			scanId,
			pk: `${scanId}:${log.transactionHash}:${log.logIndex}`,
			network,
			contract,
			filterSetId,
			eventName,
			args,
			blockNumber: Number(log.blockNumber),
			txHash: log.transactionHash,
			logIndex: log.logIndex,
		});
	}
	return out;
}
