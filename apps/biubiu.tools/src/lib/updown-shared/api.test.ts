import { describe, it, expect, vi } from 'vitest';
import {
	parseCurrentRound,
	parseStats,
	fetchCurrentRound,
	fetchStats,
	fetchStrategyStart,
	type ApiFetchOptions,
} from './api.js';
import type { CurrentRoundResponse, Stats } from './types.js';

describe('parseCurrentRound', () => {
	it('returns watching when data is null', () => {
		expect(parseCurrentRound(null)).toEqual({ status: 'watching' });
	});

	it('returns watching when round is null', () => {
		expect(parseCurrentRound({ round: null })).toEqual({ status: 'watching' });
	});

	it('returns settled with profit for settled rounds', () => {
		const data: CurrentRoundResponse = {
			round: {
				id: 1, market_slug: 'test', status: 'settled',
				entry_direction: 'Up', entry_price_avg: 0.45, entry_shares: 100,
				entry_cost: 45, entry_time: null, entry_remaining: null,
				outcome: 'Up', real_outcome: 'Up', main_payout: 100, hedge_cost: null, hedge_payout: null,
				hedge_sell_revenue: null, platform_fee: 2, total_profit: 53,
				signal_action: null, skip_reason: null, swing_mode: null,
				swing_exit_reason: null, swing_exit_price: null, stop_loss_checked_at: null,
				event_start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-01T00:05:00Z',
				created_at: '2026-01-01T00:00:00Z', settled_at: '2026-01-01T00:05:00Z',
				hedge: null,
			}
		};
		expect(parseCurrentRound(data)).toEqual({
			status: 'settled', profit: 53, direction: 'Up'
		});
	});

	it('returns entered for entered rounds', () => {
		const data: CurrentRoundResponse = {
			round: {
				id: 2, market_slug: 'test', status: 'entered',
				entry_direction: 'Down', entry_price_avg: 0.5, entry_shares: 100,
				entry_cost: 50, entry_time: null, entry_remaining: null,
				outcome: null, real_outcome: null, main_payout: null, hedge_cost: null, hedge_payout: null,
				hedge_sell_revenue: null, platform_fee: null, total_profit: null,
				signal_action: null, skip_reason: null, swing_mode: null,
				swing_exit_reason: null, swing_exit_price: null, stop_loss_checked_at: null,
				event_start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-01T00:05:00Z',
				created_at: '2026-01-01T00:00:00Z', settled_at: null,
				hedge: null,
			}
		};
		expect(parseCurrentRound(data)).toEqual({ status: 'entered', direction: 'Down' });
	});

	it('returns skipped for skipped rounds', () => {
		const data: CurrentRoundResponse = {
			round: {
				id: 3, market_slug: 'test', status: 'skipped',
				entry_direction: null, entry_price_avg: null, entry_shares: null,
				entry_cost: null, entry_time: null, entry_remaining: null,
				outcome: null, real_outcome: null, main_payout: null, hedge_cost: null, hedge_payout: null,
				hedge_sell_revenue: null, platform_fee: null, total_profit: null,
				signal_action: null, skip_reason: 'no_signal', swing_mode: null,
				swing_exit_reason: null, swing_exit_price: null, stop_loss_checked_at: null,
				event_start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-01T00:05:00Z',
				created_at: '2026-01-01T00:00:00Z', settled_at: null,
				hedge: null,
			}
		};
		expect(parseCurrentRound(data)).toEqual({ status: 'skipped' });
	});
});

describe('parseStats', () => {
	it('returns zeros for null data', () => {
		expect(parseStats(null)).toEqual({ profit: 0, rounds: 0, winRate: 0 });
	});

	it('extracts relevant fields from stats', () => {
		const stats = {
			totalProfit: 150, entered: 30, winRate: 0.65,
		} as Stats;
		expect(parseStats(stats)).toEqual({ profit: 150, rounds: 30, winRate: 0.65 });
	});
});

describe('fetchCurrentRound', () => {
	it('returns round data on success', async () => {
		const mockResponse = {
			ok: true,
			json: () => Promise.resolve({ round: { id: 1, status: 'watching' } }),
		} as Response;
		const opts: ApiFetchOptions = {
			baseUrl: 'http://test',
			fetchFn: vi.fn().mockResolvedValue(mockResponse),
		};
		const result = await fetchCurrentRound(opts);
		expect(result).toEqual({ round: { id: 1, status: 'watching' } });
		expect(opts.fetchFn).toHaveBeenCalledWith('http://test/rounds/current', { signal: undefined });
	});

	it('returns null on fetch error', async () => {
		const opts: ApiFetchOptions = {
			baseUrl: 'http://test',
			fetchFn: vi.fn().mockRejectedValue(new Error('Network error')),
		};
		const result = await fetchCurrentRound(opts);
		expect(result).toBeNull();
	});

	it('returns null on non-ok response', async () => {
		const opts: ApiFetchOptions = {
			baseUrl: 'http://test',
			fetchFn: vi.fn().mockResolvedValue({ ok: false }),
		};
		const result = await fetchCurrentRound(opts);
		expect(result).toBeNull();
	});
});

describe('fetchStats', () => {
	it('passes date range params to API', async () => {
		const mockResponse = {
			ok: true,
			json: () => Promise.resolve({ totalRounds: 10, entered: 5, winRate: 0.6 }),
		} as Response;
		const fetchFn = vi.fn().mockResolvedValue(mockResponse);
		const opts: ApiFetchOptions = { baseUrl: 'http://test', fetchFn };

		await fetchStats(opts, { from: '2026-03-15', to: '2026-03-15' }, null);

		const calledUrl = fetchFn.mock.calls[0][0] as string;
		expect(calledUrl).toContain('/stats?');
		expect(calledUrl).toContain('from=');
		expect(calledUrl).toContain('to=');
	});

	it('returns null on error', async () => {
		const opts: ApiFetchOptions = {
			baseUrl: 'http://test',
			fetchFn: vi.fn().mockRejectedValue(new Error('fail')),
		};
		const result = await fetchStats(opts, { from: '', to: '' }, null);
		expect(result).toBeNull();
	});
});

describe('fetchStrategyStart', () => {
	it('fetches first and last page to get start time', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ rows: [], total: 50, page: 1, pageSize: 1 }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({
					rows: [{ event_start_time: '2026-01-01T00:00:00Z' }],
					total: 50, page: 50, pageSize: 1
				}),
			});

		const result = await fetchStrategyStart({ baseUrl: 'http://test', fetchFn });
		expect(result).toBe('2026-01-01T00:00:00Z');
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('returns null when no rounds', async () => {
		const fetchFn = vi.fn().mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 1 }),
		});
		const result = await fetchStrategyStart({ baseUrl: 'http://test', fetchFn });
		expect(result).toBeNull();
	});
});
