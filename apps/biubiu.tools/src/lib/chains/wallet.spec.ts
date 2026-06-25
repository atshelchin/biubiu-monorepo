import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	getInjectedProvider,
	hasInjectedWallet,
	toHexChainId,
	addChainToWallet
} from './wallet.js';
import type { ChainData } from './types.js';

type RequestArg = { method: string; params?: unknown[] | object };

/** Install a fake window.ethereum on globalThis and return cleanup. */
function setEthereum(eth: unknown): void {
	(globalThis as unknown as { window?: unknown }).window = { ethereum: eth };
}
function clearWindow(): void {
	delete (globalThis as unknown as { window?: unknown }).window;
}

afterEach(() => {
	clearWindow();
	vi.restoreAllMocks();
});

const BASE_CHAIN: ChainData = {
	name: 'Polygon Mainnet',
	chain: 'Polygon',
	shortName: 'matic',
	chainId: 137,
	networkId: 137,
	rpc: ['https://polygon-rpc.com'],
	faucets: [],
	nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
	infoURL: 'https://polygon.technology/',
	explorers: [{ name: 'polygonscan', url: 'https://polygonscan.com' }]
};

describe('toHexChainId', () => {
	it('encodes mainnet (1) as 0x1', () => {
		expect(toHexChainId(1)).toBe('0x1');
	});

	it('encodes Polygon (137) as 0x89', () => {
		expect(toHexChainId(137)).toBe('0x89');
	});

	it('encodes a large chain id (42161 / Arbitrum) as 0xa4b1', () => {
		expect(toHexChainId(42161)).toBe('0xa4b1');
	});

	it('encodes 0 as 0x0', () => {
		expect(toHexChainId(0)).toBe('0x0');
	});
});

describe('getInjectedProvider / hasInjectedWallet', () => {
	it('returns null when window is undefined (SSR / node)', () => {
		clearWindow();
		expect(getInjectedProvider()).toBeNull();
		expect(hasInjectedWallet()).toBe(false);
	});

	it('returns null when window has no ethereum', () => {
		setEthereum(undefined);
		expect(getInjectedProvider()).toBeNull();
		expect(hasInjectedWallet()).toBe(false);
	});

	it('returns the single injected provider when present', () => {
		const eth = { request: vi.fn() };
		setEthereum(eth);
		expect(getInjectedProvider()).toBe(eth);
		expect(hasInjectedWallet()).toBe(true);
	});

	it('prefers the MetaMask provider when multiple are injected', () => {
		const coinbase = { request: vi.fn(), isMetaMask: false };
		const metamask = { request: vi.fn(), isMetaMask: true };
		const eth = { request: vi.fn(), providers: [coinbase, metamask] };
		setEthereum(eth);
		expect(getInjectedProvider()).toBe(metamask);
	});

	it('falls back to the first provider when none flags MetaMask', () => {
		const a = { request: vi.fn() };
		const b = { request: vi.fn() };
		const eth = { request: vi.fn(), providers: [a, b] };
		setEthereum(eth);
		expect(getInjectedProvider()).toBe(a);
	});
});

describe('addChainToWallet — no wallet', () => {
	it('returns no-wallet when nothing is injected', async () => {
		clearWindow();
		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'no-wallet'
		});
	});
});

describe('addChainToWallet — switch path (chain already known)', () => {
	it('switches without adding and returns added', async () => {
		const calls: RequestArg[] = [];
		const request = vi.fn(async (arg: RequestArg) => {
			calls.push(arg);
			return null; // both requestAccounts + switch succeed
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'added'
		});

		expect(calls.map((c) => c.method)).toEqual([
			'eth_requestAccounts',
			'wallet_switchEthereumChain'
		]);
		// chainId must be the hex form, not the decimal.
		expect(calls[1].params).toEqual([{ chainId: '0x89' }]);
		// It must NOT call addEthereumChain when switching succeeds.
		expect(calls.some((c) => c.method === 'wallet_addEthereumChain')).toBe(false);
	});
});

