/**
 * Live-tail: after a historical scan, keep polling new blocks forward and append
 * matching events to the same scan in IndexedDB.
 *
 * Standalone (not part of the PDA generator) so the GUI execution module and the
 * CLI can both drive it and stop it cleanly via the returned handle. Idempotent:
 * seeds from the highest stored block and upserts by `pk`, so overlapping polls
 * and reorgs (within the confirmation depth) never double-count.
 */
import type { Pool } from '@shelchin/vendor-pool';
import type { Abi, Address } from 'viem';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { FilterSet, RawLog } from '../types.js';
import { scanRangeAdaptive } from './adaptive-chunk.js';
import { getLatestBlock } from './time-to-block.js';
import { decodeLogs } from './decode.js';
import { countEvents, getMaxScannedBlock, getScan, putEvents, saveScan } from './event-store.js';

export interface LiveTailDeps {
	pool: Pool<EVMCall<RawLog[]>, RawLog[]>;
	scanId: string;
	networkKey: string;
	contract: Address;
	abi: Abi;
	filterSets: FilterSet[];
	chunkSize: number;
	/** Where to start if nothing is stored yet (the historical toBlock). */
	fromBlockFallback: number;
	confirmations?: number;
	intervalMs?: number;
	onTick?: (info: { head: number; total: number }) => void;
	onError?: (err: Error) => void;
}

export interface LiveTailHandle {
	stop: () => void;
	readonly running: boolean;
}

export function startLiveTail(deps: LiveTailDeps): LiveTailHandle {
	const controller = new AbortController();
	const confirmations = deps.confirmations ?? 3;
	const intervalMs = deps.intervalMs ?? 12000;
	let running = true;

	const sleep = (ms: number) =>
		new Promise<void>((resolve) => {
			const id = setTimeout(resolve, ms);
			controller.signal.addEventListener(
				'abort',
				() => {
					clearTimeout(id);
					resolve();
				},
				{ once: true },
			);
		});

	(async () => {
		const seed = await getMaxScannedBlock(deps.scanId);
		let cursor = (seed ?? deps.fromBlockFallback) + 1;

		while (!controller.signal.aborted) {
			try {
				const latest = await getLatestBlock(deps.pool);
				const safeHead = latest - confirmations;
				if (safeHead >= cursor) {
					for (const fs of deps.filterSets) {
						const logs = await scanRangeAdaptive(
							deps.pool,
							{
								network: deps.networkKey,
								contract: deps.contract,
								filterSetId: fs.id,
								topics: fs.topics,
								fromBlock: cursor,
								toBlock: safeHead,
								chunkSize: deps.chunkSize,
							},
							{ signal: controller.signal },
							deps.chunkSize,
						);
						await putEvents(
							decodeLogs(logs, deps.abi, deps.scanId, deps.networkKey, deps.contract, fs.id),
						);
					}
					cursor = safeHead + 1;
					const scan = await getScan(deps.scanId);
					const total = await countEvents(deps.scanId);
					if (scan) {
						await saveScan({
							...scan,
							lastScannedBlock: safeHead,
							eventCount: total,
							updatedAt: Date.now(),
							live: true,
						});
					}
					deps.onTick?.({ head: safeHead, total });
				}
			} catch (err) {
				deps.onError?.(err instanceof Error ? err : new Error(String(err)));
			}
			await sleep(intervalMs);
		}
		running = false;
	})();

	return {
		stop: () => controller.abort(),
		get running() {
			return running;
		},
	};
}
