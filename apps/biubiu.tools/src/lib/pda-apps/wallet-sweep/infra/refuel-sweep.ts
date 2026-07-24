/**
 * Universal (non-7702) sweep — the contract-free fallback that works on ANY EVM
 * chain, including pre-Pectra / legacy ones that cannot delegate an EOA.
 *
 * The app holds every source EOA's private key, so we drain each one the boring
 * way: the relay sends it just-enough native gas (the shortfall only), then the
 * EOA — using its own key — sends one `transfer(dest, bal)` per ERC20 and finally
 * sweeps its remaining native to `dest`. Every action is "move current balance to
 * dest", so a re-run re-reads balances and finishes whatever was interrupted —
 * idempotent by construction.
 *
 * Hazards this file is built around (all from the design review):
 *  - Bricking on a base-fee spike between refuel and self-send → every tx PINS its
 *    fee fields (gas.ts). A transfer can never overrun `gas·cap`; it just waits.
 *  - Nonce corruption → the relay refuel leg is SERIAL on one monotonic counter;
 *    each EOA seeds its nonce once and local-increments; native is strictly last.
 *  - Legacy vs 1559 → fee mode detected once, matching fields built everywhere.
 *  - Fee bypass by under-funding → the fee is charged after the FIRST real drain
 *    and, if it fails to confirm, the run stops (it is not silently skippable).
 *  - Discarding a still-funded key → `drainedAddress` is emitted ONLY after a
 *    fresh post-drain balance confirms the EOA is ~empty.
 */
