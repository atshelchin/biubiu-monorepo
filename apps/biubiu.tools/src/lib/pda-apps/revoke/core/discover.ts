/**
 * Fast discovery orchestrator — merges built-in + custom registries, runs the
 * Multicall scan, sorts results (unlimited / highest-risk first).
 */
import type { Address } from 'viem';
import { scanApprovals } from '../infra/multicall.js';
import { dedupeBy } from '../infra/dedupe.js';
import { tokensForChain } from '../registry/tokens.js';
import { spendersForChain } from '../registry/spenders.js';
import type { ApprovalRow, RevokeNetwork, SpenderEntry, TokenEntry } from '../types.js';

export interface DiscoverInput {
	network: RevokeNetwork;
	owner: Address;
	customTokens?: TokenEntry[];
	customSpenders?: SpenderEntry[];
}

export async function discover({
	network,
	owner,
	customTokens = [],
	customSpenders = [],
}: DiscoverInput): Promise<ApprovalRow[]> {
	const tokens = dedupeBy(
		[...tokensForChain(network.chainId), ...customTokens],
		(t) => `${t.standard}:${t.address.toLowerCase()}`,
	);
	const spenders = dedupeBy(
		[...spendersForChain(network.chainId), ...customSpenders],
		(s) => s.address.toLowerCase(),
	);
	const rows = await scanApprovals(network, owner, tokens, spenders);
	return rows.sort(
		(a, b) =>
			Number(b.unlimited) - Number(a.unlimited) ||
			a.tokenSymbol.localeCompare(b.tokenSymbol) ||
			a.spender.localeCompare(b.spender),
	);
}
