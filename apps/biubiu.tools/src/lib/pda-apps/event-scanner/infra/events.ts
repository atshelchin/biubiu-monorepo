/**
 * Event extraction + topic helpers.
 *
 * Events are the scanner's unit of work: from an ABI we pull every (non-anonymous)
 * event, compute its `topic0` (keccak of the canonical signature), and expose which
 * params are `indexed` (and therefore filterable as topic1/2/3).
 */
import {
	type Abi,
	type AbiEvent,
	type AbiParameter,
	type Hex,
	getAddress,
	isAddress,
	pad,
	toEventSelector,
	toEventSignature,
} from 'viem';
import type { ParsedEvent, ParsedEventParam } from '../types.js';

/** Pull all (non-anonymous) events out of an ABI, enriched for the scan form. */
export function extractEvents(abi: Abi): ParsedEvent[] {
	const events = abi.filter((i): i is AbiEvent => i.type === 'event');

	const parsed = events.map((ev): ParsedEvent => {
		let signature = `${ev.name}(${ev.inputs.map((i) => i.type).join(',')})`;
		let topic0 = '0x' as Hex;
		try {
			signature = toEventSignature(ev);
		} catch {
			/* keep fallback */
		}
		try {
			topic0 = toEventSelector(ev);
		} catch {
			/* leave 0x — filtered out below */
		}

		const inputs: ParsedEventParam[] = ev.inputs.map((i) => ({
			name: i.name ?? '',
			type: i.type,
			indexed: (i as { indexed?: boolean }).indexed ?? false,
			components: (i as { components?: readonly AbiParameter[] }).components,
		}));

		return {
			name: ev.name,
			signature,
			topic0,
			anonymous: ev.anonymous ?? false,
			inputs,
			abiItem: ev,
		};
	});

	return parsed
		.filter((e) => !e.anonymous && e.topic0 !== '0x')
		.sort((a, b) => a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature));
}

/** Left-pad an address into a 32-byte topic (lowercased). */
export function addressTopic(address: string): Hex {
	const addr = getAddress(address.trim());
	return pad(addr.toLowerCase() as Hex, { size: 32 });
}

/** Whether a string is a 0x-40-hex address (loose check used before padding). */
export function isAddr(value: string): boolean {
	return isAddress(value.trim());
}

/**
 * Build a single topic-slot value from one indexed filter's canonical values:
 * - 0 values → null (wildcard)
 * - 1 value  → exact match
 * - N values → OR-set
 * For address-typed params the values are padded to 32 bytes; bytes32/uintN are
 * already 32-byte hex or coerced to hex.
 */
export function buildTopicSlot(type: string, values: string[]): Hex | Hex[] | null {
	const cleaned = values.map((v) => v.trim()).filter(Boolean);
	if (cleaned.length === 0) return null;
	const toTopic = (v: string): Hex => encodeTopicValue(type, v);
	return cleaned.length === 1 ? toTopic(cleaned[0]) : cleaned.map(toTopic);
}

/** Encode one canonical value into a 32-byte topic for the given indexed type. */
export function encodeTopicValue(type: string, value: string): Hex {
	const v = value.trim();
	if (type === 'address') return addressTopic(v);
	if (type === 'bool') {
		return pad((v === 'true' || v === '1' ? '0x01' : '0x00') as Hex, { size: 32 });
	}
	if (type.startsWith('uint') || type.startsWith('int')) {
		const n = BigInt(v);
		const hex = (n < 0n ? (1n << 256n) + n : n).toString(16);
		return ('0x' + hex.padStart(64, '0')) as Hex;
	}
	if (/^bytes\d+$/.test(type)) {
		const h = (v.startsWith('0x') ? v : '0x' + v).toLowerCase();
		return pad(h as Hex, { size: 32, dir: 'right' });
	}
	// Dynamic types (string, bytes, arrays) are hashed when indexed; we expect the
	// user to paste the 32-byte topic hash directly in that rare case.
	const h = (v.startsWith('0x') ? v : '0x' + v).toLowerCase();
	return pad(h as Hex, { size: 32 });
}
