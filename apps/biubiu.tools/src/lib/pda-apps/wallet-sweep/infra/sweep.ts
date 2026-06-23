/**
 * v2 sweep — the relay does upgrade + sweep in ONE type-4 transaction per chunk.
 *
 * Per chunk: sign 7702 authorizations for the EOAs that still need delegating
 * (skip already-ours), then send a type-4 tx to BatchSweeper.sweepMany(...).
 * The authorizations apply first (EOAs → Sweeper), then sweepMany loops
 * `eoa.sweep(dest, erc20s)`; each Sweeper checks tx.origin == relay. The service
 * fee rides as msg.value on the FIRST chunk and BatchSweeper forwards it.
 *
 * Re-sweep is the same call with no authorizations (EOAs already delegated).
 */
import { type Address, type Hex, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { makeWalletClient } from './viem-chain.js';
import { getPendingNonce } from './rpc.js';
import { waitForReceipt, chunk, mapLimit } from './tx-utils.js';
import { signEoaAuthorization, getDelegation } from './authorizations.js';
import { predictBatchSweeperAddress } from './sweeper-address.js';
import { BATCHSWEEPER_ABI } from './batchsweeper-artifact.js';
import { FEE_COLLECTOR } from './fee.js';
import type { SweepNetwork, EoaKey, SweepBatchRecord } from '../types.js';
import type { Relayer } from './relayer.js';

const RPC_CONCURRENCY = 12;

export function encodeSweepMany(
	eoas: Address[],
	dest: Address,
	erc20s: Address[],
	feeCollector: Address,
): Hex {
	return encodeFunctionData({
		abi: BATCHSWEEPER_ABI,
		functionName: 'sweepMany',
		args: [eoas, dest, erc20s, feeCollector],
	});
}

export interface SweepPlan {
	/** Will be swept (none / foreign / ours). none+foreign need (re)authorization. */
	sweepable: EoaKey[];
	/** Real contracts — not sweepable EOAs. */
	contracts: Address[];
}

/** Classify input keys against the relay's Sweeper. */
export async function planSweep(
	rpcs: string[],
	keys: EoaKey[],
	sweeperAddr: Address,
): Promise<SweepPlan> {
	const plan: SweepPlan = { sweepable: [], contracts: [] };
	await mapLimit(keys, RPC_CONCURRENCY, async (k) => {
		const d = await getDelegation(rpcs, k.address, sweeperAddr);
		if (d === 'contract') plan.contracts.push(k.address);
		else plan.sweepable.push(k);
	});
	return plan;
}

export type SweepPhase = 'sign' | 'broadcast' | 'confirm' | 'chunk-done' | 'error';
export interface SweepEvent {
	phase: SweepPhase;
	chunkIndex: number;
	chunkTotal: number;
	txHash?: Hex;
	count?: number;
	message?: string;
}

export async function runSweep(opts: {
	network: SweepNetwork;
	rpcs: string[];
	relay: Relayer;
	keys: EoaKey[];
	sweeperAddr: Address;
	dest: Address;
	erc20s: Address[];
	feeWei: bigint;
	onEvent?: (e: SweepEvent) => void;
}): Promise<SweepBatchRecord[]> {
	const { network, rpcs, relay, keys, sweeperAddr, dest, erc20s, feeWei, onEvent } = opts;
	const chainId = network.chainId;
	const batchSweeper = predictBatchSweeperAddress();
	const account = privateKeyToAccount(relay.privateKey);
	const wallet = makeWalletClient(network, rpcs, account);

	let relayerNonce = await getPendingNonce(rpcs, relay.address);
	const chunks = chunk(keys, network.maxBatchUpgrade);
	const records: SweepBatchRecord[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const group = chunks[i];
		const emit = (phase: SweepPhase, extra: Partial<SweepEvent> = {}) =>
			onEvent?.({ phase, chunkIndex: i, chunkTotal: chunks.length, ...extra });

		try {
			emit('sign');
			// Only EOAs not already delegated to our Sweeper need an authorization.
			const maybe = await mapLimit(group, RPC_CONCURRENCY, async (k) => {
				const d = await getDelegation(rpcs, k.address, sweeperAddr);
				return d === 'ours' ? null : k;
			});
			const toAuth = maybe.filter((k): k is EoaKey => k !== null);
			const authList = await mapLimit(toAuth, RPC_CONCURRENCY, (k) =>
				signEoaAuthorization(rpcs, k, sweeperAddr, chainId),
			);

			const eoaAddrs = group.map((k) => k.address);
			const data = encodeSweepMany(eoaAddrs, dest, erc20s, FEE_COLLECTOR);
			const value = i === 0 ? feeWei : 0n;

			// Explicit gas (7702 node estimation is unreliable); generous, the relay
			// is only charged for gas used.
			const perEoa = 45_000n + 40_000n * BigInt(erc20s.length);
			const gas = 60_000n + perEoa * BigInt(group.length) + 30_000n * BigInt(toAuth.length);

			emit('broadcast');
			const txHash = await wallet.sendTransaction({
				to: batchSweeper,
				data,
				value,
				nonce: relayerNonce,
				gas,
				...(authList.length ? { authorizationList: authList } : {}),
			});
			relayerNonce += 1;
			emit('broadcast', { txHash });

			await waitForReceipt(network, rpcs, txHash);
			records.push({
				index: i,
				count: group.length,
				txHash,
				explorerUrl: network.explorerTxUrl + txHash,
				status: 'completed',
			});
			emit('chunk-done', { txHash, count: group.length });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			records.push({ index: i, count: group.length, status: 'failed', error });
			emit('error', { message: error });
		}
	}

	return records;
}
