/**
 * Shared utility functions for btc-updown-5m pages.
 * Import from any page or component that needs these helpers.
 */
import { formatNumber, formatCurrency, formatDate, preferences } from '$lib/i18n';

/** CSS class for profit coloring */
export function profitClass(v: number): string {
	return v >= 0 ? 'positive' : 'negative';
}

/** Status dot CSS class */
export function statusDot(status: string): string {
	if (status === 'running') return 'dot-run';
	if (status === 'paused') return 'dot-pause';
	return 'dot-stop';
}

/** Format profit with sign + user's currency */
export function fmt(v: number): string {
	const sign = v >= 0 ? '+' : '';
	return sign + formatCurrency(v);
}

/** Short format for compact spaces (no fraction digits) */
export function fmtShort(v: number): string {
	const sign = v >= 0 ? '+' : '';
	return sign + formatNumber(v, { style: 'currency', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Format percentage (e.g. 58.3%) respecting locale */
export function fmtPct(v: number): string {
	return formatNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

/** Format date short (respects user's dateLocale + timezone) */
export function fmtDate(ts: string): string {
	return formatDate(ts);
}

/** Locale-aware short date (e.g. "Mar 23" or "3月23日") */
export function shortDate(d: Date): string {
	const { dateLocale, timezone } = preferences;
	return new Intl.DateTimeFormat(dateLocale, { month: 'short', day: 'numeric', timeZone: timezone }).format(d);
}

/** Locale-aware short date+hour (e.g. "Mar 23 14:00") */
export function shortDateHour(d: Date): string {
	const { dateLocale, timezone } = preferences;
	return new Intl.DateTimeFormat(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(d);
}

/** Generate sparkline HTML from data array */
export function sparklineHtml(data: number[]): string {
	const max = Math.max(...data.map(Math.abs), 0.01);
	return data.map(v => {
		const h = Math.max(Math.abs(v) / max * 100, 4);
		const color = v >= 0 ? 'var(--success, #34d399)' : 'var(--error, #f87171)';
		const opacity = 0.35 + Math.abs(v) / max * 0.65;
		return `<div style="flex:1;height:${h}%;background:${color};opacity:${opacity};border-radius:1px 1px 0 0;min-width:2px"></div>`;
	}).join('');
}
