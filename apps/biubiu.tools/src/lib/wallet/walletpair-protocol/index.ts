/**
 * WalletPair v1 dApp-side protocol (self-contained, no SDK).
 *
 * Ported 1:1 from walletpair-next `walletpair-extension/src/lib/walletpair/` — the ecosystem
 * dropped the `walletpair-sdk` npm package and implements the protocol directly per
 * `protocols/{relay,encryption,ethereum}.md`: X25519 + HKDF-SHA256 + ChaCha20-Poly1305 over a
 * restricted MessagePack payload, `walletpair:?ch&pubkey&relay&name&url&icon` pairing URI, and a
 * `<sealed>@eip155:1` CAIP-2 frame suffix. This replaces biubiu's old JSON-based `walletpair-sdk`,
 * which is wire-incompatible with wallets that have moved to MessagePack.
 *
 * biubiu is only ever the DApp peer (shows a QR for a mobile wallet to scan); the wallet-side of
 * the protocol is not included. The biubiu EIP-1193 wrapper lives in backends/walletpair-provider.ts.
 */
export * from './crypto';
export * from './encoding';
export * from './ethereum';
export * from './msgpack';
export * from './relay';
export * from './session';
