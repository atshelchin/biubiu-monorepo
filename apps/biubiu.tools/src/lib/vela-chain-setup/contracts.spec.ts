import { describe, it, expect } from 'vitest';
import {
	parseTransaction,
	recoverTransactionAddress,
	getAddress,
	isAddress,
	type TransactionSerialized
} from 'viem';
import {
	REQUIRED_CONTRACTS,
	CONTRACT_ORDER,
	ARACHNID_PRESIGNED_TX,
	ARACHNID_DEPLOYER_EOA,
	ARACHNID_FUNDING_WEI,
	MULTICALL3_PRESIGNED_TX,
	MULTICALL3_DEPLOYER_EOA,
	MULTICALL3_FUNDING_WEI,
	SAFE_FACTORY_GITHUB_URL,
	SAFE_FACTORY_DEPLOY_GUIDE_URL,
} from './contracts.js';

// These tests pin down the deterministic, security-critical data baked into the
// Vela chain-setup module: the contract registry, the pre-signed keyless
// deployment transactions, and the EOA/funding constants derived from them.
// Nothing here touches the network — every RPC export is intentionally untested.

describe('REQUIRED_CONTRACTS registry', () => {
	it('contains exactly the 11 expected contract keys', () => {
		expect(Object.keys(REQUIRED_CONTRACTS).sort()).toEqual(
			[
				'arachnidProxy',
				'entryPoint',
				'fallbackHandler',
				'multiSend',
				'multicall3',
				'safe4337Module',
				'safeModuleSetup',
				'safeProxyFactory',
				'safeSingleton',
				'safeSingletonFactory',
				'webAuthnSigner',
			].sort(),
		);
	});

	it('every address is a valid checksummed EVM address', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			expect(isAddress(def.address), `${key} should be a valid address`).toBe(true);
			// Stored addresses must already be in canonical checksum form.
			expect(def.address, `${key} should be checksummed`).toBe(getAddress(def.address));
		}
	});

	it('pins the canonical well-known infrastructure addresses', () => {
		// Regressing any of these would point the deployer at the wrong contract.
		expect(REQUIRED_CONTRACTS.arachnidProxy.address).toBe(
			'0x4e59b44847b379578588920cA78FbF26c0B4956C',
		);
		expect(REQUIRED_CONTRACTS.entryPoint.address).toBe(
			'0x0000000071727De22E5E9d8BAf0edAc6f37da032',
		);
		expect(REQUIRED_CONTRACTS.multicall3.address).toBe(
			'0xcA11bde05977b3631167028862bE2a173976CA11',
		);
		expect(REQUIRED_CONTRACTS.safeSingletonFactory.address).toBe(
			'0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7',
		);
	});

	it('every dependsOn points at an existing registry key', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			if (def.dependsOn !== undefined) {
				expect(REQUIRED_CONTRACTS, `${key}.dependsOn`).toHaveProperty(def.dependsOn);
			}
		}
	});

	it('a dependent contract is never in a lower layer than its dependency', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			if (def.dependsOn) {
				const dep = REQUIRED_CONTRACTS[def.dependsOn];
				expect(def.layer, `${key} (layer ${def.layer}) vs ${def.dependsOn} (layer ${dep.layer})`).toBeGreaterThanOrEqual(dep.layer);
			}
		}
	});

	it('uses only the known deploy methods', () => {
		const allowed = new Set([
			'nicks-method',
			'presigned-tx',
			'arachnid-proxy',
			'safe-factory',
			'external',
		]);
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			expect(allowed.has(def.deployMethod), `${key} deployMethod=${def.deployMethod}`).toBe(true);
		}
	});

	it('every estimatedGas is a non-negative bigint', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			expect(typeof def.estimatedGas, `${key}`).toBe('bigint');
			expect(def.estimatedGas >= 0n, `${key} gas should be >= 0`).toBe(true);
		}
	});

	it('arachnid-proxy deployed contracts depend on the arachnid proxy', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			if (def.deployMethod === 'arachnid-proxy') {
				expect(def.dependsOn, `${key}`).toBe('arachnidProxy');
			}
		}
	});

	it('safe-factory deployed contracts depend on the safe singleton factory', () => {
		for (const [key, def] of Object.entries(REQUIRED_CONTRACTS)) {
			if (def.deployMethod === 'safe-factory') {
				expect(def.dependsOn, `${key}`).toBe('safeSingletonFactory');
			}
		}
	});
});

