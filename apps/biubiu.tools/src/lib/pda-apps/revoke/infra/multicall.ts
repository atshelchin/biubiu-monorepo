/**
 * Fast approval discovery — batched current-state reads via Multicall3.
 *
 * Three type-safe passes (one ABI each, so viem infers cleanly):
 *   1. ERC20    allowance(owner, spender)              → active if > 0
 *   2. NFT      isApprovedForAll(owner, operator)      → active if true
 *   3. Permit2  allowance(owner, token, spender)       → active if amount > 0 & not expired
 *
 * Pure public RPC, bounded by the curated token/spender registries. Multicall3
 * `allowFailure` means a token/spender with no code on this chain is just skipped.
 */
import type { Address, PublicClient } from 'viem';
import { makeClient } from './viem.js';
import {
	ERC20_ABI,
	NFT_ABI,
	PERMIT2_ABI,
	PERMIT2_ADDRESS,
	isUnlimited,
	isUnlimited160,
} from './abis.js';
import type { ApprovalRow, SpenderEntry, TokenEntry, RevokeNetwork } from '../types.js';

const CALLS_PER_REQUEST = 400;

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

type MultiResult<T> = { status: 'success'; result: T } | { status: 'failure'; error: Error };

function rowId(standard: string, token: Address, spender: Address): string {
	return `${standard}:${token.toLowerCase()}:${spender.toLowerCase()}`;
}

function spenderLabel(s: SpenderEntry): Pick<ApprovalRow, 'spenderLabel' | 'spenderKind'> {
	return { spenderLabel: s.label, spenderKind: s.kind };
}

/**
 * Scan all (token × spender) pairs for currently-active approvals.
 * Throws if the chain has no reachable Multicall3 (caller shows a friendly error).
 */
export async function scanApprovals(
	network: RevokeNetwork,
	owner: Address,
	tokens: TokenEntry[],
	spenders: SpenderEntry[],
): Promise<ApprovalRow[]> {
	const client = makeClient(network);
	const erc20s = tokens.filter((t) => t.standard === 'erc20');
	const nfts = tokens.filter((t) => t.standard !== 'erc20');
	// Permit2 sub-allowances are granted TO non-Permit2 spenders.
	const permit2Spenders = spenders.filter((s) => s.kind !== 'permit2');
	const nowSec = Math.floor(Date.now() / 1000);

	const rows: ApprovalRow[] = [];

	// ── Pass 1: ERC20 allowance ──
	{
		const calls = erc20s.flatMap((token) =>
			spenders.map((spender) => ({
				address: token.address,
				abi: ERC20_ABI,
				functionName: 'allowance' as const,
				args: [owner, spender.address] as const,
			})),
		);
		const pairs = erc20s.flatMap((token) => spenders.map((spender) => ({ token, spender })));
		const res = await runMulticall<bigint>(client, calls);
		res.forEach((r, i) => {
			if (r.status !== 'success' || r.result <= 0n) return;
			const { token, spender } = pairs[i];
			rows.push({
				id: rowId('erc20', token.address, spender.address),
				standard: 'erc20',
				token: token.address,
				tokenSymbol: token.symbol,
				tokenName: token.name,
				decimals: token.decimals,
				spender: spender.address,
				allowance: r.result,
				unlimited: isUnlimited(r.result),
				...spenderLabel(spender),
			});
		});
	}

	// ── Pass 2: NFT isApprovedForAll ──
	{
		const calls = nfts.flatMap((token) =>
			spenders.map((spender) => ({
				address: token.address,
				abi: NFT_ABI,
				functionName: 'isApprovedForAll' as const,
				args: [owner, spender.address] as const,
			})),
		);
		const pairs = nfts.flatMap((token) => spenders.map((spender) => ({ token, spender })));
		const res = await runMulticall<boolean>(client, calls);
		res.forEach((r, i) => {
			if (r.status !== 'success' || r.result !== true) return;
			const { token, spender } = pairs[i];
			rows.push({
				id: rowId(token.standard, token.address, spender.address),
				standard: token.standard,
				token: token.address,
				tokenSymbol: token.symbol,
				tokenName: token.name,
				spender: spender.address,
				approvedForAll: true,
				unlimited: true, // operator approval = blanket access to the whole collection
				...spenderLabel(spender),
			});
		});
	}

	// ── Pass 3: Permit2 sub-allowances ──
	{
		const calls = erc20s.flatMap((token) =>
			permit2Spenders.map((spender) => ({
				address: PERMIT2_ADDRESS,
				abi: PERMIT2_ABI,
				functionName: 'allowance' as const,
				args: [owner, token.address, spender.address] as const,
			})),
		);
		const pairs = erc20s.flatMap((token) => permit2Spenders.map((spender) => ({ token, spender })));
		const res = await runMulticall<readonly [bigint, number, number]>(client, calls);
		res.forEach((r, i) => {
			if (r.status !== 'success') return;
			const [amount, expiration] = r.result;
			if (amount <= 0n || expiration <= nowSec) return; // zero or expired → not active
			const { token, spender } = pairs[i];
			rows.push({
				id: rowId('permit2', token.address, spender.address),
				standard: 'erc20',
				token: token.address,
				tokenSymbol: token.symbol,
				tokenName: token.name,
				decimals: token.decimals,
				spender: spender.address,
				allowance: amount,
				unlimited: isUnlimited160(amount),
				spenderLabel: `${spender.label} · via Permit2`,
				spenderKind: 'permit2',
			});
		});
	}

	return rows;
}

async function runMulticall<T>(
	client: PublicClient,
	contracts: readonly unknown[],
): Promise<MultiResult<T>[]> {
	const out: MultiResult<T>[] = [];
	for (const group of chunk(contracts as unknown[], CALLS_PER_REQUEST)) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const r = await client.multicall({ contracts: group as any, allowFailure: true, batchSize: 0 });
		out.push(...(r as MultiResult<T>[]));
	}
	return out;
}
