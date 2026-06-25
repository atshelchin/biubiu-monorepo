import { describe, it, expect } from 'vitest';
import type { WalletKind } from '$lib/wallet';
import { usesMultiSend, canAddChainToWallet } from './gating.js';

/** Minimal ConnectedWallet stub — only `kind` matters to the gating logic. */
const w = (kind: WalletKind) => ({ kind }) as never;

describe('usesMultiSend (MultiSend preview gate)', () => {
	it('is true only for biubiu (the passkey Safe that delegatecalls MultiSend)', () => {
		expect(usesMultiSend(w('biubiu'))).toBe(true);
	});

	it('is false for external EIP-1193 wallets (they use eth_sendTransaction / EIP-5792)', () => {
		expect(usesMultiSend(w('inject'))).toBe(false);
		expect(usesMultiSend(w('walletpair'))).toBe(false);
	});

	it('is false when no wallet is connected', () => {
		expect(usesMultiSend(null)).toBe(false);
	});
});

describe('canAddChainToWallet (Add-to-wallet gate)', () => {
	it('is false for biubiu — chainless passkey Safe, no EIP-1193 provider', () => {
		expect(canAddChainToWallet(w('biubiu'))).toBe(false);
	});

	it('is true for external EIP-1193 wallets that carry a provider', () => {
		expect(canAddChainToWallet(w('inject'))).toBe(true);
		expect(canAddChainToWallet(w('walletpair'))).toBe(true);
	});

	it('is false when no wallet is connected', () => {
		expect(canAddChainToWallet(null)).toBe(false);
	});
});

describe('gates are mutually consistent with the wallet model', () => {
	it('biubiu uses MultiSend but cannot add chains; external wallets are the inverse', () => {
		// biubiu: shows MultiSend preview, hides "Add to wallet"
		expect(usesMultiSend(w('biubiu'))).toBe(true);
		expect(canAddChainToWallet(w('biubiu'))).toBe(false);
		// inject / walletpair: hides MultiSend preview, shows "Add to wallet"
		for (const k of ['inject', 'walletpair'] as const) {
			expect(usesMultiSend(w(k))).toBe(false);
			expect(canAddChainToWallet(w(k))).toBe(true);
		}
	});
});
