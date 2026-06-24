/**
 * Wallet Sweep — small display formatters shared by the Run/Done widgets.
 * Kept framework-agnostic; the i18n `formatNumber` respects the user's locale.
 */
import { formatUnits } from 'viem';
import { formatNumber } from '$lib/i18n';

/** Abbreviate a 0x address as 0x1234…cdef (leaves short strings untouched). */
export function shortAddr(a: string): string {
	return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Format a wei amount as a human, locale-aware token quantity. */
export function fmtAmount(wei: bigint, decimals = 18): string {
	const n = Number(formatUnits(wei, decimals));
	if (n === 0) return '0';
	if (n < 0.0001) return '<0.0001';
	return formatNumber(n, { maximumFractionDigits: 6 });
}
