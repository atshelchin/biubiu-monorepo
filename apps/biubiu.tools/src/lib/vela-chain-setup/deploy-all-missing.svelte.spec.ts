/**
 * Regression test for the vela-chain-setup P2 finding (REVIEW-FINDINGS "deploy …"):
 *
 *   deployAllMissing() ignored the UI-scoped contract set and iterated EVERY
 *   non-external missing contract. The deploy page renders a live progress list
 *   over only `deployableContracts`, so the loop, the "Deploy all (N)" count, and
 *   `activeContractKey` could diverge from what the user saw — and a still-missing
 *   presigned-tx/nicks-method contract (no DEPLOYMENT_DATA entry) would throw in
 *   getDeployCalldata and abort the whole batch with a confusing error.
 *
 *   The fix gives deployAllMissing(keys?) an optional scoped key list; the page
 *   passes deployableContracts.map(c => c.key). This test proves that when keys
 *   are passed, ONLY those contracts are deployed (in order), and a non-scoped
 *   missing contract is never touched.
 *
 * deployContract (real RPC/tx) is spied so we exercise only the selection logic.
 * Runs in the browser project (the store uses Svelte 5 runes).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { velaSetupStore as store } from './store.svelte.js';
import { REQUIRED_CONTRACTS, type ContractStatus } from './contracts.js';

function statusFor(key: string, deployed: boolean): ContractStatus {
	return { key, def: REQUIRED_CONTRACTS[key], deployed, verified: deployed, mismatch: false };
}

let deploySpy: ReturnType<typeof vi.spyOn>;
let balanceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();

	// A funded deployer wallet + selected chain so deployAllMissing proceeds.
	store.deployerWallet = {
		address: '0x2222222222222222222222222222222222222222',
		privateKey: ('0x' + '11'.repeat(32)) as `0x${string}`
	} as never;
	store.selectedChain = { chainId: 1 } as never;
	store.p256Available = true;
	store.step = 'results';

	// Mix of methods, all missing:
	//   entryPoint        → arachnid-proxy  (scoped, deployable)
	//   safeSingleton     → safe-factory    (scoped, deployable)
	//   safe4337Module    → arachnid-proxy  (scoped, deployable)
	//   multicall3        → presigned-tx    (NOT in the scoped safe/entrypoint step)
	store.contractStatuses = [
		statusFor('entryPoint', false),
		statusFor('safeSingleton', false),
		statusFor('safe4337Module', false),
		statusFor('multicall3', false)
	];

	// Spy deployContract: mark the status deployed in-place (mirrors the real one)
	// and report success, without any network/tx.
	deploySpy = vi.spyOn(store, 'deployContract').mockImplementation(async (key: string) => {
		store.activeContractKey = key;
		const s = store.contractStatuses.find((c) => c.key === key);
		if (s) s.deployed = true;
		return true;
	});

	// Skip the post-batch balance refresh (network).
	balanceSpy = vi.spyOn(store, 'refreshDeployerBalance').mockResolvedValue(undefined);
});

afterEach(() => {
	deploySpy.mockRestore();
	balanceSpy.mockRestore();
	vi.useRealTimers();
});

/** Drive deployAllMissing to completion, flushing the 1500ms inter-deploy pauses. */
async function runToCompletion(promise: Promise<void>): Promise<void> {
	await vi.runAllTimersAsync();
	await promise;
}

describe('deployAllMissing — honors the UI-scoped key set (P2)', () => {
	it('deploys ONLY the passed scoped keys, never the unscoped presigned-tx contract', async () => {
		const scoped = ['entryPoint', 'safeSingleton', 'safe4337Module'];
		await runToCompletion(store.deployAllMissing(scoped));

		const deployedKeys = deploySpy.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(deployedKeys).toEqual(scoped); // exactly the scope, in order
		// The unscoped (presigned-tx) contract must NOT have been deployed.
		expect(deployedKeys).not.toContain('multicall3');
		expect(store.contractStatuses.find((c) => c.key === 'multicall3')?.deployed).toBe(false);
	});

	it('the deployed count matches the scoped list length, not all missing', async () => {
		const scoped = ['entryPoint'];
		await runToCompletion(store.deployAllMissing(scoped));
		expect(deploySpy).toHaveBeenCalledTimes(1);
		expect(deploySpy).toHaveBeenCalledWith('entryPoint');
	});

	it('already-deployed scoped keys are filtered out (no redundant deploy)', async () => {
		const ep = store.contractStatuses.find((c) => c.key === 'entryPoint')!;
		ep.deployed = true; // already done
		await runToCompletion(store.deployAllMissing(['entryPoint', 'safeSingleton']));
		const deployedKeys = deploySpy.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(deployedKeys).toEqual(['safeSingleton']);
	});

	it('falls back to ALL non-external missing when no keys are passed (legacy behavior)', async () => {
		await runToCompletion(store.deployAllMissing());
		const deployedKeys = deploySpy.mock.calls.map((c: unknown[]) => c[0] as string);
		// multicall3 is presigned-tx (non-external) → included in the fallback path.
		expect(deployedKeys).toContain('multicall3');
		expect(deployedKeys).toContain('entryPoint');
	});

	it('a scope with no deployable contracts is a no-op', async () => {
		await runToCompletion(store.deployAllMissing(['nonexistent-key']));
		expect(deploySpy).not.toHaveBeenCalled();
		expect(store.deploying).toBe(false);
	});
});
