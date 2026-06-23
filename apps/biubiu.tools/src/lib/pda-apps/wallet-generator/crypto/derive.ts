import { HDKey, privateKeyToAddress } from 'viem/accounts';
import { mnemonicToSeedSync } from '@scure/bip39';
import { bytesToHex } from '@noble/hashes/utils.js';
import { toHex } from 'viem';
import type { DerivedWallet } from '../types';

/** EVM account-level node `m/44'/60'/0'` — the unit MetaMask imports as a QR account. */
export function evmAccountNode(mnemonic: string): HDKey {
	const seed = mnemonicToSeedSync(mnemonic);
	const root = HDKey.fromMasterSeed(seed);
	return root.derive("m/44'/60'/0'");
}

/**
 * Extended fingerprint (XFP) used to pair with watch-only wallets.
 *
 * ⚠️ Matches the legacy `getXFPOfMetamask` exactly: it is the **account node's
 * own fingerprint** (m/44'/60'/0'), NOT the master key fingerprint. The xpub
 * export and the sign-request verification both use this same value, so the
 * MetaMask round-trip (import xpub → receive eth-sign-request) lines up.
 */
export function getXFP(mnemonic: string): `0x${string}` {
	return toHex(evmAccountNode(mnemonic).fingerprint, { size: 4 });
}

/**
 * EVM HD path for a given variant + index. Kept identical to the legacy worker:
 *   bip44      → m/44'/60'/0'/0/{i}   (standard)
 *   ledgerlive → m/44'/60'/{i}'/0/0
 *   legacy     → m/44'/60'/0'/{i}     (non-standard depth, legacy compat)
 */
export function evmPath(hdPathType: string, index: number): string {
	if (hdPathType === 'legacy') return `m/44'/60'/0'/${index}`;
	if (hdPathType === 'ledgerlive') return `m/44'/60'/${index}'/0/0`;
	return `m/44'/60'/0'/0/${index}`; // bip44 (default)
}

/**
 * Build a reusable EVM deriver from a mnemonic.
 *
 * The BIP39 seed (PBKDF2, 2048 rounds) is computed ONCE here and the BIP32
 * master node reused for every index — deriving N wallets stays cheap instead
 * of re-stretching the seed per address (matches the legacy worker's caching).
 */
export function createEvmDeriver(mnemonic: string) {
	const seed = mnemonicToSeedSync(mnemonic);
	const root = HDKey.fromMasterSeed(seed);

	function derive(hdPathType: string, index: number): DerivedWallet {
		const path = evmPath(hdPathType, index);
		const child = root.derive(path);
		if (!child.privateKey) throw new Error(`No private key at ${path}`);
		const privateKey = `0x${bytesToHex(child.privateKey)}` as `0x${string}`;
		// Checksummed (EIP-55) address — same 20 bytes the legacy tool emitted lowercase.
		return { index, path, address: privateKeyToAddress(privateKey), privateKey };
	}

	return { derive };
}

/** Convenience: derive a single EVM wallet (e.g. "view one"). */
export function deriveEvmWallet(
	mnemonic: string,
	hdPathType: string,
	index: number,
): DerivedWallet {
	return createEvmDeriver(mnemonic).derive(hdPathType, index);
}
