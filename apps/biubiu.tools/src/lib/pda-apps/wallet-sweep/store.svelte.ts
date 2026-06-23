/**
 * Wallet Sweep — wizard store (Svelte 5 runes class).
 *
 * Orchestrates the two-phase flow:
 *   A) upgrade EOAs to the Sweeper delegate (relayer broadcasts type-4 txs)
 *   B) the passkey Safe sweeps native + ERC20 from all of them (one fingerprint)
 *
 * Private keys live only in this store's memory + the signing path; they are
 * NEVER written to localStorage or sent anywhere. Only the throwaway relayer key
 * (relayer.ts) and address-level history (sweep-history.ts) are persisted.
 */
import { type Address, type Hex } from 'viem';
import { authStore } from '$lib/auth/auth-store.svelte';
import { subscriptionStore } from '$lib/subscription';
import { quoteSweepFee, type FeeQuote } from './infra/fee.js';
import type {
	SweepNetwork,
	NetworkReadiness,
	EoaKey,
	TokenSpec,
	Phase,
	RunStage,
	SweepRecord,
	SweepBatchRecord,
} from './types.js';
import { listNetworks, getNetwork, probeNetwork, pickWorkingRpc } from './infra/networks.js';
import { parsePrivateKey, dedupeKeys } from './infra/authorizations.js';
import { predictSweeperAddress } from './infra/sweeper-address.js';
import { fetchBalances, type EoaBalances } from './infra/balances.js';
import { fetchTokenMetadata, isValidTokenAddress } from './infra/erc20.js';
import {
	getOrCreateRelayer,
	loadRelayer,
	clearRelayer,
	relayerBalance,
	estimateUpgradeCostWei,
	downloadRelayerKey,
	type Relayer,
} from './infra/relayer.js';
import { ensureSweeper, isSweeperDeployed } from './infra/deploy-sweeper.js';
import { planDelegations, runUpgrade, type DelegationPlan, type DelegationEvent } from './infra/upgrade.js';
import { runRevoke } from './infra/revoke.js';
import { runSweep, defaultSweepBatch, type SweepUser, type SweepBatchEvent } from './infra/sweep-multisend.js';
import { fundRelayerFromSafe } from './infra/fund-relayer.js';
import { putSweep, listSweeps, deleteSweep } from './history/sweep-history.js';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogEntry {
	ts: number;
	level: LogLevel;
	msg: string;
}

export class WalletSweepStore {
	// ─── wizard ───
	phase = $state<Phase>('config');
	includeTestnets = $state(false);

	// ─── network ───
	networkSlug = $state<string | null>(null);
	readiness = $state<Record<string, NetworkReadiness>>({});
	probing = $state(false);
	private rpcCache: Record<string, string> = {};

