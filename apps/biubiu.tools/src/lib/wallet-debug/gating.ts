/**
 * Pure, per-wallet capability gating for the Wallet Lab debug UI.
 *
 * The TxBuilder / Network panels are wallet-agnostic, but two actions are only
 * meaningful for *some* backends. Centralising the decision here (instead of
 * inline `kind === …` checks scattered across .svelte files) keeps it testable
 * and in one place.
 *
 * Backend behaviour (see wallet/types.ts):
 *   - biubiu  → passkey Safe. N calls = MultiSend delegatecall. Chainless: it has
 *               no EIP-1193 `provider`, reads via the RPC pool, so "add chain to
 *               wallet" does not apply.
 *   - inject / walletpair → external EIP-1193 wallet. 1 call = eth_sendTransaction,
 *               N calls = EIP-5792 wallet_sendCalls. Never MultiSend. Has a
 *               `provider`, so chains can be added/switched on it.
 */
import type { ConnectedWallet } from '$lib/wallet';

/**
 * Does this wallet actually batch via MultiSend (a Safe delegatecall)?
 * Only biubiu's passkey Safe does — so only it should show the MultiSend
 * calldata preview. External wallets broadcast via eth_sendTransaction /
 * EIP-5792 wallet_sendCalls and never delegatecall a MultiSend.
 */
export function usesMultiSend(wallet: ConnectedWallet | null): boolean {
	return wallet?.kind === 'biubiu';
}

/**
 * Can chains be added/switched on this wallet via EIP-3085/3326?
 * Only external EIP-1193 wallets (inject / walletpair) carry a `provider`.
 * biubiu is chainless (no provider) and must NOT fall back to driving an
 * unrelated browser-injected extension, so "Add to wallet" does not apply.
 */
export function canAddChainToWallet(wallet: ConnectedWallet | null): boolean {
	if (!wallet) return false;
	return wallet.kind !== 'biubiu';
}
