/**
 * Shared types for the Contract Caller tool.
 */
import type { Abi, AbiFunction, AbiParameter, Address, Hex } from 'viem';

export type StateMutability = 'pure' | 'view' | 'nonpayable' | 'payable';

/** A single callable function extracted from an ABI, enriched with metadata. */
export interface ParsedMethod {
	/** Function name (may repeat across overloads). */
	name: string;
	/** Canonical signature, e.g. `transfer(address,uint256)`. Unique per overload. */
	signature: string;
	/** 4-byte selector, e.g. `0xa9059cbb`. */
	selector: string;
	stateMutability: StateMutability;
	/** view / pure → read; otherwise write. */
	isRead: boolean;
	/** Whether the function accepts ETH value. */
	payable: boolean;
	inputs: readonly AbiParameter[];
	outputs: readonly AbiParameter[];
	/** The raw ABI item (used for encode/decode). */
	abiItem: AbiFunction;
}

/** Which ABI is currently driving the method list (proxy phase). */
export type AbiSource = 'primary' | 'implementation';

/** Result of a read (eth_call) for a single method. */
export interface ReadState {
	status: 'idle' | 'loading' | 'success' | 'error';
	/** Decoded outputs (array matching `outputs`, or single value). */
	decoded?: unknown;
	error?: string;
	at?: number;
}

/** Chain metadata loaded from the ethereum-data API (mirrors vela-chain-setup). */
export interface ChainInfo {
	chainId: number;
	name: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
	rpcUrls: string[];
	explorerUrl: string;
	logoURL: string;
	isTestnet: boolean;
}

export interface ChainSearchResult {
	chainId: number;
	name: string;
	shortName: string;
	nativeCurrencySymbol: string;
	hasLogo: boolean;
}

export interface RpcOption {
	url: string;
	latencyMs: number | null;
	status: 'ok' | 'error' | 'pending';
}

/** Proxy detection result. */
export interface ProxyInfo {
	/** The detected pattern. */
	kind: 'eip1967' | 'beacon' | 'eip1822' | 'eip1167' | 'gnosis-safe' | 'getter' | 'none';
	/** Resolved implementation address (the contract holding the real logic). */
	implementation: Address | null;
	/** For beacon proxies, the beacon address. */
	beacon?: Address | null;
	/** Human label, e.g. "EIP-1967 Transparent / UUPS". */
	label: string;
}

/** State of an in-app write (sent via the built-in Safe wallet). */
export interface WriteState {
	status: 'idle' | 'sending' | 'done' | 'error';
	/** Current SendStatus phase from the wallet (checking/building/…/confirmed). */
	phase?: string;
	txHash?: string;
	explorerUrl?: string;
	error?: string;
}

/** A queued write call (used by the batch builder). */
export interface QueuedCall {
	id: string;
	/** Display label, e.g. `USDC.approve(...)`. */
	label: string;
	to: Address;
	value: bigint;
	data: Hex;
	/** Source method signature (for editing). */
	signature: string;
}

/** Summary of a WhatsABI auto-fetch, shown after a successful discovery. */
export interface AutoFetchInfo {
	/** Verified source name (e.g. "Sourcify") or "bytecode selectors". */
	source: string;
	/** Whether a proxy was detected and its implementation ABI merged. */
	followedProxy: boolean;
	/** The resolved implementation address (when a proxy was followed). */
	resolvedAddress: string;
	/** 4-byte selectors that could not be named (omitted from the list). */
	unresolved: number;
}

/** How a chained-call parameter gets its value. */
export interface ChainParamRef {
	kind: 'literal' | 'ref';
	/** Index of an earlier step whose return value feeds this param. */
	sourceStep?: number;
	/** Which 32-byte output word of that step (0-based). */
	outputSlot?: number;
}

/** One step in an atomic on-chain chain. */
export interface ChainStep {
	id: string;
	signature: string;
	name: string;
	to: Address;
	method: ParsedMethod;
	/** Literal canonical values per parameter (used when ref.kind === 'literal'). */
	values: string[];
	/** Per-parameter: literal or reference to a previous step's output. */
	refs: ChainParamRef[];
	/** ETH value (wei) for payable steps. */
	payableValue: string;
}

export type { Abi, AbiFunction, AbiParameter, Address, Hex };
