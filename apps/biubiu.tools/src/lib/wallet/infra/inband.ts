/**
 * In-band gas settlement — pricing, fee-leg encoding, and fee-asset selection.
 *
 * Ported 1:1 from vela-wallet `services/safe-transaction.ts` (calculateInBandFeeAmount,
 * buildInBandFeeLeg, sameAssetFeeLimit) + `hooks/use-inband-fee-tokens.ts`.
 *
 * The vela relay (打包服务) now requires EVERY chain — not just Tempo — to settle gas
 * "in-band": the UserOp is signed with maxFeePerGas = maxPriorityFeePerGas = 0 (EntryPoint's
 * native prefund/refund is a no-op) and a transfer to the relay's settlement recipient is
 * batched into the UserOp's MultiSend — native value, or a whitelisted-stablecoin `transfer`
 * when the user picks `gasFeeToken`. The relay re-verifies `reimbursed ≥ required` at submit,
 * so this module MUST never undercharge (native USD price rounded up, fee-token rounded down).
 *
 * `vela_getInBandGasQuote` returns, for one Safe address, every acceptable fee asset with its
 * balance + USD price + the settlement recipient. See wallet/infra/bundler-client.ts for the RPC.
 */

import { type Address, type Hex, encodeFunctionData, erc20Abi } from 'viem';
import type { Call } from '$lib/wallet/types.js';

/** One fee-asset entry returned by `vela_getInBandGasQuote`. */
export interface InBandGasQuote {
	/** The relay's settlement recipient for this fee asset (one global treasury in practice). */
	recipient: Address;
	asset: 'native' | 'erc20';
	/** null = the native coin; else a whitelisted stablecoin contract. */
	feeToken: Address | null;
	/** Safe balance of this asset, base units. */
	balance: bigint;
	decimals: number;
	symbol: string;
	/** Decimal string, preserved so USD conversion never loses precision. */
	usdBalance: string;
	/** Null when the network has no native-coin price source. Native gas still works. */
	usdPrice: string | null;
}

// ─── Pricing constants (must match vela-wallet) ───

/**
 * Charge 3× the estimated relayer cost. The relay's own settlement gate requires
 * `reimbursed ≥ realCost × markup` (relay default markup 1.5×); 3× off the padded UserOp gas
 * LIMITS gives comfortable headroom so a stale/optimistic estimate is never rejected.
 */
export const INBAND_MARKUP = 3n;
const USD_PRICE_DECIMALS = 8;
const USD_PRICE_SCALE = 10n ** BigInt(USD_PRICE_DECIMALS);
const STABLE_MIN_USD_SCALED = USD_PRICE_SCALE / 100n; // $0.01

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
	return (numerator + denominator - 1n) / denominator;
}

