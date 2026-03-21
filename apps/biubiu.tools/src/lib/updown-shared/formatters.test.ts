import { describe, it, expect } from 'vitest';
import {
	fmtTimeRaw,
	fmtTime,
	fmtShortTime,
	fmtProfit,
	fmtPct,
	fmtPrice,
	formatDuration,
	formatCountdown,
	isRoundWon,
	todayLocal,
	toUTCString,
	getDateRange,
	naturalCompare,
	tzLabel,
	fmtTimeWindow,
	type FormatterContext,
} from './formatters.js';
import type { Round } from './types.js';

// --- Mock context ---

function mockCtx(overrides?: Partial<FormatterContext>): FormatterContext {
	return {
		formatNumber: (v, opts) => {
			if (opts?.style === 'percent') return `${(v * 100).toFixed(1)}%`;
			if (opts?.style === 'currency') return `$${v.toFixed(opts?.maximumFractionDigits ?? 2)}`;
			return String(v);
		},
		formatCurrency: (v) => `$${v.toFixed(2)}`,
		formatDate: (ts, opts) => {
			if (opts?.timeStyle === 'short') return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
			if (opts?.timeStyle === 'medium') return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
			if (opts?.dateStyle === 'short') return new Date(ts).toLocaleDateString('en-US');
			return new Date(ts).toISOString();
		},
		formatDateTime: () => '2026-01-01 12:00',
		timezone: 'UTC',
		timeFormat: '24',
		exchangeRate: 1,
		...overrides,
	};
}

// --- Tests ---

describe('formatDuration', () => {
	it('formats seconds only', () => {
		expect(formatDuration('2026-01-01T00:00:00Z', new Date('2026-01-01T00:00:45Z').getTime()))
			.toBe('0m 45s');
	});

	it('formats hours, minutes, seconds', () => {
		expect(formatDuration('2026-01-01T00:00:00Z', new Date('2026-01-01T02:30:15Z').getTime()))
			.toBe('2h 30m 15s');
	});

	it('formats days', () => {
		expect(formatDuration('2026-01-01T00:00:00Z', new Date('2026-01-03T04:05:06Z').getTime()))
			.toBe('2d 4h 5m 6s');
	});
});

describe('formatCountdown', () => {
	it('returns 0m 0s when time has passed', () => {
		expect(formatCountdown('2026-01-01T00:00:00Z', new Date('2026-01-01T00:01:00Z').getTime()))
			.toBe('0m 0s');
	});

	it('formats remaining time', () => {
		const endTime = '2026-01-01T00:05:30Z';
		const now = new Date('2026-01-01T00:02:10Z').getTime();
		expect(formatCountdown(endTime, now)).toBe('3m 20s');
	});
});

describe('isRoundWon', () => {
	it('returns true when outcome matches entry_direction', () => {
		expect(isRoundWon({ outcome: 'Up', entry_direction: 'Up' } as Round)).toBe(true);
	});

	it('returns false when outcome differs from entry_direction', () => {
		expect(isRoundWon({ outcome: 'Down', entry_direction: 'Up' } as Round)).toBe(false);
	});

	it('returns false when outcome is null', () => {
		expect(isRoundWon({ outcome: null, entry_direction: 'Up' } as Round)).toBe(false);
	});
});

describe('fmtProfit', () => {
	it('adds + sign for positive values', () => {
		expect(fmtProfit(mockCtx(), 10)).toBe('+$10.00');
	});

	it('no + sign for negative values', () => {
		expect(fmtProfit(mockCtx(), -5)).toBe('$-5.00');
	});

	it('handles zero', () => {
		expect(fmtProfit(mockCtx(), 0)).toBe('+$0.00');
	});
});

describe('fmtPct', () => {
	it('formats percentage with 1 decimal place', () => {
		expect(fmtPct(mockCtx(), 0.756)).toBe('75.6%');
	});
});

