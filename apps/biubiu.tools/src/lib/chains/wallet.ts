/**
 * One-click "Add to wallet" via the injected provider (EIP-1193 / EIP-3085).
 *
 * Deliberately self-contained: it talks to `window.ethereum` directly and does
 * NOT couple to the app's wallet store, so it works for any visitor who has
 * MetaMask (or another injected wallet) regardless of whether they've signed in.
 */

import type { ChainData } from './types';

interface Eip1193Provider {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
	isMetaMask?: boolean;
	providers?: Eip1193Provider[];
}

/** Resolve the best injected provider, preferring MetaMask when several exist. */
export function getInjectedProvider(): Eip1193Provider | null {
	if (typeof window === 'undefined') return null;
	const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
	if (!eth) return null;
	if (Array.isArray(eth.providers) && eth.providers.length > 0) {
		return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
	}
	return eth;
}

/** Whether an injected wallet is available right now. */
export function hasInjectedWallet(): boolean {
	return getInjectedProvider() !== null;
}

export function toHexChainId(chainId: number): string {
	return '0x' + chainId.toString(16);
}

export type AddChainResult = 'added' | 'no-wallet' | 'rejected' | 'failed';

function errCode(err: unknown): number | undefined {
	return typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
}

// EIP-1193: 4001 = user rejected the request.
function isUserRejection(err: unknown): boolean {
	return errCode(err) === 4001;
}

/** Best human-readable message a provider attached to an error, if any. */
function errMessage(err: unknown): string | undefined {
	if (typeof err !== 'object' || err === null) return undefined;
	const e = err as { message?: string; reason?: string; data?: { message?: string } };
	const msg = e.data?.message || e.message || e.reason;
	return typeof msg === 'string' && msg.trim() ? msg.trim() : undefined;
}

export interface AddChainOutcome {
	status: AddChainResult;
	/** Wallet-provided failure reason, surfaced to the user on `failed`. */
	message?: string;
}

/**
 * Add (or switch to) the given chain in the user's injected wallet.
 *
 * Follows the canonical EIP-3326 → EIP-3085 flow: try to *switch* first (this
 * is what works for chains the wallet already knows, including MetaMask's
 * built-in defaults like Ethereum Mainnet, which `wallet_addEthereumChain`
 * refuses to add). Only if the chain is unrecognised do we add it.
 *
 * `rpcUrl` MUST be an http(s) endpoint — MetaMask rejects ws:// for adding.
 */
export async function addChainToWallet(chain: ChainData, rpcUrl: string): Promise<AddChainOutcome> {
	const provider = getInjectedProvider();
	if (!provider) return { status: 'no-wallet' };

	const hexId = toHexChainId(chain.chainId);

	// 0) Ensure the site is connected. Many wallets reject chain operations with
	//    "Wallet not connected" until eth_requestAccounts has been authorised.
	try {
		await provider.request({ method: 'eth_requestAccounts' });
	} catch (connectErr) {
		if (isUserRejection(connectErr)) return { status: 'rejected' };
		// Non-rejection: continue; the switch/add below will surface any real error.
	}

	// 1) Try switching — succeeds when the wallet already has this chain.
	try {
		await provider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: hexId }]
		});
		return { status: 'added' };
	} catch (switchErr) {
		if (isUserRejection(switchErr)) return { status: 'rejected' };
		// Otherwise fall through and try to add it (commonly code 4902 = unknown chain).
	}

	// 2) Add the chain. Only http(s) RPC + https block-explorer URLs are valid.
	const httpRpc = /^https?:\/\//i.test(rpcUrl) ? rpcUrl : '';
	const explorerUrls = (chain.explorers ?? [])
		.map((e) => e.url)
		.filter((u) => /^https:\/\//i.test(u));

	if (!httpRpc) {
		return { status: 'failed', message: 'No usable HTTP(S) RPC endpoint for this chain.' };
	}

	try {
		await provider.request({
			method: 'wallet_addEthereumChain',
			params: [
				{
					chainId: hexId,
					chainName: chain.name,
					nativeCurrency: {
						name: chain.nativeCurrency.name,
						symbol: chain.nativeCurrency.symbol,
						decimals: chain.nativeCurrency.decimals
					},
					rpcUrls: [httpRpc],
					...(explorerUrls.length ? { blockExplorerUrls: explorerUrls } : {})
				}
			]
		});
		return { status: 'added' };
	} catch (addErr) {
		if (isUserRejection(addErr)) return { status: 'rejected' };
		return { status: 'failed', message: errMessage(addErr) };
	}
}
