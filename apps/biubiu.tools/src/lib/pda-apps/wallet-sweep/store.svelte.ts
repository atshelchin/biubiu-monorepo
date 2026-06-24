/**
 * Wallet Sweep v2 — wizard store (Svelte 5 runes class). No passkey / Safe.
 *
 * A throwaway relay EOA does everything: deploy the contracts, upgrade the EOAs
 * (EIP-7702) and sweep them to a user-chosen destination. The user funds the
 * relay with gas; the relay key MUST be downloaded and the download proven (by
 * re-uploading the file) before the funding address/QR is shown.
 *
 * Private keys live only in memory; only the relay key (relayer.ts) and
 * address-level history (sweep-history.ts) are persisted.
 */
import { type Address } from 'viem';
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
import {
	listNetworks,
	getNetwork,
	probeNetwork,
	pickWorkingRpc,
	makeCustomNetwork,
	verifyCustomRpc,
} from './infra/networks.js';
import { parsePrivateKey, dedupeKeys } from './infra/authorizations.js';
import { predictSweeperAddress } from './infra/sweeper-address.js';
import { fetchBalances, type EoaBalances } from './infra/balances.js';
import { fetchTokenMetadata, isValidTokenAddress } from './infra/erc20.js';
import {
	getOrCreateRelayer,
	loadRelayer,
	rotateRelayer,
	clearRelayer,
	relayerBalance,
	estimateFundingWei,
	downloadRelayerKey,
	verifyRelayFile,
	recoverGas,
	type Relayer,
} from './infra/relayer.js';
import {
	ensureBatchSweeper,
	ensureSweeper,
	isBatchSweeperDeployed,
	isSweeperDeployed,
} from './infra/deploy-sweeper.js';
import { planSweep, runSweep, type SweepPlan, type SweepEvent } from './infra/sweep.js';
import { runRevoke } from './infra/revoke.js';
import { quoteSweepFee, type FeeQuote } from './infra/fee.js';
import { putSweep, listSweeps, deleteSweep } from './history/sweep-history.js';
import {
	memberWaiver,
	proveMemberControl,
	ensureMembershipLoaded,
	type ProofResult,
} from '$lib/subscription/member-proof.svelte.js';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogEntry {
	ts: number;
	level: LogLevel;
	msg: string;
}

const CUSTOM_NETWORKS_KEY = 'wallet-sweep-custom-networks';

export class WalletSweepStore {
	phase = $state<Phase>('config');
	includeTestnets = $state(false);

	// network
	networkSlug = $state<string | null>(null);
	customNetworks = $state<SweepNetwork[]>(loadCustomNetworks());
	readiness = $state<Record<string, NetworkReadiness>>({});
	probing = $state(false);
	addNetworkError = $state<string | null>(null);
	addingNetwork = $state(false);
	private rpcCache: Record<string, string[]> = {};

