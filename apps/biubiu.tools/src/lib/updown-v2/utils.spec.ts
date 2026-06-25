/**
 * Unit tests for the pure formatters / mappers in updown-v2/utils.ts.
 *
 * `fmt`, `fmtShort`, `fmtPct`, `fmtDate` delegate to the site's i18n layer
 * (`$lib/i18n`). We mock that module with deterministic, locale-independent
 * implementations so we can assert the exact composed output (sign prefixing,
 * "%" suffix, option pass-through) without depending on the host ICU data.
 *
 * `profitClass` and `statusDot` are pure mappers — every branch is exercised,
 * including the negative / zero / positive boundaries and the fall-through.
 */
import { describe, it, expect, vi } from 'vitest';

// Deterministic i18n stubs. We make the formatters echo their input + the
// options they received so the tests can verify both the value handling and
// that updown's wrappers forward the correct options.
vi.mock('$lib/i18n', () => ({
	formatNumber: vi.fn((value: number, options?: Intl.NumberFormatOptions) => {
		if (options?.style === 'currency') {
			return `CUR[${value}|min:${options.minimumFractionDigits}|max:${options.maximumFractionDigits}]`;
		}
		return `NUM[${value}|min:${options?.minimumFractionDigits}|max:${options?.maximumFractionDigits}]`;
	}),
	formatCurrency: vi.fn((value: number) => `$${value}`),
	formatDate: vi.fn((ts: string) => `DATE(${ts})`),
	preferences: { numberLocale: 'en-US', dateLocale: 'en-US', currency: 'USD', timezone: 'UTC' }
}));

import { fmt, fmtShort, fmtPct, fmtDate, profitClass, statusDot, isSpaceAdmin } from './utils.js';

describe('profitClass', () => {
	it('maps a positive value to "positive"', () => {
		expect(profitClass(12.5)).toBe('positive');
	});

	it('maps zero to "positive" (>= 0 boundary)', () => {
		expect(profitClass(0)).toBe('positive');
	});

	it('maps a negative value to "negative"', () => {
		expect(profitClass(-0.01)).toBe('negative');
	});

	it('treats -0 as positive (since -0 >= 0 is true)', () => {
		expect(profitClass(-0)).toBe('positive');
	});
});

describe('statusDot', () => {
	it('maps "running" to dot-run', () => {
		expect(statusDot('running')).toBe('dot-run');
	});

	it('maps "paused" to dot-pause', () => {
		expect(statusDot('paused')).toBe('dot-pause');
	});

	it('falls through to dot-stop for "stopped"', () => {
		expect(statusDot('stopped')).toBe('dot-stop');
	});

	it('falls through to dot-stop for any unknown status', () => {
		expect(statusDot('something-else')).toBe('dot-stop');
		expect(statusDot('')).toBe('dot-stop');
	});
});

describe('fmt (signed currency)', () => {
	it('prefixes a "+" sign for a positive amount', () => {
		expect(fmt(42)).toBe('+$42');
	});

	it('prefixes a "+" sign for zero (>= 0 boundary)', () => {
		expect(fmt(0)).toBe('+$0');
	});

	it('does NOT prefix "+" for a negative amount (the minus comes from the currency)', () => {
		expect(fmt(-5)).toBe('$-5');
	});
});

describe('fmtShort (compact, no fraction digits)', () => {
	it('prefixes "+" and requests 0 fraction digits in currency style', () => {
		expect(fmtShort(1000)).toBe('+CUR[1000|min:0|max:0]');
	});

	it('does not prefix "+" for a negative value', () => {
		expect(fmtShort(-250)).toBe('CUR[-250|min:0|max:0]');
	});

	it('prefixes "+" for zero', () => {
		expect(fmtShort(0)).toBe('+CUR[0|min:0|max:0]');
	});
});

