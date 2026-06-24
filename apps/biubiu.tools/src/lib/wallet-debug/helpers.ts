/**
 * Pure helpers for the Wallet Lab debug tool.
 */
import { type Address, type Hex, encodeFunctionData, isAddress, parseEther, parseUnits } from 'viem';
import { CHAINS } from '$lib/wallet/infra/chains.js';
import { loadChainInfo } from '$lib/contract-caller/networks.js';
import { getInjectedProvider } from '$lib/chains/wallet.js';
import type { ConnectedWallet } from '$lib/wallet';

/** A curated, biubiu-writable network for the quick-pick chips. */
export interface CuratedChain {
	chainId: number;
	name: string;
	nativeSymbol: string;
	iconLabel: string;
	iconColor: string;
	iconBg: string;
	explorerURL: string;
	isL2: boolean;
}

/** The 12 built-in (passkey-Safe writable) networks, in declaration order. */
export const CURATED_CHAINS: CuratedChain[] = CHAINS.map((c) => ({
	chainId: c.chainId,
	name: c.name,
	nativeSymbol: c.nativeSymbol,
	iconLabel: c.iconLabel,
	iconColor: c.iconColor,
	iconBg: c.iconBg,
	explorerURL: c.explorerURL,
	isL2: c.isL2
}));

/** JSON.stringify that survives bigint (→ decimal string) and renders nicely. */
export function safeJson(value: unknown): string {
	return JSON.stringify(
		value,
		(_k, v) => (typeof v === 'bigint' ? v.toString() : v),
		2
	);
}

/** 0x1234…abcd */
export function truncateMiddle(s: string, head = 6, tail = 4): string {
	if (s.length <= head + tail + 1) return s;
	return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const ERC20_TRANSFER_ABI = [
	{
		type: 'function',
		name: 'transfer',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' }
		],
		outputs: [{ type: 'bool' }]
	}
] as const;

/** Encode `transfer(address,uint256)` calldata. Throws on bad address/amount. */
export function encodeErc20Transfer(to: Address, amount: bigint): Hex {
	return encodeFunctionData({
		abi: ERC20_TRANSFER_ABI,
		functionName: 'transfer',
		args: [to, amount]
	});
}

/** Parse a human decimal native amount to wei. Empty → 0n. Throws on garbage. */
export function nativeToWei(human: string): bigint {
	const v = human.trim();
	if (!v) return 0n;
	return parseEther(v);
}

/** Parse a human token amount to base units. */
export function tokenToUnits(human: string, decimals: number): bigint {
	const v = human.trim();
	if (!v) return 0n;
	return parseUnits(v, decimals);
}

/** Trailing-edge debounce — returns a wrapper that delays the last call by `ms`. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (...args: A) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

// ── Add / switch chain (EIP-3326 → EIP-3085) ──

export interface Eip1193Like {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type AddChainOutcome =
	| { status: 'switched' }
	| { status: 'added'; name: string }
	| { status: 'rejected' }
	| { status: 'no-wallet' }
	| { status: 'failed'; error: string };

/** The connected external wallet's provider, else the browser-injected wallet. */
export function resolveAddProvider(wallet: ConnectedWallet | null): Eip1193Like | null {
	if (wallet && 'provider' in wallet) {
		return (wallet as unknown as { provider: Eip1193Like }).provider;
	}
	return getInjectedProvider() as Eip1193Like | null;
}

function isUserRejection(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: number }).code === 4001;
}

/** Try to switch to `chainId`; if the wallet doesn't know it, fetch its info and add it. */
export async function addOrSwitchChain(provider: Eip1193Like, chainId: number): Promise<AddChainOutcome> {
	const hexId = '0x' + chainId.toString(16);
	try {
		await provider.request({ method: 'eth_requestAccounts' });
	} catch {
		/* continue — switch/add surfaces the real error */
	}
	try {
		await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
		return { status: 'switched' };
	} catch (err) {
		if (isUserRejection(err)) return { status: 'rejected' };
	}
	try {
		const info = await loadChainInfo(chainId);
		await provider.request({
			method: 'wallet_addEthereumChain',
			params: [
				{
					chainId: hexId,
					chainName: info.name,
					nativeCurrency: info.nativeCurrency,
					rpcUrls: [info.rpcUrls[0]],
					...(info.explorerUrl ? { blockExplorerUrls: [info.explorerUrl] } : {})
				}
			]
		});
		return { status: 'added', name: info.name };
	} catch (err) {
		if (isUserRejection(err)) return { status: 'rejected' };
		return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
	}
}

export { isAddress };
