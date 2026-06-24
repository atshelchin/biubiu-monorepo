/**
 * Execution module: run a scan via the PDA app, stream progress/logs into ctx,
 * read decoded events back from IndexedDB, manage saved scans, export CSV/JSON,
 * and drive live-tail. The live-tail handle + pool are kept module-scoped (not in
 * ctx) because they aren't serializable.
 */
import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { type Abi, getAddress } from 'viem';
import type {
	Adapter,
	InteractionRequest,
	InteractionResponse,
	InteractionType
} from '@shelchin/pda';
import { eventScannerApp } from '../index.js';
import { fillGaps } from '../executor.js';
import { inputSchema } from '../schema.js';
import type { DecodedEvent, RawLog, ScanMeta } from '../types.js';
import { buildRegistry } from '../infra/networks.js';
import { createGetLogsPools } from '../infra/getlogs-pool.js';
import {
	countEvents,
	deleteScan,
	getAllEvents,
	getEvents,
	getScan,
	getScans
} from '../infra/event-store.js';
import { startLiveTail, type LiveTailHandle } from '../infra/live-tail.js';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface LogEntry {
	timestamp: number;
	message: string;
	level: 'info' | 'warning' | 'error';
}
export interface ProgressState {
	current: number;
	total: number;
	status: string;
	percent: number;
}

const PAGE_SIZE = 100;

// Non-serializable singletons (browser module is a singleton per page).
let liveHandle: LiveTailHandle | null = null;

