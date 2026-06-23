import type { Address } from 'viem';

/**
 * Canonical Forever protocol address — identical on every chain (deployed via the canonical
 * CREATE2 proxy with a fixed salt and an argument-free contract).
 *
 * NOTE: this value is the deterministic address computed for the current contract bytecode
 * (OWNER/treasury = BiuBiu vault). It is final once that bytecode is locked; if the OWNER
 * constant changes, recompute via `forge script script/Forever.s.sol --sig "printAddress()"`.
 * The contract is not yet deployed on-chain — deploy before enabling live writes/reads.
 */
export const FOREVER_ADDRESS: Address = '0xbF3cfD0b37cC38B50D0DF5140A7558CdbdA7D3DB';

/** drand quicknet — the timelock-capable beacon used for capsule mode. */
export const DRAND_QUICKNET_HASH = '0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971' as const;
