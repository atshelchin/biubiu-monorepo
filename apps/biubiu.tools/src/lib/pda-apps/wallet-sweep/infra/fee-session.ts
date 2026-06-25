/**
 * Service-fee idempotency for a sweep session.
 *
 * The fee rides as msg.value on chunk 0 of every runSweep call (sweep.ts). proceed()
 * and sweepAgain() both go through runSweep, so without a guard a re-sweep / manual
 * retry of a flaky run would re-charge the full service fee once PER attempt.
 *
 * The fee must be charged ONCE per logical operation, identified by
 * (network, destination): a retry of the SAME operation pays 0, while a genuinely
 * new operation (different destination or network) charges again. These pure
 * helpers hold that rule so it can be unit-tested without any network/RPC.
 */
import type { Address } from 'viem';
import type { SweepBatchRecord } from '../types.js';

/** Stable key identifying a single fee-bearing sweep operation. */
export function feeSessionKey(networkSlug: string, dest: Address): string {
	return `${networkSlug}|${dest.toLowerCase()}`;
}

/**
 * The fee to actually attach to this sweep: the quoted `feeWei` the first time an
 * operation is swept, or 0 if the fee was already collected for this session key.
 */
export function effectiveFeeWei(feeWei: bigint, paidKey: string | null, currentKey: string): bigint {
	return paidKey === currentKey ? 0n : feeWei;
}

/**
 * Whether the fee should now be considered paid for `currentKey`. The fee rides on
 * chunk 0, so it is only "paid" once chunk-0 actually confirms — a failed chunk-0
 * must still charge (and succeed) on the next attempt. A 0-fee run (re-sweep or
 * member-waived) never marks anything paid.
 */
export function feeNowPaid(effectiveFee: bigint, records: SweepBatchRecord[]): boolean {
	if (effectiveFee <= 0n) return false;
	return records.some((r) => r.index === 0 && r.status === 'completed');
}
