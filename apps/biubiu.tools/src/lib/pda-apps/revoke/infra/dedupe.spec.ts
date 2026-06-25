/**
 * Tests for the shared first-occurrence dedupe extracted from discover.ts
 * (dedupeTokens/dedupeSpenders) and registry/spenders.ts (spendersForChain).
 */
import { describe, it, expect } from 'vitest';
import { dedupeBy } from './dedupe.js';

describe('dedupeBy', () => {
	it('keeps the FIRST occurrence per key and preserves order', () => {
		const list = [
			{ id: 'a', v: 1 },
			{ id: 'b', v: 2 },
			{ id: 'a', v: 3 }, // dup of 'a' — dropped
			{ id: 'c', v: 4 },
			{ id: 'b', v: 5 }, // dup of 'b' — dropped
		];
		const out = dedupeBy(list, (x) => x.id);
		expect(out).toEqual([
			{ id: 'a', v: 1 },
			{ id: 'b', v: 2 },
			{ id: 'c', v: 4 },
		]);
	});

	it('dedupes addresses case-insensitively (the spender/token use case)', () => {
		const merged = [
			{ address: '0xAbCd', label: 'first' },
			{ address: '0xabcd', label: 'dup-different-case' },
			{ address: '0x000000000022D473030F116dDEE9F6B43aC78BA3', label: 'permit2' },
		];
		const out = dedupeBy(merged, (s) => s.address.toLowerCase());
		expect(out).toEqual([
			{ address: '0xAbCd', label: 'first' },
			{ address: '0x000000000022D473030F116dDEE9F6B43aC78BA3', label: 'permit2' },
		]);
	});

	it('namespaces by a composite key so same address with different standard is kept (token use case)', () => {
		const tokens = [
			{ standard: 'erc20', address: '0xAAA' },
			{ standard: 'erc721', address: '0xAAA' }, // same addr, different standard — kept
			{ standard: 'erc20', address: '0xaaa' }, // dup of erc20:0xaaa — dropped
		];
		const out = dedupeBy(tokens, (t) => `${t.standard}:${t.address.toLowerCase()}`);
		expect(out).toEqual([
			{ standard: 'erc20', address: '0xAAA' },
			{ standard: 'erc721', address: '0xAAA' },
		]);
	});

	it('returns an empty array for empty input (edge)', () => {
		expect(dedupeBy([], (x: { id: string }) => x.id)).toEqual([]);
	});
});
