import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAddress, type Address } from 'viem';
import {
	CURATED_CHAINS,
	safeJson,
	truncateMiddle,
	encodeErc20Transfer,
	nativeToWei,
	tokenToUnits,
	debounce,
	resolveAddProvider,
	addOrSwitchChain,
	isAddress,
	type Eip1193Like
} from './helpers.js';
import { CHAINS } from '$lib/wallet/infra/chains.js';

// Mock the chain-info fetch so the "add" path never touches the network.
vi.mock('$lib/contract-caller/networks.js', () => ({
	loadChainInfo: vi.fn(async (chainId: number) => ({
		name: `Chain ${chainId}`,
		nativeCurrency: { name: 'X', symbol: 'X', decimals: 18 },
		rpcUrls: ['https://rpc.example/' + chainId],
		explorerUrl: 'https://explorer.example'
	}))
}));

const DAI = getAddress('0x6b175474e89094c44da98b954eedeac495271d0f') as Address;

describe('CURATED_CHAINS', () => {
	it('mirrors every built-in chain in declaration order', () => {
		expect(CURATED_CHAINS.map((c) => c.chainId)).toEqual(CHAINS.map((c) => c.chainId));
	});

	it('projects only the curated subset of fields (drops rpcUrls/gasModel)', () => {
		const eth = CURATED_CHAINS.find((c) => c.chainId === 1)!;
		expect(eth).toEqual({
			chainId: 1,
			name: 'Ethereum',
			nativeSymbol: 'ETH',
			iconLabel: 'ETH',
			iconColor: '#627EEA',
			iconBg: '#EEF0F8',
			explorerURL: 'https://etherscan.io',
			isL2: false
		});
		expect(eth).not.toHaveProperty('rpcUrls');
		expect(eth).not.toHaveProperty('gasModel');
	});

	it('marks L2 chains correctly (Base is L2, Ethereum is not)', () => {
		expect(CURATED_CHAINS.find((c) => c.chainId === 8453)!.isL2).toBe(true);
		expect(CURATED_CHAINS.find((c) => c.chainId === 1)!.isL2).toBe(false);
	});
});

describe('safeJson', () => {
	it('serialises bigint as a decimal string instead of throwing', () => {
		expect(safeJson({ wei: 1000000000000000000n })).toBe('{\n  "wei": "1000000000000000000"\n}');
	});

	it('pretty-prints with 2-space indentation', () => {
		expect(safeJson({ a: 1, b: { c: 2 } })).toBe('{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}');
	});

	it('handles plain values, arrays and nested bigints', () => {
		expect(safeJson('hi')).toBe('"hi"');
		expect(safeJson([1n, 2n])).toBe('[\n  "1",\n  "2"\n]');
	});

	it('plain JSON.stringify would throw on the same bigint input', () => {
		expect(() => JSON.stringify({ wei: 1n })).toThrow(TypeError);
	});
});

describe('truncateMiddle', () => {
	it('inserts an ellipsis between head and tail for long strings', () => {
		expect(truncateMiddle(DAI)).toBe('0x6B17…1d0F');
	});

	it('respects custom head/tail lengths', () => {
		expect(truncateMiddle(DAI, 4, 6)).toBe('0x6B…271d0F');
	});

	it('returns short strings unchanged (length <= head + tail + 1)', () => {
		// default head=6, tail=4 → threshold 11; an 11-char string is left intact
		expect(truncateMiddle('0x123456789')).toBe('0x123456789');
		expect(truncateMiddle('')).toBe('');
	});
});

describe('encodeErc20Transfer', () => {
	it('encodes transfer(address,uint256) with the canonical selector and ABI-packed args', () => {
		expect(encodeErc20Transfer(DAI, 1000000n)).toBe(
			'0xa9059cbb0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000000000000000f4240'
		);
	});

	it('always begins with the transfer 4-byte selector 0xa9059cbb', () => {
		expect(encodeErc20Transfer(DAI, 0n).slice(0, 10)).toBe('0xa9059cbb');
	});

	it('throws on an invalid recipient address', () => {
		expect(() => encodeErc20Transfer('0x1234' as Address, 1n)).toThrow();
	});

	it('throws on a negative amount (uint256 underflow)', () => {
		expect(() => encodeErc20Transfer(DAI, -1n)).toThrow();
	});
});

describe('nativeToWei', () => {
	it('parses a decimal ether amount to wei', () => {
		expect(nativeToWei('1.5')).toBe(1500000000000000000n);
	});

	it('trims surrounding whitespace', () => {
		expect(nativeToWei('  2  ')).toBe(2000000000000000000n);
	});

	it('treats empty / whitespace-only input as 0n', () => {
		expect(nativeToWei('')).toBe(0n);
		expect(nativeToWei('   ')).toBe(0n);
	});

	it('throws on non-numeric input', () => {
		expect(() => nativeToWei('abc')).toThrow();
	});
});

describe('tokenToUnits', () => {
	it('scales by the given decimals (USDC, 6)', () => {
		expect(tokenToUnits('100', 6)).toBe(100000000n);
	});

	it('scales by 18 decimals', () => {
		expect(tokenToUnits('1.5', 18)).toBe(1500000000000000000n);
	});

	it('treats empty / whitespace-only input as 0n', () => {
		expect(tokenToUnits('', 6)).toBe(0n);
		expect(tokenToUnits('   ', 18)).toBe(0n);
	});

	it('throws on garbage input', () => {
		expect(() => tokenToUnits('not-a-number', 6)).toThrow();
	});
});

