import { describe, it, expect } from 'vitest';
import { numberToHex, type PublicClient } from 'viem';
import { isRangeOverflow, isRateLimit } from './infra/getlogs-pool.js';
import { extractEvents, buildTopicSlot, addressTopic } from './infra/events.js';
import { decodeLogs } from './infra/decode.js';
import { scanRangeAdaptive } from './infra/adaptive-chunk.js';
import { resolveBlockRange } from './infra/time-to-block.js';
import { ERC20_EVENT_ABI } from './infra/presets.js';
import type { RawLog, ScanJob } from './types.js';

const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

describe('getlogs-pool: error classification helpers', () => {
	it('detects range-overflow by phrase and by JSON-RPC code (-32005)', () => {
		expect(isRangeOverflow(new Error('query returned more than 10000 results'))).toBe(true);
		expect(isRangeOverflow(new Error('block range is too wide'))).toBe(true);
		expect(isRangeOverflow(new Error('eth_getLogs is limited to 0 - 50 blocks range'))).toBe(true);
		expect(isRangeOverflow(new Error('limit exceeded'))).toBe(true); // BSC -32005 message
		expect(isRangeOverflow({ code: -32005, message: 'limit exceeded' })).toBe(true); // by code
		expect(isRangeOverflow(new Error('connection timeout'))).toBe(false);
	});

	it('never treats a rate-limit as a range overflow', () => {
		expect(isRateLimit(new Error('429 too many requests'))).toBe(true);
		expect(isRangeOverflow(new Error('rate limit exceeded'))).toBe(false);
		expect(isRangeOverflow({ code: 429, message: 'too many requests' })).toBe(false);
	});
});

describe('events: extraction + topic encoding', () => {
	it('extracts the Transfer event with its topic0 and indexed flags', () => {
		const events = extractEvents(ERC20_EVENT_ABI);
		const transfer = events.find((e) => e.name === 'Transfer');
		expect(transfer).toBeTruthy();
		expect(transfer!.signature).toBe('Transfer(address,address,uint256)');
		expect(transfer!.topic0.toLowerCase()).toBe(TRANSFER_TOPIC0);
		expect(transfer!.inputs[0].indexed).toBe(true);
		expect(transfer!.inputs[2].indexed).toBe(false);
	});

	it('encodes indexed topic slots (address padding, OR-sets, wildcard)', () => {
		const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
		const topic = addressTopic(addr);
		expect(topic).toBe('0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045');
		expect(buildTopicSlot('address', [])).toBeNull();
		expect(buildTopicSlot('address', [addr])).toBe(topic);
		expect(Array.isArray(buildTopicSlot('address', [addr, addr]))).toBe(true);
	});
});

describe('decode: logs → named args', () => {
	it('decodes a Transfer log into from/to/value and a dedup pk', () => {
		const from = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
		const to = '0x1111111111111111111111111111111111111111';
		const log: RawLog = {
			address: '0x55d398326f99059fF775485246999027B3197955',
			topics: [TRANSFER_TOPIC0, addressTopic(from), addressTopic(to)],
			data: numberToHex(1000n, { size: 32 }),
			blockNumber: '42',
			transactionHash: '0xabc',
			logIndex: 7,
		};
		const [decoded] = decodeLogs([log], ERC20_EVENT_ABI, 'scan1', 'chain-56', log.address, 'in');
		expect(decoded.eventName).toBe('Transfer');
		expect(decoded.args.value).toBe('1000');
		expect(decoded.args.from?.toLowerCase()).toBe(from.toLowerCase());
		expect(decoded.pk).toBe('scan1:0xabc:7');
		expect(decoded.filterSetId).toBe('in');
		expect(decoded.blockNumber).toBe(42);
	});
});

describe('adaptive-chunk: binary split on overflow', () => {
	it('covers the full range and accumulates logs despite a per-call block cap', async () => {
		const LIMIT = 1000;
		const covered: Array<[number, number]> = [];
		const fakeClient = {
			request: async ({ params }: { params: [{ fromBlock: `0x${string}`; toBlock: `0x${string}` }] }) => {
				const from = Number(BigInt(params[0].fromBlock));
				const to = Number(BigInt(params[0].toBlock));
				if (to - from + 1 > LIMIT) throw new Error('query returned more than 10000 results');
				covered.push([from, to]);
				return from <= 1000 && 1000 <= to
					? [
							{
								address: '0x0000000000000000000000000000000000000001',
								topics: [TRANSFER_TOPIC0],
								data: '0x',
								blockNumber: numberToHex(1000n),
								transactionHash: '0xfeed',
								logIndex: numberToHex(0n),
							},
						]
					: [];
			},
		} as unknown as PublicClient;

		const pool = {
			do: async (call: { execute: (c: PublicClient) => Promise<RawLog[]> }) => ({ result: await call.execute(fakeClient) }),
		} as never;

		const job: ScanJob = {
			network: 'chain-1',
			contract: '0x0000000000000000000000000000000000000001',
			filterSetId: 'all',
			topics: [TRANSFER_TOPIC0],
			fromBlock: 0,
			toBlock: 2500,
			chunkSize: 2500,
		};

		const logs = await scanRangeAdaptive(pool, job, { signal: new AbortController().signal }, job.chunkSize);

		expect(logs).toHaveLength(1);
		expect(logs[0].blockNumber).toBe('1000');
		// Coverage is contiguous from 0..2500 with no gaps.
		covered.sort((a, b) => a[0] - b[0]);
		let cursor = 0;
		for (const [f, t] of covered) {
			expect(f).toBe(cursor);
			cursor = t + 1;
		}
		expect(cursor).toBe(2501);
	});
});

describe('time-to-block: estimate (few RPC calls)', () => {
	it('resolves "last N days" accurately AND with few requests', async () => {
		const LATEST = 1_000_000;
		let calls = 0;
		const fakeClient = {
			getBlock: async ({ blockNumber }: { blockTag?: string; blockNumber?: bigint }) => {
				calls++;
				const n = blockNumber !== undefined ? Number(blockNumber) : LATEST;
				return { number: BigInt(n), timestamp: BigInt(n * 12) };
			},
		} as unknown as PublicClient;
		const pool = {
			do: async (call: { execute: (c: PublicClient) => Promise<unknown> }) => ({ result: await call.execute(fakeClient) }),
		} as never;

		const nowMs = LATEST * 12 * 1000; // head timestamp in ms
		const { fromBlock, toBlock } = await resolveBlockRange(pool, { kind: 'lastNDays', days: 1, nowMs });
		expect(toBlock).toBe(LATEST);
		// 1 day = 86400s = 7200 blocks @ 12s → estimate ≈ LATEST - 7200, plus a small
		// earlier safety margin. Accept the estimate ± the margin.
		const expected = LATEST - 7200;
		expect(fromBlock).toBeLessThanOrEqual(expected);
		expect(fromBlock).toBeGreaterThanOrEqual(expected - 100);
		// The whole point: not ~log2(1e6) ≈ 20 probes — a handful.
		expect(calls).toBeLessThanOrEqual(8);
	});
});
