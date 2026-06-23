/**
 * Deterministic CREATE2 addresses for the v2 contracts.
 *
 * - Sweeper7702 is per-relay: its constructor takes the controller (the relay),
 *   so the address is unique per relay. sweep() is guarded by tx.origin.
 * - BatchSweeper is global (no constructor) — one deterministic address shared
 *   by every relay on a chain.
 *
 * Both MUST agree with apps/biubiu-contracts/script/Sweeper7702.s.sol.
 */
import type { Address, Hex } from 'viem';
import { buildInitCode, predictCreate2Address } from '$lib/deploy/create2';
import { SWEEPER_BYTECODE, SWEEPER_CTOR_INPUTS } from './sweeper-artifact.js';
import { BATCHSWEEPER_BYTECODE } from './batchsweeper-artifact.js';

/** Fixed CREATE2 salt — bytes32(0). */
export const SWEEPER_SALT: Hex = `0x${'00'.repeat(32)}`;

/** Init code = Sweeper creation bytecode + abi.encode(controller). */
export function buildSweeperInitCode(controller: Address): Hex {
	const initCode = buildInitCode(SWEEPER_BYTECODE, SWEEPER_CTOR_INPUTS, [controller]);
	if (!initCode) throw new Error('Failed to build Sweeper init code');
	return initCode;
}

/** Predict the per-relay Sweeper address (controller = relay). */
export function predictSweeperAddress(controller: Address): Address {
	const addr = predictCreate2Address(SWEEPER_SALT, buildSweeperInitCode(controller));
	if (!addr) throw new Error('Failed to predict Sweeper address');
	return addr as Address;
}

/** BatchSweeper has no constructor — global deterministic address. */
export function buildBatchSweeperInitCode(): Hex {
	return BATCHSWEEPER_BYTECODE;
}

export function predictBatchSweeperAddress(): Address {
	const addr = predictCreate2Address(SWEEPER_SALT, BATCHSWEEPER_BYTECODE);
	if (!addr) throw new Error('Failed to predict BatchSweeper address');
	return addr as Address;
}
