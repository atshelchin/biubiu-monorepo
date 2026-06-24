/**
 * Fiat exchange rates — configurable HTTP endpoint (USD base).
 *
 * Ported from vela-wallet `services/fiat-fx.ts`. Fetches the rate table directly
 * from the user-configurable `fiatRatesURL` service node (default Frankfurter v2,
 * CORS-open — verified). Accepts both the Frankfurter v2 array shape and the
 * `{ rates: {…} }` object shape. 6h in-memory + localStorage cache (offline first
 * paint). Formatting stays with the app's i18n `formatCurrency`.
 */

import { browser } from '$app/environment';
import { getFiatRatesURL } from './endpoints.js';

const CACHE_KEY = 'biubiu-fiat-rates';
const TTL = 6 * 60 * 60 * 1000; // 6 hours

interface FxCache {
	url: string;
	rates: Record<string, number>;
	at: number;
}

let _cache: FxCache | null = null;
let _inflight: Promise<Record<string, number>> | null = null;

/** Normalize a provider response (array or `{rates}`) into `{ CODE: rate }` (USD base). */
export function normalizeRates(data: unknown): Record<string, number> | null {
	const out: Record<string, number> = { USD: 1 };
	if (Array.isArray(data)) {
		// Frankfurter v2: [{ base, quote, rate }]
		for (const row of data as Array<{ quote?: string; rate?: unknown }>) {
			const code = String(row?.quote ?? '').toUpperCase();
			const n = Number(row?.rate);
			if (code && isFinite(n) && n > 0) out[code] = n;
		}
	} else if (data && typeof data === 'object' && 'rates' in data && typeof (data as { rates: unknown }).rates === 'object') {
		// open.er-api / Frankfurter v1: { rates: { CODE: rate } }
		for (const [k, v] of Object.entries((data as { rates: Record<string, unknown> }).rates)) {
			const n = Number(v);
			if (isFinite(n) && n > 0) out[k.toUpperCase()] = n;
		}
	}
	return Object.keys(out).length > 1 ? out : null;
}

function loadPersisted(): Record<string, number> {
	if (_cache) return _cache.rates;
	if (browser) {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			if (raw) {
				_cache = JSON.parse(raw) as FxCache;
				return _cache.rates;
			}
		} catch {
			/* ignore */
		}
	}
	return { USD: 1 };
}

/** Full USD-base rate table, cached. Falls back to the last persisted table on failure. */
export async function fetchFxRates(): Promise<Record<string, number>> {
	const url = getFiatRatesURL();
	if (_cache && _cache.url === url && Date.now() - _cache.at < TTL) return _cache.rates;
	if (_inflight) return _inflight;

	_inflight = (async () => {
		try {
			const res = await fetch(url);
			if (res.ok) {
				const rates = normalizeRates(await res.json());
				if (rates) {
					_cache = { url, rates, at: Date.now() };
					if (browser) {
						try {
							localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
						} catch {
							/* storage full — non-critical */
						}
					}
					return rates;
				}
			}
		} catch {
			/* network error — fall back to persisted */
		}
		return loadPersisted();
	})();

	try {
		return await _inflight;
	} finally {
		_inflight = null;
	}
}

/** USD → `code` multiplier; 1 for USD or on any failure (always renders a value). */
export async function getFxRate(code: string): Promise<number> {
	const c = code.toUpperCase();
	if (c === 'USD') return 1;
	const rates = await fetchFxRates();
	const r = rates[c];
	return r && r > 0 ? r : 1;
}
