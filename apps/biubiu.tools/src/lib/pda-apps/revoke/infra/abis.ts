/**
 * Minimal ABIs for reading + revoking approvals across ERC20 / ERC721 / ERC1155
 * and Uniswap Permit2. Kept as `const` tuples so viem infers argument/return
 * types at the call sites.
 */
import type { Address } from 'viem';

/** Uniswap Permit2 — same address on every chain. */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address;

/** 2^256 - 1. */
export const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Treat an allowance as "unlimited" when it's in the top half of uint256.
 * Covers `type(uint256).max` and the common `max/2` / "very large" patterns
 * that are, in practice, unbounded spend rights.
 */
export function isUnlimited(allowance: bigint): boolean {
	return allowance > MAX_UINT256 >> 1n;
}

// ── ERC20 ───────────────────────────────────────────────────────────────────
export const ERC20_ABI = [
	{ name: 'allowance', type: 'function', stateMutability: 'view',
		inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
		outputs: [{ type: 'uint256' }] },
	{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
		inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
		outputs: [{ type: 'bool' }] },
	{ name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
	{ name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
	{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

// ── ERC721 / ERC1155 (operator approvals share the same signatures) ──────────
export const NFT_ABI = [
	{ name: 'isApprovedForAll', type: 'function', stateMutability: 'view',
		inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
		outputs: [{ type: 'bool' }] },
	{ name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable',
		inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
		outputs: [] },
	// ERC721 single-token approval (deep scan / advanced).
	{ name: 'getApproved', type: 'function', stateMutability: 'view',
		inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
	{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
		inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
	{ name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
	{ name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

// ── Permit2 ──────────────────────────────────────────────────────────────────
export const PERMIT2_ABI = [
	// Per-spender sub-allowance: (amount, expiration, nonce).
	{ name: 'allowance', type: 'function', stateMutability: 'view',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'token', type: 'address' },
			{ name: 'spender', type: 'address' },
		],
		outputs: [
			{ name: 'amount', type: 'uint160' },
			{ name: 'expiration', type: 'uint48' },
			{ name: 'nonce', type: 'uint48' },
		] },
	{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
		inputs: [
			{ name: 'token', type: 'address' },
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint160' },
			{ name: 'expiration', type: 'uint48' },
		],
		outputs: [] },
	// Batch revoke: lockdown([{ token, spender }, …]).
	{ name: 'lockdown', type: 'function', stateMutability: 'nonpayable',
		inputs: [{
			name: 'approvals', type: 'tuple[]',
			components: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }],
		}],
		outputs: [] },
] as const;

/** Permit2 amount field is uint160 → its "max"/unlimited sentinel. */
export const MAX_UINT160 = (1n << 160n) - 1n;
export function isUnlimited160(amount: bigint): boolean {
	return amount > MAX_UINT160 >> 1n;
}
