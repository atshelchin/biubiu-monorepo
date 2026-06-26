import type { Address } from 'viem';

/**
 * Canonical Seal protocol address — identical on every chain (deployed via the canonical
 * CREATE2 proxy with a fixed salt and an argument-free contract).
 *
 * The contract is fully immutable: `fee` (0.001 native), `maxPayload`, and `treasury` are
 * compile-time constants with NO admin/owner and NO setters, and the per-write fee is forwarded
 * straight to treasury (the contract never custodies funds). The address is purely a function of
 * that frozen bytecode — recompute via `forge script script/Seal.s.sol --sig "printAddress()"`.
 */
export const FOREVER_ADDRESS: Address = '0xb8860E2CcD9428d0fc1F57C0AE705A6224Fd384a';
