/** Encode/decode helpers for the Forever contract calls and events. */
import { type Hex, bytesToHex, encodeFunctionData, hexToBytes } from 'viem';
import { FOREVER_ABI } from './abi.js';

/** ABI-encode a `seal(payload)` call. */
export function encodeSeal(payload: Uint8Array): Hex {
	return encodeFunctionData({ abi: FOREVER_ABI, functionName: 'seal', args: [bytesToHex(payload)] });
}

/** Convert an on-chain `bytes` hex payload back to raw bytes for decryption. */
export function payloadToBytes(payloadHex: Hex): Uint8Array {
	return hexToBytes(payloadHex);
}
