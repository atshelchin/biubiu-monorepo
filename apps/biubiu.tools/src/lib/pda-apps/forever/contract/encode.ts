/** Encode/decode helpers for the Forever contract calls and events. */
import { type Hex, bytesToHex, encodeFunctionData, hexToBytes } from 'viem';
import { FOREVER_ABI } from './abi.js';

const ZERO_BYTES32: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

export interface SealArgs {
	mode: number;
	/** Unix seconds; 0 if not a capsule. */
	unlockAt: bigint;
	/** drand round; 0 if not a capsule. */
	drandRound: bigint;
	/** 32-byte beacon scheme id; zero if not a capsule. */
	beaconScheme?: Hex;
	/** Ciphertext bytes (the encrypted payload). */
	payload: Uint8Array;
}

/** ABI-encode a `seal(...)` call. */
export function encodeSeal(args: SealArgs): Hex {
	return encodeFunctionData({
		abi: FOREVER_ABI,
		functionName: 'seal',
		args: [
			args.mode,
			args.unlockAt,
			args.drandRound,
			args.beaconScheme ?? ZERO_BYTES32,
			bytesToHex(args.payload)
		]
	});
}

/** ABI-encode a `setKey(envelope)` call. */
export function encodeSetKey(envelope: Uint8Array): Hex {
	return encodeFunctionData({ abi: FOREVER_ABI, functionName: 'setKey', args: [bytesToHex(envelope)] });
}

/** Convert an on-chain `bytes` hex payload back to raw bytes for decryption. */
export function payloadToBytes(payloadHex: Hex): Uint8Array {
	return hexToBytes(payloadHex);
}
