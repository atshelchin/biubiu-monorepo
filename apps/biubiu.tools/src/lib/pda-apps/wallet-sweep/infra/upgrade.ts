/**
 * Phase A — EIP-7702 delegation change (upgrade / revoke), broadcast by the
 * relayer as type-4 transactions.
 *
 * Per type-4 tx: a no-op top-level call (to = relayer, data = 0x) plus an
 * authorizationList of one signed authorization per EOA. The authorizations
 * apply first (installing or clearing the delegation), then the no-op runs.
 * Chunked at network.maxBatchUpgrade and broadcast sequentially with explicit,
 * locally-incremented relayer nonces.
 */
import { type Address, type Hex, type SignedAuthorization } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { rpcCall } from '$lib/vela-chain-setup/contracts';
import { makeWalletClient } from './viem-chain.js';
import { waitForReceipt, chunk } from './tx-utils.js';
import {
	signEoaAuthorization,
	getDelegation,
	getPendingNonce,
	REVOKE_TARGET,
} from './authorizations.js';
import type { SweepNetwork, EoaKey, Delegation } from '../types.js';
import type { Relayer } from './relayer.js';

export interface DelegationPlan {
	/** Plain EOAs (no code) or EOAs delegated elsewhere — need (re)authorization. */
	toUpgrade: EoaKey[];
	/** Already delegated to OUR Sweeper — skip upgrade, still sweepable. */
	alreadyOurs: Address[];
	/** Addresses with real contract code — not sweepable EOAs. */
	contracts: Address[];
}

/** Classify each input EOA against our Sweeper to decide what needs upgrading. */
export async function planDelegations(
	rpcUrl: string,
	keys: EoaKey[],
	sweeper: Address,
): Promise<DelegationPlan> {
	const plan: DelegationPlan = { toUpgrade: [], alreadyOurs: [], contracts: [] };
	await Promise.all(
		keys.map(async (k) => {
			const d = await getDelegation(rpcUrl, k.address, sweeper);
			if (d === 'ours') plan.alreadyOurs.push(k.address);
			else if (d === 'contract') plan.contracts.push(k.address);
			else plan.toUpgrade.push(k); // 'none' | 'foreign' → (re)delegate to ours
		}),
	);
	return plan;
}

export type DelegationPhase = 'sign' | 'broadcast' | 'confirm' | 'verify' | 'chunk-done' | 'error';

export interface DelegationEvent {
	phase: DelegationPhase;
	chunkIndex: number;
	chunkTotal: number;
	txHash?: Hex;
	done?: Address[];
	failed?: { address: Address; error: string }[];
	message?: string;
}

export interface DelegationResult {
	succeeded: Address[];
	failed: { address: Address; error: string }[];
}

/**
 * Generic delegation-change runner used by both upgrade (target = Sweeper,
 * expect 'ours') and revoke (target = zero, expect 'none').
 */
export async function runDelegationChange(opts: {
	network: SweepNetwork;
	rpcUrl: string;
	relayer: Relayer;
	keys: EoaKey[];
	target: Address;
	sweeper: Address;
	expect: 'ours' | 'none';
	chunkSize?: number;
	onEvent?: (e: DelegationEvent) => void;
}): Promise<DelegationResult> {
	const { network, rpcUrl, relayer, keys, target, sweeper, expect, onEvent } = opts;
	const chainId = network.chainId;
	const size = opts.chunkSize ?? network.maxBatchUpgrade;

	const account = privateKeyToAccount(relayer.privateKey);
	const wallet = makeWalletClient(network, rpcUrl, account);

	let relayerNonce = await getPendingNonce(rpcUrl, relayer.address);

	const chunks = chunk(keys, size);
	const result: DelegationResult = { succeeded: [], failed: [] };

	for (let i = 0; i < chunks.length; i++) {
		const group = chunks[i];
		const emit = (phase: DelegationPhase, extra: Partial<DelegationEvent> = {}) =>
			onEvent?.({ phase, chunkIndex: i, chunkTotal: chunks.length, ...extra });

		try {
			emit('sign');
			const authList: SignedAuthorization[] = await Promise.all(
				group.map((k) => signEoaAuthorization(rpcUrl, k, target, chainId)),
			);

			// Explicit gas limit avoids flaky 7702 node estimation; the relayer is
			// only charged for gas USED (the limit is just an upfront ceiling).
			const gas = 21_000n + 60_000n * BigInt(group.length);

			emit('broadcast');
			const txHash = await wallet.sendTransaction({
				to: relayer.address,
				data: '0x',
				value: 0n,
				authorizationList: authList,
				nonce: relayerNonce,
				gas,
			});
			relayerNonce += 1;
			emit('broadcast', { txHash });

			await waitForReceipt(network, rpcUrl, txHash);
			emit('confirm', { txHash });

			// Verify each EOA reached the expected delegation state.
			emit('verify', { txHash });
			const done: Address[] = [];
			const failed: { address: Address; error: string }[] = [];
			await Promise.all(
				group.map(async (k) => {
					const d: Delegation = await getDelegation(rpcUrl, k.address, sweeper);
					const ok = expect === 'ours' ? d === 'ours' : d === 'none';
					if (ok) done.push(k.address);
					else
						failed.push({
							address: k.address,
							error: `unexpected state "${d}" (nonce drift?)`,
						});
				}),
			);
			result.succeeded.push(...done);
			result.failed.push(...failed);
			emit('chunk-done', { txHash, done, failed });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			const failed = group.map((k) => ({ address: k.address, error }));
			result.failed.push(...failed);
			emit('error', { failed, message: error });
		}
	}

	return result;
}

/** Phase A upgrade: delegate EOAs to our Sweeper. */
export function runUpgrade(opts: {
	network: SweepNetwork;
	rpcUrl: string;
	relayer: Relayer;
	keys: EoaKey[];
	sweeper: Address;
	onEvent?: (e: DelegationEvent) => void;
}): Promise<DelegationResult> {
	return runDelegationChange({ ...opts, target: opts.sweeper, expect: 'ours' });
}

/** Read the current relayer pending nonce (exposed for diagnostics). */
export async function relayerNonceOf(rpcUrl: string, relayer: Relayer): Promise<number> {
	const n = (await rpcCall(rpcUrl, 'eth_getTransactionCount', [relayer.address, 'pending'])) as string;
	return Number(BigInt(n));
}

export { REVOKE_TARGET };
