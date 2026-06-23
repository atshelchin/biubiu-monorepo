/**
 * Deterministic per-Safe Sweeper7702 address.
 *
 * The Sweeper's constructor takes the controller (the user's passkey Safe), so
 * the init code — and therefore the CREATE2 address — is unique per Safe. The
 * salt is fixed at bytes32(0); uniqueness comes from the embedded ctor arg.
 *
 * This MUST agree with apps/biubiu-contracts/script/Sweeper7702.s.sol. Verified
 * cross-check: controller 0x1111…1111 → 0xfCdD9Cd31Ed5E6B3D7b96D987066F1658d4B1078.
 */
import type { Address, Hex } from 'viem';
import { buildInitCode, predictCreate2Address } from '$lib/deploy/create2';
import { SWEEPER_BYTECODE, SWEEPER_CTOR_INPUTS } from './sweeper-artifact.js';

/** Fixed CREATE2 salt — bytes32(0). */
export const SWEEPER_SALT: Hex = `0x${'00'.repeat(32)}`;

/** Init code = creation bytecode + abi.encode(controller). */
export function buildSweeperInitCode(controller: Address): Hex {
	const initCode = buildInitCode(SWEEPER_BYTECODE, SWEEPER_CTOR_INPUTS, [controller]);
	if (!initCode) throw new Error('Failed to build Sweeper init code');
	return initCode;
}

/** Predict the deterministic Sweeper address for a given controller (Safe). */
export function predictSweeperAddress(controller: Address): Address {
	const addr = predictCreate2Address(SWEEPER_SALT, buildSweeperInitCode(controller));
	if (!addr) throw new Error('Failed to predict Sweeper address');
	return addr as Address;
}
