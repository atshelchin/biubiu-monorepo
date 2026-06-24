import { describe, it, expect } from 'vitest';
import {
	getEventTypeLabel,
	getEventColorClass,
	getRoundStatusLabel,
	getRoundBadgeClass,
	getHedgeStatusLabel,
	getSkipReasonLabel,
	getSwingExitLabel,
} from './labels.js';
import type { Round } from './types.js';

const mockT = (key: string, _params?: Record<string, string>) => key;

describe('getEventTypeLabel', () => {
	it('returns translation key for known event types', () => {
		expect(getEventTypeLabel(mockT, 'round_start')).toBe('btcUpdown.event.roundStart');
		expect(getEventTypeLabel(mockT, 'entry')).toBe('btcUpdown.event.entry');
		expect(getEventTypeLabel(mockT, 'settlement')).toBe('btcUpdown.event.settlement');
		expect(getEventTypeLabel(mockT, 'exit_trigger')).toBe('btcUpdown.event.exitTrigger');
		expect(getEventTypeLabel(mockT, 'hedge_placed')).toBe('btcUpdown.event.hedgePlaced');
		expect(getEventTypeLabel(mockT, 'round_skip')).toBe('btcUpdown.event.roundSkip');
	});

	it('returns raw type for unknown events', () => {
		expect(getEventTypeLabel(mockT, 'unknown_event')).toBe('unknown_event');
	});
});

describe('getEventColorClass', () => {
	it('returns correct CSS class for each event type', () => {
		expect(getEventColorClass('entry')).toBe('event-green');
		expect(getEventColorClass('settlement')).toBe('event-settlement');
		expect(getEventColorClass('exit_trigger')).toBe('event-settlement');
		expect(getEventColorClass('round_start')).toBe('event-blue');
		expect(getEventColorClass('hedge_placed')).toBe('event-amber');
		expect(getEventColorClass('round_skip')).toBe('event-gray');
		expect(getEventColorClass('unknown')).toBe('event-gray');
	});
});

describe('getRoundStatusLabel', () => {
	it('returns correct label for each status', () => {
		expect(getRoundStatusLabel(mockT, { status: 'skipped' } as Round)).toBe('btcUpdown.round.skip');
		expect(getRoundStatusLabel(mockT, { status: 'watching' } as Round)).toBe('btcUpdown.round.watching');
		expect(getRoundStatusLabel(mockT, { status: 'pending' } as Round)).toBe('btcUpdown.round.pending');
		expect(getRoundStatusLabel(mockT, { status: 'entered' } as Round)).toBe('btcUpdown.round.entered');
	});

	it('returns win/loss for settled rounds', () => {
		expect(getRoundStatusLabel(mockT, {
			status: 'settled', outcome: 'Up', entry_direction: 'Up'
		} as Round)).toBe('btcUpdown.round.win');
		expect(getRoundStatusLabel(mockT, {
			status: 'settled', outcome: 'Down', entry_direction: 'Up'
		} as Round)).toBe('btcUpdown.round.loss');
	});

	it('returns raw status for unknown statuses', () => {
		expect(getRoundStatusLabel(mockT, { status: 'custom_status' } as Round)).toBe('custom_status');
	});
});

describe('getRoundBadgeClass', () => {
	it('returns correct badge class', () => {
		expect(getRoundBadgeClass({ status: 'skipped' } as Round)).toBe('badge-skip');
		expect(getRoundBadgeClass({ status: 'watching' } as Round)).toBe('badge-watching');
		expect(getRoundBadgeClass({ status: 'pending' } as Round)).toBe('badge-watching');
		expect(getRoundBadgeClass({ status: 'entered' } as Round)).toBe('badge-entered');
	});

	it('returns win/loss badge for settled rounds', () => {
		expect(getRoundBadgeClass({
			status: 'settled', outcome: 'Up', entry_direction: 'Up'
		} as Round)).toBe('badge-win');
		expect(getRoundBadgeClass({
			status: 'settled', outcome: 'Down', entry_direction: 'Up'
		} as Round)).toBe('badge-loss');
	});
});

describe('getHedgeStatusLabel', () => {
	it('returns translation keys for known statuses', () => {
		expect(getHedgeStatusLabel(mockT, 'filled')).toBe('btcUpdown.hedge.filled');
		expect(getHedgeStatusLabel(mockT, 'expired')).toBe('btcUpdown.hedge.expired');
		expect(getHedgeStatusLabel(mockT, 'sold')).toBe('btcUpdown.hedge.sold');
		expect(getHedgeStatusLabel(mockT, 'open')).toBe('btcUpdown.hedge.open');
		expect(getHedgeStatusLabel(mockT, 'pending')).toBe('btcUpdown.hedge.pending');
	});

	it('returns raw status for unknown', () => {
		expect(getHedgeStatusLabel(mockT, 'custom')).toBe('custom');
	});
});

describe('getSkipReasonLabel', () => {
	it('handles signal_skip with score', () => {
		expect(getSkipReasonLabel(mockT, 'signal_skip(score=42)')).toBe('btcUpdown.skip.signalSkip');
	});

	it('handles known skip reasons', () => {
		expect(getSkipReasonLabel(mockT, 'no_qualifying_signal')).toBe('btcUpdown.skip.noQualifyingSignal');
		expect(getSkipReasonLabel(mockT, 'market_expired')).toBe('btcUpdown.skip.marketExpired');
		expect(getSkipReasonLabel(mockT, 'daemon_restarted')).toBe('btcUpdown.skip.daemonRestarted');
	});

	it('returns raw reason for unknown', () => {
		expect(getSkipReasonLabel(mockT, 'custom_reason')).toBe('custom_reason');
	});
});

describe('getSwingExitLabel', () => {
	it('returns translation key for known exit reasons', () => {
		expect(getSwingExitLabel(mockT, 'stop_loss')).toBe('btcUpdown.exit.stopLoss');
		expect(getSwingExitLabel(mockT, 'take_profit')).toBe('btcUpdown.exit.takeProfit');
		expect(getSwingExitLabel(mockT, 'checkpoint_mismatch')).toBe('btcUpdown.exit.signalReversed');
		expect(getSwingExitLabel(mockT, 'manual')).toBe('btcUpdown.exit.manual');
	});

	it('returns raw reason for unknown', () => {
		expect(getSwingExitLabel(mockT, 'custom_exit')).toBe('custom_exit');
	});
});
