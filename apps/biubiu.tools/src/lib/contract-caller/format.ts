/**
 * Human-friendly value conversions + ABI value coercion.
 *
 * The UI keeps each parameter as a *canonical string* (the value ready for ABI
 * encoding): integer string for uint/int, `0x…` for address/bytes, `true`/`false`
 * for bool, plain text for string, JSON for arrays/tuples. The helpers below let
 * the SmartParamInput turn human input (ether amounts, durations, dates, UTF-8
 * text) into that canonical string, and `coerceValue` turns the canonical string
 * into the JS value viem expects.
 */
import {
	type AbiParameter,
	getAddress,
	isAddress,
	isHex,
	parseUnits,
	formatUnits,
	stringToHex,
	hexToString
} from 'viem';
import { getComponents } from './abi.js';

// ─── Canonical string → JS value for viem encoding ───

/** Coerce a canonical string (or already-parsed value) into the JS type viem needs. */
export function coerceValue(
	type: string,
	components: readonly AbiParameter[] | undefined,
	value: unknown
): unknown {
	// Arrays: `uint256[]`, `address[3]`, `tuple[]`, ...
	if (type.endsWith(']')) {
		const inner = type.slice(0, type.lastIndexOf('['));
		const arr = typeof value === 'string' ? JSON.parse(value || '[]') : value;
		if (!Array.isArray(arr)) throw new Error(`Expected a JSON array for ${type}`);
		return arr.map((v) => coerceValue(inner, components, v));
	}

	// Tuples
	if (type === 'tuple' || type.startsWith('tuple')) {
		if (!components) throw new Error('Tuple is missing components');
		const obj = typeof value === 'string' ? JSON.parse(value || '{}') : value;
		if (Array.isArray(obj)) {
			return obj.map((v, i) => coerceValue(components[i].type, getComponents(components[i]), v));
		}
		const out: Record<string, unknown> = {};
		for (const c of components) {
			out[c.name ?? ''] = coerceValue(
				c.type,
				getComponents(c),
				(obj as Record<string, unknown>)[c.name ?? '']
			);
		}
		return out;
	}

	// Scalars
	const s = typeof value === 'string' ? value.trim() : value;
	if (type.startsWith('uint') || type.startsWith('int')) {
		if (s === '' || s === undefined || s === null) throw new Error('Empty number');
		return BigInt(s as string);
	}
	if (type === 'bool') {
		return s === true || s === 'true' || s === '1';
	}
	if (type === 'address') {
		if (!isAddress(s as string)) throw new Error('Invalid address');
		return getAddress(s as string);
	}
	if (type === 'string') {
		return typeof value === 'string' ? value : String(value ?? '');
	}
	if (type === 'bytes' || /^bytes\d+$/.test(type)) {
		const h = s as string;
		if (!isHex(h)) throw new Error('Expected 0x-prefixed hex');
		return h;
	}
	return value;
}

/** Validate a single canonical value without building the whole arg list. Returns error or null. */
export function validateValue(
	type: string,
	components: readonly AbiParameter[] | undefined,
	value: string
): string | null {
	try {
		coerceValue(type, components, value);
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : 'Invalid value';
	}
}

// ─── Human helpers (input side) ───

/** Convert a decimal token amount (e.g. "1.5") to base units string given decimals. */
export function amountToBase(amount: string, decimals: number): string {
	return parseUnits(amount.trim() || '0', decimals).toString();
}

/** Convert base units back to a decimal string (for previews). */
export function baseToAmount(base: string | bigint, decimals: number): string {
	try {
		return formatUnits(BigInt(base), decimals);
	} catch {
		return '0';
	}
}

const DURATION_UNITS: Record<string, bigint> = {
	seconds: 1n,
	minutes: 60n,
	hours: 3600n,
	days: 86400n,
	weeks: 604800n,
	years: 31536000n
};

export const DURATION_UNIT_KEYS = Object.keys(DURATION_UNITS);

/** Convert a duration like (24, "hours") into a seconds string. */
export function durationToSeconds(value: string, unit: string): string {
	const mult = DURATION_UNITS[unit] ?? 1n;
	const n = value.trim();
	if (!n) return '0';
	// support decimals by scaling
	if (n.includes('.')) {
		const secs = Number(n) * Number(mult);
		return BigInt(Math.round(secs)).toString();
	}
	return (BigInt(n) * mult).toString();
}

/** Human-readable duration from seconds, e.g. "1d 2h 3m". */
export function secondsToHuman(seconds: string | bigint): string {
	let s = 0n;
	try {
		s = BigInt(seconds);
	} catch {
		return '';
	}
	if (s <= 0n) return '0s';
	const d = s / 86400n;
	const h = (s % 86400n) / 3600n;
	const m = (s % 3600n) / 60n;
	const sec = s % 60n;
	const parts: string[] = [];
	if (d) parts.push(`${d}d`);
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	if (sec) parts.push(`${sec}s`);
	return parts.join(' ');
}

/** Convert a datetime-local string to a unix-seconds string. */
export function dateToUnix(value: string): string {
	if (!value) return '0';
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return '0';
	return Math.floor(ms / 1000).toString();
}

/** Format a unix-seconds value as an ISO-ish UTC string (for previews). */
export function unixToDate(seconds: string | bigint): string {
	try {
		const ms = Number(BigInt(seconds)) * 1000;
		if (!Number.isFinite(ms) || ms <= 0) return '';
		return new Date(ms).toISOString().replace('.000Z', 'Z');
	} catch {
		return '';
	}
}

/** Value of `datetime-local` input from a unix-seconds value (local time). */
export function unixToDatetimeLocal(seconds: string | bigint): string {
	try {
		const ms = Number(BigInt(seconds)) * 1000;
		if (!Number.isFinite(ms) || ms <= 0) return '';
		const d = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	} catch {
		return '';
	}
}

/** UTF-8 text → hex (for bytes inputs). */
export function textToHex(text: string): string {
	return stringToHex(text);
}

/** hex → UTF-8 text (best effort, for previews). */
export function hexToText(hex: string): string {
	try {
		if (!isHex(hex)) return '';
		return hexToString(hex);
	} catch {
		return '';
	}
}

/** Group digits of an integer string for readability: 1000000 → "1,000,000". */
export function groupDigits(value: string): string {
	const neg = value.startsWith('-');
	const digits = (neg ? value.slice(1) : value).replace(/[^0-9]/g, '');
	if (!digits) return value;
	return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Shorten an address for display. */
export function shortenAddress(addr: string): string {
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
