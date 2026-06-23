import { createTaskHub, computeMerkleRoot, generateJobId, type Job } from '@shelchin/taskhub/browser';
import { type Abi, type Address, createPublicClient, getAddress, http } from 'viem';
import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { inputSchema, outputSchema } from './schema.js';
import type {
	FilterSet,
	RawLog,
	RunResult,
	ScanJob,
	ScanJobResult,
	ScanMeta,
	ScanNetwork,
} from './types.js';
import { EventLogSource, type ScanPlan } from './infra/log-source.js';
import { buildRegistry, toViemChain } from './infra/networks.js';
import { createGetLogsPools } from './infra/getlogs-pool.js';
import { resolveBlockRange } from './infra/time-to-block.js';
import { decodeLogs } from './infra/decode.js';
import { countEvents, getEventPks, getScan, putEvents, saveScan } from './infra/event-store.js';
import { InterruptQueue } from '$lib/async/interrupt-queue';

const DEFAULT_CHUNK = 2_000;
const CONCURRENCY = { min: 1, max: 8, initial: 3 } as const;
// Per-job timeout. A getLogs job may split into many small calls under
// rate-limited / range-capped RPCs, so the 30s TaskHub default is far too low —
// it would abort the job mid-scan and discard the logs it already gathered.
const JOB_TIMEOUT = 180_000;

