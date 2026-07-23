/**
 * Path selection — the single decision point for "how do we drain this chain".
 *
 *  - eip7702: the fast relay-delegate path (`runSweep`) — one type-4 tx upgrades &
 *    sweeps a whole chunk; source EOAs need zero native. Curated Pectra chains.
 *  - refuel:  the universal, contract-free fallback (`runRefuelSweep`) — refuel
 *    each EOA then self-send with its own key. Works on ANY EVM chain.
 *
 * Custom chains default to `supports7702:false` (networks.ts), so the safe path
 * is chosen for chains of unknown capability. The store, the funding estimator
 * and the UI all read this so they can never disagree about which path runs.
 */
import type { SweepNetwork } from '../types.js';

export type SweepMethod = 'eip7702' | 'refuel';

export function sweepMethod(network: SweepNetwork): SweepMethod {
	return network.supports7702 ? 'eip7702' : 'refuel';
}

export function isRefuelMethod(network: SweepNetwork): boolean {
	return sweepMethod(network) === 'refuel';
}
