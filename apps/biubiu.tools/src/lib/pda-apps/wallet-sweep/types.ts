/**
 * Wallet Sweep — shared types.
 *
 * The tool upgrades many EOAs to an EIP-7702 Sweeper delegate (controller =
 * the user's passkey Safe), then the Safe pulls native + ERC20 out of all of
 * them in one fingerprint via Safe MultiSend.
 */
import type { Address, Hex } from 'viem';

/** A whitelisted, passkey-capable, 7702-capable network. */
export interface SweepNetwork {
	/** Slug aligned with CHAIN_CONFIG so sendContractCall({ network }) works. */
	slug: string;
	name: string;
	chainId: number;
	/** Native coin symbol (ETH, POL, BNB, xDAI…). */
	symbol: string;
	decimals: number;
	/** Read RPCs (balances, getCode, nonce). */
	rpcs: string[];
	/** Type-4-capable RPCs for broadcasting the upgrade tx. Defaults to `rpcs`. */
	writableRpcs: string[];
	explorerTxUrl: string;
	explorerAddressUrl: string;
	/** Safe MultiSend 1.4.1 (same deterministic address on every chain). */
	multiSendAddress: Address;
	/** Multicall3 (same deterministic address on every chain). */
	multicall3: Address;
	/** Max EOA authorizations per upgrade (type-4) tx. */
	maxBatchUpgrade: number;
	/** Max sweep() sub-calls per MultiSend batch (one fingerprint). */
	maxBatchSweep: number;
	/** Curated: chain is post-Pectra / supports EIP-7702. */
	supports7702: boolean;
	/** Chainlink native/USD feed for the $5-equiv fee (omit → fallback). */
	chainlinkNativeUsdFeed?: Address;
	isTestnet?: boolean;
}

/** Result of probing a network's live readiness. */
export interface NetworkReadiness {
	slug: string;
	/** RPC answered eth_chainId with the expected id. */
	reachable: boolean;
	/** RIP-7212 P256 precompile present (passkey can sign here). */
	p256: boolean;
	/** Safe MultiSend deployed (passkey Safe stack present). */
	safeStack: boolean;
	/** All checks passed → usable. */
	ready: boolean;
	error?: string;
}

/** EIP-7702 delegation state of an EOA, derived from eth_getCode. */
export type Delegation =
	| 'none' // plain EOA, no code
	| 'ours' // delegated to OUR Sweeper (0xef0100 || sweeper)
	| 'foreign' // delegated to a different contract
	| 'contract' // real contract code — not a sweepable EOA
	| 'unknown';

export type UpgradeStatus = 'pending' | 'signing' | 'broadcast' | 'upgraded' | 'skipped' | 'failed';

/** Per-EOA working state (status keyed by address; keys held separately). */
export interface EoaStatus {
	address: Address;
	delegation: Delegation;
	/** Native balance (wei) as decimal string for serialization. */
	nativeBalance: string;
	/** tokenAddress(lowercase) → balance (raw) string. */
	tokenBalances: Record<string, string>;
	upgrade: UpgradeStatus;
	error?: string;
}

/** A private key paired with its derived address (in-memory only, never persisted). */
export interface EoaKey {
	privateKey: Hex;
	address: Address;
}

export type TokenKind = 'native' | 'erc20';

export interface TokenSpec {
	kind: TokenKind;
	/** undefined for native. */
	address?: Address;
	symbol: string;
	decimals: number;
}

export type Phase = 'config' | 'run' | 'done';

/** Sub-state shown inside the merged "Run" step. */
export type RunStage = 'idle' | 'funding' | 'deploying' | 'upgrading' | 'sweeping';

/** One executed sweep batch (one MultiSend / one fingerprint). */
export interface SweepBatchRecord {
	index: number;
	count: number;
	txHash?: string;
	explorerUrl?: string;
	status: 'completed' | 'failed';
	error?: string;
}

/** History record (IndexedDB) — one per sweep operation. */
export interface SweepRecord {
	id: string;
	createdAt: number;
	network: string;
	networkName: string;
	destination: Address;
	/** Token symbols included (native first). */
	tokens: string[];
	eoaCount: number;
	/** Total native swept (wei) as string. */
	totalNative: string;
	/** tokenAddress → total raw amount string. */
	totalTokens: Record<string, string>;
	/** Fee charged (native wei) as string; "0" for members. */
	feeWei: string;
	isMember: boolean;
	batches: SweepBatchRecord[];
	status: 'completed' | 'partial' | 'failed';
}
