import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenSenderNetwork } from '../types.js';

/**
 * publicClientFor is the single shared read-only viem client builder reused by
 * core/wallet.ts (balance/meta reads) and core/price.ts (Chainlink reads). These
 * tests pin the contract that mattered before extraction: it threads the network's
 * chainId + rpcs through resolveRpcUrls and builds a viem PublicClient over those URLs.
 */
const resolveRpcUrls = vi.fn<(chainId: number, rpcs?: string[]) => string[]>();
vi.mock('$lib/wallet/infra/rpc-client.js', () => ({ resolveRpcUrls }));

const { publicClientFor } = await import('./public-client.js');

const NETWORK: TokenSenderNetwork = {
	slug: 'eth-mainnet',
	name: 'Ethereum',
	chainId: 1,
	symbol: 'ETH',
	decimals: 18,
	rpcs: ['https://a.example', 'https://b.example'],
	explorerTxUrl: 'https://etherscan.io/tx/',
	multiSendAddress: '0x38869bf66a61cF6bDB996A6aE40D5853FD43B526',
	maxBatchNative: 100,
	maxBatchErc20: 100
};

describe('publicClientFor', () => {
	beforeEach(() => resolveRpcUrls.mockReset());

	it('resolves RPC URLs from the network (chainId + curated rpcs) and builds a viem client', () => {
		resolveRpcUrls.mockReturnValue(['https://a.example', 'https://b.example']);

		const client = publicClientFor(NETWORK);

		expect(resolveRpcUrls).toHaveBeenCalledTimes(1);
		expect(resolveRpcUrls).toHaveBeenCalledWith(NETWORK.chainId, NETWORK.rpcs);
		// A real viem PublicClient exposes read actions over the resolved transport.
		expect(typeof client.readContract).toBe('function');
		expect(typeof client.getBalance).toBe('function');
	});

	it('edge: still builds a client when only a single resolved URL is available', () => {
		resolveRpcUrls.mockReturnValue(['https://only.example']);

		const client = publicClientFor({ ...NETWORK, rpcs: ['https://only.example'] });

		expect(resolveRpcUrls).toHaveBeenCalledWith(1, ['https://only.example']);
		expect(typeof client.readContract).toBe('function');
	});
});