describe('CONTRACT_ORDER', () => {
	it('only references keys that exist in REQUIRED_CONTRACTS', () => {
		for (const key of CONTRACT_ORDER) {
			expect(REQUIRED_CONTRACTS, key).toHaveProperty(key);
		}
	});

	it('has no duplicate entries', () => {
		expect(new Set(CONTRACT_ORDER).size).toBe(CONTRACT_ORDER.length);
	});

	it('is sorted by ascending deploy layer (dependencies first)', () => {
		const layers = CONTRACT_ORDER.map((k) => REQUIRED_CONTRACTS[k].layer);
		const sorted = [...layers].sort((a, b) => a - b);
		expect(layers).toEqual(sorted);
	});

	it('lists every layer-0/1 base contract before any layer-2 contract', () => {
		const firstLayer2 = CONTRACT_ORDER.findIndex((k) => REQUIRED_CONTRACTS[k].layer === 2);
		// arachnidProxy, safeSingletonFactory, multicall3, entryPoint, safeSingleton... ;
		// the first layer-2 contract must come after all the base layers.
		const before = CONTRACT_ORDER.slice(0, firstLayer2);
		expect(before.every((k) => REQUIRED_CONTRACTS[k].layer < 2)).toBe(true);
	});
});

describe('ARACHNID pre-signed keyless deployment tx', () => {
	it('is a 0x-prefixed hex string', () => {
		expect(ARACHNID_PRESIGNED_TX).toMatch(/^0x[0-9a-f]+$/);
	});

	it('parses as a legacy (pre-EIP-155) contract-creation tx with 100 gwei / 100k gas', () => {
		const tx = parseTransaction(ARACHNID_PRESIGNED_TX as `0x${string}`);
		expect(tx.type).toBe('legacy');
		expect(tx.to).toBeUndefined(); // contract creation
		expect(tx.nonce).toBe(0);
		expect(tx.gas).toBe(100_000n);
		expect(tx.gasPrice).toBe(100_000_000_000n); // 100 gwei
	});

	it('recovers a sender that equals ARACHNID_DEPLOYER_EOA', async () => {
		const sender = await recoverTransactionAddress({
			serializedTransaction: ARACHNID_PRESIGNED_TX as TransactionSerialized,
		});
		// Source stores the EOA lowercased; compare case-insensitively.
		expect(sender.toLowerCase()).toBe(ARACHNID_DEPLOYER_EOA.toLowerCase());
		expect(getAddress(ARACHNID_DEPLOYER_EOA)).toBe(sender);
	});

	it('funds the deployer with exactly gasPrice * gasLimit (0.01 ETH)', () => {
		expect(ARACHNID_FUNDING_WEI).toBe(10_000_000_000_000_000n);
		expect(ARACHNID_FUNDING_WEI).toBe(100_000_000_000n * 100_000n);
	});
});

describe('MULTICALL3 pre-signed keyless deployment tx', () => {
	it('parses as a legacy contract-creation tx with 100 gwei / 1M gas', () => {
		const tx = parseTransaction(MULTICALL3_PRESIGNED_TX as `0x${string}`);
		expect(tx.type).toBe('legacy');
		expect(tx.to).toBeUndefined();
		expect(tx.nonce).toBe(0);
		expect(tx.gas).toBe(1_000_000n);
		expect(tx.gasPrice).toBe(100_000_000_000n);
	});

	it('recovers a sender that equals MULTICALL3_DEPLOYER_EOA', async () => {
		const sender = await recoverTransactionAddress({
			serializedTransaction: MULTICALL3_PRESIGNED_TX as TransactionSerialized,
		});
		expect(sender.toLowerCase()).toBe(MULTICALL3_DEPLOYER_EOA.toLowerCase());
		expect(getAddress(MULTICALL3_DEPLOYER_EOA)).toBe(sender);
	});

	it('funds the deployer with exactly gasPrice * gasLimit (0.1 ETH)', () => {
		expect(MULTICALL3_FUNDING_WEI).toBe(100_000_000_000_000_000n);
		expect(MULTICALL3_FUNDING_WEI).toBe(100_000_000_000n * 1_000_000n);
	});

	it('requires 10x the funding of the Arachnid deployer (10x the gas)', () => {
		expect(MULTICALL3_FUNDING_WEI).toBe(ARACHNID_FUNDING_WEI * 10n);
	});
});

describe('Safe factory help links', () => {
	it('are https github URLs to the safe-singleton-factory repo', () => {
		for (const url of [SAFE_FACTORY_GITHUB_URL, SAFE_FACTORY_DEPLOY_GUIDE_URL]) {
			expect(url).toMatch(/^https:\/\/github\.com\/safe-global\/safe-singleton-factory/);
		}
		expect(SAFE_FACTORY_GITHUB_URL).toContain('/issues');
		expect(SAFE_FACTORY_DEPLOY_GUIDE_URL).toContain('adding-new-networks');
	});
});
