/**
 * Bundler gas-account REST client (vela bundler model).
 *
 * Ported from vela-wallet `services/bundler-service.ts`. The vela bundler gives each
 * Safe a dedicated per-chain EOA — the "gas account" — that pays the outer tx cost.
 * The user funds that EOA (self-fund) or the bundler sponsors it from its treasury.
 * Sends check the gas-account `spendableBalance` against the estimated cost BEFORE
 * submitting; if short, the funding modal offers sponsor / self-fund.
 *
 * Tempo (no native coin): the per-Safe EOA is the reimbursement target and its
 * balance is read as pathUSD (6-dec) scaled to 18 for a uniform wei-based UI.
 */

import { type Hex } from 'viem';
import { getBundlerServiceURL } from './endpoints.js';
import { rpcCall } from './rpc-client.js';
import { bundlerHeaders } from './bundler-headers.js';
import { chainInfo, isTempoChain } from './chains.js';
import { TEMPO_DEFAULT_FEE_TOKEN } from './tempo.js';

export interface BundlerAccountInfo {
	chainId: number;
	/** The bundler's per-Safe EOA (fund this / reimbursement target). */
	depositAddress: string;
	/** On-chain native balance (wei); pathUSD scaled to 18-dec on Tempo. */
	onchainBalance: bigint;
	/** Balance available to spend (on-chain minus reserved). */
	spendableBalance: bigint;
	/** Bundler-reported status (informational; not gated on). */
	status: string;
	/** Native symbol used for display ('pathUSD' on Tempo). */
	nativeSym: string;
}

export interface SponsorResult {
	sponsored: boolean;
	reason?: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const SPONSOR_TIMEOUT_MS = 20_000;
const INFO_CACHE_TTL = 30_000;
const cache = new Map<string, { info: BundlerAccountInfo | null; at: number }>();

function parseBigIntHex(v: unknown): bigint {
	if (typeof v === 'string' && v.startsWith('0x')) {
		try {
			return BigInt(v);
		} catch {
			return 0n;
		}
	}
	if (typeof v === 'number') return BigInt(Math.trunc(v));
	if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
	return 0n;
}

/** Invalidate the cached info for a Safe (call after funding / sponsoring). */
export function clearBundlerAccountCache(chainId: number, safeAddress: string): void {
	cache.delete(`${chainId}:${safeAddress.toLowerCase()}`);
}

export async function fetchBundlerAccountInfo(
	chainId: number,
	safeAddress: string
): Promise<BundlerAccountInfo | null> {
	const key = `${chainId}:${safeAddress.toLowerCase()}`;
	const cached = cache.get(key);
	if (cached && Date.now() - cached.at < INFO_CACHE_TTL) return cached.info;

	try {
		const url = `${getBundlerServiceURL()}/v1/account/${chainId}/${safeAddress.toLowerCase()}`;
		const headers = await bundlerHeaders(chainId, { Accept: 'application/json' });

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		let res: Response;
		try {
			res = await fetch(url, { headers, signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) return null;

		const data = (await res.json()) as {
			activeDepositAddress?: string;
			onchainBalance?: unknown;
			spendableBalance?: unknown;
			status?: string;
		};

		let onchainBalance = parseBigIntHex(data.onchainBalance);
		let spendableBalance = parseBigIntHex(data.spendableBalance);
		let nativeSym = chainInfo(chainId)?.nativeSymbol ?? 'ETH';

		// Tempo: eth_getBalance is a sentinel — read the gas EOA's pathUSD (6-dec)
		// and scale to 18-dec so the wei-based funding UI renders the right USD value.
		if (isTempoChain(chainId) && data.activeDepositAddress) {
			try {
				const callData = ('0x70a08231000000000000000000000000' +
					String(data.activeDepositAddress).slice(2).toLowerCase()) as Hex;
				const balRes = await rpcCall<Hex>(
					'eth_call',
					[{ to: TEMPO_DEFAULT_FEE_TOKEN, data: callData }, 'latest'],
					chainId
				);
				const path6 = parseBigIntHex(balRes);
				onchainBalance = path6 * 10n ** 12n;
				spendableBalance = onchainBalance;
				nativeSym = 'pathUSD';
			} catch {
				/* keep native fallback */
			}
		}

		const info: BundlerAccountInfo = {
			chainId,
			depositAddress: data.activeDepositAddress ?? '',
			onchainBalance,
			spendableBalance,
			status: data.status ?? 'UNKNOWN',
			nativeSym
		};
		cache.set(key, { info, at: Date.now() });
		return info;
	} catch {
		return null;
	}
}

/**
 * Ask the bundler to sponsor (fund) the Safe's gas account from its treasury.
 * Server-side eligibility (nonce/passkey/treasury). Returns {sponsored, reason?}.
 */
export async function requestSponsorship(
	chainId: number,
	safeAddress: string,
	requiredWei: bigint
): Promise<SponsorResult> {
	try {
		const url = `${getBundlerServiceURL()}/v1/sponsor/${chainId}/${safeAddress.toLowerCase()}`;
		const headers = await bundlerHeaders(chainId, {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		});

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SPONSOR_TIMEOUT_MS);
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify({ requiredWei: '0x' + requiredWei.toString(16) }),
				signal: controller.signal
			});
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) return { sponsored: false, reason: 'request_failed' };
		return (await res.json()) as SponsorResult;
	} catch {
		return { sponsored: false, reason: 'network_error' };
	}
}

export interface GasAccountFunding {
	chainId: number;
	safeAddress: string;
	depositAddress: string;
	nativeSym: string;
	/** Minimum spendable the gas account needs for this send. */
	requiredWei: bigint;
	/** Current spendable balance of the gas account. */
	currentWei: bigint;
}

/**
 * Returns funding info IF the gas account is short for `requiredWei`, else null
 * (already funded / unknown bundler / fetch failed → let the send proceed and the
 * bundler reject if truly underfunded).
 */
export async function checkGasAccountFunding(
	chainId: number,
	safeAddress: string,
	requiredWei: bigint
): Promise<GasAccountFunding | null> {
	const info = await fetchBundlerAccountInfo(chainId, safeAddress);
	if (!info || !info.depositAddress) return null;
	if (info.spendableBalance >= requiredWei) return null;
	return {
		chainId,
		safeAddress,
		depositAddress: info.depositAddress,
		nativeSym: info.nativeSym,
		requiredWei,
		currentWei: info.spendableBalance
	};
}
