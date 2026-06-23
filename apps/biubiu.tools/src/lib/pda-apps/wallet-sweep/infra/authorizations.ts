/**
 * EIP-7702 authorization signing + delegation classification.
 *
 * Sponsored case (the relayer, not the EOA, sends the type-4 tx): the
 * authorization nonce MUST be the EOA's current pending nonce with NO +1.
 * viem only adds +1 for executor:'self'; the account-level signAuthorization
 * signs exactly the (chainId, address, nonce) we pass.
 */
import { type Address, type Hex, type SignedAuthorization, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getCode, getPendingNonce as rpcPendingNonce } from './rpc.js';
import type { EoaKey, Delegation } from '../types.js';

/** Zero delegation target = "revoke" (clears the EOA's code). */
export const REVOKE_TARGET: Address = zeroAddress;

/** Dedupe EOA keys by derived address (keeps the first occurrence). */
export function dedupeKeys(keys: EoaKey[]): EoaKey[] {
	const seen = new Set<string>();
	const out: EoaKey[] = [];
	for (const k of keys) {
		const a = k.address.toLowerCase();
		if (seen.has(a)) continue;
		seen.add(a);
		out.push(k);
	}
	return out;
}

/** Classify an EOA's code into a delegation state. */
export function classifyCode(code: string, ourSweeper: Address): Delegation {
	if (!code || code === '0x' || code === '0x0') return 'none';
	const c = code.toLowerCase();
	// EIP-7702 delegation designator: 0xef0100 || 20-byte address (23 bytes total).
	if (c.startsWith('0xef0100') && c.length === 2 + 2 * 23) {
		const target = '0x' + c.slice(8);
		return target === ourSweeper.toLowerCase() ? 'ours' : 'foreign';
	}
	return 'contract';
}

export async function getDelegation(
	rpcs: string[],
	address: Address,
	ourSweeper: Address,
): Promise<Delegation> {
	const code = await getCode(rpcs, address);
	return classifyCode(code, ourSweeper);
}

/** EOA's pending transaction count (the 7702 authorization nonce, sponsored). */
export async function getPendingNonce(rpcs: string[], address: Address): Promise<number> {
	return rpcPendingNonce(rpcs, address);
}

/**
 * Sign one EIP-7702 authorization for `eoa` delegating to `target`
 * (the Sweeper to upgrade, or zeroAddress to revoke).
 */
export async function signEoaAuthorization(
	rpcs: string[],
	eoa: EoaKey,
	target: Address,
	chainId: number,
): Promise<SignedAuthorization> {
	const account = privateKeyToAccount(eoa.privateKey);
	const nonce = await getPendingNonce(rpcs, eoa.address);
	// account-level signing: signs (chainId, address, nonce) verbatim — no +1.
	return account.signAuthorization({ address: target, chainId, nonce });
}

/** Parse a pasted private key into an EoaKey, or null if invalid. */
export function parsePrivateKey(raw: string): EoaKey | null {
	let s = raw.trim();
	if (!s) return null;
	if (!s.startsWith('0x')) s = '0x' + s;
	if (!/^0x[0-9a-fA-F]{64}$/.test(s)) return null;
	try {
		const { address } = privateKeyToAccount(s as Hex);
		return { privateKey: s as Hex, address };
	} catch {
		return null;
	}
}