	// ─── keys (in-memory only) ───
	keys = $state<EoaKey[]>([]);
	parseStats = $state({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
	parsing = $state(false);

	// ─── tokens + destination ───
	tokens = $state<TokenSpec[]>([]);
	destination = $state('');
	addingToken = $state(false);
	addTokenError = $state<string | null>(null);

	// ─── preview ───
	balances = $state<EoaBalances[]>([]);
	balancesLoading = $state(false);
	plan = $state<DelegationPlan | null>(null);
	fee = $state<FeeQuote | null>(null);

	// ─── relayer / funding ───
	relayer = $state<Relayer | null>(null);
	relayerBal = $state(0n);
	fundNeeded = $state(0n);
	needSweeperDeploy = $state(false);
	funding = $state(false);

	// ─── run (merged fund + upgrade + sweep) ───
	runStage = $state<RunStage>('idle');
	upgrading = $state(false);
	upgradeProgress = $state<{ chunk: number; total: number; done: number } | null>(null);
	private upgradedSet = $state<Set<string>>(new Set());

	// ─── sweep ───
	sweeping = $state(false);
	sweepRecords = $state<SweepBatchRecord[]>([]);

	// ─── revoke ───
	revoking = $state(false);

	// ─── misc ───
	history = $state<SweepRecord[]>([]);
	logs = $state<LogEntry[]>([]);
	error = $state<string | null>(null);

	// ─── derived ───
	get networks(): SweepNetwork[] {
		return listNetworks({ includeTestnets: this.includeTestnets });
	}
	get network(): SweepNetwork | null {
		return this.networkSlug ? (getNetwork(this.networkSlug) ?? null) : null;
	}
	get user(): SweepUser | null {
		const u = authStore.user;
		if (!u) return null;
		return {
			safeAddress: u.safeAddress as Address,
			publicKey: u.publicKey,
			credentialId: u.credentialId,
			rpId: u.rpId,
		};
	}
	get sweeperAddress(): Address | null {
		const u = this.user;
		return u ? predictSweeperAddress(u.safeAddress) : null;
	}
	get isMember(): boolean {
		return subscriptionStore.isPremium;
	}
	get erc20Addresses(): Address[] {
		return this.tokens.filter((t) => t.kind === 'erc20' && t.address).map((t) => t.address as Address);
	}
	get destinationValid(): boolean {
		return isValidTokenAddress(this.destination);
	}
	/** EOAs currently delegated to our Sweeper (already-ours + freshly upgraded). */
	get upgradedAddresses(): Address[] {
		return this.keys.map((k) => k.address).filter((a) => this.upgradedSet.has(a.toLowerCase()));
	}
	/** Upgraded EOAs that actually hold something worth sweeping. */
	get sweepableAddresses(): Address[] {
		const byAddr = new Map(this.balances.map((b) => [b.address.toLowerCase(), b]));
		return this.upgradedAddresses.filter((a) => {
			const b = byAddr.get(a.toLowerCase());
			if (!b) return true; // unknown balance → include (will no-op if empty)
			if (b.native > 0n) return true;
			return Object.values(b.tokens).some((v) => v > 0n);
		});
	}
	get totalNative(): bigint {
		return this.balances.reduce((s, b) => s + b.native, 0n);
	}
	totalForToken(tokenAddr: Address): bigint {
		const key = tokenAddr.toLowerCase();
		return this.balances.reduce((s, b) => s + (b.tokens[key] ?? 0n), 0n);
	}

	// ─── logging ───
	log(msg: string, level: LogLevel = 'info') {
		this.logs = [...this.logs, { ts: Date.now(), level, msg }].slice(-200);
	}
	private fail(e: unknown, context: string) {
		const m = e instanceof Error ? e.message : String(e);
		this.error = `${context}: ${m}`;
		this.log(this.error, 'error');
	}

	// ─── network actions ───
	selectNetwork(slug: string) {
		this.networkSlug = slug;
		this.error = null;
		void this.probe(slug);
	}

	async probe(slug: string) {
		const net = getNetwork(slug);
		if (!net) return;
		this.probing = true;
		try {
			const r = await probeNetwork(net);
			this.readiness = { ...this.readiness, [slug]: r };
		} finally {
			this.probing = false;
		}
	}

	async probeAll() {
		this.probing = true;
		try {
			const results = await Promise.all(this.networks.map((n) => probeNetwork(n)));
			const next: Record<string, NetworkReadiness> = { ...this.readiness };
			for (const r of results) next[r.slug] = r;
			this.readiness = next;
		} finally {
			this.probing = false;
		}
	}

	private async resolveRpc(net: SweepNetwork): Promise<string> {
		if (this.rpcCache[net.slug]) return this.rpcCache[net.slug];
		const rpc = await pickWorkingRpc(net.rpcs, net.chainId);
		if (!rpc) throw new Error(`No reachable RPC for ${net.name}`);
		this.rpcCache[net.slug] = rpc;
		return rpc;
	}

	// ─── keys ───
	async setKeys(text: string) {
		this.parsing = true;
		try {
			const lines = text
				.split(/[\s,]+/)
				.map((l) => l.trim())
				.filter(Boolean);
			const parsed: EoaKey[] = [];
			let invalid = 0;
			// Batched to keep the UI responsive on large pastes.
			for (let i = 0; i < lines.length; i++) {
				const k = parsePrivateKey(lines[i]);
				if (k) parsed.push(k);
				else invalid++;
				if (i % 500 === 0) await Promise.resolve();
			}
			const deduped = dedupeKeys(parsed);
			this.keys = deduped;
			this.parseStats = {
				total: lines.length,
				valid: deduped.length,
				invalid,
				duplicates: parsed.length - deduped.length,
			};
		} finally {
			this.parsing = false;
		}
	}

	// ─── tokens ───
	async addTokenByAddress(addr: string) {
		const net = this.network;
		if (!net) return;
		this.addTokenError = null;
		if (!isValidTokenAddress(addr)) {
			this.addTokenError = 'Invalid token address';
			return;
		}
		if (this.tokens.some((t) => t.address?.toLowerCase() === addr.toLowerCase())) {
			this.addTokenError = 'Token already added';
			return;
		}
		this.addingToken = true;
		try {
			const rpc = await this.resolveRpc(net);
			const meta = await fetchTokenMetadata(net, rpc, addr as Address);
			this.tokens = [...this.tokens, meta];
		} catch (e) {
			this.addTokenError = e instanceof Error ? e.message : 'Failed to read token';
		} finally {
			this.addingToken = false;
		}
	}
	removeToken(addr?: Address) {
		this.tokens = this.tokens.filter((t) => t.address !== addr);
	}

	// ─── preflight → run ───
	async preflight() {
		const net = this.network;
		const sweeper = this.sweeperAddress;
		if (!net || !sweeper) {
			this.error = 'Select a network and connect your passkey first';
			return;
		}
		if (this.keys.length === 0) {
			this.error = 'Add at least one private key';
			return;
		}
		if (!this.destinationValid) {
			this.error = 'Enter a valid destination address';
			return;
		}
		this.error = null;
		this.balancesLoading = true;
		try {
			const rpc = await this.resolveRpc(net);
			const addresses = this.keys.map((k) => k.address);
			const [balances, plan] = await Promise.all([
				fetchBalances(net, rpc, addresses, this.erc20Addresses),
				planDelegations(rpc, this.keys, sweeper),
			]);
			this.balances = balances;
			this.plan = plan;
			// Seed upgraded set with already-ours.
			const set = new Set(this.upgradedSet);
			for (const a of plan.alreadyOurs) set.add(a.toLowerCase());
			this.upgradedSet = set;

			this.needSweeperDeploy = !(await isSweeperDeployed(rpc, sweeper));
			this.fundNeeded = await estimateUpgradeCostWei(rpc, plan.toUpgrade.length, this.needSweeperDeploy);

			// Fee (identical policy to token-sender): member-free → $5-equiv → fallback.
			this.fee = await quoteSweepFee(net, this.isMember);

			if (plan.contracts.length) {
				this.log(`${plan.contracts.length} address(es) have contract code and will be skipped`, 'warn');
			}
			this.log(
				`Preflight: ${plan.toUpgrade.length} to upgrade, ${plan.alreadyOurs.length} already upgraded`,
				'ok',
			);

			// Prepare the relayer so the merged "Run" step has funding ready.
			this.relayer = loadRelayer(net.slug) ?? getOrCreateRelayer(net.slug);
			await this.refreshRelayerBalance();

			this.phase = 'run';
		} catch (e) {
			this.fail(e, 'Preflight failed');
		} finally {
			this.balancesLoading = false;
		}
	}

	// ─── relayer / funding ───
	async refreshRelayerBalance() {
		const net = this.network;
		if (!net || !this.relayer) return;
		try {
			const rpc = await this.resolveRpc(net);
			this.relayerBal = await relayerBalance(rpc, this.relayer.address);
		} catch (e) {
			this.fail(e, 'Relayer balance');
		}
	}
	get relayerFunded(): boolean {
		return this.relayerBal >= this.fundNeeded;
	}
	async fundFromSafe() {
		const net = this.network;
		const user = this.user;
		if (!net || !user || !this.relayer) return;
		this.funding = true;
		this.error = null;
		try {
			// Send a little extra (10%) to cover fee fluctuation.
			const amount = (this.fundNeeded * 11n) / 10n;
			const res = await fundRelayerFromSafe({
				network: net,
				user,
				relayerAddress: this.relayer.address,
				amountWei: amount,
				onStatus: (s) => this.log(`Fund relayer: ${s}`),
			});
			if (!res.success) throw new Error(res.error ?? 'fund failed');
			this.log('Relayer funded from Safe', 'ok');
			await this.refreshRelayerBalance();
		} catch (e) {
			this.fail(e, 'Auto-fund failed');
		} finally {
			this.funding = false;
		}
	}
	downloadRelayer() {
		if (this.relayer && this.network) downloadRelayerKey(this.relayer, this.network.slug);
	}

	// ─── The single "Run" action: fund (if needed) → upgrade → sweep ───
	get running(): boolean {
		return this.runStage !== 'idle';
	}
	/** Primary button on the Run step. Auto-funds from the Safe when needed. */
	async proceed() {
		if (this.running) return;
		if (!this.relayerFunded) {
			await this.fundFromSafe();
			if (!this.relayerFunded) return; // funding failed / manual needed
		}
		await this.runAll();
	}
	/** Deploy (if needed) → upgrade → sweep, back to back. */
	async runAll() {
		const ok = await this._runUpgrade();
		if (ok) await this._runSweep();
		if (!this.error) this.phase = 'done';
		this.runStage = 'idle';
	}

	private async _runUpgrade(): Promise<boolean> {
		const net = this.network;
		const user = this.user;
		const sweeper = this.sweeperAddress;
		if (!net || !user || !sweeper || !this.relayer || !this.plan) return false;
		this.error = null;
		try {
			const rpc = await this.resolveRpc(net);

			if (this.needSweeperDeploy) {
				this.runStage = 'deploying';
				this.log('Deploying your Sweeper contract…');
				const dr = await ensureSweeper(net, rpc, this.relayer, user.safeAddress);
				this.log(`Sweeper ready at ${dr.address}`, 'ok');
				this.needSweeperDeploy = false;
			}

			const toUpgrade = this.plan.toUpgrade;
			if (toUpgrade.length === 0) {
				this.log('Nothing to upgrade — all EOAs already delegated', 'ok');
				return true;
			}
			this.runStage = 'upgrading';
			this.upgrading = true;
			this.upgradeProgress = { chunk: 0, total: Math.ceil(toUpgrade.length / net.maxBatchUpgrade), done: 0 };
			const result = await runUpgrade({
				network: net,
				rpcUrl: rpc,
				relayer: this.relayer,
				keys: toUpgrade,
				sweeper,
				onEvent: (e: DelegationEvent) => this.onUpgradeEvent(e),
			});
			const set = new Set(this.upgradedSet);
			for (const a of result.succeeded) set.add(a.toLowerCase());
			this.upgradedSet = set;
			this.log(`Upgraded ${result.succeeded.length}/${toUpgrade.length}`, result.failed.length ? 'warn' : 'ok');
			for (const f of result.failed.slice(0, 5)) this.log(`Failed ${f.address}: ${f.error}`, 'error');
			return true;
		} catch (e) {
			this.fail(e, 'Upgrade failed');
			return false;
		} finally {
			this.upgrading = false;
			this.upgradeProgress = null;
		}
	}

	private onUpgradeEvent(e: DelegationEvent) {
		if (e.phase === 'broadcast' && e.txHash) {
			this.log(`Upgrade batch ${e.chunkIndex + 1}/${e.chunkTotal} broadcast: ${e.txHash.slice(0, 10)}…`);
		} else if (e.phase === 'chunk-done') {
			const done = (this.upgradeProgress?.done ?? 0) + (e.done?.length ?? 0);
			this.upgradeProgress = { chunk: e.chunkIndex + 1, total: e.chunkTotal, done };
		} else if (e.phase === 'error') {
			this.log(`Batch ${e.chunkIndex + 1} error: ${e.message}`, 'error');
		}
	}

	/** Re-sweep upgraded EOAs (e.g. after funds re-arrive). Used from "Done". */
	async sweepAgain() {
		if (this.running) return;
		await this._runSweep();
		this.runStage = 'idle';
	}

	// ─── Phase B: sweep ───
	private async _runSweep() {
		const net = this.network;
		const user = this.user;
		if (!net || !user) return;
		const dest = this.destination as Address;
		const eoas = this.sweepableAddresses;
		if (eoas.length === 0) {
			this.log('No upgraded EOAs with a balance to sweep', 'warn');
			return;
		}
		this.runStage = 'sweeping';
		this.sweeping = true;
		this.error = null;
		this.sweepRecords = [];
		try {
			const records = await runSweep({
				network: net,
				user,
				destination: dest,
				eoas,
				erc20s: this.erc20Addresses,
				feeWei: this.fee?.amount ?? 0n,
				chunkSize: defaultSweepBatch(net, this.erc20Addresses.length),
				onBatch: (e: SweepBatchEvent) => this.onSweepBatch(e),
			});
			this.sweepRecords = records;
			await this.saveHistory(records, dest);
			const ok = records.filter((r) => r.status === 'completed').length;
			this.log(`Swept ${ok}/${records.length} batches`, ok === records.length ? 'ok' : 'warn');
			void this.loadHistory();
		} catch (e) {
			this.fail(e, 'Sweep failed');
		} finally {
			this.sweeping = false;
		}
	}

	private onSweepBatch(e: SweepBatchEvent) {
		if (e.status) this.log(`Batch ${e.index + 1}/${e.total}: ${e.status}`);
		else if (e.txHash) this.log(`Batch ${e.index + 1}/${e.total} confirmed: ${e.txHash.slice(0, 10)}…`, 'ok');
		else if (e.error) this.log(`Batch ${e.index + 1}/${e.total} failed: ${e.error}`, 'error');
	}

	private async saveHistory(records: SweepBatchRecord[], dest: Address) {
		const net = this.network!;
		const totalTokens: Record<string, string> = {};
		for (const t of this.erc20Addresses) totalTokens[t.toLowerCase()] = this.totalForToken(t).toString();
		const completed = records.filter((r) => r.status === 'completed').length;
		const status: SweepRecord['status'] =
			completed === records.length ? 'completed' : completed === 0 ? 'failed' : 'partial';
		const rec: SweepRecord = {
			id: crypto.randomUUID(),
			createdAt: Date.now(),
			network: net.slug,
			networkName: net.name,
			destination: dest,
			tokens: [net.symbol, ...this.tokens.map((t) => t.symbol)],
			eoaCount: this.sweepableAddresses.length,
			totalNative: this.totalNative.toString(),
			totalTokens,
			feeWei: (this.fee?.amount ?? 0n).toString(),
			isMember: this.isMember,
			batches: records,
			status,
		};
		try {
			await putSweep(rec);
		} catch {
			// history is non-critical
		}
	}

	async loadHistory() {
		try {
			this.history = await listSweeps();
		} catch {
			this.history = [];
		}
	}
	async removeHistory(id: string) {
		await deleteSweep(id);
		void this.loadHistory();
	}

	// ─── Revoke ───
	async revoke(addresses: Address[]) {
		const net = this.network;
		const sweeper = this.sweeperAddress;
		if (!net || !sweeper) return;
		const relayer = loadRelayer(net.slug) ?? getOrCreateRelayer(net.slug);
		const keys = this.keys.filter((k) => addresses.some((a) => a.toLowerCase() === k.address.toLowerCase()));
		if (keys.length === 0) {
			this.log('No matching keys to revoke (need the private keys present)', 'warn');
			return;
		}
		this.revoking = true;
		this.error = null;
		try {
			const rpc = await this.resolveRpc(net);
			const result = await runRevoke({
				network: net,
				rpcUrl: rpc,
				relayer,
				keys,
				sweeper,
				onEvent: (e) => {
					if (e.phase === 'broadcast' && e.txHash) this.log(`Revoke broadcast ${e.txHash.slice(0, 10)}…`);
				},
			});
			const set = new Set(this.upgradedSet);
			for (const a of result.succeeded) set.delete(a.toLowerCase());
			this.upgradedSet = set;
			this.log(`Revoked ${result.succeeded.length}/${keys.length}`, result.failed.length ? 'warn' : 'ok');
		} catch (e) {
			this.fail(e, 'Revoke failed');
		} finally {
			this.revoking = false;
		}
	}

	clearRelayerWallet() {
		if (this.network) {
			clearRelayer(this.network.slug);
			this.relayer = null;
			this.relayerBal = 0n;
		}
	}

	// ─── navigation ───
	back() {
		if (this.running) return;
		if (this.phase === 'run') this.phase = 'config';
	}
	reset() {
		this.phase = 'config';
		this.runStage = 'idle';
		this.keys = [];
		this.parseStats = { total: 0, valid: 0, invalid: 0, duplicates: 0 };
		this.balances = [];
		this.plan = null;
		this.sweepRecords = [];
		this.upgradedSet = new Set();
		this.error = null;
	}
}
