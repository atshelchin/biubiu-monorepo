import { toBytes } from 'viem';
import { evmAccountNode, getXFP } from './derive';
import { loadKeystoneEth } from './ur';

export interface XpubExport {
	/** Single-fragment `ur:crypto-hdkey/…` string — scan into MetaMask "QR hardware wallet". */
	ur: string;
	/** base58 extended public key of m/44'/60'/0'. */
	xpub: string;
	/** 0x-prefixed account fingerprint (XFP) used to match sign requests. */
	xfp: string;
	/** Origin path of the exported account node. */
	path: string;
}

/**
 * Build the `crypto-hdkey` UR for the EVM account node (m/44'/60'/0').
 *
 * Replicates the legacy export byte-for-byte so the MetaMask round-trip matches:
 *  - origin path = [44', 60', 0'] with sourceFingerprint = the account node's
 *    OWN fingerprint (same value `getXFP` returns), NOT the master XFP;
 *  - key = compressed pubkey, plus chainCode and parentFingerprint.
 */
export async function buildXpubExport(
	mnemonic: string,
	name = 'BiuBiu Wallet',
): Promise<XpubExport> {
	const node = evmAccountNode(mnemonic);
	if (!node.publicKey || !node.chainCode) throw new Error('Failed to derive account node');

	const { CryptoHDKey, CryptoKeypath, PathComponent } = await loadKeystoneEth();

	const cryptoHDKey = new CryptoHDKey({
		isMaster: false,
		key: Buffer.from(node.publicKey),
		chainCode: Buffer.from(node.chainCode),
		origin: new CryptoKeypath(
			[
				new PathComponent({ index: 44, hardened: true }),
				new PathComponent({ index: 60, hardened: true }),
				new PathComponent({ index: 0, hardened: true }),
			],
			Buffer.from(toBytes(node.fingerprint, { size: 4 })),
		),
		parentFingerprint: Buffer.from(toBytes(node.parentFingerprint, { size: 4 })),
		name,
	});

	// xpub fits in one QR — single fragment.
	const ur = cryptoHDKey.toUREncoder(1000).nextPart();

	return { ur, xpub: node.publicExtendedKey, xfp: getXFP(mnemonic), path: "m/44'/60'/0'" };
}