function downloadBlob(content: string, type: string, filename: string) {
	if (typeof window === 'undefined') return;
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
	return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface ExecCtx {
	status: ExecutionStatus;
	progress: ProgressState;
	logs: LogEntry[];
	errorMessage: string;
	scanId: string;
	currentScan: ScanMeta | null;
	events: DecodedEvent[];
	eventTotal: number;
	page: number;
	order: 'asc' | 'desc';
	savedScans: ScanMeta[];
	liveActive: boolean;
}

async function loadPage(ctx: ExecCtx) {
	if (!ctx.scanId) return;
	ctx.eventTotal = await countEvents(ctx.scanId);
	ctx.events = await getEvents(ctx.scanId, {
		limit: PAGE_SIZE,
		offset: ctx.page * PAGE_SIZE,
		order: ctx.order
	});
}

export const executionModule = defineModule({
	name: 'execution',
	description: 'Run event scans, browse results, export, and manage live-tail',

	context: {
		status: 'idle' as ExecutionStatus,
		progress: { current: 0, total: 0, status: '', percent: 0 } as ProgressState,
		logs: [] as LogEntry[],
		errorMessage: '',
		scanId: '',
		currentScan: null as ScanMeta | null,
		events: [] as DecodedEvent[],
		eventTotal: 0,
		page: 0,
		order: 'desc' as 'asc' | 'desc',
		savedScans: [] as ScanMeta[],
		liveActive: false
	},

	actions: {
		refreshScans: {
			description: 'Reload the saved-scans list from IndexedDB',
			input: z.object({}),
			async execute({ ctx }) {
				ctx.savedScans = await getScans();
			}
		},

		run: {
			description: 'Run an event scan with the configured chain/contract/event/filters',
			input: inputSchema,
			output: z.object({
				success: z.boolean(),
				scanId: z.string(),
				eventCount: z.number(),
				durationMs: z.number()
			}),
			async execute({ input, ctx }) {
				return executeScan(ctx, input);
			}
		},

		resumeScan: {
			description: 'Resume a saved scan — re-runs only the chunks that did not complete (断点续扫)',
			input: z.object({ scanId: z.string() }),
			output: z.object({
				success: z.boolean(),
				scanId: z.string(),
				eventCount: z.number(),
				durationMs: z.number()
			}),
			async execute({ input, ctx }) {
				const meta = await getScan(input.scanId);
				if (!meta) return { success: false, scanId: '', eventCount: 0, durationMs: 0 };
				return executeScan(ctx, {
					network: meta.net,
					contract: meta.contract,
					abi: meta.abi,
					eventName: meta.eventName,
					eventSignature: meta.eventSignature,
					topic0: meta.topic0,
					filterSets: meta.filterSets,
					fromBlock: meta.fromBlock,
					toBlock: meta.toBlock,
					chunkSize: meta.chunkSize,
					scanName: meta.name,
					live: false
				} as z.infer<typeof inputSchema>);
			}
		},

		loadScan: {
			description: 'Open a previously saved scan into the results view',
			input: z.object({ scanId: z.string() }),
			async execute({ input, ctx }) {
				const scan = await getScan(input.scanId);
				if (!scan) return;
				ctx.scanId = scan.scanId;
				ctx.currentScan = scan;
				ctx.page = 0;
				ctx.status = 'success';
				await loadPage(ctx);
			}
		},

		deleteScan: {
			description: 'Delete a saved scan and its events',
			input: z.object({ scanId: z.string() }),
			async execute({ input, ctx }) {
				await deleteScan(input.scanId);
				if (ctx.scanId === input.scanId) {
					ctx.scanId = '';
					ctx.currentScan = null;
					ctx.events = [];
					ctx.eventTotal = 0;
				}
				ctx.savedScans = await getScans();
			}
		},

		setPage: {
			description: 'Go to a results page',
			input: z.object({ page: z.number().int().min(0) }),
			async execute({ input, ctx }) {
				ctx.page = input.page;
				await loadPage(ctx);
			}
		},

		setOrder: {
			description: 'Order results by block (asc/desc)',
			input: z.object({ order: z.enum(['asc', 'desc']) }),
			async execute({ input, ctx }) {
				ctx.order = input.order;
				ctx.page = 0;
				await loadPage(ctx);
			}
		},

		exportCSV: {
			description: 'Download all events of the current scan as CSV',
			input: z.object({}),
			output: z.object({ rows: z.number() }),
			async execute({ ctx }) {
				if (!ctx.scanId) return { rows: 0 };
				const all = await getAllEvents(ctx.scanId);
				const argKeys = Array.from(new Set(all.flatMap((e) => Object.keys(e.args))));
				const header = ['block', 'txHash', 'logIndex', 'direction', 'event', ...argKeys];
				const lines = [header.join(',')];
				for (const e of all) {
					const row = [
						String(e.blockNumber),
						e.txHash,
						String(e.logIndex),
						e.filterSetId,
						e.eventName,
						...argKeys.map((k) => e.args[k] ?? '')
					];
					lines.push(row.map(csvCell).join(','));
				}
				downloadBlob(
					lines.join('\n'),
					'text/csv',
					`event-scan-${ctx.scanId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
				);
				return { rows: all.length };
			}
		},

		exportJSON: {
			description: 'Download all events of the current scan as JSON',
			input: z.object({}),
			output: z.object({ rows: z.number() }),
			async execute({ ctx }) {
				if (!ctx.scanId) return { rows: 0 };
				const all = await getAllEvents(ctx.scanId);
				const scan = ctx.currentScan;
				// A coverage header makes the export self-auditable: exactly which block
				// range was queried, whether it is complete, and which blocks (if any)
				// could not be fetched from any RPC.
				const gaps = scan?.gaps ?? [];
				const coverage = scan
					? {
							chainId: scan.chainId,
							contract: scan.contract,
							event: scan.eventSignature,
							fromBlock: scan.fromBlock,
							toBlock: scan.toBlock,
							complete:
								gaps.length === 0 && (scan.lastScannedBlock ?? scan.toBlock) >= scan.toBlock,
							gaps,
							eventCount: all.length,
							exportedAt: new Date().toISOString()
						}
					: null;
				const payload = { coverage, scan, events: all };
				downloadBlob(
					JSON.stringify(payload, null, 2),
					'application/json',
					`event-scan-${ctx.scanId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`
				);
				return { rows: all.length };
			}
		},

		stopLive: {
			description: 'Stop live-tail',
			input: z.object({}),
			execute({ ctx }) {
				if (liveHandle) {
					liveHandle.stop();
					liveHandle = null;
				}
				ctx.liveActive = false;
			}
		},

		refreshResults: {
			description: 'Reload the current results page (e.g. after a live-tail tick)',
			input: z.object({}),
			async execute({ ctx }) {
				await loadPage(ctx);
			}
		},

		fillGaps: {
			description:
				'Re-scan only the unservable block gaps of a saved scan (data-completeness recovery)',
			input: z.object({ scanId: z.string() }),
			output: z.object({
				filledBlocks: z.number(),
				remainingGaps: z.number(),
				eventCount: z.number()
			}),
			async execute({ input, ctx }) {
				const scan = await getScan(input.scanId);
				if (!scan?.gaps?.length) {
					return { filledBlocks: 0, remainingGaps: 0, eventCount: ctx.eventTotal };
				}
				if (liveHandle) {
					liveHandle.stop();
					liveHandle = null;
					ctx.liveActive = false;
				}
				ctx.status = 'running';
				ctx.logs = [];
				ctx.errorMessage = '';
				ctx.progress = { current: 0, total: 1, status: 'Re-scanning gaps…', percent: 0 };
				try {
					const res = await fillGaps(input.scanId, (p) => {
						ctx.progress = {
							current: p.current,
							total: p.total,
							status: p.message,
							percent: p.total > 0 ? Math.round((p.current / p.total) * 100) : 0
						};
					});
					ctx.scanId = input.scanId;
					ctx.currentScan = await getScan(input.scanId);
					ctx.page = 0;
					await loadPage(ctx);
					ctx.status = 'success';
					ctx.progress = { current: 1, total: 1, status: 'Complete', percent: 100 };
					ctx.savedScans = await getScans();
					return {
						filledBlocks: res.filledBlocks,
						remainingGaps: res.remainingGaps.length,
						eventCount: res.eventCount
					};
				} catch (e) {
					ctx.errorMessage = e instanceof Error ? e.message : 'Gap re-scan failed';
					ctx.status = 'error';
					return { filledBlocks: 0, remainingGaps: scan.gaps.length, eventCount: ctx.eventTotal };
				}
			}
		},

		reset: {
			description: 'Reset to idle (keeps saved scans)',
			input: z.object({}),
			execute({ ctx }) {
				if (liveHandle) {
					liveHandle.stop();
					liveHandle = null;
				}
				ctx.status = 'idle';
				ctx.progress = { current: 0, total: 0, status: '', percent: 0 };
				ctx.logs = [];
				ctx.errorMessage = '';
				ctx.liveActive = false;
			}
		}
	}
});

/** Shared run logic for both `run` and `resumeScan`. */
async function executeScan(
	ctx: ExecCtx,
	input: z.infer<typeof inputSchema>
): Promise<{ success: boolean; scanId: string; eventCount: number; durationMs: number }> {
	if (liveHandle) {
		liveHandle.stop();
		liveHandle = null;
	}
	ctx.status = 'running';
	ctx.logs = [];
	ctx.errorMessage = '';
	ctx.events = [];
	ctx.eventTotal = 0;
	ctx.page = 0;
	ctx.liveActive = false;
	ctx.progress = { current: 0, total: 0, status: 'Preparing…', percent: 0 };

	const adapter: Adapter<
		typeof input,
		{
			scanId: string;
			eventCount: number;
			scannedBlocks: number;
			totalBlocks: number;
			duration: number;
		}
	> = {
		async collectInput() {
			return input;
		},
		async handleInteraction<T extends InteractionType>(
			request: InteractionRequest<T>
		): Promise<InteractionResponse<T>> {
			if (request.type === 'progress') {
				const data = request.data as
					| { current: number; total?: number; status?: string }
					| undefined;
				if (data) {
					const total = data.total ?? ctx.progress.total;
					ctx.progress = {
						current: data.current,
						total,
						status: data.status ?? request.message,
						percent: total > 0 ? Math.round((data.current / total) * 100) : 0
					};
				}
			} else if (request.type === 'info') {
				const data = request.data as { level?: string } | undefined;
				ctx.logs = [
					...ctx.logs,
					{
						timestamp: Date.now(),
						message: request.message,
						level: (data?.level as LogEntry['level']) ?? 'info'
					}
				];
			}
			return {
				requestId: request.requestId,
				value: request.defaultValue
			} as InteractionResponse<T>;
		},
		async renderOutput() {
			/* ctx-driven */
		}
	};

	const result = await eventScannerApp.run(adapter, input);

	if (result.success && result.data) {
		ctx.scanId = result.data.scanId;
		ctx.currentScan = await getScan(result.data.scanId);
		await loadPage(ctx);
		ctx.status = 'success';
		ctx.progress = {
			current: result.data.totalBlocks,
			total: result.data.totalBlocks,
			status: 'Complete',
			percent: 100
		};
		ctx.savedScans = await getScans();
		if (input.live && ctx.currentScan) startLive(ctx, input, ctx.currentScan);
		return {
			success: true,
			scanId: result.data.scanId,
			eventCount: result.data.eventCount,
			durationMs: result.data.duration
		};
	}

	ctx.errorMessage = result.error ?? 'Unknown error';
	ctx.status = 'error';
	return { success: false, scanId: '', eventCount: 0, durationMs: result.duration };
}

/** Start live-tail for a completed scan (module-scoped handle). */
function startLive(ctx: ExecCtx, input: z.infer<typeof inputSchema>, scan: ScanMeta) {
	const { key, networks, chainMap } = buildRegistry(input.network);
	const pool = createGetLogsPools<RawLog[]>(networks, chainMap).get(key);
	if (!pool) return;
	ctx.liveActive = true;
	liveHandle = startLiveTail({
		pool,
		scanId: scan.scanId,
		networkKey: key,
		contract: getAddress(input.contract),
		abi: input.abi as Abi,
		filterSets: scan.filterSets,
		chunkSize: scan.chunkSize,
		fromBlockFallback: scan.toBlock,
		intervalMs: input.liveIntervalMs ?? 12000,
		onTick: async () => {
			ctx.eventTotal = await countEvents(scan.scanId);
			ctx.events = await getEvents(scan.scanId, {
				limit: PAGE_SIZE,
				offset: ctx.page * PAGE_SIZE,
				order: ctx.order
			});
			const updated = await getScan(scan.scanId);
			if (updated) ctx.currentScan = updated;
		}
	});
}
