/**
 * Display formatting helpers for the E2E chat UI (no framework, no deps).
 */

/**
 * Shorten a wallet/identity address for display.
 *
 * Returns `${addr.slice(0, 6)}…${addr.slice(-4)}` for addresses longer than
 * 12 chars; shorter strings (including the empty string) are returned as-is.
 */
export function shortenAddress(addr: string): string {
	return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
