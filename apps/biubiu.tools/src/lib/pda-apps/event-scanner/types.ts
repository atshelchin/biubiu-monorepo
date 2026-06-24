/**
 * Domain types for the Event Scanner.
 *
 * The scanner queries `eth_getLogs` over a block range for a contract address +
 * an event topic0 (+ optional indexed-topic filters), decodes the raw logs with
 * the (implementation) ABI, and persists decoded events to IndexedDB.
 */
import type { Abi, AbiEvent, AbiParameter, Address, Hex } from 'viem';

/** Minimal network shape the scanner pool needs (a single user-selected chain). */
export interface ScanNetwork {
	/** Stable registry key for the pool, e.g. `chain-56`. */
	key: string;
	name: string;
	chainId: number;
	rpcs: string[];
	symbol: string;
	decimals: number;
	explorerUrl?: string;
}

/** A viem topics array element: exact match, OR-set, or wildcard. */
export type TopicFilter = Hex | Hex[] | null;

/**
 * One filter set = a concrete `topics` array (topic0 + optional topic1/2/3).
 * Tracking a wallet's transfers produces two sets (`out` and `in`).
 */
export interface FilterSet {
	/** 'all' | 'out' | 'in' | custom — kept on each event for direction labels. */
	id: string;
	topics: TopicFilter[];
}

/** A single resumable TaskHub job: one filter set over one block sub-range. */
export interface ScanJob {
	network: string;
	contract: Address;
	filterSetId: string;
	topics: TopicFilter[];
	/** inclusive */
	fromBlock: number;
	/** inclusive */
	toBlock: number;
	/** starting span; the handler may split below this on RPC overflow */
	chunkSize: number;
}

/** Minimal serializable subset of a viem Log (bigints stringified for JSON/TaskHub). */
export interface RawLog {
	address: Address;
	topics: Hex[];
	data: Hex;
	blockNumber: string;
	transactionHash: Hex;
	logIndex: number;
	transactionIndex?: number;
}

export interface ScanJobResult {
	job: ScanJob;
	logs: RawLog[];
}

/** A decoded event row persisted to IndexedDB. */
export interface DecodedEvent {
	scanId: string;
	/** `${scanId}:${txHash}:${logIndex}` — IndexedDB keyPath (free dedup). */
	pk: string;
	network: string;
	contract: Address;
	filterSetId: string;
	eventName: string;
	/** decoded args by name (bigints stringified); positional fallback `arg0`,`arg1`… */
	args: Record<string, string>;
	blockNumber: number;
	txHash: Hex;
	logIndex: number;
}

/** Persisted scan metadata (keyPath `scanId`). */
export interface ScanMeta {
	/** = merkleRoot of the job set (deterministic identity). */
	scanId: string;
	name: string;
	network: string;
	/** Full network (with RPCs) — needed to resume a scan and fetch timestamps. */
	net: ScanNetwork;
	chainId: number;
	contract: Address;
	explorerUrl?: string;
	/** ERC-20 decimals of the contract, if it is a token (for friendly amounts). */
	tokenDecimals?: number;
	/** The decode ABI (merged implementation ABI). */
	abi: Abi;
	eventName: string;
	eventSignature: string;
	topic0: Hex;
	filterSets: FilterSet[];
	fromBlock: number;
	toBlock: number;
	/** advances during live-tail; outside the merkle identity. */
	lastScannedBlock: number;
	chunkSize: number;
	eventCount: number;
	/**
	 * Auditable data gaps: inclusive block ranges `[from,to]` that no RPC could
	 * serve. Empty = every block in the range was queried. Persisted so the user
	 * can see, re-scan, and prove completeness — critical when the output is the
	 * basis for accounting/tax. Undefined on scans saved before this was tracked.
	 */
	gaps?: [number, number][];
	createdAt: number;
	updatedAt: number;
	live: boolean;
}

/** A parsed event input parameter (with indexed flag for topic filtering). */
export interface ParsedEventParam {
	name: string;
	type: string;
	indexed: boolean;
	components?: readonly AbiParameter[];
}

/** An event extracted from an ABI, enriched for the scan form. */
export interface ParsedEvent {
	name: string;
	/** canonical signature, e.g. `Transfer(address,address,uint256)`. */
	signature: string;
	topic0: Hex;
	anonymous: boolean;
	inputs: ParsedEventParam[];
	abiItem: AbiEvent;
}

/** A single indexed-topic filter the user configured for one event param. */
export interface IndexedFilter {
	/** param index within the event inputs */
	paramIndex: number;
	/** the indexed position (1-based topic slot): topic1/2/3 */
	topicIndex: number;
	name: string;
	type: string;
	/** canonical string value(s); empty = wildcard. Multiple = OR. */
	values: string[];
}

export interface RunResult {
	scanId: string;
	eventCount: number;
	scannedBlocks: number;
	totalBlocks: number;
	duration: number;
}