function bigintMax(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

/**
 * Convert the decimal price strings from the relay to a fixed USD scale (8 dp).
 * Rounding the native price UP and the fee-token price DOWN ensures the converted
 * reimbursement never undercharges relative to the true native cost.
 */
function usdPriceScaled(value: string | null | undefined, roundUp: boolean): bigint | null {
	if (value === null || value === undefined) return null;
	const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
	if (!match) return null;
	const integer = BigInt(match[1]);
	const fraction = match[2] ?? '';
	const kept = fraction.slice(0, USD_PRICE_DECIMALS).padEnd(USD_PRICE_DECIMALS, '0');
	let scaled = integer * USD_PRICE_SCALE + BigInt(kept);
	if (roundUp && /[1-9]/.test(fraction.slice(USD_PRICE_DECIMALS))) scaled += 1n;
	return scaled;
}

/**
 * Exact in-band reimbursement amount for the chosen fee asset, from the transaction's gas basis.
 *
 * `totalGas` = the refined UserOp gas limits sum; `gasPrice` = the chain's (network) gas price.
 * Native fee → `max(totalGas × gasPrice × 3, 0.00001 native)`. Stablecoin fee → that native
 * amount converted through the two USD prices, floored at $0.01. Returns null when a stablecoin
 * conversion lacks the prices it needs.
 */
export function calculateInBandFeeAmount(
	totalGas: bigint,
	gasPrice: bigint,
	feeAsset: Pick<InBandGasQuote, 'asset' | 'decimals' | 'usdPrice'>,
	nativeAsset: Pick<InBandGasQuote, 'asset' | 'decimals' | 'usdPrice'>
): bigint | null {
	if (totalGas < 0n || gasPrice < 0n || nativeAsset.asset !== 'native') return null;
	const nativeUnit = 10n ** BigInt(nativeAsset.decimals);
	// Minimum is 0.00001 native. For an unusual native precision below 5, one base unit is the
	// smallest representable safe floor.
	const nativeMinimum =
		nativeAsset.decimals >= 5 ? 10n ** BigInt(nativeAsset.decimals - 5) : 1n;
	const nativeAmount = bigintMax(totalGas * gasPrice * INBAND_MARKUP, nativeMinimum);
	if (feeAsset.asset === 'native') return nativeAmount;

	const nativeUsdPrice = usdPriceScaled(nativeAsset.usdPrice, true);
	const feeTokenUsdPrice = usdPriceScaled(feeAsset.usdPrice, false);
	if (!nativeUsdPrice || !feeTokenUsdPrice) return null;
	const feeTokenUnit = 10n ** BigInt(feeAsset.decimals);
	const convertedAmount = ceilDiv(
		nativeAmount * nativeUsdPrice * feeTokenUnit,
		nativeUnit * feeTokenUsdPrice
	);
	const stableMinimum = ceilDiv(STABLE_MIN_USD_SCALED * feeTokenUnit, feeTokenUsdPrice);
	return bigintMax(convertedAmount, stableMinimum);
}

/**
 * The single fee leg batched into an in-band UserOp: a plain native-value transfer to the
 * relay's settlement recipient, or a whitelisted-stablecoin `transfer`. Must stay a plain CALL
 * to the exact recipient — that is what the relay's reimbursement parser counts.
 */
export function buildInBandFeeLeg(
	gasFeeToken: Address | null,
	recipient: Address,
	amount: bigint
): Call {
	if (gasFeeToken) {
		return {
			to: gasFeeToken,
			value: 0n,
			data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, amount] })
		};
	}
	return { to: recipient, value: amount, data: '0x' as Hex };
}

/** Find the native (feeToken null) or requested ERC-20 row in a quote set. */
export function findInBandGasQuote(
	quotes: InBandGasQuote[],
	feeToken?: Address | null
): InBandGasQuote | null {
	const wanted = feeToken?.toLowerCase() ?? null;
	return (
		quotes.find((quote) =>
			wanted
				? quote.asset === 'erc20' && quote.feeToken?.toLowerCase() === wanted
				: quote.asset === 'native'
		) ?? null
	);
}

/**
 * The usable transfer ceiling when the transfer itself and its network fee draw from the same
 * asset (send-max / sweep). Returns null when the fee uses a different asset — a caller must not
 * apply this reserve to an unrelated token balance. `transferAsset` is null for the native asset.
 */
export function sameAssetFeeLimit(
	feeAmount: bigint,
	feeAssetToken: Address | null,
	transferAsset: Address | null,
	balance: bigint
): { feeAmount: bigint; maxTransferAmount: bigint } | null {
	if (balance < 0n || feeAmount < 0n) return null;
	const feeIsNative = feeAssetToken === null;
	if (feeIsNative) {
		if (transferAsset !== null) return null;
	} else {
		if (!transferAsset || feeAssetToken.toLowerCase() !== transferAsset.toLowerCase()) return null;
	}
	return {
		feeAmount,
		maxTransferAmount: balance > feeAmount ? balance - feeAmount : 0n
	};
}

/** UI option for the fee-asset selector: native + every whitelisted stablecoin the Safe holds. */
export interface FeeTokenOption {
	asset: 'native' | 'erc20';
	symbol: string;
	/** null = the native coin; else a whitelisted stablecoin contract. */
	contract: Address | null;
	balance: bigint;
	decimals: number;
	recipient: Address;
	usdBalance: string;
	usdPrice: string | null;
}

/**
 * Shape the fee-asset options from a quote set: keep the native row for context even when empty;
 * omit zero-balance stablecoins (they cannot pay). Returns null when there is no quote.
 */
export function loadInBandFeeTokenOptions(quotes: InBandGasQuote[] | null): FeeTokenOption[] | null {
	if (!quotes) return null;
	return quotes
		.filter((quote) => quote.asset === 'native' || quote.balance > 0n)
		.map((quote) => ({
			asset: quote.asset,
			symbol: quote.symbol,
			contract: quote.feeToken,
			balance: quote.balance,
			decimals: quote.decimals,
			recipient: quote.recipient,
			usdBalance: quote.usdBalance,
			usdPrice: quote.usdPrice
		}));
}
