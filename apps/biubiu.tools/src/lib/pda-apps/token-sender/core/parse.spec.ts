import { describe, it, expect } from 'vitest';
import { parseUnits, getAddress } from 'viem';
import { parseRecipients } from './parse.js';

const A1 = '0x1111111111111111111111111111111111111111';
const A2 = '0x2222222222222222222222222222222222222222';
const A3 = '0x3333333333333333333333333333333333333333';

describe('parseRecipients · specified mode', () => {
	it('parses "address,amount" lines with token decimals', () => {
		const r = parseRecipients({
			text: `${A1},1.5\n${A2},0.25`,
			mode: 'specified',
			decimals: 18,
		});
		expect(r.validCount).toBe(2);
		expect(r.invalid).toHaveLength(0);
		expect(r.recipients[0].amount).toBe(parseUnits('1.5', 18));
		expect(r.recipients[1].amount).toBe(parseUnits('0.25', 18));
		expect(r.totalAmount).toBe(parseUnits('1.5', 18) + parseUnits('0.25', 18));
	});

	it('accepts comma, tab and space separators', () => {
		const r = parseRecipients({
			text: `${A1},1\n${A2}\t2\n${A3} 3`,
			mode: 'specified',
			decimals: 0,
		});
		expect(r.validCount).toBe(3);
		expect(r.recipients.map((x) => x.amount)).toEqual([1n, 2n, 3n]);
	});

	it('ignores comments and blank lines', () => {
		const r = parseRecipients({
			text: `# header\n\n   \n${A1},1`,
			mode: 'specified',
			decimals: 0,
		});
		expect(r.validCount).toBe(1);
	});

	it('checksums addresses', () => {
		const lower = '0xdac17f958d2ee523a2206206994597c13d831ec7';
		const r = parseRecipients({ text: `${lower},1`, mode: 'specified', decimals: 0 });
		expect(r.recipients[0].address).toBe(getAddress(lower));
	});

	it('flags invalid address / missing / invalid / zero amounts', () => {
		const r = parseRecipients({
			text: [`0xnotanaddress,1`, `${A1}`, `${A2},abc`, `${A3},0`].join('\n'),
			mode: 'specified',
			decimals: 18,
		});
		expect(r.validCount).toBe(0);
		const reasons = r.invalid.map((i) => i.reason).sort();
		expect(reasons).toEqual(['invalid-address', 'invalid-amount', 'missing-amount', 'zero-amount']);
	});

	it('dedupes repeated addresses (keeps first, counts duplicates)', () => {
		const r = parseRecipients({
			text: `${A1},1\n${A1},9`,
			mode: 'specified',
			decimals: 0,
		});
		expect(r.validCount).toBe(1);
		expect(r.duplicateCount).toBe(1);
		expect(r.recipients[0].amount).toBe(1n);
	});
});

describe('parseRecipients · equal mode', () => {
	it('splits totalAmount evenly, dust to first recipient', () => {
		const total = parseUnits('100', 18);
		const r = parseRecipients({
			text: `${A1}\n${A2}\n${A3}`,
			mode: 'equal',
			decimals: 18,
			totalAmount: '100',
		});
		expect(r.validCount).toBe(3);
		const per = total / 3n;
		const dust = total - per * 3n;
		expect(r.recipients[0].amount).toBe(per + dust);
		expect(r.recipients[1].amount).toBe(per);
		expect(r.recipients[2].amount).toBe(per);
		// no value lost
		expect(r.recipients.reduce((s, x) => s + x.amount, 0n)).toBe(total);
		expect(r.totalAmount).toBe(total);
	});

	it('returns empty when totalAmount is missing', () => {
		const r = parseRecipients({ text: `${A1}\n${A2}`, mode: 'equal', decimals: 18 });
		expect(r.validCount).toBe(0);
		expect(r.recipients).toHaveLength(0);
	});

	it('returns empty for no input', () => {
		const r = parseRecipients({ text: '', mode: 'specified', decimals: 18 });
		expect(r.validCount).toBe(0);
		expect(r.totalAmount).toBe(0n);
	});

	// Regression: total < recipientCount → integer share rounds to 0n. Must NOT emit
	// zero-value transfers (gas + per-batch fee for nothing); reject the parse instead.
	it('rejects when total is smaller than the recipient count (per-share would round to 0)', () => {
		// decimals 0 so totalAmount '2' parses to 2n base units across 5 recipients → per = 0n
		const r = parseRecipients({
			text: [A1, A2, A3, '0x4444444444444444444444444444444444444444', '0x5555555555555555555555555555555555555555'].join('\n'),
			mode: 'equal',
			decimals: 0,
			totalAmount: '2',
		});
		expect(r.validCount).toBe(0);
		expect(r.recipients).toHaveLength(0);
		expect(r.totalAmount).toBe(0n);
		// No recipient should ever carry amount 0n (the footgun the finding describes).
		expect(r.recipients.every((x) => x.amount > 0n)).toBe(true);
		// The reason is surfaced for the UI (consistent with specified-mode invalid lines).
		expect(r.invalid.map((i) => i.reason)).toContain('amount-too-small-for-recipient-count');
	});

	it('accepts when total exactly equals the recipient count (per-share = 1, no zeros)', () => {
		const r = parseRecipients({
			text: [A1, A2, A3].join('\n'),
			mode: 'equal',
			decimals: 0,
			totalAmount: '3',
		});
		expect(r.validCount).toBe(3);
		expect(r.recipients.map((x) => x.amount)).toEqual([1n, 1n, 1n]);
		expect(r.recipients.every((x) => x.amount > 0n)).toBe(true);
		expect(r.totalAmount).toBe(3n);
	});

	it('one recipient with tiny total still works (no division-to-zero)', () => {
		const r = parseRecipients({
			text: A1,
			mode: 'equal',
			decimals: 0,
			totalAmount: '1',
		});
		expect(r.validCount).toBe(1);
		expect(r.recipients[0].amount).toBe(1n);
	});
});