describe('addChainToWallet — add path (unknown chain, 4902)', () => {
	function providerThatNeedsAdd(addResult?: () => Promise<unknown>) {
		const calls: RequestArg[] = [];
		const request = vi.fn(async (arg: RequestArg) => {
			calls.push(arg);
			if (arg.method === 'wallet_switchEthereumChain') {
				throw { code: 4902, message: 'Unrecognized chain ID' };
			}
			if (arg.method === 'wallet_addEthereumChain' && addResult) {
				return addResult();
			}
			return null;
		});
		return { request, calls };
	}

	it('adds the chain with a correctly-shaped EIP-3085 param object', async () => {
		const { request, calls } = providerThatNeedsAdd();
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'added'
		});

		const addCall = calls.find((c) => c.method === 'wallet_addEthereumChain');
		expect(addCall).toBeDefined();
		expect(addCall!.params).toEqual([
			{
				chainId: '0x89',
				chainName: 'Polygon Mainnet',
				nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
				rpcUrls: ['https://polygon-rpc.com'],
				blockExplorerUrls: ['https://polygonscan.com']
			}
		]);
	});

	it('omits blockExplorerUrls entirely when no https explorer exists', async () => {
		const { request, calls } = providerThatNeedsAdd();
		setEthereum({ request });
		const noExplorer: ChainData = { ...BASE_CHAIN, explorers: [] };

		await addChainToWallet(noExplorer, 'https://polygon-rpc.com');

		const addCall = calls.find((c) => c.method === 'wallet_addEthereumChain');
		const params = (addCall!.params as Array<Record<string, unknown>>)[0];
		expect('blockExplorerUrls' in params).toBe(false);
	});

	it('filters out non-https explorer urls (only https kept)', async () => {
		const { request, calls } = providerThatNeedsAdd();
		setEthereum({ request });
		const mixed: ChainData = {
			...BASE_CHAIN,
			explorers: [
				{ name: 'insecure', url: 'http://polygonscan.com' },
				{ name: 'secure', url: 'https://polygonscan.com' }
			]
		};

		await addChainToWallet(mixed, 'https://polygon-rpc.com');

		const addCall = calls.find((c) => c.method === 'wallet_addEthereumChain');
		const params = (addCall!.params as Array<Record<string, unknown>>)[0];
		expect(params.blockExplorerUrls).toEqual(['https://polygonscan.com']);
	});

	it('rejects a ws:// rpc as unusable for adding and never calls addEthereumChain', async () => {
		const { request, calls } = providerThatNeedsAdd();
		setEthereum({ request });

		await expect(
			addChainToWallet(BASE_CHAIN, 'wss://polygon-rpc.com')
		).resolves.toEqual({
			status: 'failed',
			message: 'No usable HTTP(S) RPC endpoint for this chain.'
		});

		expect(calls.some((c) => c.method === 'wallet_addEthereumChain')).toBe(false);
	});

	it('accepts an http:// (non-TLS) rpc as usable for adding', async () => {
		const { request, calls } = providerThatNeedsAdd();
		setEthereum({ request });

		await expect(
			addChainToWallet(BASE_CHAIN, 'http://localhost:8545')
		).resolves.toEqual({ status: 'added' });

		const addCall = calls.find((c) => c.method === 'wallet_addEthereumChain');
		const params = (addCall!.params as Array<Record<string, unknown>>)[0];
		expect(params.rpcUrls).toEqual(['http://localhost:8545']);
	});

	it('surfaces the wallet error message on a failed add', async () => {
		const { request } = providerThatNeedsAdd(async () => {
			throw { code: -32603, data: { message: 'RPC URL unreachable' } };
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'failed',
			message: 'RPC URL unreachable'
		});
	});
});

describe('addChainToWallet — user rejection (EIP-1193 code 4001)', () => {
	it('returns rejected when the connect prompt is rejected', async () => {
		const request = vi.fn(async (arg: RequestArg) => {
			if (arg.method === 'eth_requestAccounts') throw { code: 4001 };
			return null;
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'rejected'
		});
		// Should not proceed to switching once the user rejected the connection.
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('returns rejected when the switch prompt is rejected', async () => {
		const request = vi.fn(async (arg: RequestArg) => {
			if (arg.method === 'wallet_switchEthereumChain') throw { code: 4001 };
			return null;
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'rejected'
		});
	});

	it('returns rejected when the add prompt is rejected', async () => {
		const request = vi.fn(async (arg: RequestArg) => {
			if (arg.method === 'wallet_switchEthereumChain') throw { code: 4902 };
			if (arg.method === 'wallet_addEthereumChain') throw { code: 4001 };
			return null;
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'rejected'
		});
	});

	it('still tries switch+add when connect fails for a non-rejection reason', async () => {
		const calls: RequestArg[] = [];
		const request = vi.fn(async (arg: RequestArg) => {
			calls.push(arg);
			if (arg.method === 'eth_requestAccounts') throw { code: -32002, message: 'already pending' };
			return null; // switch succeeds
		});
		setEthereum({ request });

		await expect(addChainToWallet(BASE_CHAIN, 'https://polygon-rpc.com')).resolves.toEqual({
			status: 'added'
		});
		expect(calls.map((c) => c.method)).toEqual([
			'eth_requestAccounts',
			'wallet_switchEthereumChain'
		]);
	});
});
