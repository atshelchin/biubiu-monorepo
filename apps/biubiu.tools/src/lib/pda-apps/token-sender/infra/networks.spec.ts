import { describe, it, expect } from 'vitest';
import { isAddress } from 'viem';
import { NETWORKS, getNetwork, listNetworks } from './networks.js';
import { CONTRACTS } from '$lib/auth/safe-tx/constants';
import { FEE_COLLECTOR } from './fee-config.js';

describe('NETWORKS registry', () => {
	it('every entry is internally consistent', () => {
		for (const [key, n] of Object.entries(NETWORKS)) {
			expect(n.slug).toBe(key); // slug 必须等于 key（发送时用作 network）
			expect(n.decimals).toBe(18);
			expect(n.multiSendAddress).toBe(CONTRACTS.multiSend);
			expect(isAddress(n.multiSendAddress)).toBe(true);
			expect(n.maxBatchNative).toBeGreaterThan(0);
			expect(n.maxBatchErc20).toBeGreaterThan(0);
			expect(n.rpcs.length).toBeGreaterThan(0);
			expect(n.explorerTxUrl.endsWith('/tx/')).toBe(true);
		}
	});

	it('default chunk size is 100', () => {
		expect(NETWORKS['eth-mainnet'].maxBatchNative).toBe(100);
		expect(NETWORKS['eth-mainnet'].maxBatchErc20).toBe(100);
	});

	it('mainnets carry a chainlink feed; amoy testnet does not', () => {
		expect(NETWORKS['eth-mainnet'].chainlinkNativeUsdFeed).toBeDefined();
		expect(NETWORKS['polygon-amoy'].chainlinkNativeUsdFeed).toBeUndefined();
		expect(NETWORKS['polygon-amoy'].isTestnet).toBe(true);
	});

	it('getNetwork / listNetworks', () => {
		expect(getNetwork('eth-mainnet')?.chainId).toBe(1);
		expect(getNetwork('does-not-exist')).toBeUndefined();
		expect(listNetworks()).toHaveLength(Object.keys(NETWORKS).length);
	});
});

describe('fee-config', () => {
	it('FEE_COLLECTOR is a valid address', () => {
		expect(isAddress(FEE_COLLECTOR)).toBe(true);
		expect(FEE_COLLECTOR).toBe('0x2C1c9470E6A6fc6340C9e24670361fEC4c347c23');
	});
});
