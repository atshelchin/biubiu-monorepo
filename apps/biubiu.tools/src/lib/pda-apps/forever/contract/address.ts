import type { Address } from 'viem';

/**
 * Canonical Forever protocol address — identical on every chain (deployed via the canonical
 * CREATE2 proxy with a fixed salt and an argument-free contract).
 *
 * NOTE: deterministic address for the current bytecode (OWNER/treasury = BiuBiu vault,
 * fee = 0.001 native). It changes if any field-initialized default or OWNER changes —
 * recompute via `forge script script/Forever.s.sol --sig "printAddress()"`.
 */
export const FOREVER_ADDRESS: Address = '0x9f89a5934fc7237719E4833407d0DE25E5243fF4';

/** drand quicknet — the timelock-capable beacon used for capsule mode. */
export const DRAND_QUICKNET_HASH = '0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971' as const;
