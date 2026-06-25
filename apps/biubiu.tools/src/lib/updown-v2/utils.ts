/**
 * Shared utility functions for btc-updown-5m pages.
 * Import from any page or component that needs these helpers.
 */
import { formatNumber, formatCurrency, formatDate } from '$lib/i18n';

/** Minimal shape needed to decide admin access. */
type AdminMember = { role: string; safeAddress: string };
type AdminIdentity = { safeAddress?: string | null } | null | undefined;

/**
 * Decide whether the authenticated identity is an admin of a space.
 *
 * Gated on the REAL logged-in user's `safeAddress` (case-insensitive) matching a
 * member whose role is 'admin' — NOT a hardcoded userId. If no user is logged in,
 * or no admin member's Safe matches the user's Safe, returns false, so admin-only
 * surfaces (e.g. admin codes / secrets) stay hidden. Safe-by-default: an empty /
 * absent safeAddress can never match.
 */
export function isSpaceAdmin(members: AdminMember[], user: AdminIdentity): boolean {
	const addr = user?.safeAddress?.trim().toLowerCase();
	if (!addr) return false;
	return members.some((m) => m.role === 'admin' && m.safeAddress.trim().toLowerCase() === addr);
}

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

