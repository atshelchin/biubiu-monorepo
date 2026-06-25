/**
 * Regression tests for three deploy-store P2 findings (REVIEW-FINDINGS "deploy …"):
 *
 *  1. [Salt] A salt with valid LENGTH (66) but invalid HEX must NOT yield a
 *     predicted address and must block deploy. keccak256/concat do not throw on
 *     bad hex, so the old length-only gate produced a confident-but-wrong address.
 *     Now updatePredictedAddress(), canDeploy and deployBlocker all gate on
 *     isValidSalt(). (create2.ts / deploy-store.svelte.ts)
 *
 *  2. [Race] Rapid chain switch must not let a slow runNetworkCheck() for the OLD
 *     chain write its readiness result onto the chain the user just switched to.
 *     A monotonic _checkToken is bumped on every selection change; a late result
 *     whose token is stale is dropped. (deploy-store.svelte.ts runNetworkCheck)
 *
 * The store uses Svelte 5 runes so this runs in the browser project. Heavy
 * collaborators (foundry server, on-chain reads, bundler, i18n, history) are
 * mocked; we exercise only the store's salt-validation + stale-guard logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Hex } from 'viem';

// ── Controllable network-check: each call returns a promise we resolve by hand,
//    so we can suspend the check, switch chains (bump the token), then resolve. ──
const H = vi.hoisted(() => {
	const pending: Array<(v: unknown) => void> = [];
	const checkNetworkSupport = vi.fn(
		() => new Promise((resolve) => pending.push(resolve as (v: unknown) => void))
	);
	return { pending, checkNetworkSupport };
});

vi.mock('./network-check.js', () => ({
	checkNetworkSupport: H.checkNetworkSupport
}));

// History: no-op persistence.
vi.mock('./history.js', () => ({
	saveDeployment: vi.fn(async () => {}),
	getDeployments: vi.fn(async () => []),
	markVerified: vi.fn(async () => {}),
	clearDeployments: vi.fn(async () => {})
}));

// Foundry client: never connect.
vi.mock('./foundry-client.js', () => ({
	FoundryClient: class {
		setPort() {}
		async getInfo() {
			return { isFoundry: false, cwd: '' };
		}
		async getContracts() {
			return [];
		}
	}
}));

// Wallet: a connected smart-account stub.
vi.mock('$lib/wallet', () => ({
	walletStore: {
		isConnected: true,
		activeWallet: { address: '0x1111111111111111111111111111111111111111' }
	}
}));

// contract-caller/networks: not exercised here (we drive selectedChain/rpc directly).
vi.mock('$lib/contract-caller/networks.js', () => ({
	searchChains: vi.fn(async () => []),
	loadChainInfo: vi.fn(async () => ({})),
	probeRpcs: vi.fn(async () => []),
	rpcCall: vi.fn(async () => '0x1')
}));

vi.mock('$lib/wallet/infra/bundler-client.js', async (importActual) => ({
	...(await importActual<object>()),
	getUserOperationGasPrice: vi.fn(async () => null)
}));

import { deployStore } from './deploy-store.svelte.js';

const ZERO_SALT = `0x${'00'.repeat(32)}` as Hex;
const BAD_HEX_SALT = `0x${'ZZ'}${'00'.repeat(31)}` as Hex; // 66 chars, NOT hex

// Minimal ChainInfo shape the store touches.
function fakeChain(chainId: number) {
	return {
		chainId,
		name: `Chain ${chainId}`,
		nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
	} as never;
}

// A trivial deployable contract artifact so selectedContract is non-null.
const FAKE_CONTRACT = {
	name: 'Foo',
	file: 'src/Foo.sol',
	abi: [],
	bytecode: '0x6080604052' as Hex
};

beforeEach(() => {
	H.pending.length = 0;
	H.checkNetworkSupport.mockClear();
	// Reset the singleton's relevant fields to a known baseline.
	deployStore.contracts = [FAKE_CONTRACT] as never;
	deployStore.selectedContractIndex = 0;
	deployStore.constructorArgs = [];
	deployStore.salt = ZERO_SALT;
	deployStore.selectedChain = fakeChain(1);
	deployStore.rpcUrl = 'https://rpc.example/1';
	deployStore.networkCheck = { ready: true, issues: [], gasBalance: null } as never;
	deployStore.serverStatus = 'connected';
	deployStore.deploying = false;
	deployStore.addressAlreadyDeployed = false;
	deployStore.updatePredictedAddress();
});

describe('salt validation (P2: valid-length-but-invalid-hex)', () => {
	it('a zero salt produces a predicted address and is deploy-ready', () => {
		expect(deployStore.predictedAddress).not.toBeNull();
		expect(deployStore.deployBlocker).toBeNull();
		expect(deployStore.canDeploy).toBe(true);
	});

	it('a 66-char NON-HEX salt nulls the predicted address (no confident-wrong addr)', () => {
		deployStore.salt = BAD_HEX_SALT;
		deployStore.updatePredictedAddress();
		expect(deployStore.predictedAddress).toBeNull();
	});

	it('a 66-char NON-HEX salt blocks deploy with a dedicated "salt" blocker', () => {
		deployStore.salt = BAD_HEX_SALT;
		deployStore.updatePredictedAddress();
		expect(deployStore.canDeploy).toBe(false);
		expect(deployStore.deployBlocker).toBe('salt');
	});

	it('a too-short salt is also rejected', () => {
		deployStore.salt = '0x00' as Hex;
		deployStore.updatePredictedAddress();
		expect(deployStore.predictedAddress).toBeNull();
		expect(deployStore.deployBlocker).toBe('salt');
	});
});

describe('rapid chain switch — stale network-check guard (P2 race)', () => {
	it('drops a late check result for a chain the user has since switched away from', async () => {
		// Start a readiness check for chain A (chainId 1).
		deployStore.networkCheck = null;
		const checkA = deployStore.runNetworkCheck();
		expect(H.pending.length).toBe(1);

		// User switches networks before A resolves → bumps the generation token
		// and clears the readiness state. changeNetwork() is a synchronous reset.
		deployStore.changeNetwork();
		expect(deployStore.networkCheck).toBeNull();

		// Now the SLOW chain-A check finally resolves with a (stale) "ready".
		H.pending[0]({ ready: true, issues: [], gasBalance: null });
		await checkA;

		// The stale result must NOT have been written onto the (now reset) state.
		expect(deployStore.networkCheck).toBeNull();
	});

	it('applies the result when no switch happened in between', async () => {
		deployStore.selectedChain = fakeChain(1);
		deployStore.rpcUrl = 'https://rpc.example/1';
		deployStore.networkCheck = null;
		const check = deployStore.runNetworkCheck();
		expect(H.pending.length).toBe(1);

		H.pending[0]({ ready: true, issues: [], gasBalance: null });
		await check;

		expect(deployStore.networkCheck).toEqual({ ready: true, issues: [], gasBalance: null });
	});

	it('a newer check (second token) still wins after an older one resolves late', async () => {
		deployStore.selectedChain = fakeChain(1);
		deployStore.rpcUrl = 'https://rpc.example/1';
		deployStore.networkCheck = null;

		// First (slow) check for chain A.
		const checkA = deployStore.runNetworkCheck();
		// User switches to chain B (bumps token) and a second check starts.
		deployStore.changeNetwork();
		deployStore.selectedChain = fakeChain(10);
		deployStore.rpcUrl = 'https://rpc.example/10';
		const checkB = deployStore.runNetworkCheck();
		expect(H.pending.length).toBe(2);

		// B (the current selection) resolves first → its result is applied.
		H.pending[1]({ ready: true, issues: [], gasBalance: 5n });
		await checkB;
		expect(deployStore.networkCheck).toEqual({ ready: true, issues: [], gasBalance: 5n });

		// A (stale) resolves later → must be ignored, leaving B's result intact.
		H.pending[0]({ ready: false, issues: ['stale!'], gasBalance: null });
		await checkA;
		expect(deployStore.networkCheck).toEqual({ ready: true, issues: [], gasBalance: 5n });
	});
});
