// Pure formatting functions for Up/Down prediction dashboards
// These depend on i18n helpers passed in via a context object to remain testable.

import type { Round } from './types.js';

export interface FormatterContext {
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
	formatCurrency: (value: number, currency?: string) => string;
	formatDate: (ts: string, options?: Intl.DateTimeFormatOptions) => string;
	formatDateTime: (ts: string, options?: Intl.DateTimeFormatOptions) => string;
	timezone: string;
	timeFormat: '12' | '24';
	/** USD → 用户本地货币的汇率（默认 1） */
	exchangeRate: number;
}

export function fmtTimeRaw(ctx: FormatterContext, ts: string, style: 'short' | 'medium'): string {
	const dateObj = new Date(ts);
	if (ctx.timeFormat === '12') {
		return new Intl.DateTimeFormat('en-US', {
			timeStyle: style,
			timeZone: ctx.timezone,
			hour12: true
		}).format(dateObj);
	}
	return ctx.formatDate(ts, { timeStyle: style });
}

export function fmtTime(ctx: FormatterContext, ts: string): string {
	return fmtTimeRaw(ctx, ts, 'medium');
}

export function fmtShortTime(ctx: FormatterContext, ts: string): string {
	return fmtTimeRaw(ctx, ts, 'short');
}

export function fmtLocalDate(ctx: FormatterContext, ts: string): string {
	return ctx.formatDate(ts, { dateStyle: 'short' });
}

export function tzLabel(ctx: FormatterContext): string {
	const tz = ctx.timezone;
	switch (tz) {
		case 'UTC':
			return 'UTC';
		case 'America/New_York':
			return 'ET';
		case 'Asia/Shanghai':
			return 'UTC+8';
		default: {
			try {
				const parts = new Intl.DateTimeFormat('en-US', {
					timeZone: tz,
					timeZoneName: 'short'
				}).formatToParts(new Date());
				return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
			} catch {
				return tz;
			}
		}
	}
}

export function fmtTimeWindow(ctx: FormatterContext, start: string, end: string): string {
	const s = fmtShortTime(ctx, start);
	const e = fmtShortTime(ctx, end);
	if (ctx.timeFormat === '12') {
		const periodRe = /\s*(AM|PM|上午|下午|午前|午後)/i;
		const periodMatch = e.match(periodRe);
		const period = periodMatch ? periodMatch[1] : '';
		const sClean = s.replace(periodRe, '').trim();
		const eClean = e.replace(periodRe, '').trim();
		return `${sClean} - ${eClean} ${period} ${tzLabel(ctx)}`.trim();
	}
	return `${s} - ${e} ${tzLabel(ctx)}`;
}

export function fmtProfit(ctx: FormatterContext, value: number): string {
	const converted = value * (ctx.exchangeRate ?? 1);
	const sign = converted >= 0 ? '+' : '';
	return sign + ctx.formatCurrency(converted);
}

export function fmtPct(ctx: FormatterContext, value: number): string {
	return ctx.formatNumber(value, {
		style: 'percent',
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	});
}

export function fmtDateTimeShort(ctx: FormatterContext, ts: string): string {
	return ctx.formatDateTime(ts, {
		dateStyle: 'medium',
		timeStyle: 'short',
		hour12: ctx.timeFormat === '12'
	});
}

export function fmtPrice(ctx: FormatterContext, value: number): string {
	return ctx.formatNumber(value, {
		style: 'currency',
		minimumFractionDigits: 4,
		maximumFractionDigits: 4
	});
}

export function formatDuration(startTime: string, _now: number): string {
	const diff = _now - new Date(startTime).getTime();
	const days = Math.floor(diff / 86400000);
	const hours = Math.floor((diff % 86400000) / 3600000);
	const minutes = Math.floor((diff % 3600000) / 60000);
	const seconds = Math.floor((diff % 60000) / 1000);
	if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

export function formatCountdown(endTime: string, _now: number): string {
	const diff = new Date(endTime).getTime() - _now;
	if (diff <= 0) return '0m 0s';
	const minutes = Math.floor(diff / 60000);
	const seconds = Math.floor((diff % 60000) / 1000);
	return `${minutes}m ${seconds}s`;
}

export function isRoundWon(round: Round): boolean {
	return round.outcome != null && round.outcome === round.entry_direction;
}

export function todayLocal(): string {
	return new Date().toLocaleDateString('en-CA');
}

export function toUTCString(d: Date): string {
	return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function getDateRange(
	filterDate: { from: string; to: string },
	hourFilter?: number | null
): { from: string; to: string } | null {
	if (!filterDate.from) return null;
	const h = hourFilter ?? null;
	const endDate = filterDate.to || filterDate.from;
	const start =
		h !== null
			? new Date(`${filterDate.from}T${String(h).padStart(2, '0')}:00:00`)
			: new Date(`${filterDate.from}T00:00:00`);
	const end =
		h !== null
			? new Date(`${filterDate.from}T${String(h).padStart(2, '0')}:59:59`)
			: new Date(`${endDate}T23:59:59`);
	return {
		from: start.toISOString().slice(0, 19).replace('T', ' '),
		to: end.toISOString().slice(0, 19).replace('T', ' ')
	};
}

export function naturalCompare(a: string, b: string): number {
	const re = /(\d+)|(\D+)/g;
	const pa = a.match(re) ?? [];
	const pb = b.match(re) ?? [];
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const sa = pa[i] ?? '';
		const sb = pb[i] ?? '';
		const na = Number(sa);
		const nb = Number(sb);
		if (!isNaN(na) && !isNaN(nb)) {
			if (na !== nb) return na - nb;
		} else {
			const cmp = sa.localeCompare(sb);
			if (cmp !== 0) return cmp;
		}
	}
	return 0;
}
