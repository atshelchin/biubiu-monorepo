import { describe, it, expect } from 'vitest';
import { getPublicRpcEndpoints, isTestableRpc, latencyTier, probeRpcLatency } from './rpc.js';

describe('getPublicRpcEndpoints', () => {
	it('keeps plain public endpoints', () => {
		const rpcs = ['https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'];
		expect(getPublicRpcEndpoints(rpcs)).toEqual(rpcs);
	});

	it('drops endpoints with a ${...} template placeholder', () => {
		const rpcs = [
			'https://mainnet.infura.io/v3/${INFURA_API_KEY}',
			'https://eth.llamarpc.com'
		];
		expect(getPublicRpcEndpoints(rpcs)).toEqual(['https://eth.llamarpc.com']);
	});

	it('drops endpoints mentioning API_KEY', () => {
		const rpcs = ['https://rpc.example.com/v1/API_KEY', 'https://public.example.com'];
		expect(getPublicRpcEndpoints(rpcs)).toEqual(['https://public.example.com']);
	});

	it('drops endpoints mentioning INFURA even without a template', () => {
		const rpcs = ['https://INFURA-gateway.example.com', 'https://open.example.com'];
		expect(getPublicRpcEndpoints(rpcs)).toEqual(['https://open.example.com']);
	});

	it('returns an empty array when every endpoint needs a key', () => {
		const rpcs = [
			'https://x.io/${KEY}',
			'https://y.io/API_KEY',
			'https://mainnet.infura.io/v3/${INFURA_API_KEY}'
		];
		expect(getPublicRpcEndpoints(rpcs)).toEqual([]);
	});

	it('does NOT filter a lowercase "infura" host (matcher is the literal uppercase INFURA token)', () => {
		// guards the case-sensitivity of the INFURA placeholder match
		const rpcs = ['https://mainnet.infura.io/v3/abc'];
		expect(getPublicRpcEndpoints(rpcs)).toEqual(['https://mainnet.infura.io/v3/abc']);
	});

	it('returns [] for an empty input list', () => {
		expect(getPublicRpcEndpoints([])).toEqual([]);
	});
});

describe('isTestableRpc', () => {
	it('accepts https endpoints', () => {
		expect(isTestableRpc('https://rpc.example.com')).toBe(true);
	});

	it('accepts http endpoints', () => {
		expect(isTestableRpc('http://localhost:8545')).toBe(true);
	});

	it('accepts wss endpoints', () => {
		expect(isTestableRpc('wss://rpc.example.com')).toBe(true);
	});

	it('accepts ws endpoints', () => {
		expect(isTestableRpc('ws://localhost:8546')).toBe(true);
	});

	it('rejects non-http(s)/ws(s) schemes', () => {
		expect(isTestableRpc('ipc:///tmp/geth.ipc')).toBe(false);
		expect(isTestableRpc('enode://abc@1.2.3.4:30303')).toBe(false);
		expect(isTestableRpc('')).toBe(false);
	});
});

describe('latencyTier', () => {
	it('returns "none" for a null latency (unprobed / failed)', () => {
		expect(latencyTier(null)).toBe('none');
	});

	it('returns "good" below 200ms', () => {
		expect(latencyTier(0)).toBe('good');
		expect(latencyTier(199)).toBe('good');
	});

	it('returns "medium" at the 200ms boundary up to <500ms', () => {
		expect(latencyTier(200)).toBe('medium');
		expect(latencyTier(499)).toBe('medium');
	});

	it('returns "slow" at the 500ms boundary and above', () => {
		expect(latencyTier(500)).toBe('slow');
		expect(latencyTier(5000)).toBe('slow');
	});
});

describe('probeRpcLatency — protocol dispatch (no real network)', () => {
	it('returns an error result for an unsupported scheme without touching the network', async () => {
		// ipc:// is neither http* nor ws* → falls through to the static error branch,
		// so this resolves synchronously-ish with no fetch / WebSocket call.
		await expect(probeRpcLatency('ipc:///tmp/geth.ipc')).resolves.toEqual({
			latency: null,
			status: 'error'
		});
	});

	it('returns an error result for an empty url', async () => {
		await expect(probeRpcLatency('')).resolves.toEqual({ latency: null, status: 'error' });
	});
});
