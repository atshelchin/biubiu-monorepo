/**
 * Fast discovery orchestrator — merges built-in + custom registries, runs the
 * Multicall scan, sorts results (unlimited / highest-risk first).
 */
import type { Address } from 'viem';
import { scanApprovals } from '../infra/multicall.js';
import { tokensForChain } from '../registry/tokens.js';
import { spendersForChain } from '../registry/spenders.js';
import type { ApprovalRow, RevokeNetwork, SpenderEntry, TokenEntry } from '../types.js';

export interface DiscoverInput {
	network: RevokeNetwork;
	owner: Address;
	customTokens?: TokenEntry[];
	customSpenders?: SpenderEntry[];
}

function dedupeTokens(list: TokenEntry[]): TokenEntry[] {
	const seen = new Set<string>();
	return list.filter((t) => {
		const k = `${t.standard}:${t.address.toLowerCase()}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

function dedupeSpenders(list: SpenderEntry[]): SpenderEntry[] {
	const seen = new Set<string>();
	return list.filter((s) => {
		const k = s.address.toLowerCase();
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

export async function discover({
	network,
	owner,
	customTokens = [],
	customSpenders = [],
}: DiscoverInput): Promise<ApprovalRow[]> {
	const tokens = dedupeTokens([...tokensForChain(network.chainId), ...customTokens]);
	const spenders = dedupeSpenders([...spendersForChain(network.chainId), ...customSpenders]);
	const rows = await scanApprovals(network, owner, tokens, spenders);
	return rows.sort(
		(a, b) =>
			Number(b.unlimited) - Number(a.unlimited) ||
			a.tokenSymbol.localeCompare(b.tokenSymbol) ||
			a.spender.localeCompare(b.spender),
	);
}
