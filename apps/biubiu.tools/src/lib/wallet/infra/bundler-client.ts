/**
 * Direct-fetch ERC-4337 relay/bundler client (vela relay — replaces the Pimlico proxy).
 *
 * Base URL comes from wallet/infra/endpoints.ts (default https://vela-relay.getvela.app),
 * chainId appended per request. Each POST carries an `X-Rpc-Url` header with the chain's
 * fastest RPC so the relay can reach the chain (vela convention, CORS pre-approved). The
 * relay accepts a Tempo `feeToken` extension field on the UserOp dict for `eth_sendUserOperation`.
 */

import type { Address, Hex } from 'viem';
import { CONTRACTS } from '$lib/auth/compute-safe-address.js';
import { getBundlerServiceURL } from './endpoints.js';
import { jsonRpcPost } from './json-rpc.js';
import { bundlerHeaders } from './bundler-headers.js';
import type { InBandGasQuote } from './inband.js';

/** UserOp dict as produced by build-userop.ts `formatUserOpForRpc` (+ optional feeToken). */
export type UserOpDict = Record<string, unknown>;

const ENTRY_POINT = CONTRACTS.entryPoint;

function bundlerRpcUrl(chainId: number): string {
	return `${getBundlerServiceURL()}/${chainId}`;
}

async function bundlerCall<T>(method: string, params: unknown[], chainId: number): Promise<T> {
	// Keyless public RPC only — never leak a provider-key URL to the bundler.
	const headers = await bundlerHeaders(chainId, { 'Content-Type': 'application/json' });
	return jsonRpcPost<T>(bundlerRpcUrl(chainId), method, params, {
		headers,
		httpError: async (res) => {
			const text = await res.text().catch(() => '');
			return new Error(`Bundler HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
		}
	});
}

export interface GasEstimate {
	preVerificationGas: Hex;
	verificationGasLimit: Hex;
	callGasLimit: Hex;
}

export async function estimateUserOperationGas(op: UserOpDict, chainId: number): Promise<GasEstimate> {
	return bundlerCall('eth_estimateUserOperationGas', [op, ENTRY_POINT], chainId);
}

export async function sendUserOperation(op: UserOpDict, chainId: number): Promise<Hex> {
	return bundlerCall<Hex>('eth_sendUserOperation', [op, ENTRY_POINT], chainId);
}

export interface UserOpReceipt {
	userOpHash: Hex;
	success: boolean;
	receipt: { transactionHash: Hex; blockNumber: Hex };
}

export async function getUserOperationReceipt(userOpHash: Hex, chainId: number): Promise<UserOpReceipt | null> {
	return bundlerCall('eth_getUserOperationReceipt', [userOpHash], chainId);
}

export interface GasPriceTiers {
	slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
	standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
	fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
}

/** pimlico_getUserOperationGasPrice — supported by the vela bundler; null on failure. */
export async function getUserOperationGasPrice(chainId: number): Promise<GasPriceTiers | null> {
	return bundlerCall<GasPriceTiers>('pimlico_getUserOperationGasPrice', [], chainId).catch(() => null);
}

// ─── In-band gas quote (vela_getInBandGasQuote) ───

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^\d+(?:\.\d+)?$/;
const QUOTE_CACHE_TTL = 8_000;
const quoteCache = new Map<string, { at: number; quotes: InBandGasQuote[] | null }>();

function parseQuantity(v: unknown): bigint {
	if (typeof v === 'string') {
		try {
			if (v.startsWith('0x')) return BigInt(v);
			if (/^\d+$/.test(v)) return BigInt(v);
		} catch {
			return -1n;
		}
	}
	if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
	return -1n;
}

function parseDecimalString(v: unknown): string | null {
	return typeof v === 'string' && DECIMAL_RE.test(v.trim()) ? v.trim() : null;
}

/**
 * Fetch every in-band fee asset the relay accepts for `safeAddress` on this chain (native +
 * whitelisted stablecoins the Safe holds), with balances, USD prices, and the settlement
 * recipient — all in one address-only RPC. Returns null when the method is unavailable,
 * unsupported, or malformed (callers then treat the chain as non-in-band / show an error).
 * Short-lived cache so the estimate and the selector share one round trip.
 */
export async function getInBandGasQuotes(
	safeAddress: Address,
	chainId: number
): Promise<InBandGasQuote[] | null> {
	const key = `${chainId}:${safeAddress.toLowerCase()}`;
	const cached = quoteCache.get(key);
	if (cached && Date.now() - cached.at < QUOTE_CACHE_TTL) return cached.quotes;

	let quotes: InBandGasQuote[] | null;
	try {
		const raw = await bundlerCall<unknown>('vela_getInBandGasQuote', [{ safeAddress }], chainId);
		quotes = Array.isArray(raw) ? parseQuotes(raw) : null;
	} catch {
		return null; // transient failure — do not poison the cache
	}
	quoteCache.set(key, { at: Date.now(), quotes });
	return quotes;
}

function parseQuotes(rows: unknown[]): InBandGasQuote[] | null {
	const quotes = rows.flatMap((r): InBandGasQuote[] => {
		if (!r || typeof r !== 'object') return [];
		const o = r as Record<string, unknown>;
		const recipient = typeof o.recipient === 'string' && ADDRESS_RE.test(o.recipient) ? (o.recipient as Address) : null;
		const asset = o.asset === 'native' || o.asset === 'erc20' ? o.asset : null;
		const feeToken = typeof o.feeToken === 'string' && ADDRESS_RE.test(o.feeToken) ? (o.feeToken as Address) : null;
		const balance = parseQuantity(o.balance);
		const decimals = typeof o.decimals === 'number' && Number.isSafeInteger(o.decimals) && o.decimals >= 0 ? o.decimals : null;
		const symbol = typeof o.symbol === 'string' && o.symbol.trim() ? o.symbol : null;
		const usdBalance = parseDecimalString(o.usdBalance) ?? '0';
		const usdPrice = parseDecimalString(o.usdPrice);
		if (!recipient || !asset || balance < 0n || decimals === null || !symbol || (asset === 'erc20' && (!feeToken || usdPrice === null))) {
			return [];
		}
		return [{ recipient, asset, feeToken: asset === 'erc20' ? feeToken : null, balance, decimals, symbol, usdBalance, usdPrice }];
	});
	// Stablecoin reimbursement is converted from the native gas cost — without a native USD price
	// it cannot be computed, so drop stablecoin options and keep only the payable native row.
	const nativeQuote = quotes.find((q) => q.asset === 'native');
	const usable = nativeQuote?.usdPrice === null ? quotes.filter((q) => q.asset === 'native') : quotes;
	return usable.length > 0 ? usable : null;
}