describe('fmtPrice', () => {
	it('formats price with 4 decimal places', () => {
		expect(fmtPrice(mockCtx(), 0.4523)).toBe('$0.4523');
	});
});

describe('todayLocal', () => {
	it('returns YYYY-MM-DD format', () => {
		const result = todayLocal();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('toUTCString', () => {
	it('formats date to UTC string without T separator', () => {
		const d = new Date('2026-03-15T14:30:45Z');
		expect(toUTCString(d)).toBe('2026-03-15 14:30:45');
	});
});

describe('getDateRange', () => {
	it('returns null when from is empty', () => {
		expect(getDateRange({ from: '', to: '' })).toBeNull();
	});

	it('returns date range for a single day', () => {
		const result = getDateRange({ from: '2026-03-15', to: '2026-03-15' });
		expect(result).not.toBeNull();
		// Output is UTC (via toISOString), so exact date depends on local timezone offset
		expect(result!.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(result!.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		// 'to' should be after 'from'
		expect(result!.to > result!.from).toBe(true);
	});

	it('narrows to a specific hour when hourFilter is given', () => {
		const result = getDateRange({ from: '2026-03-15', to: '2026-03-15' }, 14);
		expect(result).not.toBeNull();
		// The from/to span should be exactly 59 minutes 59 seconds apart (one hour window)
		const fromDate = new Date(result!.from.replace(' ', 'T') + 'Z');
		const toDate = new Date(result!.to.replace(' ', 'T') + 'Z');
		const diffSeconds = (toDate.getTime() - fromDate.getTime()) / 1000;
		expect(diffSeconds).toBe(3599); // 59m 59s
	});
});

describe('naturalCompare', () => {
	it('sorts numerically within strings', () => {
		expect(naturalCompare('v2', 'v10')).toBeLessThan(0);
		expect(naturalCompare('v10', 'v2')).toBeGreaterThan(0);
	});

	it('sorts equal strings as 0', () => {
		expect(naturalCompare('v1', 'v1')).toBe(0);
	});

	it('sorts alphabetically when no numbers', () => {
		expect(naturalCompare('abc', 'abd')).toBeLessThan(0);
	});
});

describe('tzLabel', () => {
	it('returns UTC for UTC timezone', () => {
		expect(tzLabel(mockCtx({ timezone: 'UTC' }))).toBe('UTC');
	});

	it('returns ET for America/New_York', () => {
		expect(tzLabel(mockCtx({ timezone: 'America/New_York' }))).toBe('ET');
	});

	it('returns UTC+8 for Asia/Shanghai', () => {
		expect(tzLabel(mockCtx({ timezone: 'Asia/Shanghai' }))).toBe('UTC+8');
	});
});

describe('fmtTime vs fmtShortTime', () => {
	it('fmtTime uses medium style', () => {
		const ctx = mockCtx();
		const result = fmtTime(ctx, '2026-01-01T14:30:45Z');
		// medium style includes seconds
		expect(result).toContain(':');
	});

	it('fmtShortTime uses short style (no seconds)', () => {
		const ctx = mockCtx();
		const short = fmtShortTime(ctx, '2026-01-01T14:30:45Z');
		const medium = fmtTime(ctx, '2026-01-01T14:30:45Z');
		// Short should be different from medium (no seconds)
		expect(short.length).toBeLessThanOrEqual(medium.length);
	});
});

describe('fmtTimeRaw with 12h format', () => {
	it('uses 12-hour format with AM/PM', () => {
		const ctx = mockCtx({ timeFormat: '12', timezone: 'UTC' });
		const result = fmtTimeRaw(ctx, '2026-01-01T14:30:00Z', 'short');
		expect(result).toMatch(/PM/i);
	});
});

describe('fmtTimeWindow', () => {
	it('formats window in 24h mode', () => {
		const ctx = mockCtx();
		const result = fmtTimeWindow(ctx, '2026-01-01T14:00:00Z', '2026-01-01T14:05:00Z');
		expect(result).toContain(' - ');
		expect(result).toContain('UTC');
	});
});
