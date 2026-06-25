import { describe, expect, it } from 'vitest';
import { QUICKNET_BEACON_SCHEME, roundForTime, timeForRound } from './timelock.js';

describe('forever timelock round math', () => {
	it('round and time are inverse around the 3s period', () => {
		const t = 1_800_000_000;
		const r = roundForTime(t);
		expect(timeForRound(r)).toBeLessThanOrEqual(t);
		expect(timeForRound(r + 1)).toBeGreaterThan(t);
	});

	it('genesis time maps to round 1', () => {
		expect(roundForTime(1_692_803_367)).toBe(1);
	});

	it('never returns a round below 1 for past times', () => {
		expect(roundForTime(0)).toBe(1);
	});

	it('beacon scheme is the 32-byte quicknet chain hash', () => {
		expect(QUICKNET_BEACON_SCHEME).toMatch(/^0x[0-9a-f]{64}$/);
	});
});