const DECIMALS_ABI = [
	{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

/** Best-effort read of an ERC-20 `decimals()` so amounts can be shown human-friendly. */
async function readTokenDecimals(net: ScanNetwork, rpcUrl: string, contract: Address): Promise<number | undefined> {
	try {
		const client = createPublicClient({ chain: toViemChain(net), transport: http(rpcUrl) });
		const d = await client.readContract({ address: contract, abi: DECIMALS_ABI, functionName: 'decimals' });
		return Number(d);
	} catch {
		return undefined;
	}
}

export interface Input {
	network: ScanNetwork;
	contract: string;
	abi: unknown[];
	eventName: string;
	eventSignature: string;
	topic0: string;
	filterSets: FilterSet[];
	fromBlock?: number;
	toBlock?: number;
	range?: { kind: 'lastNDays'; days: number } | { kind: 'dates'; fromMs: number; toMs: number };
	chunkSize?: number;
	scanName?: string;
	live?: boolean;
	liveIntervalMs?: number;
}

type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

export interface ValidatedScan {
	network: ScanNetwork;
	registryKey: string;
	contract: Address;
	abi: Abi;
	filterSets: FilterSet[];
	fromBlock: number;
	toBlock: number;
	chunkSize: number;
	scanName: string;
	eventName: string;
	eventSignature: string;
	topic0: `0x${string}`;
}

export function validate(input: Input): {
	network: ScanNetwork;
	registryKey: string;
	contract: Address;
	abi: Abi;
} {
	if (!input.network?.rpcs?.length) throw new Error('No RPC endpoints for the selected chain.');
	if (!input.contract || !/^0x[a-fA-F0-9]{40}$/.test(input.contract.trim())) {
		throw new Error('Invalid contract address.');
	}
	if (!Array.isArray(input.abi) || input.abi.length === 0) throw new Error('ABI is required.');
	if (!input.filterSets?.length) throw new Error('At least one event filter is required.');

	const { key } = buildRegistry(input.network);
	return {
		network: input.network,
		registryKey: key,
		contract: getAddress(input.contract.trim()),
		abi: input.abi as Abi,
	};
}

async function* run(input: Input, ctx: Ctx): AsyncGenerator<InteractionRequest, RunResult, InteractionResponse | undefined> {
	const base = validate(input);
	const { network, contract, abi } = base;
	const startTime = Date.now();

	// 1. Resolve the block range (UI usually passes concrete blocks for a stable scanId).
	const { key, networks, chainMap } = buildRegistry(network);
	let fromBlock = input.fromBlock;
	let toBlock = input.toBlock;
	if (fromBlock === undefined || toBlock === undefined) {
		ctx.info('Resolving block range…');
		const resolvePool = createGetLogsPools<RawLog[]>(networks, chainMap).get(key)!;
		const sel = input.range
			? input.range.kind === 'lastNDays'
				? { kind: 'lastNDays' as const, days: input.range.days, nowMs: Date.now() }
				: { kind: 'dates' as const, fromMs: input.range.fromMs, toMs: input.range.toMs, nowMs: Date.now() }
			: { kind: 'lastNDays' as const, days: 7, nowMs: Date.now() };
		const resolved = await resolveBlockRange(resolvePool, sel);
		fromBlock = resolved.fromBlock;
		toBlock = resolved.toBlock;
		ctx.info(`Block range: ${fromBlock} → ${toBlock}`);
	}

	const chunkSize = input.chunkSize && input.chunkSize > 0 ? input.chunkSize : DEFAULT_CHUNK;
	const totalBlocks = Math.max(0, toBlock - fromBlock + 1) * input.filterSets.length;

	if (toBlock < fromBlock) {
		ctx.info('Empty block range — nothing to scan.', 'warning');
		return { scanId: '', eventCount: 0, scannedBlocks: 0, totalBlocks: 0, duration: Date.now() - startTime };
	}

	// 2. Build the deterministic source + compute the scanId (merkle root).
	const plan: ScanPlan = { network, contract, filterSets: input.filterSets, fromBlock, toBlock, chunkSize };
	const source = new EventLogSource(plan);
	const jobs = source.getData();
	const jobIds = await Promise.all(jobs.map((j) => generateJobId(j)));
	const merkleRoot = await computeMerkleRoot(jobIds);
	const scanId = merkleRoot;

	ctx.info(`Scan ${scanId.slice(0, 10)}… · ${jobs.length} jobs · chunk ${chunkSize}`);

	// 3. Persist scan metadata up front so it shows in the saved-scans list.
	//    Reuse a prior scan's createdAt/decimals if this is a resume.
	const existingMeta = await getScan(scanId);
	const tokenDecimals = existingMeta?.tokenDecimals ?? (await readTokenDecimals(network, network.rpcs[0], contract));
	const now = Date.now();
	const meta: ScanMeta = {
		scanId,
		name: input.scanName || existingMeta?.name || `${input.eventName} @ ${contract.slice(0, 8)}…`,
		network: key,
		net: network,
		chainId: network.chainId,
		contract,
		explorerUrl: network.explorerUrl,
		tokenDecimals,
		abi,
		eventName: input.eventName,
		eventSignature: input.eventSignature,
		topic0: input.topic0 as `0x${string}`,
		filterSets: input.filterSets,
		fromBlock,
		toBlock,
		lastScannedBlock: fromBlock,
		chunkSize,
		eventCount: 0,
		createdAt: existingMeta?.createdAt ?? now,
		updatedAt: now,
		live: false,
	};
	await saveScan(meta);

	// Seed dedup/count from anything already stored (resume).
	const seen = new Set<string>(await getEventPks(scanId));
	let eventCount = seen.size;
	let scannedBlocks = 0;
	const pendingWrites: Promise<unknown>[] = [];

	const hub = await createTaskHub();
	const existing = await hub.findTaskByMerkleRoot(merkleRoot);
	let isResume = false;
	let task;
	if (existing) {
		const resumed = await hub.resumeTask(existing.id, source, {
			concurrency: CONCURRENCY,
			timeout: JOB_TIMEOUT,
		});
		if (resumed) {
			task = resumed;
			isResume = true;
			ctx.info(`Resuming scan from a previous session`);
		}
	}
	if (!task) {
		task = await hub.createTask({
			name: `Event Scan ${input.eventName} - ${new Date().toISOString()}`,
			source,
			concurrency: CONCURRENCY,
			timeout: JOB_TIMEOUT,
		});
	}

	const ingest = (jobResult: ScanJobResult | undefined) => {
		if (!jobResult) return;
		const { job, logs } = jobResult;
		scannedBlocks += job.toBlock - job.fromBlock + 1;
		const decoded = decodeLogs(logs, abi, scanId, key, contract, job.filterSetId);
		let fresh = 0;
		for (const ev of decoded) {
			if (!seen.has(ev.pk)) {
				seen.add(ev.pk);
				eventCount++;
				fresh++;
			}
		}
		if (decoded.length > 0) pendingWrites.push(putEvents(decoded));
		ctx.progress(
			Math.min(scannedBlocks, totalBlocks),
			totalBlocks,
			`Block ${job.fromBlock}–${job.toBlock}: +${fresh} ${input.eventName} (${eventCount} total)`,
		);
	};

	// On resume, replay already-completed job outputs to seed the count and
	// re-persist decoded events (idempotent upsert) — TaskHub won't re-run them.
	if (isResume) {
		const pageSize = 100;
		for (let offset = 0; ; offset += pageSize) {
			const batch = await task.getResults({ status: 'completed', limit: pageSize, offset });
			for (const job of batch) ingest(job.output);
			if (batch.length < pageSize) break;
		}
	}

	const interrupts = new InterruptQueue();
	task.on('job:complete', (job: Job<ScanJob, ScanJobResult>) => ingest(job.output));
	task.on('job:failed', (job: Job<ScanJob, ScanJobResult>, error: Error) => {
		scannedBlocks += job.input.toBlock - job.input.fromBlock + 1;
		ctx.info(`Failed blocks ${job.input.fromBlock}–${job.input.toBlock}: ${error.message}`, 'warning');
		ctx.progress(Math.min(scannedBlocks, totalBlocks), totalBlocks, '');
	});
	task.on('rate-limited', (concurrency: number) => {
		if (concurrency <= 1) interrupts.push({ type: 'rate-limited', data: { concurrency } });
	});

	let taskCompleted = false;
	let taskError: Error | null = null;
	const launch = () => {
		taskCompleted = false;
		taskError = null;
		const done = isResume ? task.resume() : task.start();
		done.then(() => { taskCompleted = true; }).catch((err: Error) => { taskCompleted = true; taskError = err; });
	};

	try {
		launch();
		let done = false;
		while (!done) {
			while (!taskCompleted) {
				const interrupt = await interrupts.next(1000);
				if (interrupt?.type === 'rate-limited') {
					ctx.info('All RPC endpoints are rate-limited, scan paused', 'warning');
					const action = yield* ctx.select('All RPC endpoints are rate-limited. What would you like to do?', [
						{ value: 'wait', label: 'Wait and retry automatically' },
						{ value: 'abort', label: 'Stop and keep results so far' },
					]);
					if (action === 'abort') {
						await task.stop();
						break;
					}
				}
			}
			if (!taskError) {
				done = true;
			} else {
				const err = taskError as Error;
				const action = yield* ctx.select(`Scan failed: ${err.message}`, [
					{ value: 'retry', label: 'Retry' },
					{ value: 'partial', label: `Keep partial results (${eventCount} events)` },
					{ value: 'abort', label: 'Abort' },
				]);
				if (action === 'retry') launch();
				else if (action === 'abort') throw err;
				else done = true;
			}
		}
	} finally {
		await Promise.allSettled(pendingWrites);
		interrupts.dispose();
		await hub.close();
	}

	// In the browser, countEvents (IndexedDB) is authoritative incl. resume; in
	// Node there is no IndexedDB, so fall back to the in-memory unique tally.
	const finalCount = Math.max(eventCount, await countEvents(scanId));
	await saveScan({ ...meta, eventCount: finalCount, lastScannedBlock: toBlock, updatedAt: Date.now() });

	if (source.skippedCount > 0) {
		ctx.info(
			`${source.skippedCount} block(s) couldn't be served by any RPC and were skipped — re-run to retry them, or switch RPC.`,
			'warning',
		);
	}

	return {
		scanId,
		eventCount: finalCount,
		scannedBlocks: Math.min(scannedBlocks, totalBlocks),
		totalBlocks,
		duration: Date.now() - startTime,
	};
}

export const executor: AppConfig<typeof inputSchema, typeof outputSchema>['executor'] = async function* (input, ctx) {
	const result = yield* run(input as Input, ctx);
	ctx.info(
		`Completed in ${(result.duration / 1000).toFixed(2)}s: ${result.eventCount} events across ${result.scannedBlocks} blocks`,
	);
	return result;
};
