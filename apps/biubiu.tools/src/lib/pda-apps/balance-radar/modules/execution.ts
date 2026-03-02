import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { balanceRadarApp } from '../index.js';
import type { Adapter, InteractionRequest, InteractionResponse, Manifest } from '@shelchin/pda';
import type { BalanceFailure } from '../types.js';

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
	balance: string;
}

export type SortField = 'address' | 'network' | 'balance';
export type SortDirection = 'asc' | 'desc';

type PDAInput = { addresses: string; networks: string[] };
type PDAOutput = {
	results: { address: string; network: string; symbol: string; balance: string }[];
	stats: { total: number; success: number; failed: number; duration: number };
};

export const executionModule = defineModule({
	name: 'execution',
	description: 'Run balance queries and manage results',

	context: {
		status: 'idle' as ExecutionStatus,
		progress: { current: 0, total: 0, status: '', percent: 0 } as ProgressState,
		logs: [] as LogEntry[],
		results: [] as ResultEntry[],
		failures: [] as BalanceFailure[],
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
				ctx.results = [];
				ctx.failures = [];
				ctx.duration = 0;
				ctx.errorMessage = '';
				ctx.showFailures = false;
				ctx.progress = { current: 0, total: 0, status: 'Preparing...', percent: 0 };

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
					ctx.results = data.results;
					ctx.duration = data.stats.duration;
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
				field: z.enum(['address', 'network', 'balance']).describe('Field to sort by'),
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
			execute({ ctx }) {
				const rows = [
					['Address', 'Network', 'Symbol', 'Balance'].join(','),
					...ctx.results.map((r) =>
						[r.address, r.network, r.symbol, r.balance].join(','),
					),
				];
				const csv = rows.join('\n');

				if (typeof window !== 'undefined') {
					const blob = new Blob([csv], { type: 'text/csv' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `balance-radar-${new Date().toISOString().slice(0, 10)}.csv`;
					a.click();
					URL.revokeObjectURL(url);
				}

				return { rowCount: ctx.results.length };
			},
		},

		reset: {
			description: 'Reset execution state to idle',
			input: z.object({}),
			execute({ ctx }) {
				ctx.status = 'idle';
				ctx.progress = { current: 0, total: 0, status: '', percent: 0 };
				ctx.logs = [];
				ctx.results = [];
				ctx.failures = [];
				ctx.duration = 0;
				ctx.errorMessage = '';
				ctx.showFailures = false;
			},
		},
	},
});