describe('fmtPct (one fraction digit + "%" suffix)', () => {
	it('appends "%" and requests exactly 1 fraction digit', () => {
		expect(fmtPct(58.3)).toBe('NUM[58.3|min:1|max:1]%');
	});

	it('formats zero with a trailing "%"', () => {
		expect(fmtPct(0)).toBe('NUM[0|min:1|max:1]%');
	});

	it('formats a negative percentage', () => {
		expect(fmtPct(-12.7)).toBe('NUM[-12.7|min:1|max:1]%');
	});
});

describe('fmtDate', () => {
	it('delegates straight to i18n formatDate with the raw timestamp', () => {
		expect(fmtDate('2026-01-02T03:04:05Z')).toBe('DATE(2026-01-02T03:04:05Z)');
	});
});

// winRate is stored as a PERCENT (0-100, e.g. 58.3). The hub previously rendered it
// raw as `{winRate}%` (locale-unaware); it must go through fmtPct like every other
// win-rate readout. This documents the unit + the single-formatter-boundary contract.
describe('fmtPct (winRate render boundary)', () => {
	it('renders a percent-unit winRate (58.3) with locale formatting + 1 fraction digit, NOT raw', () => {
		// Raw render would have been the string '58.3%'. fmtPct routes through i18n
		// (mocked NUM[...] here) so it is locale-aware and consistently 1-dp.
		expect(fmtPct(58.3)).toBe('NUM[58.3|min:1|max:1]%');
	});

	it('does NOT treat winRate as a fraction (0.583 stays 0.583, never *100)', () => {
		// Guards the fraction-vs-percent off-by-100: fmtPct must not rescale.
		expect(fmtPct(0.583)).toBe('NUM[0.583|min:1|max:1]%');
	});
});

describe('isSpaceAdmin (admin gate on real authenticated Safe, not a hardcoded userId)', () => {
	const adminSafe = '0xAbC0000000000000000000000000000000000001';
	const memberSafe = '0xDef0000000000000000000000000000000000002';

	const members = [
		{ role: 'admin', safeAddress: adminSafe },
		{ role: 'member', safeAddress: memberSafe }
	];

	it('is true when the logged-in user IS the admin (Safe matches, case-insensitive)', () => {
		expect(isSpaceAdmin(members, { safeAddress: adminSafe.toLowerCase() })).toBe(true);
		expect(isSpaceAdmin(members, { safeAddress: adminSafe.toUpperCase() })).toBe(true);
	});

	it('is false for a logged-in non-admin member (Safe matches a member, not an admin)', () => {
		expect(isSpaceAdmin(members, { safeAddress: memberSafe })).toBe(false);
	});

	it('is false for an arbitrary logged-in Safe that matches no member', () => {
		expect(isSpaceAdmin(members, { safeAddress: '0x9999999999999999999999999999999999999999' })).toBe(false);
	});

	it('is false when no user is logged in (null / undefined identity)', () => {
		expect(isSpaceAdmin(members, null)).toBe(false);
		expect(isSpaceAdmin(members, undefined)).toBe(false);
	});

	it('is false for a user with an empty / whitespace / missing safeAddress (cannot match anything)', () => {
		expect(isSpaceAdmin(members, { safeAddress: '' })).toBe(false);
		expect(isSpaceAdmin(members, { safeAddress: '   ' })).toBe(false);
		expect(isSpaceAdmin(members, {})).toBe(false);
	});

	it('does NOT leak admin to fabricated/truncated mock Safe addresses (the old hardcoded-userId leak)', () => {
		// Mock members carry truncated Safe values like '0x1234...abcd' that can never
		// equal a real derived Safe. A real logged-in Safe must therefore never match.
		const mockMembers = [{ role: 'admin', safeAddress: '0x1234...abcd' }];
		const realUser = { safeAddress: '0x1234567890abcdef1234567890abcdef12345678' };
		expect(isSpaceAdmin(mockMembers, realUser)).toBe(false);
	});

	it('is false when the matching Safe is present but its role is not admin', () => {
		const onlyMembers = [{ role: 'member', safeAddress: adminSafe }];
		expect(isSpaceAdmin(onlyMembers, { safeAddress: adminSafe })).toBe(false);
	});
});
