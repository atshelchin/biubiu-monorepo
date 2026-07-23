import { describe, it, expect } from 'vitest';
import {
	floorGasPrice,
	perEoaGasCost,
	refuelValue,
	nativeReserve,
	nativeReclaim,
	G_ERC20,
	G_NATIVE,
	REFUEL_HEADROOM,
} from './gas.js';

describe('gas — anti-zero floor', () => {
	it('lifts a 0 / dust gas price off the floor (a 0-price tx never mines)', () => {
		expect(floorGasPrice(0n)).toBeGreaterThan(0n);
	});
	it('leaves a real price untouched', () => {
		expect(floorGasPrice(5_000_000_000n)).toBe(5_000_000_000n);
	});
});

describe('gas — per-EOA cost', () => {
	it('is (K·G_ERC20 + G_NATIVE)·cap', () => {
		expect(perEoaGasCost(3, 10n)).toBe((3n * G_ERC20 + G_NATIVE) * 10n);
	});
	it('treats native-only (K=0) as just one reclaim', () => {
		expect(perEoaGasCost(0, 10n)).toBe(G_NATIVE * 10n);
	});
});

describe('gas — refuel value (anti-brick)', () => {
	it('always funds at least the worst-case gas cost, so tokens can never brick mid-sequence', () => {
		const cap = 7n;
		const r = refuelValue(4, 0n, cap);
		expect(r).toBeGreaterThanOrEqual(perEoaGasCost(4, cap));
	});
	it('funds REFUEL_HEADROOM × cost when the EOA starts empty', () => {
		const cap = 7n;
		expect(refuelValue(4, 0n, cap)).toBe(perEoaGasCost(4, cap) * REFUEL_HEADROOM);
	});
	it('tops up only the shortfall when the EOA already holds some native', () => {
		const cap = 7n;
		const need = perEoaGasCost(2, cap) * REFUEL_HEADROOM;
		expect(refuelValue(2, need - 100n, cap)).toBe(100n);
	});
	it('sends nothing when the EOA already holds enough', () => {
		const cap = 7n;
		const need = perEoaGasCost(2, cap) * REFUEL_HEADROOM;
		expect(refuelValue(2, need, cap)).toBe(0n);
		expect(refuelValue(2, need + 999n, cap)).toBe(0n);
	});
});

describe('gas — native reclaim (zero-dust)', () => {
	it('reclaim + reserve == balance exactly (no dust) on the legacy pin', () => {
		const balF = 1_000_000_000n;
		const cap = 3n;
		const reserve = nativeReserve(cap, 0n);
		expect(nativeReclaim(balF, cap, 0n) + reserve).toBe(balF);
	});
	it('reserves exactly one native transfer plus the L2 knob', () => {
		expect(nativeReserve(3n, 5n)).toBe(G_NATIVE * 3n + 5n);
	});
	it('never goes negative when the balance is below the reserve', () => {
		expect(nativeReclaim(10n, 3n, 0n)).toBe(0n);
	});
});