import { type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { makeWalletClient } from './viem-chain.js';
import { getBalance, getPendingNonce } from './rpc.js';
import { waitForReceipt, chunk, mapLimit } from './tx-utils.js';
import { encodeErc20Transfer } from './erc20-transfer.js';
import {
	detectFeeMode,
	quoteFees,
	nativeReserveFor,
	perEoaGasCost,
	refuelValue,
	nativeReserve,
	nativeReclaim,
	type FeeQuote,
	G_ERC20,
	G_NATIVE,
	G_REFUEL,
	REFUEL_BATCH,
	DRAIN_CONCURRENCY,
} from './gas.js';
import { FEE_COLLECTOR } from './fee.js';
import type { SweepNetwork, EoaKey, SweepBatchRecord, SweepEvent } from '../types.js';
import type { EoaBalances } from './balances.js';
import type { Relayer } from './relayer.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll the read RPCs until `addr` holds at least `min` (defeats cross-RPC lag). */
async function waitBalanceAtLeast(rpcs: string[], addr: Address, min: bigint): Promise<void> {
	for (let i = 0; i < 20; i++) {
		if ((await getBalance(rpcs, addr)) >= min) return;
		await sleep(500);
	}
}

/** Per-EOA plan computed in the refuel phase and reused (same cap) in the drain phase. */
interface EoaPlan {
	key: EoaKey;
	/** nonzero selected tokens on this EOA (amount by lowercased address). */
	tokenAmounts: { token: Address; amount: bigint }[];
	/** Fee quote used to size the refuel — reused for the token txs so they can't underfund. */
	quote: FeeQuote;
	/** Refuel tx (null when the EOA already held enough gas). */
	refuelTx: Hex | null;
	/** True when there is nothing worth sweeping (skipped entirely). */
	skip: boolean;
	/** Min native the EOA needs to cover its own token+native gas. */
	perEoaGasCost: bigint;
}

export interface RunRefuelOpts {
	network: SweepNetwork;
	rpcs: string[];
	relay: Relayer;
	keys: EoaKey[];
	balances: EoaBalances[];
	dest: Address;
	erc20s: Address[];
	feeWei: bigint;
	/** Fee already collected this session (persisted marker) → skip charging again. */
	feeAlreadyPaid: boolean;
	/** Called with the fee tx hash once it confirms, so the store can persist it. */
	onFeePaid?: (txHash: Hex) => void;
	onEvent?: (e: SweepEvent) => void;
}

export async function runRefuelSweep(opts: RunRefuelOpts): Promise<SweepBatchRecord[]> {
	const { network, rpcs, relay, keys, balances, dest, erc20s, feeWei, feeAlreadyPaid, onFeePaid, onEvent } = opts;

	const mode = await detectFeeMode(network, rpcs);
	const nativeReserveWei = nativeReserveFor(network);
	const balByAddr = new Map(balances.map((b) => [b.address.toLowerCase(), b]));

	const relayAccount = privateKeyToAccount(relay.privateKey);
	const relayWallet = makeWalletClient(network, rpcs, relayAccount);
	// Relay nonce: seed ONCE, monotonic, only ever incremented in serial sections.
	let relayNonce = await getPendingNonce(rpcs, relay.address);

	// index 0 = the fee marker record (count 0). Batch records are index 1..B, so
	// `feeNowPaid` (index-0 completed) means the fee actually confirmed on this path.
	const records: SweepBatchRecord[] = [{ index: 0, count: 0, status: feeAlreadyPaid ? 'completed' : 'failed' }];
	let feePaid = feeAlreadyPaid;

	const batches = chunk(keys, REFUEL_BATCH);
	let eoaSeen = 0;

	const emit = (e: Partial<SweepEvent> & { phase: SweepEvent['phase']; chunkIndex: number }) =>
		onEvent?.({ chunkTotal: batches.length, ...e } as SweepEvent);

	// ── charge the service fee once, gated on a real drain (relay-serial, awaited) ──
	const chargeFee = async (chunkIndex: number): Promise<boolean> => {
		if (feePaid || feeWei <= 0n) return true;
		const q = await quoteFees(rpcs, mode);
		const feeTx = await relayWallet.sendTransaction({
			to: FEE_COLLECTOR,
			value: feeWei,
			nonce: relayNonce++,
			gas: G_REFUEL,
			...q.fields,
		});
		const rec = await waitForReceipt(network, rpcs, feeTx);
		if (rec.status !== 'success') {
			records[0] = { index: 0, count: 0, txHash: feeTx, status: 'failed' };
			emit({ phase: 'error', chunkIndex, message: 'Service fee payment failed — run stopped' });
			return false;
		}
		feePaid = true;
		records[0] = { index: 0, count: 0, txHash: feeTx, status: 'completed' };
		onFeePaid?.(feeTx);
		return true;
	};

	// ── drain a single EOA: tokens (sequential) then native (last, fresh reserve) ──
	const drainEoa = async (plan: EoaPlan, chunkIndex: number): Promise<boolean> => {
		const { key, tokenAmounts, quote } = plan;
		if (plan.skip) return false;
		const account = privateKeyToAccount(key.privateKey);
		const wallet = makeWalletClient(network, rpcs, account);
		let moved = false;
		try {
			let nonce = await getPendingNonce(rpcs, key.address); // seed once, advance only on a real broadcast
			const tokenTxs: Hex[] = [];
			for (const { token, amount } of tokenAmounts) {
				try {
					const tx = await wallet.sendTransaction({
						to: token,
						data: encodeErc20Transfer(dest, amount),
						nonce,
						gas: G_ERC20,
						...quote.fields,
					});
					tokenTxs.push(tx);
					nonce++; // advance ONLY on a successful broadcast → no nonce gap on a rejected send
				} catch {
					// best-effort: one bad token (reverting / non-standard) never aborts the EOA;
					// nonce is left unchanged so the next token / the native leg reuses this slot.
				}
			}
			for (const tx of tokenTxs) {
				try {
					await waitForReceipt(network, rpcs, tx);
					moved = true;
				} catch {
					// receipt timeout — self-heals on a re-run (balance is re-read)
				}
			}

			// native LAST — fresh price + fresh balance, exact reserve
			const q2 = await quoteFees(rpcs, mode);
			const reserve = nativeReserve(q2.cap, nativeReserveWei, G_NATIVE);
			const balF = await getBalance(rpcs, key.address);
			const value = nativeReclaim(balF, q2.cap, nativeReserveWei, G_NATIVE);
			if (value > 0n) {
				const tx = await wallet.sendTransaction({
					to: dest,
					value,
					nonce,
					gas: G_NATIVE,
					...q2.fields,
				});
				await waitForReceipt(network, rpcs, tx);
				moved = true;
			}
			// verifiedEmpty: only NOW is the key safe to discard.
			if ((await getBalance(rpcs, key.address)) <= reserve) {
				emit({ phase: 'drain', chunkIndex, eoaAddress: key.address, eoaIndex: ++eoaSeen, eoaTotal: keys.length, leg: 'native', drainedAddress: key.address });
			} else {
				emit({ phase: 'drain', chunkIndex, eoaAddress: key.address, eoaIndex: ++eoaSeen, eoaTotal: keys.length, leg: 'native' });
			}
		} catch (e) {
			emit({ phase: 'error', chunkIndex, eoaAddress: key.address, message: e instanceof Error ? e.message : String(e) });
		}
		return moved;
	};

	for (let b = 0; b < batches.length; b++) {
		const batch = batches[b];

		// ── Phase A: plan + refuel the batch, SERIAL on the relay nonce ──
		emit({ phase: 'refuel', chunkIndex: b, count: batch.length });
		const plans: EoaPlan[] = [];
		for (const key of batch) {
			const bal = balByAddr.get(key.address.toLowerCase());
			const bal0 = bal?.native ?? (await getBalance(rpcs, key.address));
			const tokenAmounts = erc20s
				.map((token) => ({ token, amount: bal?.tokens[token.toLowerCase()] ?? 0n }))
				.filter((t) => t.amount > 0n);
			const q = await quoteFees(rpcs, mode);
			const gasCost = perEoaGasCost(tokenAmounts.length, q.cap, G_NATIVE);

			// Nothing worth sweeping: no tokens and native below one reclaim's own cost.
			if (tokenAmounts.length === 0 && bal0 < G_NATIVE * q.cap) {
				plans.push({ key, tokenAmounts, quote: q, refuelTx: null, skip: true, perEoaGasCost: gasCost });
				continue;
			}
			const value = refuelValue(tokenAmounts.length, bal0, q.cap, G_NATIVE);
			let refuelTx: Hex | null = null;
			if (value > 0n) {
				refuelTx = await relayWallet.sendTransaction({
					to: key.address,
					value,
					nonce: relayNonce++,
					gas: G_REFUEL,
					...q.fields,
				});
			}
			plans.push({ key, tokenAmounts, quote: q, refuelTx, skip: false, perEoaGasCost: gasCost });
		}

		// barrier: refuel receipts + balance propagation before any self-send
		await mapLimit(plans, DRAIN_CONCURRENCY, async (p) => {
			if (!p.refuelTx) return;
			try {
				await waitForReceipt(network, rpcs, p.refuelTx);
				await waitBalanceAtLeast(rpcs, p.key.address, p.perEoaGasCost);
			} catch {
				// refuel receipt lag — the drain re-reads balance and self-heals
			}
		});

		// ── Phase B: drain the batch. Gate the fee on the first real drain. ──
		emit({ phase: 'drain', chunkIndex: b, count: batch.length });
		if (!feePaid && feeWei > 0n) {
			// Sequentially drain until one EOA actually moves funds, then charge the
			// fee (a wholly front-run/empty batch is never charged). Then parallelize.
			let i = 0;
			let charged = false;
			for (; i < plans.length; i++) {
				const moved = await drainEoa(plans[i], b);
				if (moved) {
					const ok = await chargeFee(b);
					if (!ok) {
						// fee failed → stop: funds already moved for this one EOA (to the
						// user's dest); a re-run resumes the rest once the fee clears.
						records.push({ index: b + 1, count: i + 1, status: 'failed' });
						return records;
					}
					charged = true;
					i++;
					break;
				}
			}
			if (charged) await mapLimit(plans.slice(i), DRAIN_CONCURRENCY, (p) => drainEoa(p, b));
		} else {
			await mapLimit(plans, DRAIN_CONCURRENCY, (p) => drainEoa(p, b));
		}

		records.push({ index: b + 1, count: batch.length, status: 'completed' });
		emit({ phase: 'chunk-done', chunkIndex: b, count: batch.length });
	}

	return records;
}
