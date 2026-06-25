/**
 * Regression tests for service-fee idempotency (REVIEW-FINDINGS
 * pda-apps/wallet-sweep P2: "Service fee is re-charged in full on every re-sweep /
 * manual retry of a flaky run").
 *
 * The bug: the fee rides as msg.value on chunk 0 of EVERY runSweep call. proceed()
 * and sweepAgain() both call runSweep with the full fee, so retrying a flaky run
 * charged the full service fee once PER attempt. The fix charges the fee once per
 * (network, destination) session: a retry of the same operation pays 0, but a
 * genuinely new operation (different dest/network) charges again — and a FAILED
 * chunk-0 must still re-charge next time (the fee never landed).
 */
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import type { SweepBatchRecord } from '../types.js';
import { feeSessionKey, effectiveFeeWei, feeNowPaid } from './fee-session.js';

const DEST = '0xAbC0000000000000000000000000000000000001' as Address;
const DEST2 = '0x0000000000000000000000000000000000000002' as Address;
const FEE = 1_000_000_000_000_000n; // 0.001 native

const completed = (index: number): SweepBatchRecord => ({ index, count: 5, status: 'completed' });
const failed = (index: number): SweepBatchRecord => ({ index, count: 5, status: 'failed', error: 'x' });

describe('feeSessionKey', () => {
	it('is stable + case-insensitive on the destination', () => {
		expect(feeSessionKey('base', DEST)).toBe(feeSessionKey('base', DEST.toLowerCase() as Address));
	});
	it('differs by network and by destination', () => {
		expect(feeSessionKey('base', DEST)).not.toBe(feeSessionKey('arbitrum', DEST));
		expect(feeSessionKey('base', DEST)).not.toBe(feeSessionKey('base', DEST2));
	});
});

describe('effectiveFeeWei', () => {
	it('charges the full fee on the first sweep of an operation', () => {
		const key = feeSessionKey('base', DEST);
		expect(effectiveFeeWei(FEE, null, key)).toBe(FEE);
	});

	it('charges 0 on a re-sweep / retry of the SAME operation (already paid)', () => {
		const key = feeSessionKey('base', DEST);
		expect(effectiveFeeWei(FEE, key, key)).toBe(0n);
	});

	it('charges again for a genuinely new operation (different destination)', () => {
		const paidKey = feeSessionKey('base', DEST);
		const newKey = feeSessionKey('base', DEST2);
		expect(effectiveFeeWei(FEE, paidKey, newKey)).toBe(FEE);
	});

	it('charges again on a different network', () => {
		const paidKey = feeSessionKey('base', DEST);
		const newKey = feeSessionKey('arbitrum', DEST);
		expect(effectiveFeeWei(FEE, paidKey, newKey)).toBe(FEE);
	});
});

describe('feeNowPaid', () => {
	it('marks paid once chunk 0 confirms', () => {
		expect(feeNowPaid(FEE, [completed(0), completed(1)])).toBe(true);
	});

	it('does NOT mark paid if chunk 0 failed (fee never landed → retry must re-charge)', () => {
		expect(feeNowPaid(FEE, [failed(0), completed(1)])).toBe(false);
	});

	it('does NOT mark paid when no fee was attached (re-sweep / member-waived)', () => {
		expect(feeNowPaid(0n, [completed(0)])).toBe(false);
	});
});

describe('end-to-end: a flaky run is charged exactly once', () => {
	it('attempt 1 fails (chunk 0 failed) → still unpaid; attempt 2 succeeds → paid; attempt 3 re-sweep → free', () => {
		const key = feeSessionKey('base', DEST);
		let paidKey: string | null = null;

		// Attempt 1: full fee attached, but chunk 0 fails — fee never landed.
		let eff = effectiveFeeWei(FEE, paidKey, key);
		expect(eff).toBe(FEE);
		if (feeNowPaid(eff, [failed(0)])) paidKey = key;
		expect(paidKey).toBeNull(); // not marked paid — good, the fee didn't land

		// Attempt 2 (manual retry): fee charged AGAIN because attempt 1 never paid.
		eff = effectiveFeeWei(FEE, paidKey, key);
		expect(eff).toBe(FEE);
		if (feeNowPaid(eff, [completed(0)])) paidKey = key;
		expect(paidKey).toBe(key); // now paid

		// Attempt 3 (re-sweep, funds re-arrived): NO fee — same operation.
		eff = effectiveFeeWei(FEE, paidKey, key);
		expect(eff).toBe(0n);
		// And a successful re-sweep with 0 fee must not flip any flag.
		expect(feeNowPaid(eff, [completed(0)])).toBe(false);
	});
});
