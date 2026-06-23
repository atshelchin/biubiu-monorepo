import { sha256 } from '@noble/hashes/sha2.js';
import { md5 } from '@noble/hashes/legacy.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { WordsLen } from '../types';

/**
 * Deterministically expand a secret passphrase into a BIP39 mnemonic.
 *
 * ⚠️ INTENTIONAL byte-for-byte compatibility with the legacy "brainwallet"
 * tool — DO NOT silently "harden" this. The exact pipeline must stay:
 *   24 words → SHA-256(utf8(passphrase.trim()))  → 32-byte entropy
 *   12 words → MD5(utf8(passphrase.trim()))       → 16-byte entropy
 * then BIP39 entropy→mnemonic with the English wordlist.
 *
 * This is cryptographically weak (single-round hash, no salt/KDF, MD5 for the
 * 12-word path) and brute-forceable for low-entropy passphrases. It is kept
 * identical on purpose so addresses match the legacy tool and existing funds
 * remain recoverable. Verified equal to bitcoinjs `bip39` (the legacy lib).
 *
 * A future opt-in Argon2id mode can be added as a *separate* path without
 * touching this one.
 */
export function passphraseToMnemonic(passphrase: string, wordsLen: WordsLen): string {
	const input = utf8ToBytes(passphrase.trim());
	const entropy = wordsLen === 24 ? sha256(input) : md5(input);
	return entropyToMnemonic(entropy, wordlist);
}
