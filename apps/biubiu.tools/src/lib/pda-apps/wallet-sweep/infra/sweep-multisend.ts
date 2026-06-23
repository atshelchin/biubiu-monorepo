/**
 * Phase B — the passkey Safe pulls assets from upgraded EOAs.
 *
 * For each upgraded EOA we encode a CALL to `eoa.sweep(dest, erc20s)` and pack
 * them via Safe MultiSend 1.4.1. The Safe delegatecalls MultiSend (operation=1),
 * so each EOA sees msg.sender == Safe == the Sweeper's immutable controller.
 * One MultiSend batch = one passkey fingerprint. Repeatable.
 *
 * Reuses token-sender's encodeMultiSend and the passkey sendContractCall path.
 */
import { type Address, type Hex, encodeFunctionData } from 'viem';
import { encodeMultiSend } from '$lib/pda-apps/token-sender/infra/multisend';
import type { SubTransaction } from '$lib/pda-apps/token-sender/types';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call';
import type { SendStatus } from '$lib/auth/safe-tx/send-token';
import { SWEEPER_ABI } from './sweeper-artifact.js';
import { chunk } from './tx-utils.js';
import { FEE_COLLECTOR } from './fee.js';
import type { SweepNetwork, SweepBatchRecord } from '../types.js';

/** Passkey wallet identity needed to drive sendContractCall. */
export interface SweepUser {
	safeAddress: Address;
	publicKey: string;
	credentialId: string;
	rpId: string;
}

/** Encode a single eoa.sweep(dest, erc20s) call. */
export function encodeSweepCall(dest: Address, erc20s: Address[]): Hex {
	return encodeFunctionData({ abi: SWEEPER_ABI, functionName: 'sweep', args: [dest, erc20s] });
}

/**
 * One MultiSend sub-tx per EOA: CALL eoa.sweep(dest, erc20s), value 0.
 * When `feeWei > 0`, the fee (native Safe → FEE_COLLECTOR) is prepended as the
 * first sub-tx — used for the first batch only.
 */
export function buildSweepSubTransactions(
	eoas: Address[],
	dest: Address,
	erc20s: Address[],
	feeWei = 0n,
): SubTransaction[] {
	const data = encodeSweepCall(dest, erc20s);
	const subs: SubTransaction[] = eoas.map((eoa) => ({ to: eoa, value: 0n, data }));
	if (feeWei > 0n) subs.unshift({ to: FEE_COLLECTOR, value: feeWei, data: '0x' });
	return subs;
}

/**
 * Default sweep batch size: each sweep() touches (erc20s + native) transfers,
 * so we shrink the per-batch EOA count as the token list grows to keep gas
 * bounded. Native-only → full maxBatchSweep.
 */
export function defaultSweepBatch(network: SweepNetwork, tokenCount: number): number {
	const transfersPerEoa = tokenCount + 1;
	return Math.max(1, Math.floor(network.maxBatchSweep / Math.max(1, transfersPerEoa)));
}

export interface SweepBatchEvent {
	index: number;
	total: number;
	count: number;
	status?: SendStatus;
	txHash?: string;
	explorerUrl?: string;
	error?: string;
}

/**
 * Run the sweep across all EOAs, chunked into MultiSend batches (one fingerprint
 * each). Returns a record per batch. A failed batch is recorded and the rest
 * continue (idempotent — re-running re-sweeps whatever is left).
 */
export async function runSweep(opts: {
	network: SweepNetwork;
	user: SweepUser;
	destination: Address;
	eoas: Address[];
	erc20s: Address[];
	/** Native fee (wei) charged once, prepended to the first batch. */
	feeWei?: bigint;
	chunkSize?: number;
	onBatch?: (e: SweepBatchEvent) => void;
}): Promise<SweepBatchRecord[]> {
	const { network, user, destination, eoas, erc20s, onBatch } = opts;
	const feeWei = opts.feeWei ?? 0n;
	const size = opts.chunkSize ?? defaultSweepBatch(network, erc20s.length);
	const batches = chunk(eoas, size);
	const records: SweepBatchRecord[] = [];

	for (let i = 0; i < batches.length; i++) {
		const group = batches[i];
		// Fee is charged once — only the first batch carries it.
		const subs = buildSweepSubTransactions(group, destination, erc20s, i === 0 ? feeWei : 0n);
		const data = encodeMultiSend(subs);

		try {
			const result = await sendContractCall({
				safeAddress: user.safeAddress,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: network.multiSendAddress,
				value: 0n,
				data,
				operation: 1, // DELEGATECALL into MultiSend
				network: network.slug,
				onStatus: (status) =>
					onBatch?.({ index: i, total: batches.length, count: group.length, status }),
			});

			const explorerUrl =
				result.explorerUrl ?? (result.txHash ? network.explorerTxUrl + result.txHash : undefined);

			if (result.success) {
				records.push({ index: i, count: group.length, txHash: result.txHash, explorerUrl, status: 'completed' });
				onBatch?.({ index: i, total: batches.length, count: group.length, txHash: result.txHash, explorerUrl });
			} else {
				records.push({ index: i, count: group.length, status: 'failed', error: result.error });
				onBatch?.({ index: i, total: batches.length, count: group.length, error: result.error });
			}
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			records.push({ index: i, count: group.length, status: 'failed', error });
			onBatch?.({ index: i, total: batches.length, count: group.length, error });
		}
	}

	return records;
}
