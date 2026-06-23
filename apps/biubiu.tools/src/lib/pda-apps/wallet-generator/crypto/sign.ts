import {
	fromBytes,
	toBytes,
	toHex,
	parseTransaction,
	parseEther,
	signatureToHex,
	type TransactionSerializable,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { getXFP } from './derive';
import { loadBcUr, loadKeystoneEth } from './ur';

/** Keystone eth-sign-request data types. */
export type SignDataType = 1 | 2 | 3 | 4; // 1=legacy tx, 2=typed-data, 3=personal msg, 4=typed tx

export interface ParsedSignRequest {
	dataType: SignDataType;
	/** Source fingerprint carried by the request (0x, 4 bytes). */
	fingerprint: string;
	/** True when the request's fingerprint matches this mnemonic's XFP. */
	fingerprintMatches: boolean;
	/** Full derivation path, e.g. m/44'/60'/0'/0/0. */
	path: string;
	chainId?: number;
	/** Decoded transaction (dataType 1/4). */
	transaction?: TransactionSerializable;
	/** Decoded UTF-8 personal message (dataType 3). */
	message?: string;
	/** Raw EIP-712 typed-data JSON string (dataType 2). */
	typedData?: string;
	/** The underlying EthSignRequest instance, retained for signing. */
	raw: unknown;
}

/** Fresh URDecoder for feeding animated-QR frames (`receivePart` / `isComplete` / `resultUR`). */
export async function createUrDecoder() {
	const { URDecoder } = await loadBcUr();
	return new URDecoder();
}

/**
 * Parse a scanned `eth-sign-request` UR and decode a human-previewable view.
 * Mirrors the legacy URDisplay parsing (dataType → hex tx / utf-8 string).
 */
export async function parseSignRequest(
	ur: { type: string; cbor: Buffer },
	mnemonic: string,
): Promise<ParsedSignRequest> {
	if (ur.type !== 'eth-sign-request') {
		throw new Error(`Unsupported UR type: ${ur.type}`);
	}
	const { EthSignRequest } = await loadKeystoneEth();
	const req = EthSignRequest.fromCBOR(Buffer.from(ur.cbor.toString('hex'), 'hex'));

	const dataType = req.getDataType() as SignDataType;
	const fingerprint = toHex(req.getSourceFingerprint(), { size: 4 });
	const xfp = getXFP(mnemonic);
	const path = 'm/' + req.getDerivationPath();

	const parsed: ParsedSignRequest = {
		dataType,
		fingerprint,
		fingerprintMatches: fingerprint.toLowerCase() === xfp.toLowerCase(),
		path,
		raw: req,
	};

	if (dataType === 1 || dataType === 4) {
		const tx = parseTransaction(fromBytes(req.getSignData(), 'hex')) as TransactionSerializable;
		parsed.transaction = tx;
		parsed.chainId = typeof tx.chainId === 'number' ? tx.chainId : undefined;
	} else if (dataType === 2) {
		parsed.typedData = fromBytes(req.getSignData(), 'string');
	} else if (dataType === 3) {
		parsed.message = fromBytes(req.getSignData(), 'string');
	}

	return parsed;
}

/**
 * Sign a parsed request offline and return `eth-signature` UR fragments to play
 * as an animated QR. `maxFragment` bounds each frame so dense data still scans.
 */
export async function signRequest(
	mnemonic: string,
	parsed: ParsedSignRequest,
	maxFragment = 400,
): Promise<string[]> {
	const { ETHSignature } = await loadKeystoneEth();
	const req = parsed.raw as {
		getRequestId(): unknown;
		getOrigin(): unknown;
	};
	const account = mnemonicToAccount(mnemonic, { path: parsed.path as `m/44'/60'/${string}` });

	let signature: `0x${string}`;
	if (parsed.dataType === 1 || parsed.dataType === 4) {
		if (!parsed.transaction) throw new Error('Missing transaction');
		const signedTxHex = await account.signTransaction({
			value: parseEther('0'),
			...parsed.transaction,
		});
		const signedTx = parseTransaction(signedTxHex);
		signature = signatureToHex({
			r: signedTx.r!,
			s: signedTx.s!,
			v: signedTx.v!,
		});
	} else if (parsed.dataType === 2) {
		if (!parsed.typedData) throw new Error('Missing typed data');
		signature = await account.signTypedData(JSON.parse(parsed.typedData));
	} else {
		if (parsed.message === undefined) throw new Error('Missing message');
		signature = await account.signMessage({ message: parsed.message });
	}

	const ethSig = new ETHSignature(
		Buffer.from(toBytes(signature)),
		req.getRequestId() as Buffer,
		req.getOrigin() as string,
	);
	const encoder = ethSig.toUREncoder(maxFragment);
	const parts: string[] = [];
	for (let i = 0; i < encoder.fragmentsLength; i++) parts.push(encoder.nextPart());
	return parts;
}
