// Shared constants for Up/Down prediction dashboards

export const MAX_EVENTS = 50;
export const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

export const VALIDATE_STEP_KEYS = {
	strategy: 'btcUpdown.validate.strategy',
	stats: 'btcUpdown.validate.stats',
	rounds: 'btcUpdown.validate.rounds',
	health: 'btcUpdown.validate.health',
	format: 'btcUpdown.validate.format'
} as const;

/** Events to show in the live feed (skip noisy ones like heartbeat, price_update) */
export const FEED_EVENTS = new Set([
	'round_start',
	'entry',
	'settlement',
	'exit_trigger',
	'round_skip',
	'hedge_placed',
	'hedge_filled',
	'hedge_sold',
	'hedge_expired'
]);

/** All SSE event types to listen for */
export const SSE_EVENT_TYPES = [
	'round_start',
	'waiting_for_window',
	'window_check',
	'window_miss',
	'entry',
	'hedge_placed',
	'hedge_filled',
	'hedge_sold',
	'hedge_expired',
	'price_update',
	'settlement',
	'exit_trigger',
	'round_skip',
	'heartbeat'
] as const;
