/**
 * Tempo network gas model — the single home for Tempo-specific gas logic.
 *
 * Ported 1:1 from vela-wallet `services/tempo.ts`. Tempo (chainId 4217) has NO
 * native gas coin. EVM `value`/`balance` are disabled, so canonical ERC-4337
 * native prefund is impossible — a UserOp with non-zero maxFeePerGas fails
 * `AA21 didn't pay prefund`. Instead:
 *
 *   1. The UserOperation is signed with maxFeePerGas = maxPriorityFeePerGas = 0, so
 *      EntryPoint's native accounting is a no-op.
 *   2. The bundler submits `EntryPoint.handleOps([userOp])` inside a native Tempo
 *      0x76 transaction with `feeToken` = a USD stablecoin, paying real gas in it.
 *   3. To repay the bundler in-band, the wallet batches a
 *      `feeToken.transfer(bundlerEOA, reimbursement)` call into the UserOp's MultiSend.
 *
 * This module is intentionally dependency-light (pure math, no I/O) so it is
 * unit-testable. `isTempoChain` lives in wallet/infra/chains.ts.
 */

/**
 * Canonical default fee token (pathUSD) — used to pay gas. TIP-20 fee tokens live
 * in the reserved 0x20c0… range; pathUSD is the protocol-default fee token.
 */
export const TEMPO_DEFAULT_FEE_TOKEN = '0x20c0000000000000000000000000000000000000';

/** Every Tempo TIP-20 USD stablecoin uses 6 decimals (microdollar). */
export const TEMPO_FEE_TOKEN_DECIMALS = 6;

/** Tempo's protocol base fee fallback: 20e9 attodollars (USD×1e-18) per gas. */
export const TEMPO_BASE_FEE_ATTO = 20_000_000_000n;

/** Gas the bundler's OUTER 0x76 pays beyond the UserOp limits (EntryPoint + tx base). */
export const TEMPO_OUTER_OVERHEAD_GAS = 150_000n;

/**
 * callGasLimit budget per inner sub-call in a Tempo MultiSend batch. The 0x20c0…
 * TIP-20 tokens are extraordinarily gas-heavy: a single `transfer` meters ~308k
 * on-chain. A batch always carries the reimbursement transfer on top of the user's
 * calls, and the bundler's eth_estimateUserOperationGas under-reports (handleOps
 * swallows the inner OOG), so this floor — not the estimate — keeps the atomic
 * batch from reverting "out of gas". 380k = measured ~308k + headroom.
 */
export const TEMPO_CALL_GAS_PER_SUBCALL = 380_000n;

/** callGasLimit floor for a Tempo batch of `subCalls` inner calls (incl. reimbursement). */
export function tempoCallGasLimit(subCalls: number): bigint {
	return BigInt(Math.max(subCalls, 1)) * TEMPO_CALL_GAS_PER_SUBCALL;
}

/**
 * Verification gas for an UNDEPLOYED Safe on Tempo. The Safe deploy (initCode) meters
 * to ~3.9M gas on Tempo — far above the 2M used on EVM chains — so we provision more.
 * Must stay ≤ the bundler's Tempo verification cap (8M).
 */
export const TEMPO_VERIFICATION_GAS_UNDEPLOYED = 6_000_000n;

/**
 * Reimbursement margin: charge ~2× the bundler's REAL cost (100% markup) to give the
 * bundler a healthy margin AND absorb estimate error. The charge is priced off
 * `tempoExpectedGas` (realistic), NOT the padded UserOp gas LIMITS.
 */
export const TEMPO_FEE_MARGIN_NUM = 2n;
export const TEMPO_FEE_MARGIN_DEN = 1n;

/**
 * Realistic gas a Tempo 0x76 actually burns — used ONLY to PRICE the reimbursement,
 * not to set the UserOp gas fields. Measured on Tempo mainnet: a deployed Safe's
 * verification + preVerification ≈ 250k, the Safe deploy (initCode) ≈ 3.9–4.1M, and
 * one in-batch TIP-20 transfer ≈ 90–120k.
 */
export const TEMPO_DEPLOYED_GAS_EST = 250_000n;
export const TEMPO_DEPLOY_GAS_EST = 4_100_000n;
export const TEMPO_PER_SUBCALL_GAS_EST = 95_000n;

/** Realistic total gas for a batch of `subCalls` inner calls (incl. the reimbursement). */
export function tempoExpectedGas(deployed: boolean, subCalls: number): bigint {
	const fixed = deployed ? TEMPO_DEPLOYED_GAS_EST : TEMPO_DEPLOY_GAS_EST;
	return fixed + BigInt(Math.max(subCalls, 1)) * TEMPO_PER_SUBCALL_GAS_EST;
}

/**
 * Convert an attodollar amount (USD×1e-18) to a fee-token's smallest units:
 *   tokenUnits = atto × 10^decimals / 1e18
 */
export function attoToTokenUnits(atto: bigint, decimals: number = TEMPO_FEE_TOKEN_DECIMALS): bigint {
	if (atto <= 0n) return 0n;
	return (atto * 10n ** BigInt(decimals)) / 10n ** 18n;
}

/**
 * Stablecoin amount to reimburse the bundler, baked into the UserOp as a batched
 * transfer. `expectedGas` should be the REALISTIC gas (see `tempoExpectedGas`). =
 * realistic cost × margin. Always ≥ 1 so the transfer is never a no-op.
 */
export function tempoReimbursement(
	expectedGas: bigint,
	gasPriceAtto: bigint,
	decimals: number = TEMPO_FEE_TOKEN_DECIMALS
): bigint {
	const price = gasPriceAtto > 0n ? gasPriceAtto : TEMPO_BASE_FEE_ATTO;
	const base = attoToTokenUnits(expectedGas * price, decimals);
	const withMargin = (base * TEMPO_FEE_MARGIN_NUM) / TEMPO_FEE_MARGIN_DEN;
	return withMargin > 0n ? withMargin : 1n;
}