describe('debounce', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('invokes the wrapped fn only once, after the delay, with the latest args', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d('a');
		d('b');
		d('c');
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('c');
	});

	it('fires again for a fresh burst after the timer elapses', () => {
		const fn = vi.fn();
		const d = debounce(fn, 50);
		d(1);
		vi.advanceTimersByTime(50);
		d(2);
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(fn).toHaveBeenNthCalledWith(1, 1);
		expect(fn).toHaveBeenNthCalledWith(2, 2);
	});
});

describe('resolveAddProvider', () => {
	it('returns the wallet provider when the connected wallet carries one', () => {
		const provider = { request: vi.fn() };
		// ConnectedWallet shape is irrelevant to the runtime check (`'provider' in wallet`)
		const wallet = { provider } as never;
		expect(resolveAddProvider(wallet)).toBe(provider);
	});

	it('falls back to the injected provider (null in node, no window)', () => {
		// In the node test env there is no window → getInjectedProvider() returns null
		expect(resolveAddProvider(null)).toBeNull();
	});

	it('returns null for biubiu (chainless, no provider) — never falls back to injected', () => {
		const wallet = { kind: 'biubiu' } as never;
		expect(resolveAddProvider(wallet)).toBeNull();
	});

	it('does NOT drive a random injected provider when biubiu is the active wallet', () => {
		// Even if a browser-injected wallet (e.g. MetaMask) is present, an active
		// biubiu connection must resolve to null — not the unrelated extension.
		const injected = { request: vi.fn() };
		vi.stubGlobal('window', { ethereum: injected });
		try {
			const wallet = { kind: 'biubiu' } as never;
			expect(resolveAddProvider(wallet)).toBeNull();
			expect(resolveAddProvider(wallet)).not.toBe(injected);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("prefers an external wallet's own provider over the injected one", () => {
		const own = { request: vi.fn() };
		const injected = { request: vi.fn() };
		vi.stubGlobal('window', { ethereum: injected });
		try {
			const wallet = { kind: 'inject', provider: own } as never;
			expect(resolveAddProvider(wallet)).toBe(own);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('isAddress (re-export)', () => {
	it('accepts a valid checksummed address', () => {
		expect(isAddress(DAI)).toBe(true);
	});

	it('rejects malformed input', () => {
		expect(isAddress('0x1234')).toBe(false);
		expect(isAddress('nope')).toBe(false);
	});
});

describe('addOrSwitchChain', () => {
	const REJECT = { code: 4001 };

	it('returns "switched" when wallet_switchEthereumChain resolves', async () => {
		const calls: { method: string; params?: unknown[] }[] = [];
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				calls.push(args);
				return undefined;
			})
		};
		const out = await addOrSwitchChain(provider, 8453);
		expect(out).toEqual({ status: 'switched' });
		// requested accounts first, then switched to the hex chain id (8453 → 0x2105)
		expect(calls[0].method).toBe('eth_requestAccounts');
		expect(calls[1]).toEqual({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: '0x2105' }]
		});
	});

	it('returns "rejected" when the user denies the switch (code 4001)', async () => {
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				if (args.method === 'wallet_switchEthereumChain') throw REJECT;
				return undefined;
			})
		};
		const out = await addOrSwitchChain(provider, 1);
		expect(out).toEqual({ status: 'rejected' });
	});

	it('continues to switch even if eth_requestAccounts throws', async () => {
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				if (args.method === 'eth_requestAccounts') throw new Error('locked');
				return undefined; // switch succeeds
			})
		};
		const out = await addOrSwitchChain(provider, 10);
		expect(out).toEqual({ status: 'switched' });
	});

	it('returns "added" with the chain name when switch fails but add succeeds', async () => {
		// switch throws a non-4001 error → falls through to add; loadChainInfo (mocked)
		// resolves and wallet_addEthereumChain succeeds → status 'added'
		const calls: { method: string; params?: unknown[] }[] = [];
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				calls.push(args);
				if (args.method === 'wallet_switchEthereumChain') throw new Error('Unrecognized chain');
				return undefined; // requestAccounts + addEthereumChain succeed
			})
		};
		const out = await addOrSwitchChain(provider, 137);
		expect(out).toEqual({ status: 'added', name: 'Chain 137' });
		// the add request carries the assembled EIP-3085 params (137 → 0x89)
		const addCall = calls.find((c) => c.method === 'wallet_addEthereumChain')!;
		expect((addCall.params![0] as { chainId: string }).chainId).toBe('0x89');
	});

	it('returns "failed" with the error message when wallet_addEthereumChain throws a non-rejection', async () => {
		// switch fails (non-4001) → add path runs but the wallet rejects the add with a
		// generic error → caught → status 'failed' carrying the message
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				if (args.method === 'wallet_switchEthereumChain') throw new Error('Unrecognized chain');
				if (args.method === 'wallet_addEthereumChain') throw new Error('add boom');
				return undefined;
			})
		};
		const out = await addOrSwitchChain(provider, 137);
		expect(out).toEqual({ status: 'failed', error: 'add boom' });
	});

	it('returns "rejected" when the user denies the add (code 4001 on the add path)', async () => {
		const provider: Eip1193Like = {
			request: vi.fn(async (args) => {
				if (args.method === 'wallet_switchEthereumChain') throw new Error('Unrecognized chain');
				if (args.method === 'wallet_addEthereumChain') throw REJECT;
				return undefined;
			})
		};
		const out = await addOrSwitchChain(provider, 137);
		expect(out).toEqual({ status: 'rejected' });
	});
});
