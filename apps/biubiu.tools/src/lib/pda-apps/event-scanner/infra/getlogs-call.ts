/**
 * A getLogs `EVMCall` built on the raw JSON-RPC request so we have full control
 * over the `topics` array (viem's typed getLogs builds topics from an event +
 * args, which can't express the "OR across topic positions" wallet-track case).
 */
import { type Address, type PublicClient, numberToHex } from 'viem';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { RawLog, TopicFilter } from '../types.js';

export interface GetLogsParams {
	contract: Address;
	topics: TopicFilter[];
	fromBlock: number;
	toBlock: number;
}

interface RpcLog {
	address: Address;
	topics: `0x${string}`[];
	data: `0x${string}`;
	blockNumber: `0x${string}`;
	transactionHash: `0x${string}`;
	logIndex: `0x${string}`;
	transactionIndex?: `0x${string}`;
}

export function createGetLogsCall(p: GetLogsParams): EVMCall<RawLog[]> {
	return {
		execute: async (client: PublicClient) => {
			const logs = (await client.request({
				method: 'eth_getLogs',
				params: [
					{
						address: p.contract,
						topics: p.topics,
						fromBlock: numberToHex(BigInt(p.fromBlock)),
						toBlock: numberToHex(BigInt(p.toBlock)),
					},
				],
			} as never)) as RpcLog[];

			return logs.map((log) => ({
				address: log.address,
				topics: log.topics,
				data: log.data,
				blockNumber: BigInt(log.blockNumber).toString(),
				transactionHash: log.transactionHash,
				logIndex: Number(BigInt(log.logIndex)),
				transactionIndex:
					log.transactionIndex != null ? Number(BigInt(log.transactionIndex)) : undefined,
			}));
		},
	};
}
