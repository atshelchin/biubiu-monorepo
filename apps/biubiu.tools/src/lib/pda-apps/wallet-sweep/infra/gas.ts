/**
 * Gas budget + fee-market source of truth — imported by BOTH the refuel executor
 * and the funding estimator so the price used to SIZE a tx can never drift from
 * the price used to RESERVE / ESTIMATE for it (the zero-dust invariant).
 *
 * Two hazards this module exists to kill, both flagged by the design review:
 *  1. Bricking a source EOA mid-sequence when the base fee spikes between refuel
 *     and self-send. Defeated by PINNING the fee fields on every EOA/relay tx —
 *     a token transfer can never cost more than `gas·cap`, it just waits.
 *  2. Legacy vs EIP-1559 portability. Many non-7702 chains are pre-London and
 *     reject type-2 txs; some post-London chains reject legacy `gasPrice`. We
 *     detect the mode once per run and build the matching fields everywhere.
 */
import type { FeeMode, SweepNetwork } from '../types.js';
import { getGasPrice, getLatestBlockBaseFee, getMaxPriorityFee } from './rpc.js';

/** +25% inclusion bump, PINNED on every legacy tx (gasPrice·BUMP/100). */
export const BUMP = 125n;
/** Refuel value = REFUEL_HEADROOM × worst-case gas cost (slack for the price re-read). */
export const REFUEL_HEADROOM = 2n;
/** Per-token gas LIMIT — generous for USDT / non-standard tokens; over-budget is reclaimed. */
export const G_ERC20 = 100_000n;
/** Native reclaim gas LIMIT to a codeless dest (contract dest is estimated + bumped). */
export const G_NATIVE = 21_000n;
/** relay→EOA refuel intrinsic. */
export const G_REFUEL = 21_000n;
/** EOAs processed per window: refuel the batch, then drain it — bounds stranding blast radius. */
export const REFUEL_BATCH = 20;
/** Parallel EOA drains within a batch (each EOA is still strictly sequential internally). */
export const DRAIN_CONCURRENCY = 8;

/** Anti-zero floor: some L2s return eth_gasPrice=0 under no load; a 0-price tx never mines. */
const GAS_PRICE_FLOOR = 1_000_000n; // 0.001 gwei
/** 1559 tip floor used only when the node's eth_maxPriorityFeePerGas is absurdly low / 0. */
const MIN_TIP = 1_000_000n; // 0.001 gwei

export type ResolvedFeeMode = 'legacy' | 'eip1559';

/** viem fee fields — spread directly into sendTransaction. */
export type FeeFields =
	| { gasPrice: bigint }
	| { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

export interface FeeQuote {
	/** The exact fee fields to submit. */
	fields: FeeFields;
	/** Max per-gas price this tx can cost — the price ALL reserve/estimate math must use. */
	cap: bigint;
}

export function floorGasPrice(p: bigint): bigint {
	return p > GAS_PRICE_FLOOR ? p : GAS_PRICE_FLOOR;
}

/**
 * Resolve the concrete fee mode for a run. Honours an explicit network.feeMode;
 * otherwise probes the latest block: a present `baseFeePerGas` field ⇒ EIP-1559,
 * absent ⇒ legacy. Callers detect once and thread the result through the run.
 */
export async function detectFeeMode(network: SweepNetwork, rpcs: string[]): Promise<ResolvedFeeMode> {
	const declared: FeeMode | undefined = network.feeMode;
	if (declared === 'legacy' || declared === 'eip1559') return declared;
	const base = await getLatestBlockBaseFee(rpcs);
	return base != null ? 'eip1559' : 'legacy';
}

/**
 * Build the fee fields + reserve cap for one tx, from a FRESH price read.
 * - legacy:  gasPrice = floor(price)·BUMP/100 → cap == gasPrice (exact, zero-dust).
 * - eip1559: maxFeePerGas = 2·baseFee + tip, tip = max(node suggestion, floor) →
 *            cap == maxFeePerGas (reserve never reverts; tiny refund is dust).
 */
export async function quoteFees(rpcs: string[], mode: ResolvedFeeMode): Promise<FeeQuote> {
	if (mode === 'eip1559') {
		const [base, tip] = await Promise.all([getLatestBlockBaseFee(rpcs), getMaxPriorityFee(rpcs)]);
		const b = base ?? 0n;
		const t = tip > MIN_TIP ? tip : MIN_TIP;
		const maxFee = 2n * b + t;
		return { fields: { maxFeePerGas: maxFee, maxPriorityFeePerGas: t }, cap: maxFee };
	}
	const pinned = (floorGasPrice(await getGasPrice(rpcs)) * BUMP) / 100n;
	return { fields: { gasPrice: pinned }, cap: pinned };
}

/**
 * Extra native withheld on the final native-reclaim leg for costs NOT captured by
 * `gas·cap` — chiefly an OP-stack L1 data fee. v1 reads it from the network config
 * (0 by default → exact zero-dust on classic L1-fee chains). Curated OP-stack
 * chains use the 7702 path, so this only bites custom OP-stack L2s the user adds;
 * they can set `nativeReserveWei`. (Oracle probe: deferred — see design §6.)
 */
export function nativeReserveFor(network: SweepNetwork): bigint {
	return network.nativeReserveWei ?? 0n;
}

// ─── pure gas math (extracted so the anti-brick / zero-dust invariants are testable) ───

/** Worst-case native an EOA needs to pay for its own K token transfers + 1 native sweep. */
export function perEoaGasCost(tokenCount: number, cap: bigint, gNative = G_NATIVE): bigint {
	return (BigInt(Math.max(0, tokenCount)) * G_ERC20 + gNative) * cap;
}

/**
 * Native the relay must send INTO an EOA to cover its self-send gas: the shortfall
 * to `REFUEL_HEADROOM × worst-case cost`, or 0 if it already holds enough. The
 * headroom is slack for the price re-read window; the surplus is later reclaimed by
 * the native leg, so over-funding costs nothing.
 */
export function refuelValue(tokenCount: number, bal0: bigint, cap: bigint, gNative = G_NATIVE): bigint {
	const need = perEoaGasCost(tokenCount, cap, gNative) * REFUEL_HEADROOM;
	return bal0 >= need ? 0n : need - bal0;
}

/** Native withheld on the final reclaim: exactly one native-transfer's own cost + the reserve knob. */
export function nativeReserve(cap: bigint, nativeReserveWei: bigint, gNative = G_NATIVE): bigint {
	return gNative * cap + nativeReserveWei;
}

/** Amount to sweep out on the native leg: fresh balance minus the exact reserve (never negative). */
export function nativeReclaim(balF: bigint, cap: bigint, nativeReserveWei: bigint, gNative = G_NATIVE): bigint {
	const value = balF - nativeReserve(cap, nativeReserveWei, gNative);
	return value > 0n ? value : 0n;
}
