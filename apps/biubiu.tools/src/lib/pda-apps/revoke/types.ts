/**
 * Approval Revoke — shared types.
 *
 * The tool finds *currently active* token approvals an owner has granted
 * (ERC20 allowances, ERC721/ERC1155 operator approvals, Uniswap Permit2) and lets
 * them be revoked — single or batched — through the site `ConnectedWallet`.
 */
import type { Address } from 'viem';

export type TokenStandard = 'erc20' | 'erc721' | 'erc1155';

/**
 * A network the tool can scan. `slug` is the legacy apiNetworkId
 * (e.g. 'eth-mainnet') so it matches chain visuals + the safe-tx CHAIN_CONFIG
 * the wallet uses when sending. Custom networks are keyed `custom-<chainId>`.
 */
export interface RevokeNetwork {
	slug: string;
	chainId: number;
	name: string;
	/** Native gas-coin symbol (ETH, POL, BNB…). */
	symbol: string;
	/** Read RPCs in failover order (first = primary). */
	rpcs: string[];
	/** Block-explorer base URL, no trailing slash. */
	explorerUrl: string;
	/** Multicall3 aggregator (canonical address on every chain). */
	multicall3: Address;
	isTestnet?: boolean;
	isCustom?: boolean;
}

/** A token/collection we probe approvals for (built-in registry or user-added). */
export interface TokenEntry {
	standard: TokenStandard;
	address: Address;
	symbol: string;
	name?: string;
	/** ERC20 only. */
	decimals?: number;
	isCustom?: boolean;
}

/** A known approval recipient (DEX router, marketplace, bridge, Permit2…). */
export type SpenderKind = 'dex' | 'permit2' | 'marketplace' | 'bridge' | 'lending' | 'other';
export interface SpenderEntry {
	address: Address;
	label: string;
	kind: SpenderKind;
	isCustom?: boolean;
}

/** One discovered, currently-active approval — a row in the table. */
export interface ApprovalRow {
	/** Stable id: `${standard}:${token}:${spender}` (all lowercased). */
	id: string;
	standard: TokenStandard;
	token: Address;
	tokenSymbol: string;
	tokenName?: string;
	/** ERC20 only. */
	decimals?: number;
	spender: Address;
	/** Human label when the spender is known; undefined for unknown contracts. */
	spenderLabel?: string;
	spenderKind?: SpenderKind;
	/** ERC20: raw on-chain allowance. NFT operator approvals leave this undefined. */
	allowance?: bigint;
	/** ERC721/ERC1155 setApprovalForAll state. */
	approvedForAll?: boolean;
	/** Allowance is effectively unlimited (≈ max uint256) — the high-risk case. */
	unlimited: boolean;
	/** Surfaced by the deep log scan rather than the curated list. */
	fromLogs?: boolean;
}