	// keys (in-memory)
	keys = $state<EoaKey[]>([]);
	parseStats = $state({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
	parsing = $state(false);

	// tokens + destination
	tokens = $state<TokenSpec[]>([]);
	destination = $state('');
	addingToken = $state(false);
	addTokenError = $state<string | null>(null);

	// preview
	balances = $state<EoaBalances[]>([]);
	balancesLoading = $state(false);
	plan = $state<SweepPlan | null>(null);
	fee = $state<FeeQuote | null>(null);

	// relay
	relay = $state<Relayer | null>(null);
	private relayTs = $state(0);
	relayDownloaded = $state(false);
	relayVerified = $state(false);
	verifyError = $state<string | null>(null);
	relayBal = $state(0n);
	fundNeeded = $state(0n);
	needBatchSweeperDeploy = $state(false);
	needSweeperDeploy = $state(false);

	// run
	runStage = $state<RunStage>('idle');
	progress = $state<{ chunk: number; total: number } | null>(null);
	sweepRecords = $state<SweepBatchRecord[]>([]);
	private sweptSet = $state<Set<string>>(new Set());

	// revoke / recover
	revoking = $state(false);
	recovering = $state(false);

	history = $state<SweepRecord[]>([]);
	logs = $state<LogEntry[]>([]);
	error = $state<string | null>(null);

	// ─── derived ───
	get networks(): SweepNetwork[] {
		const builtins = listNetworks({ includeTestnets: this.includeTestnets });
		return [...builtins, ...this.customNetworks];
	}
	get network(): SweepNetwork | null {
		if (!this.networkSlug) return null;
		return getNetwork(this.networkSlug) ?? this.customNetworks.find((n) => n.slug === this.networkSlug) ?? null;
	}

	// ─── membership / fee waiver ───
	/** 本次 sweep 是否享受会员服务费豁免（需本会话 passkey 签名证明）。 */
	get feeWaived(): boolean {
		return memberWaiver.isWaiverActive;
	}
	/** 有资格签名豁免：已登录 Pro，但本会话尚未签名。 */
	get canWaiveFee(): boolean {
		return memberWaiver.canProve;
	}
	/** 正在进行 passkey 签名。 */
	get waiveProving(): boolean {
		return memberWaiver.proving;
	}
	/** 懒加载链上会员状态（页面挂载时调用）。 */
	loadMembership(): void {
		void ensureMembershipLoaded();
	}
	/** 发起 passkey 控制权证明；成功则豁免本次 sweep 的服务费。 */
	async waiveFeeWithPasskey(): Promise<ProofResult> {
		return proveMemberControl();
	}
	get sweeperAddress(): Address | null {
		return this.relay ? predictSweeperAddress(this.relay.address) : null;
	}
	get erc20Addresses(): Address[] {
		return this.tokens.filter((t) => t.kind === 'erc20' && t.address).map((t) => t.address as Address);
	}
	get destinationValid(): boolean {
		return isValidTokenAddress(this.destination);
	}
	get relayerFunded(): boolean {
		return this.relayBal >= this.fundNeeded && this.fundNeeded > 0n;
	}
	get running(): boolean {
		return this.runStage !== 'idle';
	}
	get sweptAddresses(): Address[] {
		return this.keys.map((k) => k.address).filter((a) => this.sweptSet.has(a.toLowerCase()));
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
		this.resetRelay();
		void this.probe(slug);
	}
	async probe(slug: string) {
		const net = this.network && this.networkSlug === slug ? this.network : getNetwork(slug) ?? this.customNetworks.find((n) => n.slug === slug);
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
			const next = { ...this.readiness };
			for (const r of results) next[r.slug] = r;
			this.readiness = next;
		} finally {
			this.probing = false;
		}
	}
	async addCustomNetwork(cfg: { name: string; chainId: number; symbol: string; rpc: string; explorerTxUrl?: string }) {
		this.addNetworkError = null;
		if (!cfg.name.trim() || !cfg.chainId || !cfg.rpc.trim()) {
			this.addNetworkError = 'Name, chain ID and RPC are required';
			return;
		}
		if (this.networks.some((n) => n.chainId === cfg.chainId)) {
			this.addNetworkError = 'A network with this chain ID already exists';
			return;
		}
		this.addingNetwork = true;
		try {
			const ok = await verifyCustomRpc(cfg.rpc, cfg.chainId);
			if (!ok) {
				this.addNetworkError = 'RPC unreachable or chain ID mismatch';
				return;
			}
			const net = makeCustomNetwork({ ...cfg, rpcs: [cfg.rpc] });
			this.customNetworks = [...this.customNetworks, net];
			saveCustomNetworks(this.customNetworks);
			this.selectNetwork(net.slug);
		} finally {
			this.addingNetwork = false;
		}
	}
	removeCustomNetwork(slug: string) {
		this.customNetworks = this.customNetworks.filter((n) => n.slug !== slug);
		saveCustomNetworks(this.customNetworks);
		if (this.networkSlug === slug) this.networkSlug = null;
	}

	private async resolveRpcs(net: SweepNetwork): Promise<string[]> {
		if (this.rpcCache[net.slug]) return this.rpcCache[net.slug];
		const working = await pickWorkingRpc(net.rpcs, net.chainId);
		const ordered = working ? [working, ...net.rpcs.filter((u) => u !== working)] : [...net.rpcs];
		this.rpcCache[net.slug] = ordered;
		return ordered;
	}

	// ─── keys ───
	async setKeys(text: string) {
		this.parsing = true;
		try {
			const lines = text.split(/[\s,]+/).map((l) => l.trim()).filter(Boolean);
			const parsed: EoaKey[] = [];
			let invalid = 0;
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
			const rpcs = await this.resolveRpcs(net);
			this.tokens = [...this.tokens, await fetchTokenMetadata(net, rpcs, addr as Address)];
		} catch (e) {
			this.addTokenError = e instanceof Error ? e.message : 'Failed to read token';
		} finally {
			this.addingToken = false;
		}
	}
	removeToken(addr?: Address) {
		this.tokens = this.tokens.filter((t) => t.address !== addr);
	}

	// ─── relay lifecycle ───
	private resetRelay() {
		this.relay = null;
		this.relayDownloaded = false;
		this.relayVerified = false;
		this.relayBal = 0n;
		this.verifyError = null;
	}
	private ensureRelay() {
		const net = this.network;
		if (!net) return;
		if (!this.relay) {
			this.relay = loadRelayer(net.slug) ?? getOrCreateRelayer(net.slug);
			this.relayTs = Date.now();
		}
	}
	rotateRelay() {
		const net = this.network;
		if (!net) return;
		this.relay = rotateRelayer(net.slug);
		this.relayTs = Date.now();
		this.relayDownloaded = false;
		this.relayVerified = false;
		this.relayBal = 0n;
	}
	downloadRelay() {
		if (this.relay && this.network) {
			downloadRelayerKey(this.relay, this.network.slug, this.relayTs);
			this.relayDownloaded = true;
		}
	}
	/** Called with the re-uploaded file's text; reveals funding only on match. */
	verifyUpload(fileText: string) {
		this.verifyError = null;
		if (!this.relay) return;
		if (verifyRelayFile(fileText, this.relay)) {
			this.relayVerified = true;
			void this.refreshRelayerBalance();
		} else {
			this.verifyError = 'This file does not match your relay key';
		}
	}
	async refreshRelayerBalance() {
		const net = this.network;
		if (!net || !this.relay) return;
		try {
			const rpcs = await this.resolveRpcs(net);
			this.relayBal = await relayerBalance(rpcs, this.relay.address);
		} catch (e) {
			this.fail(e, 'Relay balance');
		}
	}

	// ─── preflight → run ───
	async preflight() {
		const net = this.network;
		if (!net) return (void (this.error = 'Select a network'));
		if (this.keys.length === 0) return (void (this.error = 'Add at least one private key'));
		if (!this.destinationValid) return (void (this.error = 'Enter a valid destination address'));
		this.error = null;
		this.balancesLoading = true;
		try {
			const rpcs = await this.resolveRpcs(net);
			this.ensureRelay();
			const sweeper = this.sweeperAddress!;
			const addresses = this.keys.map((k) => k.address);

			const [balances, plan, fee, batchDeployed, sweeperDeployed] = await Promise.all([
				fetchBalances(net, rpcs, addresses, this.erc20Addresses),
				planSweep(rpcs, this.keys, sweeper),
				quoteSweepFee(net, { isMember: this.feeWaived }),
				isBatchSweeperDeployed(rpcs),
				isSweeperDeployed(rpcs, this.relay!.address),
			]);
			this.balances = balances;
			this.plan = plan;
			this.fee = fee;
			this.needBatchSweeperDeploy = !batchDeployed;
			this.needSweeperDeploy = !sweeperDeployed;

			this.fundNeeded = await estimateFundingWei({
				rpcs,
				eoaCount: plan.sweepable.length,
				tokenCount: this.erc20Addresses.length,
				deployBatchSweeper: this.needBatchSweeperDeploy,
				deploySweeper: this.needSweeperDeploy,
				feeWei: fee.amount,
			});

			if (plan.contracts.length) this.log(`${plan.contracts.length} address(es) are contracts — skipped`, 'warn');
			this.log(`Preflight: ${plan.sweepable.length} sweepable wallets`, 'ok');
			this.phase = 'run';
		} catch (e) {
			this.fail(e, 'Preflight failed');
		} finally {
			this.balancesLoading = false;
		}
	}

	// ─── the single Run action ───
	async proceed() {
		if (this.running || !this.relayerFunded) return;
		const net = this.network;
		const sweeper = this.sweeperAddress;
		if (!net || !sweeper || !this.relay || !this.plan) return;
		this.error = null;
		try {
			const rpcs = await this.resolveRpcs(net);

			if (this.needBatchSweeperDeploy || this.needSweeperDeploy) {
				this.runStage = 'deploying';
				const bs = await ensureBatchSweeper(net, rpcs, this.relay);
				if (bs.deployed) this.log(`BatchSweeper deployed at ${bs.address}`, 'ok');
				const sw = await ensureSweeper(net, rpcs, this.relay);
				if (sw.deployed) this.log(`Your Sweeper deployed at ${sw.address}`, 'ok');
				this.needBatchSweeperDeploy = false;
				this.needSweeperDeploy = false;
			}

			await this.executeSweep(rpcs, net, sweeper, this.fee?.amount ?? 0n);
			this.phase = 'done';
		} catch (e) {
			this.fail(e, 'Sweep failed');
		} finally {
			this.runStage = 'idle';
			this.progress = null;
		}
	}

	/** Re-sweep (funds re-arrived) — relay only, no re-deploy. */
	async sweepAgain() {
		if (this.running) return;
		const net = this.network;
		const sweeper = this.sweeperAddress;
		if (!net || !sweeper || !this.relay) return;
		this.error = null;
		try {
			const rpcs = await this.resolveRpcs(net);
			// refresh balances first so empty wallets are skipped
			this.balances = await fetchBalances(net, rpcs, this.keys.map((k) => k.address), this.erc20Addresses);
			const fee = await quoteSweepFee(net, { isMember: this.feeWaived });
			this.fee = fee;
			await this.executeSweep(rpcs, net, sweeper, fee.amount);
		} catch (e) {
			this.fail(e, 'Re-sweep failed');
		} finally {
			this.runStage = 'idle';
			this.progress = null;
		}
	}

	private async executeSweep(rpcs: string[], net: SweepNetwork, sweeper: Address, feeWei: bigint) {
		const dest = this.destination as Address;
		// Only sweep wallets that hold something.
		const byAddr = new Map(this.balances.map((b) => [b.address.toLowerCase(), b]));
		const sweepable = (this.plan?.sweepable ?? this.keys).filter((k) => {
			const b = byAddr.get(k.address.toLowerCase());
			if (!b) return true;
			return b.native > 0n || Object.values(b.tokens).some((v) => v > 0n);
		});
		if (sweepable.length === 0) {
			this.log('No wallets with a balance to sweep', 'warn');
			return;
		}
		this.runStage = 'sweeping';
		this.sweepRecords = [];
		const records = await runSweep({
			network: net,
			rpcs,
			relay: this.relay!,
			keys: sweepable,
			sweeperAddr: sweeper,
			dest,
			erc20s: this.erc20Addresses,
			feeWei,
			onEvent: (e: SweepEvent) => this.onSweepEvent(e),
		});
		this.sweepRecords = records;
		const set = new Set(this.sweptSet);
		for (const k of sweepable) set.add(k.address.toLowerCase());
		this.sweptSet = set;
		await this.saveHistory(records, dest, feeWei);
		const ok = records.filter((r) => r.status === 'completed').length;
		this.log(`Swept ${ok}/${records.length} batches`, ok === records.length ? 'ok' : 'warn');
		void this.loadHistory();
		void this.refreshRelayerBalance();
	}

	private onSweepEvent(e: SweepEvent) {
		if (e.phase === 'broadcast' && e.txHash) {
			this.progress = { chunk: e.chunkIndex + 1, total: e.chunkTotal };
			this.log(`Batch ${e.chunkIndex + 1}/${e.chunkTotal} broadcast: ${e.txHash.slice(0, 10)}…`);
		} else if (e.phase === 'chunk-done') {
			this.log(`Batch ${e.chunkIndex + 1}/${e.chunkTotal} confirmed`, 'ok');
		} else if (e.phase === 'error') {
			this.log(`Batch ${e.chunkIndex + 1} error: ${e.message}`, 'error');
		}
	}

	private async saveHistory(records: SweepBatchRecord[], dest: Address, feeWei: bigint) {
		const net = this.network!;
		const totalTokens: Record<string, string> = {};
		for (const t of this.erc20Addresses) totalTokens[t.toLowerCase()] = this.totalForToken(t).toString();
		const completed = records.filter((r) => r.status === 'completed').length;
		const status: SweepRecord['status'] =
			completed === records.length ? 'completed' : completed === 0 ? 'failed' : 'partial';
		try {
			await putSweep({
				id: crypto.randomUUID(),
				createdAt: Date.now(),
				network: net.slug,
				networkName: net.name,
				destination: dest,
				tokens: [net.symbol, ...this.tokens.map((t) => t.symbol)],
				eoaCount: records.reduce((s, r) => s + r.count, 0),
				totalNative: this.totalNative.toString(),
				totalTokens,
				feeWei: feeWei.toString(),
				batches: records,
				status,
			});
		} catch {
			// history non-critical
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

	// ─── revoke / recover ───
	async revoke(addresses: Address[]) {
		const net = this.network;
		if (!net || !this.relay) return;
		const keys = this.keys.filter((k) => addresses.some((a) => a.toLowerCase() === k.address.toLowerCase()));
		if (keys.length === 0) return void this.log('No matching keys to revoke', 'warn');
		this.revoking = true;
		this.error = null;
		try {
			const rpcs = await this.resolveRpcs(net);
			const result = await runRevoke({
				network: net,
				rpcs,
				relay: this.relay,
				keys,
				onTx: (h) => this.log(`Revoke broadcast ${h.slice(0, 10)}…`),
			});
			const set = new Set(this.sweptSet);
			for (const a of result.succeeded) set.delete(a.toLowerCase());
			this.sweptSet = set;
			this.log(`Revoked ${result.succeeded.length}/${keys.length}`, result.failed.length ? 'warn' : 'ok');
			void this.refreshRelayerBalance();
		} catch (e) {
			this.fail(e, 'Revoke failed');
		} finally {
			this.revoking = false;
		}
	}

	async recoverRelayGas() {
		const net = this.network;
		if (!net || !this.relay) return;
		const dest = (this.destinationValid ? this.destination : this.relay.address) as Address;
		this.recovering = true;
		this.error = null;
		try {
			const rpcs = await this.resolveRpcs(net);
			const tx = await recoverGas(net, rpcs, this.relay, dest);
			this.log(tx ? `Recovered relay gas → ${dest.slice(0, 8)}… (${tx.slice(0, 10)}…)` : 'No leftover gas to recover', tx ? 'ok' : 'info');
			await this.refreshRelayerBalance();
		} catch (e) {
			this.fail(e, 'Recover gas failed');
		} finally {
			this.recovering = false;
		}
	}

	clearRelayWallet() {
		if (this.network) {
			clearRelayer(this.network.slug);
			this.resetRelay();
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
		this.sweptSet = new Set();
		this.error = null;
	}
}

// ─── custom-network persistence ───
function loadCustomNetworks(): SweepNetwork[] {
	try {
		if (typeof localStorage === 'undefined') return [];
		const raw = localStorage.getItem(CUSTOM_NETWORKS_KEY);
		return raw ? (JSON.parse(raw) as SweepNetwork[]) : [];
	} catch {
		return [];
	}
}
function saveCustomNetworks(nets: SweepNetwork[]): void {
	try {
		localStorage.setItem(CUSTOM_NETWORKS_KEY, JSON.stringify(nets));
	} catch {
		// non-critical
	}
}
