/** Supported mnemonic lengths. 24 ← SHA-256 entropy, 12 ← MD5 entropy. */
export type WordsLen = 12 | 24;

/** Chain family. v1 ships `evm`; others (btc/tron/solana/aptos) land in later phases. */
export type ChainId = 'evm';

/** A single derived account. `privateKey` is 0x-hex; never logged or transmitted. */
export interface DerivedWallet {
	index: number;
	path: string;
	address: string;
	privateKey: string;
}

/** UI option (HD path variant or address type) for a chain. */
export interface ChainOption {
	value: string;
	label: string;
}

/** Static description of a chain family used to drive the UI and validation. */
export interface ChainConfig {
	id: ChainId;
	name: string;
	/** BIP44 coin type (60 = EVM). */
	coinType: number;
	/** Address-format variants. EVM has only `default`; BTC adds p2pkh/p2sh/bech32 later. */
	addressTypes: ChainOption[];
	/** HD path variants. */
	hdPaths: ChainOption[];
}

/** Parsed + bounds-checked executor input. */
export interface ValidatedInput {
	passphrase: string;
	wordsLen: WordsLen;
	chain: ChainId;
	addressType: string;
	hdPathType: string;
	start: number;
	count: number;
}
