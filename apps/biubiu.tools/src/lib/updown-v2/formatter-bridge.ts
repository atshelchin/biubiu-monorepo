/**
 * Bridge between the site's i18n system and updown-shared's FormatterContext.
 * This lets us reuse all shared components (StatsGrid, HourlyChart, etc.)
 * while respecting the user's locale/currency/timezone preferences.
 */
import type { FormatterContext } from '$lib/updown-shared/formatters';
import { formatNumber, formatCurrency, formatDate, formatDateTime, preferences } from '$lib/i18n';

/**
 * Create a FormatterContext from the site's current i18n preferences.
 * Call this reactively (e.g. in $derived) so it updates when user changes settings.
 */
export function createFormatterCtx(exchangeRate = 1): FormatterContext {
	const prefs = preferences;
	return {
		formatNumber: (value: number, options?: Intl.NumberFormatOptions) => {
			return formatNumber(value, options as any);
		},
		formatCurrency: (value: number) => {
			return formatCurrency(value);
		},
		formatDate: (ts: string, options?: Intl.DateTimeFormatOptions) => {
			if (options) {
				const { dateLocale, timezone } = prefs;
				return new Intl.DateTimeFormat(dateLocale, { ...options, timeZone: timezone }).format(new Date(ts));
			}
			return formatDate(ts);
		},
		formatDateTime: (ts: string, options?: Intl.DateTimeFormatOptions) => {
			if (options) {
				const { dateLocale, timezone } = prefs;
				return new Intl.DateTimeFormat(dateLocale, { ...options, timeZone: timezone }).format(new Date(ts));
			}
			return formatDateTime(ts);
		},
		timezone: prefs.timezone,
		timeFormat: '24', // TODO: read from user settings when available
		exchangeRate
	};
}
