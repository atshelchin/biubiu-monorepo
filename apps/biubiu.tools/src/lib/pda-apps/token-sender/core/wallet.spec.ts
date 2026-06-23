import { describe, it, expect, vi } from 'vitest';
import { type Address, type Hex } from 'viem';
import { createConnectedWallet } from './wallet.js';
import { NETWORKS } from '../infra/networks.js';
import type { ConnectedWallet } from '$lib/wallet';

/**
 * token-sender now sends through the unified ConnectedWallet (biubiu / inject /
 * walletpair), not passkey-only. These tests verify the seam wires the raw batch
 * calls into `sendCalls` with the right chain + explorer base, and maps results.
 */
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const CALLS: { to: Address; value: bigint; data: Hex }[] = [
	{ to: '0x2222222222222222222222222222222222222222' as Address, value: 5n, data: '0x' }
];

function fakeWallet(sendCalls: unknown): ConnectedWallet {
	return {
		kind: 'inject',
		address: ACCOUNT,
		accountType: 'smart-contract',
		sendCalls: sendCalls as ConnectedWallet['sendCalls'],
		disconnect: () => {}
	};
}

describe('createConnectedWallet · sendBatch', () => {
	it('routes the raw calls through sendCalls with chainId + explorer base', async () => {
		const sendCalls = vi
			.fn()
			.mockResolvedValue({ success: true, txHash: '0xabc', explorerUrl: 'https://x/tx/0xabc' });
		const w = createConnectedWallet(fakeWallet(sendCalls));
		const net = NETWORKS['eth-mainnet'];

		const res = await w.sendBatch({ network: net, calls: CALLS });

		expect(res).toEqual({ txHash: '0xabc', explorerUrl: 'https://x/tx/0xabc' });
		expect(sendCalls).toHaveBeenCalledTimes(1);
		const [calls, opts] = sendCalls.mock.calls[0];
		expect(calls).toBe(CALLS);
		expect(opts.chainId).toBe(net.chainId);
		expect(opts.explorerTxBaseUrl).toBe(net.explorerTxUrl);
	});

	it('derives explorer url from the network when sendCalls omits it', async () => {
		const sendCalls = vi.fn().mockResolvedValue({ success: true, txHash: '0xfeed' });
		const w = createConnectedWallet(fakeWallet(sendCalls));
		const res = await w.sendBatch({ network: NETWORKS['eth-mainnet'], calls: CALLS });
		expect(res.explorerUrl).toBe('https://etherscan.io/tx/0xfeed');
	});

	it('throws when the underlying send fails', async () => {
		const sendCalls = vi.fn().mockResolvedValue({ success: false, error: 'user rejected' });
		const w = createConnectedWallet(fakeWallet(sendCalls));
		await expect(w.sendBatch({ network: NETWORKS['eth-mainnet'], calls: CALLS })).rejects.toThrow(
			'user rejected'
		);
	});

	it('exposes the connected wallet address as the account', () => {
		const w = createConnectedWallet(fakeWallet(vi.fn()));
		expect(w.account).toBe(ACCOUNT);
	});
});
