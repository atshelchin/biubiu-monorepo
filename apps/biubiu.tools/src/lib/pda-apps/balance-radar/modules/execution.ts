import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { balanceRadarApp } from '../index.js';
import { tokenSpecSchema, networkConfigSchema } from '../schema.js';
import { resultsStore } from './results-store.svelte.js';
import { runControl } from '../infra/run-control.js';
import type { Adapter, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import type { BalanceFailure, NetworkTokenSelection, NetworkConfig } from '../types.js';

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

export interface ResultEntry {
	address: string;
	network: string;
	symbol: string;
	tokenAddress?: string;
	balance: string;
}

export type SortField = 'address' | 'network' | 'symbol' | 'balance';
export type SortDirection = 'asc' | 'desc';

type PDAInput = {
	addresses: string;
	networks: string[];
	tokenSelections?: NetworkTokenSelection[];
	customNetworks?: NetworkConfig[];
};
type PDAOutput = {
	results: { address: string; network: string; symbol: string; tokenAddress?: string; balance: string }[];
	failures?: BalanceFailure[];
	stats: { total: number; success: number; failed: number; duration: number };
};

export const executionModule = defineModule({
	name: 'execution',
	description: 'Run balance queries and manage results',

	context: {
		status: 'idle' as ExecutionStatus,
		progress: { current: 0, total: 0, status: '', percent: 0 } as ProgressState,
		logs: [] as LogEntry[],
		// Heavy result rows/failures live in resultsStore ($state.raw), NOT here —
		// ctx is deep-proxied by PageKit and must stay light. These scalars mirror
		// the store so the UI can show counts/stat pills cheaply.
		resultCount: 0,
		failureCount: 0,
		stopping: false,
		duration: 0,
		errorMessage: '',

		// Results interaction state
		sortField: 'network' as SortField,
		sortDirection: 'asc' as SortDirection,
		filterNetwork: '',
		searchQuery: '',
		showFailures: false,
	},

	actions: {
		run: {
			description: 'Start balance queries with configured addresses and networks',
			input: z.object({
				addresses: z.string().describe('Comma-separated wallet addresses'),
				networks: z
					.array(z.string())
					.describe('Network keys to query (e.g. ["ethereum", "polygon"])'),
				tokenSelections: z
					.array(z.object({ network: z.string(), tokens: z.array(tokenSpecSchema) }))
					.optional()
					.describe('Per-network token selection; omit to query native coins only'),
				customNetworks: z
					.array(networkConfigSchema)
					.optional()
					.describe('User-defined EVM networks to merge into the registry'),
			}),
			output: z.object({
				success: z.boolean(),
				totalResults: z.number(),
				totalFailures: z.number(),
				durationMs: z.number(),
			}),
			async execute({ input, ctx }) {
				// Reset state
				ctx.status = 'running';
				ctx.logs = [];
				ctx.resultCount = 0;
				ctx.failureCount = 0;
				ctx.stopping = false;
				ctx.duration = 0;
				ctx.errorMessage = '';
				ctx.showFailures = false;
				ctx.progress = { current: 0, total: 0, status: 'Preparing...', percent: 0 };
				resultsStore.clear();
				runControl.reset();

				// Create adapter that bridges PDA events to Pagekit ctx
				const adapter: Adapter<PDAInput, PDAOutput> = {
					async collectInput() {
						return input;
					},

					async handleInteraction<T extends string>(
						request: InteractionRequest<T extends 'confirm' | 'prompt' | 'select' | 'multiselect' | 'progress' | 'info' | 'form' ? T : never>,
					): Promise<InteractionResponse<any>> {
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
									percent: total > 0 ? Math.round((data.current / total) * 100) : 0,
								};
							}
						} else if (request.type === 'info') {
							const data = request.data as { level?: string } | undefined;
							ctx.logs = [
								...ctx.logs,
								{
									timestamp: Date.now(),
									message: request.message,
									level: (data?.level as LogEntry['level']) ?? 'info',
								},
							];
						}

						// Auto-respond with defaults for all interaction types
						return {
							requestId: request.requestId,
							value: request.defaultValue,
						} as InteractionResponse<any>;
					},

					async renderOutput() {
						// No-op: Pagekit ctx handles rendering
					},
				};

				const executionResult = await balanceRadarApp.run(adapter, input);

				if (executionResult.success && executionResult.data) {
					const data = executionResult.data;
					const failures = data.failures ?? [];
					resultsStore.set(data.results, failures);
					ctx.resultCount = data.results.length;
					ctx.failureCount = failures.length;
					ctx.duration = data.stats.duration;
					ctx.stopping = false;
					ctx.status = 'success';
					ctx.progress = {
						current: data.stats.total,
						total: data.stats.total,
						status: 'Complete',
						percent: 100,
					};

					return {
						success: true,
						totalResults: data.stats.success,
						totalFailures: data.stats.failed,
						durationMs: data.stats.duration,
					};
				} else {
					ctx.errorMessage = executionResult.error ?? 'Unknown error';
					ctx.stopping = false;
					ctx.status = 'error';

					return {
						success: false,
						totalResults: 0,
						totalFailures: 0,
						durationMs: executionResult.duration,
					};
				}
			},
		},

		setSortField: {
			description: 'Change sort field for results table',
			input: z.object({
				field: z.enum(['address', 'network', 'symbol', 'balance']).describe('Field to sort by'),
			}),
			execute({ input, ctx }) {
				if (ctx.sortField === input.field) {
					ctx.sortDirection = ctx.sortDirection === 'asc' ? 'desc' : 'asc';
				} else {
					ctx.sortField = input.field;
					ctx.sortDirection = 'asc';
				}
			},
		},

		setFilterNetwork: {
			description: 'Filter results by network (empty string for all)',
			input: z.object({
				network: z.string().describe('Network key to filter by, or empty for all'),
			}),
			execute({ input, ctx }) {
				ctx.filterNetwork = input.network;
			},
		},

		setSearchQuery: {
			description: 'Filter results by address substring',
			input: z.object({
				query: z.string().describe('Search query for address filtering'),
			}),
			execute({ input, ctx }) {
				ctx.searchQuery = input.query;
			},
		},

		toggleFailures: {
			description: 'Toggle failure details visibility',
			input: z.object({}),
			execute({ ctx }) {
				ctx.showFailures = !ctx.showFailures;
			},
		},

		exportCSV: {
			description: 'Export results as CSV file download',
			input: z.object({}),
			output: z.object({ rowCount: z.number() }),
			execute() {
				const rows = resultsStore.rows;

				// Build the file as an array of string chunks so we never hold a
				// single multi-hundred-MB string in memory; the Blob constructor
				// concatenates the parts. At millions of rows a single join() OOMs.
				const CHUNK = 5000;
				const parts: string[] = ['Address,Network,Token,Contract,Balance\n'];
				for (let i = 0; i < rows.length; i += CHUNK) {
					let s = '';
					const end = Math.min(i + CHUNK, rows.length);
					for (let j = i; j < end; j++) {
						const r = rows[j];
						s += `${csvCell(r.address)},${csvCell(r.network)},${csvCell(r.symbol)},${csvCell(r.tokenAddress ?? 'native')},${csvCell(r.balance)}\n`;
					}
					parts.push(s);
				}

				if (typeof window !== 'undefined') {
					const blob = new Blob(parts, { type: 'text/csv;charset=utf-8' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `balance-radar-${new Date().toISOString().slice(0, 10)}.csv`;
					a.click();
					URL.revokeObjectURL(url);
				}

				return { rowCount: rows.length };
			},
		},

		stop: {
			description: 'Stop the current run and keep partial results',
			input: z.object({}),
			execute({ ctx }) {
				runControl.abort();
				ctx.stopping = true;
			},
		},

		reset: {
			description: 'Reset execution state to idle',
			input: z.object({}),
			execute({ ctx }) {
				ctx.status = 'idle';
				ctx.progress = { current: 0, total: 0, status: '', percent: 0 };
				ctx.logs = [];
				ctx.resultCount = 0;
				ctx.failureCount = 0;
				ctx.stopping = false;
				ctx.duration = 0;
				ctx.errorMessage = '';
				ctx.showFailures = false;
				// Start the next run with a clean results view.
				ctx.sortField = 'network';
				ctx.sortDirection = 'asc';
				ctx.filterNetwork = '';
				ctx.searchQuery = '';
				resultsStore.clear();
				runControl.reset();
			},
		},
	},
});

/** Minimal RFC-4180 CSV escaping for fields that may contain , " or newlines. */
function csvCell(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
