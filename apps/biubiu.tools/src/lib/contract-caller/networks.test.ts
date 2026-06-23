import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	ETHEREUM_DATA_BASE_URL,
	writeNetworkKey,
	chainLogoUrl,
	extractRpcUrls,
	searchChains,
	probeRpcs,
	loadChainInfo
} from './networks.js';

afterEach(() => vi.unstubAllGlobals());

function jsonResp(obj: unknown, ok = true) {
	return { ok, status: ok ? 200 : 404, json: async () => obj } as Response;
}

describe('writeNetworkKey', () => {
	it('maps supported chains to the site-wallet network key', () => {
		expect(writeNetworkKey(1)).toBe('eth-mainnet');
		expect(writeNetworkKey(8453)).toBe('base-mainnet');
		expect(writeNetworkKey(137)).toBe('matic-mainnet');
	});

	it('returns null for unsupported / missing chains', () => {
		expect(writeNetworkKey(999999)).toBeNull();
		expect(writeNetworkKey(null)).toBeNull();
		expect(writeNetworkKey(undefined)).toBeNull();
	});
});

describe('chainLogoUrl', () => {
	it('builds the ethereum-data logo URL', () => {
		expect(chainLogoUrl(8453)).toBe(`${ETHEREUM_DATA_BASE_URL}/chainlogos/eip155-8453.png`);
	});
});

describe('extractRpcUrls', () => {
	it('keeps only key-free https endpoints', () => {
		const urls = extractRpcUrls({
			rpc: [
				'https://good.rpc',
				'http://insecure.rpc',
				'https://has-template${KEY}.rpc',
				'https://has/API_KEY/in-path'
			]
		});
		expect(urls).toEqual(['https://good.rpc']);
	});

	it('returns [] when rpc is missing or not an array', () => {
		expect(extractRpcUrls({})).toEqual([]);
		expect(extractRpcUrls({ rpc: 'nope' as unknown as string[] })).toEqual([]);
	});
});

describe('searchChains', () => {
	const INDEX = [
		{
			chainId: 1,
			name: 'Ethereum Mainnet',
			shortName: 'eth',
			nativeCurrencySymbol: 'ETH',
			hasLogo: true
		},
		{ chainId: 8453, name: 'Base', shortName: 'base', nativeCurrencySymbol: 'ETH', hasLogo: true },
		{
			chainId: 42161,
			name: 'Arbitrum One',
			shortName: 'arb1',
			nativeCurrencySymbol: 'ETH',
			hasLogo: true
		}
	];

	function mockIndex() {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResp({ data: INDEX }))
		);
	}

	it('returns [] for an empty query without fetching', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		expect(await searchChains('   ')).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('matches by name (case-insensitive)', async () => {
		mockIndex();
		const r = await searchChains('base');
		expect(r.map((c) => c.chainId)).toContain(8453);
	});

	it('puts an exact chainId match first', async () => {
		mockIndex();
		const r = await searchChains('8453');
		expect(r[0].chainId).toBe(8453);
	});

	it('returns [] when nothing matches', async () => {
		mockIndex();
		expect(await searchChains('zzzzz-nope')).toEqual([]);
	});
});

describe('probeRpcs', () => {
	it('marks reachable RPCs ok and unreachable ones error', async () => {
		const GOOD = 'https://good.rpc';
		const BAD = 'https://bad.rpc';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, opts: { body: string }) => {
				if (url === BAD) throw new Error('unreachable');
				const body = JSON.parse(opts.body);
				return jsonResp({ jsonrpc: '2.0', id: body.id, result: '0x2105' });
			})
		);
		const res = await probeRpcs([GOOD, BAD]);
		const good = res.find((r) => r.url === GOOD)!;
		const bad = res.find((r) => r.url === BAD)!;
		expect(good.status).toBe('ok');
		expect(good.latencyMs).toBeGreaterThanOrEqual(0);
		expect(bad.status).toBe('error');
		expect(bad.latencyMs).toBeNull();
	});
});

describe('loadChainInfo', () => {
	it('parses chain metadata and filters RPCs', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResp({
					chainId: 8453,
					name: 'Base',
					nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
					rpc: ['https://base.rpc', 'http://insecure', 'https://x${KEY}'],
					explorers: [{ url: 'https://basescan.org' }],
					testnet: false
				})
			)
		);
		const info = await loadChainInfo(8453);
		expect(info.chainId).toBe(8453);
		expect(info.name).toBe('Base');
		expect(info.rpcUrls).toEqual(['https://base.rpc']);
		expect(info.explorerUrl).toBe('https://basescan.org');
		expect(info.nativeCurrency.symbol).toBe('ETH');
		expect(info.isTestnet).toBe(false);
	});

	it('throws when the chain has no usable RPCs', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResp({ chainId: 5, name: 'X', rpc: ['http://insecure'] }))
		);
		await expect(loadChainInfo(5)).rejects.toThrow(/No public RPC/);
	});

	it('throws when the chain is not found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResp({}, false))
		);
		await expect(loadChainInfo(123456789)).rejects.toThrow(/Chain not found/);
	});
});
