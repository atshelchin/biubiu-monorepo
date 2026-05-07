import type { Address, Hex } from 'viem';

/** Compiled contract artifact from Foundry */
export interface ContractArtifact {
	name: string;
	file: string;
	bytecode: Hex;
	abi: readonly AbiItem[];
}

export interface AbiItem {
	type: string;
	name?: string;
	inputs?: readonly AbiInput[];
	outputs?: readonly AbiOutput[];
	stateMutability?: string;
}

export interface AbiInput {
	name: string;
	type: string;
	components?: readonly AbiInput[];
}

export interface AbiOutput {
	name: string;
	type: string;
}

/** Foundry server info */
export interface ServerInfo {
	cwd: string;
	isFoundry: boolean;
}

/** Build result from forge build */
export interface BuildResult {
	ok: boolean;
	output: string;
}

/** Verify request params */
export interface VerifyParams {
	contractName: string;
	contractFile: string;
	address: string;
	chainId: number;
	verifier: 'etherscan' | 'blockscout';
	etherscanKey?: string;
	constructorArgs?: string;
	blockscoutUrl?: string;
}

/** Verify result */
export interface VerifyResult {
	ok: boolean;
	output: string;
}

/** Chain info from ethereum-data API */
export interface ChainInfo {
	chainId: number;
	name: string;
	shortName: string;
	nativeCurrencySymbol: string;
	rpc?: string[];
	explorers?: { url: string }[];
}

/** Log entry */
export interface LogEntry {
	id: number;
	timestamp: number;
	message: string;
	type: 'info' | 'ok' | 'error' | 'warn';
}

/** Deployment record stored in IndexedDB */
export interface DeploymentRecord {
	id: string;
	timestamp: number;
	contractName: string;
	contractFile: string;
	chainId: number;
	chainName: string;
	address: Address;
	salt: Hex;
	constructorArgs: string[];
	txHash: Hex;
	deployer: Address;
	verified: boolean;
	verifiedAt?: number;
}

/** Constructor argument value */
export interface ConstructorArg {
	name: string;
	type: string;
	value: string;
}

/** Supported network for deployment (Safe AA) */
export interface DeployNetwork {
	key: string;
	name: string;
	chainId: number;
	explorerUrl: string;
	nativeSymbol: string;
}
