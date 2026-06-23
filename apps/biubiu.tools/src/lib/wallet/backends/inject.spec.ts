import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { connectInjected, discoverInjectedProviders, InjectWallet } from './inject.js';
import { NotSmartAccountError } from '../gate.js';
import type { Eip1193Provider, Eip6963ProviderDetail } from '../eip1193.js';

/**
 * The gate (smart-contract-wallet requirement) is the security boundary for
 * external wallets — these tests prove a plain EOA is rejected at the inject
 * entry point, and that deployed contracts / 7702-delegated EOAs are accepted.
 */
function detail(reqs: Record<string, () => unknown>): Eip6963ProviderDetail {
	const provider: Eip1193Provider = {
		request: async ({ method }) => {
			const h = reqs[method];
			if (!h) throw new Error(`unexpected ${method}`);
			return h();
		}
	};
	return { info: { uuid: 'u1', name: 'MockWallet', icon: 'data:,', rdns: 'io.mock' }, provider };
}

const ADDR = '0x1111111111111111111111111111111111111111';

describe('connectInjected', () => {
	it('connects a deployed smart contract wallet', async () => {
		const w = await connectInjected(
			detail({
				eth_requestAccounts: () => [ADDR],
				eth_chainId: () => '0x2105',
				eth_getCode: () => '0x6080604052'
			})
		);
		expect(w).toBeInstanceOf(InjectWallet);
		expect(w.kind).toBe('inject');
		expect(w.address).toBe(getAddress(ADDR));
		expect(w.accountType).toBe('smart-contract');
		expect(w.info.name).toBe('MockWallet');
	});

	it('accepts an EIP-7702 delegated EOA', async () => {
		const w = await connectInjected(
			detail({
				eth_requestAccounts: () => [ADDR],
				eth_chainId: () => '0x1',
				eth_getCode: () => '0xef0100' + '22'.repeat(20)
			})
		);
		expect(w.accountType).toBe('eip7702');
	});

	it('REJECTS a plain EOA at connect (gate)', async () => {
		await expect(
			connectInjected(
				detail({
					eth_requestAccounts: () => [ADDR],
					eth_chainId: () => '0x1',
					eth_getCode: () => '0x'
				})
			)
		).rejects.toBeInstanceOf(NotSmartAccountError);
	});

	it('rejects when the wallet authorizes no account', async () => {
		await expect(connectInjected(detail({ eth_requestAccounts: () => [] }))).rejects.toThrow(
			/No account/i
		);
	});
});

describe('discoverInjectedProviders', () => {
	it('returns [] in a non-browser environment (SSR/test)', async () => {
		expect(await discoverInjectedProviders(10)).toEqual([]);
	});
});
