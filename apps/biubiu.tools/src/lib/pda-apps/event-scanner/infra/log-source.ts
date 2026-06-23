/**
 * Deterministic TaskHub source for log scanning.
 *
 * Jobs = filterSets × pre-chunked block sub-ranges. Determinism (stable getData()
 * + getJobId) is what enables merkle-root resume; RPC getLogs limits are absorbed
 * *below* the job boundary by `scanRangeAdaptive` inside the handler. The handler
 * returns RAW logs — decoding is deferred to the executor where the ABI lives.
 */
import { TaskSource, type JobContext } from '@shelchin/taskhub/browser';
import type { Pool } from '@shelchin/vendor-pool';
import type { Address } from 'viem';
import type { EVMCall } from '$lib/evm/evm-vendor';
import type { FilterSet, RawLog, ScanJob, ScanJobResult, ScanNetwork } from '../types.js';
import { buildRegistry } from './networks.js';
import { createGetLogsPools } from './getlogs-pool.js';
import { scanRangeAdaptive } from './adaptive-chunk.js';

export interface ScanPlan {
	network: ScanNetwork;
	contract: Address;
	filterSets: FilterSet[];
	fromBlock: number;
	toBlock: number;
	chunkSize: number;
}

export class EventLogSource extends TaskSource<ScanJob, ScanJobResult> {
	readonly type = 'deterministic' as const;
	private pool: Pool<EVMCall<RawLog[]>, RawLog[]> | undefined;
	private networkKey: string;
	private jobs: ScanJob[];
	/** Count of blocks no RPC could serve (skipped, surfaced as a warning). */
	skippedCount = 0;
	/** Largest getLogs span that worked — discovered once, shared across all jobs. */
	private sharedSpan: number;

	constructor(plan: ScanPlan) {
		super();
		const { key, networks, chainMap } = buildRegistry(plan.network);
		this.networkKey = key;
		this.pool = createGetLogsPools<RawLog[]>(networks, chainMap).get(key);
		this.jobs = this.buildJobs(plan);
		this.sharedSpan = plan.chunkSize;
	}

	private buildJobs(plan: ScanPlan): ScanJob[] {
		const jobs: ScanJob[] = [];
		for (const fs of plan.filterSets) {
			for (let start = plan.fromBlock; start <= plan.toBlock; start += plan.chunkSize) {
				const end = Math.min(start + plan.chunkSize - 1, plan.toBlock);
				jobs.push({
					network: this.networkKey,
					contract: plan.contract,
					filterSetId: fs.id,
					topics: fs.topics,
					fromBlock: start,
					toBlock: end,
					chunkSize: plan.chunkSize,
				});
			}
		}
		return jobs;
	}

	getData(): ScanJob[] {
		return this.jobs;
	}

	// NOTE: we intentionally do NOT override getJobId. The executor computes the
	// merkle root with the default `generateJobId` (a stable hash of the ScanJob),
	// and TaskHub must use the SAME function internally for findTaskByMerkleRoot to
	// match. The ScanJob shape (network/contract/filterSetId/topics/from-to/chunk)
	// is fully serializable and stable, so the default id is deterministic.

	async handler(job: ScanJob, ctx: JobContext): Promise<ScanJobResult> {
		if (!this.pool) throw new Error(`No RPC pool for network: ${job.network}`);
		const logs = await scanRangeAdaptive(this.pool, job, ctx, this.sharedSpan, {
			onBlocksSkipped: (from, to) => {
				this.skippedCount += to - from + 1;
			},
			onCeiling: (span) => {
				if (span < this.sharedSpan) this.sharedSpan = span;
			},
		});
		return { job, logs };
	}
}
