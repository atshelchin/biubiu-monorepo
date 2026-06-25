/**
 * Unit tests for createFormatterCtx (formatter-bridge.ts).
 *
 * The bridge adapts the site's i18n layer into the shared updown
 * `FormatterContext`. We mock `$lib/i18n` with:
 *   - identifiable delegate fns for formatNumber/formatCurrency/formatDate/
 *     formatDateTime so we can verify the "no options" path delegates straight
 *     through, and
 *   - fixed `preferences` (dateLocale='en-US', timezone='America/New_York') so
 *     the "with options" path — which builds a real Intl.DateTimeFormat using
 *     prefs.dateLocale + prefs.timezone — produces a deterministic string.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/i18n', () => ({
	formatNumber: vi.fn((value: number, options?: Intl.NumberFormatOptions) => `NUM(${value})[${options?.style ?? 'plain'}]`),
	formatCurrency: vi.fn((value: number) => `CUR(${value})`),
	formatDate: vi.fn(() => 'DELEGATED_DATE'),
	formatDateTime: vi.fn(() => 'DELEGATED_DATETIME'),
	preferences: { numberLocale: 'en-US', dateLocale: 'en-US', currency: 'USD', timezone: 'America/New_York' }
}));

import { createFormatterCtx } from './formatter-bridge.js';

describe('createFormatterCtx — static fields', () => {
	it('copies the timezone from preferences', () => {
		const ctx = createFormatterCtx();
		expect(ctx.timezone).toBe('America/New_York');
	});

	it('hardcodes timeFormat to "24"', () => {
		const ctx = createFormatterCtx();
		expect(ctx.timeFormat).toBe('24');
	});

	it('defaults exchangeRate to 1 when no argument is given', () => {
		const ctx = createFormatterCtx();
		expect(ctx.exchangeRate).toBe(1);
	});

	it('uses the provided exchangeRate', () => {
		const ctx = createFormatterCtx(6.85);
		expect(ctx.exchangeRate).toBe(6.85);
	});
});

describe('createFormatterCtx — formatNumber / formatCurrency delegation', () => {
	it('forwards formatNumber to i18n.formatNumber including options', () => {
		const ctx = createFormatterCtx();
		expect(ctx.formatNumber(1234, { style: 'percent' })).toBe('NUM(1234)[percent]');
	});

	it('forwards formatCurrency to i18n.formatCurrency', () => {
		const ctx = createFormatterCtx();
		expect(ctx.formatCurrency(99)).toBe('CUR(99)');
	});
});

describe('createFormatterCtx — formatDate', () => {
	it('delegates to i18n.formatDate when no options are passed', () => {
		const ctx = createFormatterCtx();
		expect(ctx.formatDate('2026-01-01T00:00:00Z')).toBe('DELEGATED_DATE');
	});

	it('builds a real Intl date string using prefs locale + timezone when options are passed', () => {
		const ctx = createFormatterCtx();
		// 2026-01-01T00:00:00Z is 2025-12-31 19:00 in America/New_York (EST, UTC-5).
		const expected = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'short',
			timeZone: 'America/New_York'
		}).format(new Date('2026-01-01T00:00:00Z'));
		expect(ctx.formatDate('2026-01-01T00:00:00Z', { dateStyle: 'short' })).toBe(expected);
		// Sanity: the timezone shift lands us on the prior local day.
		expect(expected).toBe('12/31/25');
	});
});

describe('createFormatterCtx — formatDateTime', () => {
	it('delegates to i18n.formatDateTime when no options are passed', () => {
		const ctx = createFormatterCtx();
		expect(ctx.formatDateTime('2026-01-01T00:00:00Z')).toBe('DELEGATED_DATETIME');
	});

	it('builds a real Intl datetime string using prefs locale + timezone when options are passed', () => {
		const ctx = createFormatterCtx();
		const expected = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'America/New_York'
		}).format(new Date('2026-01-01T00:00:00Z'));
		expect(
			ctx.formatDateTime('2026-01-01T00:00:00Z', { dateStyle: 'medium', timeStyle: 'short' })
		).toBe(expected);
		// The options path applies the EST offset, so the local time is 7:00 PM.
		expect(expected).toContain('7:00');
	});
});
