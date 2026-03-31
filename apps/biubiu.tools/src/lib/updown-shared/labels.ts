// UI label/badge helpers for Up/Down prediction dashboards
// These depend on translation function passed in to remain testable.

import type { Round } from './types.js';
import { isRoundWon } from './formatters.js';

export type TranslateFn = (key: string, params?: Record<string, string>) => string;

export function getEventTypeLabel(t: TranslateFn, type: string): string {
	switch (type) {
		case 'round_start':
			return t('btcUpdown.event.roundStart');
		case 'entry':
			return t('btcUpdown.event.entry');
		case 'settlement':
			return t('btcUpdown.event.settlement');
		case 'exit_trigger':
			return t('btcUpdown.event.exitTrigger');
		case 'hedge_placed':
			return t('btcUpdown.event.hedgePlaced');
		case 'hedge_filled':
			return t('btcUpdown.event.hedgeFilled');
		case 'hedge_sold':
			return t('btcUpdown.event.hedgeSold');
		case 'hedge_expired':
			return t('btcUpdown.event.hedgeExpired');
		case 'round_skip':
			return t('btcUpdown.event.roundSkip');
		case 'v80_waiting':
			return t('btcUpdown.event.v80Waiting');
		case 'v80_buy':
			return t('btcUpdown.event.v80Buy');
		case 'v80_probe_done':
			return t('btcUpdown.event.v80ProbeDone');
		default:
			return type;
	}
}

export function getEventColorClass(type: string): string {
	switch (type) {
		case 'entry':
			return 'event-green';
		case 'settlement':
		case 'exit_trigger':
			return 'event-settlement';
		case 'round_start':
			return 'event-blue';
		case 'hedge_placed':
		case 'hedge_filled':
		case 'hedge_sold':
		case 'hedge_expired':
			return 'event-amber';
		case 'round_skip':
			return 'event-gray';
		case 'v80_waiting':
			return 'event-blue';
		case 'v80_buy':
			return 'event-green';
		case 'v80_probe_done':
			return 'event-amber';
		default:
			return 'event-gray';
	}
}

export function getRoundStatusLabel(t: TranslateFn, round: Round): string {
	if (round.status === 'skipped') return t('btcUpdown.round.skip');
	if (round.status === 'watching') return t('btcUpdown.round.watching');
	if (round.status === 'pending') return t('btcUpdown.round.pending');
	if (round.status === 'entered') return t('btcUpdown.round.entered');
	if (round.status === 'settled') {
		return isRoundWon(round) ? t('btcUpdown.round.win') : t('btcUpdown.round.loss');
	}
	return round.status;
}

export function getRoundBadgeClass(round: Round): string {
	if (round.status === 'skipped') return 'badge-skip';
	if (round.status === 'watching' || round.status === 'pending') return 'badge-watching';
	if (round.status === 'entered') return 'badge-entered';
	if (round.status === 'settled') {
		return isRoundWon(round) ? 'badge-win' : 'badge-loss';
	}
	return 'badge-watching';
}

export function getHedgeStatusLabel(t: TranslateFn, status: string): string {
	switch (status) {
		case 'filled':
			return t('btcUpdown.hedge.filled');
		case 'expired':
			return t('btcUpdown.hedge.expired');
		case 'sold':
			return t('btcUpdown.hedge.sold');
		case 'open':
			return t('btcUpdown.hedge.open');
		case 'pending':
			return t('btcUpdown.hedge.pending');
		default:
			return status;
	}
}

export function getSkipReasonLabel(t: TranslateFn, reason: string): string {
	if (reason.startsWith('signal_skip')) {
		const match = reason.match(/score=(\d+)/);
		return t('btcUpdown.skip.signalSkip', { score: match?.[1] ?? '0' });
	}
	switch (reason) {
		case 'no_qualifying_signal':
			return t('btcUpdown.skip.noQualifyingSignal');
		case 'no_signal':
			return t('btcUpdown.skip.noSignal');
		case 'market_expired':
			return t('btcUpdown.skip.marketExpired');
		case 'window_expired':
			return t('btcUpdown.skip.windowExpired');
		case 'daemon_restarted':
			return t('btcUpdown.skip.daemonRestarted');
		case 'v80_no_direction':
			return t('btcUpdown.skip.v80NoDirection');
		case 'v80_no_probe_fill':
			return t('btcUpdown.skip.v80NoProbeFill');
		case 'v80_insufficient_fills':
			return t('btcUpdown.skip.v80InsufficientFills');
		default:
			return reason;
	}
}

export function getSwingExitLabel(locale: string, reason: string): string {
	const zh = locale === 'zh';
	switch (reason) {
		case 'stop_loss':
			return zh ? '止损' : 'Stop Loss';
		case 'binance_stop_loss':
			return zh ? '币安止损' : 'Binance Stop Loss';
		case 'take_profit':
			return zh ? '止盈' : 'Take Profit';
		case 'checkpoint_mismatch':
			return zh ? '信号反转' : 'Signal Reversed';
		case 'clob_direction_mismatch':
			return zh ? '方向偏离' : 'Direction Mismatch';
		case 'price_moved_against':
			return zh ? '价格反向' : 'Price Moved Against';
		case 'manual':
			return zh ? '手动退出' : 'Manual Exit';
		case 'timeout':
			return zh ? '超时退出' : 'Timeout';
		default:
			return reason;
	}
}
