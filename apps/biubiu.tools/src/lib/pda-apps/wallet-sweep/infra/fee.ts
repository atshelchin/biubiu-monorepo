/**
 * Sweep fee (v2) — paid by the RELAY, forwarded to FEE_COLLECTOR by BatchSweeper
 * (msg.value on the first batch). Same amount policy + constants as token-sender
 * so they never diverge: member-free → fixed-per-network → $5-equiv (Chainlink) →
 * 1-native fallback. Membership only waives THIS service fee — the relay still
 * pays network gas / bundler / on-chain costs.
 */
import { createPublicClient, http, fallback, parseUnits } from 'viem';
import {
	FEE_USD,
	FEE_COLLECTOR,
	FEE_FALLBACK_NATIVE,
	FEE_FIXED_NATIVE,
} from '$lib/pda-apps/token-sender/infra/fee-config';
import type { FeeQuote } from '$lib/pda-apps/token-sender/types';
import type { SweepNetwork } from '../types.js';

export { FEE_COLLECTOR, FEE_USD };
export type { FeeQuote };

const AGGREGATOR_ABI = [
	{
		type: 'function',
		name: 'latestRoundData',
		stateMutability: 'view',
		inputs: [],
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' },
		],
	},
	{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

async function fetchNativeUsdPrice(network: SweepNetwork): Promise<number | null> {
	const feed = network.chainlinkNativeUsdFeed;
	if (!feed) return null;
	try {
		const client = createPublicClient({ transport: fallback(network.rpcs.map((u) => http(u))) });
		const [round, dec] = await Promise.all([
			client.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: 'latestRoundData' }) as Promise<
				readonly [bigint, bigint, bigint, bigint, bigint]
			>,
			client.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: 'decimals' }) as Promise<number>,
		]);
		const answer = round[1];
		if (answer <= 0n) return null;
		return Number(answer) / 10 ** Number(dec);
	} catch {
		return null;
	}
}

/** Fee priority: member-free → config fixed → $5-equiv → 1-native fallback. */
export async function quoteSweepFee(
	network: SweepNetwork,
	opts?: { isMember?: boolean },
): Promise<FeeQuote> {
	if (opts?.isMember) return { amount: 0n, source: 'member-free' };

	const fixed = FEE_FIXED_NATIVE[network.slug];
	if (fixed != null) return { amount: fixed, source: 'config' };

	const price = await fetchNativeUsdPrice(network);
	if (price && price > 0) {
		const native = FEE_USD / price;
		const amount = parseUnits(native.toFixed(network.decimals), network.decimals);
		return { amount, source: 'usd', usd: FEE_USD, nativeUsdPrice: price };
	}

	return { amount: FEE_FALLBACK_NATIVE, source: 'fallback' };
}
