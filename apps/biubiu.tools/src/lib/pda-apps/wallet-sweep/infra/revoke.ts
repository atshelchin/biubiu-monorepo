/**
 * Revoke EIP-7702 delegations — symmetric to upgrade, but the authorization
 * target is the zero address, which clears the EOA's code back to a plain EOA.
 * Broadcast by the relayer as type-4 transactions.
 */
import { type Address } from 'viem';
import { runDelegationChange, REVOKE_TARGET, type DelegationEvent, type DelegationResult } from './upgrade.js';
import type { SweepNetwork, EoaKey } from '../types.js';
import type { Relayer } from './relayer.js';

export function runRevoke(opts: {
	network: SweepNetwork;
	rpcUrl: string;
	relayer: Relayer;
	keys: EoaKey[];
	sweeper: Address;
	onEvent?: (e: DelegationEvent) => void;
}): Promise<DelegationResult> {
	return runDelegationChange({ ...opts, target: REVOKE_TARGET, expect: 'none' });
}
