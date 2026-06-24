/**
 * Reactive store for the Contract Caller tool.
 *
 * Flow: pick a network (dynamic, any chain) → choose RPC → paste a contract
 * address + ABI → auto-generated read/write method list. Reads run over the
 * chosen RPC on any chain; writes/batch/chain (added in later phases) require
 * the chain to be one the built-in Safe wallet supports. Proxy contracts expose
 * both their own ABI and (optionally) the implementation's ABI.
 */
import { type Address, isAddress, getAddress } from 'viem';
import { t } from '$lib/i18n';
import type {
	AbiSource,
	AutoFetchInfo,
	ChainInfo,
	ChainSearchResult,
	ChainStep,
	ParsedMethod,
	ProxyInfo,
	QueuedCall,
	ReadState,
	RpcOption,
	WriteState
} from './types.js';
import { autoFetchAbi as fetchAbiFromChain } from './autoload-abi.js';
import { walletStore } from '$lib/wallet';
import { buildSafeBatchJson } from './batch.js';
import { coerceValue } from './format.js';
import { getComponents } from './abi.js';
import {
	type ChainedCall,
	encodeExecuteChainDelegated,
	staticWordRef,
	CHAINED_MULTISEND_ADDRESS,
	chainedDeployCalldata,
	isChainedDeployed
} from './chained-contract.js';
import {
	searchChains as searchChainsApi,
	loadChainInfo,
	probeRpcs,
	rpcCall,
	writeNetworkKey
} from './networks.js';
import { parseAbiInput } from './abi.js';
import { buildArgs, encodeCall } from './encode.js';
import { executeReadWithFailover } from './read.js';
import { toOutputRows } from './read.js';
import { detectProxy } from './proxy.js';
import {
	DEMO_ABI,
	DEMO_ADDRESS,
	DEMO_SCENARIOS,
	demoDeployCalldata,
	getDeployedDemos,
	resolveDemoArg,
	type DemoContractName,
	type DemoProofLabel,
	type DemoScenario
} from './demos/demos.js';

const RPC_STORAGE_KEY = 'contract-caller-rpc';

/** A single proof read shown after a demo chain runs. */
export interface DemoProofResult {
	labelKey: DemoProofLabel;
	value?: string;
	type?: string;
	error?: string;
}

class ContractCallerStore {
	// ── Network selection ──
	searchQuery = $state('');
	searchResults = $state<ChainSearchResult[]>([]);
	searching = $state(false);

	selectedChain = $state<ChainInfo | null>(null);
	loadingChain = $state(false);
	chainError = $state('');

	// ── RPC ──
	rpcUrl = $state('');
	rpcLatency = $state<number | null>(null);
	rpcError = $state('');
	rpcOptions = $state<RpcOption[]>([]);
	customRpcInput = $state('');
	usingCustomRpc = $state(false);

	// ── Contract ──
	contractAddress = $state('');
	abiInput = $state('');
	abiError = $state('');
	primaryMethods = $state<ParsedMethod[]>([]);

	// ── Auto-fetch (WhatsABI) ──
	abiFetching = $state(false);
	abiFetchError = $state('');
	autoFetchInfo = $state<AutoFetchInfo | null>(null);

	// ── Proxy / implementation ──
	proxyInfo = $state<ProxyInfo | null>(null);
	proxyChecking = $state(false);
	implAbiInput = $state('');
	implAbiError = $state('');
	implMethods = $state<ParsedMethod[]>([]);
	abiSource = $state<AbiSource>('primary');

	// ── Per-method state (keyed by method signature) ──
	paramValues = $state<Record<string, string[]>>({});
	/** ETH value (wei, canonical string) for payable methods. */
	payableValues = $state<Record<string, string>>({});
	readResults = $state<Record<string, ReadState>>({});
	writeState = $state<Record<string, WriteState>>({});
	/** Which method cards are expanded. */
	expanded = $state<Record<string, boolean>>({});

	// ── Batch ──
	batch = $state<QueuedCall[]>([]);
	batchState = $state<WriteState>({ status: 'idle' });

	// ── Chain (atomic on-chain) ──
	chain = $state<ChainStep[]>([]);
	chainState = $state<WriteState>({ status: 'idle' });
	/** null = unknown, then true/false once probed for the current RPC. */
	chainHelperDeployed = $state<boolean | null>(null);
	chainHelperDeploying = $state(false);
	readonly chainHelperAddress = CHAINED_MULTISEND_ADDRESS;

	// ── Chain demos (deterministic showcase contracts) ──
	/** Per-contract deploy status on the current RPC. */
	demoDeployed = $state<Record<string, boolean>>({});
	demoChecking = $state(false);
	/** Per-scenario deploy tx state, keyed by scenario id. */
	demoState = $state<Record<string, WriteState>>({});
	demoDeploying = $state<Record<string, boolean>>({});
	/** Which scenario's pre-wired chain is currently loaded into the builder. */
	demoLoadedId = $state<string | null>(null);
	/** Verify (proof read) results, keyed by scenario id. */
	demoProof = $state<Record<string, DemoProofResult[]>>({});
	demoVerifying = $state<Record<string, boolean>>({});
	/** Parsed demo method cache (contract → fn name → method). */
	private demoMethodCache = new Map<DemoContractName, Map<string, ParsedMethod>>();

	// ── Computed ──

	get hasChain(): boolean {
		return this.selectedChain !== null && this.rpcUrl !== '';
	}

	get addressValid(): boolean {
		return isAddress(this.contractAddress.trim());
	}

	/** Built-in (biubiu) wallet network key, or null when biubiu can't sign on this chain. */
	get writeNetwork(): string | null {
		return writeNetworkKey(this.selectedChain?.chainId);
	}

	/**
	 * Can the active wallet write on the selected chain?
	 * - External wallets (inject/walletpair) sign on any chain they support.
	 * - The built-in biubiu wallet only on the chains its bundler covers.
	 * - Disconnected: fall back to biubiu's set so the write UI shows a connect prompt.
	 */
	get canWrite(): boolean {
		if (!this.selectedChain) return false;
		const wallet = walletStore.activeWallet;
		if (wallet && wallet.kind !== 'biubiu') return true;
		return this.writeNetwork !== null;
	}

	/** Only the built-in Safe wallet can run delegatecall payloads (returndata chaining). */
	get canChain(): boolean {
		const wallet = walletStore.activeWallet;
		return this.canWrite && (!wallet || wallet.kind === 'biubiu');
	}

	get isLoggedIn(): boolean {
		return walletStore.isConnected;
	}

	get hasImplAbi(): boolean {
		return this.implMethods.length > 0;
	}

	/** The currently active method list (proxy ABI or implementation ABI). */
	get methods(): ParsedMethod[] {
		return this.abiSource === 'implementation' && this.hasImplAbi
			? this.implMethods
			: this.primaryMethods;
	}

	get readMethods(): ParsedMethod[] {
		return this.methods.filter((m) => m.isRead);
	}

	get writeMethods(): ParsedMethod[] {
		return this.methods.filter((m) => !m.isRead);
	}

	get explorerBaseUrl(): string {
		return this.selectedChain?.explorerUrl?.replace(/\/$/, '') ?? '';
	}

	/**
	 * RPC endpoints to try for a read, in order: the active one first, then any
	 * other endpoint that probed OK — so a flaky/slow RPC doesn't break reads.
	 */
	get readRpcs(): string[] {
		const healthy = this.rpcOptions.filter((o) => o.status === 'ok').map((o) => o.url);
		return [...new Set([this.rpcUrl, ...healthy].filter(Boolean))];
	}

	// ── Network actions ──

	async searchChains(query: string) {
		this.searchQuery = query;
		if (!query.trim()) {
			this.searchResults = [];
			return;
		}
		this.searching = true;
		try {
			this.searchResults = await searchChainsApi(query);
		} catch {
			this.searchResults = [];
		} finally {
			this.searching = false;
		}
	}

	async selectChain(chainId: number) {
		this.loadingChain = true;
		this.chainError = '';
		this.searchResults = [];
		this.searchQuery = '';
		// Demo deploy status is per-chain — reset it for the new chain.
		this.demoDeployed = {};
		this.chainHelperDeployed = null;
		try {
			const chain = await loadChainInfo(chainId);
			this.selectedChain = chain;

			const saved = this.loadSavedRpc(chainId);
			if (saved) {
				this.rpcUrl = saved;
				this.usingCustomRpc = !chain.rpcUrls.includes(saved);
			} else {
				await this.findBestRpc(chain.rpcUrls);
			}
			if (!this.rpcUrl) throw new Error(t('cc.err.allRpcUnreachable'));

			this.probeAllRpcs(chain.rpcUrls);
		} catch (e) {
			this.chainError = e instanceof Error ? e.message : t('cc.err.loadChainFailed');
			this.selectedChain = null;
		} finally {
			this.loadingChain = false;
		}
	}

	async switchRpc(url: string) {
		this.rpcUrl = url;
		this.usingCustomRpc = false;
		this.rpcLatency = this.rpcOptions.find((r) => r.url === url)?.latencyMs ?? null;
		this.saveRpcChoice(url);
	}

	async applyCustomRpc() {
		const url = this.customRpcInput.trim();
		if (!url) return;
		this.rpcError = '';
		try {
			const result = (await rpcCall(url, 'eth_chainId', [])) as string;
			const remoteChainId = parseInt(result, 16);
			if (this.selectedChain && remoteChainId !== this.selectedChain.chainId) {
				this.rpcError = t('cc.err.chainIdMismatch', {
					actual: remoteChainId,
					expected: this.selectedChain.chainId
				});
				return;
			}
		} catch (e) {
			this.rpcError = e instanceof Error ? e.message : t('cc.err.rpcUnreachable');
			return;
		}
		this.rpcUrl = url;
		this.usingCustomRpc = true;
		this.rpcLatency = null;
		this.customRpcInput = '';
		this.saveRpcChoice(url);
	}

	private async probeAllRpcs(urls: string[]) {
		this.rpcOptions = urls.map((url) => ({ url, latencyMs: null, status: 'pending' as const }));
		this.rpcOptions = await probeRpcs(urls);
	}

	private async findBestRpc(urls: string[]) {
		const probed = await probeRpcs(urls);
		let best: { url: string; latencyMs: number } | null = null;
		for (const r of probed) {
			if (r.status === 'ok' && r.latencyMs !== null && (!best || r.latencyMs < best.latencyMs)) {
				best = { url: r.url, latencyMs: r.latencyMs };
			}
		}
		if (best) {
			this.rpcUrl = best.url;
			this.rpcLatency = best.latencyMs;
		} else if (urls.length > 0) {
			this.rpcUrl = urls[0];
			this.rpcLatency = null;
		}
	}

	// ── Contract / ABI actions ──

	/**
	 * Parse the ABI textarea into the method list.
	 * @param detect run our own proxy detection (skip it after a WhatsABI
	 *   auto-fetch, which already merged the implementation ABI).
	 */
	loadAbi(detect = true) {
		this.abiError = '';
		const result = parseAbiInput(this.abiInput);
		if (!result.ok || !result.methods) {
			this.abiError = result.error ?? t('cc.err.invalidAbi');
			this.primaryMethods = [];
			return;
		}
		// Fresh contract: clear all per-method + proxy state.
		this.paramValues = {};
		this.payableValues = {};
		this.readResults = {};
		this.writeState = {};
		this.expanded = {};
		this.implMethods = [];
		this.implAbiInput = '';
		this.implAbiError = '';
		this.proxyInfo = null;
		this.autoFetchInfo = null;
		this.abiSource = 'primary';

		this.primaryMethods = result.methods;
		this.initParamsFor(result.methods);

		if (detect && this.addressValid) this.detectProxy();
	}

	/** Discover the ABI from chain data via WhatsABI (verified ABI or bytecode). */
	async autoFetchAbi() {
		if (!this.addressValid) {
			this.abiFetchError = t('cc.err.invalidAddress');
			return;
		}
		if (!this.selectedChain || !this.rpcUrl) {
			this.abiFetchError = t('cc.err.selectNetworkFirst');
			return;
		}
		this.abiFetchError = '';
		this.abiFetching = true;
		this.autoFetchInfo = null;
		try {
			const res = await fetchAbiFromChain(
				this.rpcUrl,
				this.selectedChain.chainId,
				getAddress(this.contractAddress.trim()) as Address
			);
			if (!res.ok || !res.abi) {
				this.abiFetchError = res.error ?? t('cc.err.noAbiFound');
				return;
			}
			this.abiInput = JSON.stringify(res.abi, null, 2);
			this.loadAbi(false); // WhatsABI already resolved proxies — skip our detection
			if (this.primaryMethods.length === 0) {
				this.abiFetchError = t('cc.err.noCallableMethods');
				return;
			}
			this.autoFetchInfo = {
				source: res.source,
				followedProxy: res.followedProxy,
				resolvedAddress: res.resolvedAddress ?? '',
				unresolved: res.unresolved
			};
		} finally {
			this.abiFetching = false;
		}
	}

	loadImplAbi() {
		this.implAbiError = '';
		const result = parseAbiInput(this.implAbiInput);
		if (!result.ok || !result.methods) {
			this.implAbiError = result.error ?? t('cc.err.invalidAbi');
			this.implMethods = [];
			return;
		}
		this.implMethods = result.methods;
		this.initParamsFor(result.methods);
		this.abiSource = 'implementation';
	}

	setActiveSource(source: AbiSource) {
		this.abiSource = source;
	}

	/** Detect proxy pattern for the current address (best-effort). */
	async detectProxy() {
		if (!this.addressValid || !this.rpcUrl) return;
		this.proxyChecking = true;
		try {
			const info = await detectProxy(
				this.rpcUrl,
				getAddress(this.contractAddress.trim()) as Address
			);
			this.proxyInfo = info.kind === 'none' ? null : info;
			// Prefill the implementation address into the impl ABI hint area is handled in UI.
		} catch {
			this.proxyInfo = null;
		} finally {
			this.proxyChecking = false;
		}
	}

	/** Merge param/payable slots for a method list without wiping existing values. */
	private initParamsFor(methods: ParsedMethod[]) {
		for (const m of methods) {
			if (!this.paramValues[m.signature]) {
				this.paramValues[m.signature] = m.inputs.map(() => '');
			}
			if (m.payable && this.payableValues[m.signature] === undefined) {
				this.payableValues[m.signature] = '';
			}
		}
	}

	setParamValue(signature: string, index: number, value: string) {
		const arr = this.paramValues[signature];
		if (arr) arr[index] = value;
	}

	setPayableValue(signature: string, value: string) {
		this.payableValues[signature] = value;
	}

	toggleExpanded(signature: string) {
		this.expanded[signature] = !this.expanded[signature];
	}

	// ── Read execution ──

	async callRead(method: ParsedMethod) {
		if (!this.addressValid) {
			this.readResults[method.signature] = {
				status: 'error',
				error: t('cc.err.invalidAddress')
			};
			return;
		}
		const raw = this.paramValues[method.signature] ?? [];
		const built = buildArgs(method, raw);
		if (!built.ok) {
			this.readResults[method.signature] = { status: 'error', error: built.error };
			return;
		}
		this.readResults[method.signature] = { status: 'loading' };
		const res = await executeReadWithFailover(
			this.readRpcs,
			getAddress(this.contractAddress.trim()) as Address,
			method,
			built.args ?? []
		);
		this.readResults[method.signature] = res.ok
			? { status: 'success', decoded: res.decoded, at: Date.now() }
			: { status: 'error', error: res.error };
	}

	// ── Write execution (built-in Safe wallet) ──

	/** Build the ETH value (wei) for a payable method, or 0n. */
	private buildValue(signature: string, payable: boolean): bigint {
		if (!payable) return 0n;
		try {
			return BigInt(this.payableValues[signature] || '0');
		} catch {
			return 0n;
		}
	}

	async sendWrite(method: ParsedMethod) {
		const sig = method.signature;
		const wallet = walletStore.activeWallet;
		if (!wallet) {
			this.writeState[sig] = { status: 'error', error: t('cc.err.connectWallet') };
			return;
		}
		// `writeNetwork` gates to chains the active wallet supports (Phase 1: biubiu's set).
		if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork)) {
			this.writeState[sig] = {
				status: 'error',
				error: t('cc.err.readOnlyMethod')
			};
			return;
		}
		if (!this.addressValid) {
			this.writeState[sig] = { status: 'error', error: t('cc.err.invalidAddress') };
			return;
		}
		const built = buildArgs(method, this.paramValues[sig] ?? []);
		if (!built.ok) {
			this.writeState[sig] = { status: 'error', error: built.error };
			return;
		}
		let data;
		try {
			data = encodeCall(method, built.args ?? []);
		} catch (e) {
			this.writeState[sig] = {
				status: 'error',
				error: e instanceof Error ? e.message : t('cc.methods.encodeFailed')
			};
			return;
		}

		this.writeState[sig] = { status: 'sending', phase: 'checking' };
		const res = await wallet.sendCalls(
			[
				{
					to: getAddress(this.contractAddress.trim()) as Address,
					value: this.buildValue(sig, method.payable),
					data
				}
			],
			{
				chainId: this.selectedChain.chainId,
				explorerTxBaseUrl: this.explorerBaseUrl ? `${this.explorerBaseUrl}/tx/` : undefined,
				onPhase: (s) => {
					const cur = this.writeState[sig];
					if (cur && cur.status === 'sending') this.writeState[sig] = { ...cur, phase: s };
				}
			}
		);
		this.writeState[sig] = res.success
			? { status: 'done', txHash: res.txHash, explorerUrl: res.explorerUrl }
			: { status: 'error', error: res.error };
	}

	// ── Batch ──

	private callLabel(method: ParsedMethod, raw: string[]): string {
		const args = raw.map((v) => (v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v)).join(', ');
		return `${method.name}(${args})`;
	}

	/** Snapshot the current params of a write method into the batch queue. */
	addToBatch(method: ParsedMethod) {
		const sig = method.signature;
		if (!this.addressValid) {
			this.writeState[sig] = { status: 'error', error: t('cc.err.invalidAddress') };
			return;
		}
		const raw = this.paramValues[sig] ?? [];
		const built = buildArgs(method, raw);
		if (!built.ok) {
			this.writeState[sig] = { status: 'error', error: built.error };
			return;
		}
		let data;
		try {
			data = encodeCall(method, built.args ?? []);
		} catch (e) {
			this.writeState[sig] = {
				status: 'error',
				error: e instanceof Error ? e.message : t('cc.methods.encodeFailed')
			};
			return;
		}
		this.batch.push({
			id: crypto.randomUUID(),
			label: this.callLabel(method, raw),
			to: getAddress(this.contractAddress.trim()) as Address,
			value: this.buildValue(sig, method.payable),
			data,
			signature: sig
		});
		this.batchState = { status: 'idle' };
	}

	removeFromBatch(id: string) {
		this.batch = this.batch.filter((c) => c.id !== id);
	}

	moveBatch(id: string, dir: 'up' | 'down') {
		const i = this.batch.findIndex((c) => c.id === id);
		if (i < 0) return;
		const j = dir === 'up' ? i - 1 : i + 1;
		if (j < 0 || j >= this.batch.length) return;
		const arr = [...this.batch];
		[arr[i], arr[j]] = [arr[j], arr[i]];
		this.batch = arr;
	}

	clearBatch() {
		this.batch = [];
		this.batchState = { status: 'idle' };
	}

	async sendBatch() {
		const wallet = walletStore.activeWallet;
		if (!wallet) {
			this.batchState = { status: 'error', error: t('cc.err.connectWallet') };
			return;
		}
		if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork)) {
			this.batchState = {
				status: 'error',
				error: t('cc.err.readOnlyBatch')
			};
			return;
		}
		if (this.batch.length === 0) return;

		// Hand the raw calls to the wallet; it picks the atomic batch primitive
		// (biubiu → MultiSend delegatecall, external → EIP-5792 wallet_sendCalls).
		const calls = this.batch.map((c) => ({ to: c.to, value: c.value, data: c.data }));
		this.batchState = { status: 'sending', phase: 'checking' };
		const res = await wallet.sendCalls(calls, {
			chainId: this.selectedChain.chainId,
			explorerTxBaseUrl: this.explorerBaseUrl ? `${this.explorerBaseUrl}/tx/` : undefined,
			onPhase: (s) => {
				if (this.batchState.status === 'sending')
					this.batchState = { ...this.batchState, phase: s };
			}
		});
		this.batchState = res.success
			? { status: 'done', txHash: res.txHash, explorerUrl: res.explorerUrl }
			: { status: 'error', error: res.error };
	}

	/** Download the batch as a Safe{Wallet} Transaction Builder import file. */
	exportSafeBatch() {
		if (!this.selectedChain || this.batch.length === 0) return;
		const json = buildSafeBatchJson(this.selectedChain.chainId, this.batch, Date.now());
		const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `contract-caller-batch-${this.selectedChain.chainId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ── Chain (atomic, returndata-forwarding) ──

	addToChain(method: ParsedMethod) {
		if (!this.addressValid) {
			this.writeState[method.signature] = {
				status: 'error',
				error: t('cc.err.invalidAddress')
			};
			return;
		}
		const raw = this.paramValues[method.signature] ?? [];
		this.chain.push({
			id: crypto.randomUUID(),
			signature: method.signature,
			name: method.name,
			to: getAddress(this.contractAddress.trim()) as Address,
			method,
			values: method.inputs.map((_, i) => raw[i] ?? ''),
			refs: method.inputs.map(() => ({ kind: 'literal' as const })),
			payableValue: method.payable ? (this.payableValues[method.signature] ?? '') : ''
		});
		this.chainState = { status: 'idle' };
		if (this.chainHelperDeployed === null) this.checkChainHelper();
	}

	removeFromChain(id: string) {
		// Dropping a step shifts indices — clear any refs that pointed past it.
		const idx = this.chain.findIndex((s) => s.id === id);
		this.chain = this.chain.filter((s) => s.id !== id);
		if (idx >= 0) {
			for (const step of this.chain) {
				step.refs = step.refs.map((r) =>
					r.kind === 'ref' && r.sourceStep !== undefined && r.sourceStep >= idx
						? { kind: 'literal' }
						: r
				);
			}
		}
	}

	moveChain(id: string, dir: 'up' | 'down') {
		const i = this.chain.findIndex((s) => s.id === id);
		if (i < 0) return;
		const j = dir === 'up' ? i - 1 : i + 1;
		if (j < 0 || j >= this.chain.length) return;
		const arr = [...this.chain];
		[arr[i], arr[j]] = [arr[j], arr[i]];
		// Reordering can invalidate refs; reset all refs to literal to stay safe.
		for (const step of arr) step.refs = step.refs.map(() => ({ kind: 'literal' as const }));
		this.chain = arr;
	}

	clearChain() {
		this.chain = [];
		this.chainState = { status: 'idle' };
	}

	setChainLiteral(stepId: string, paramIndex: number, value: string) {
		const step = this.chain.find((s) => s.id === stepId);
		if (step) step.values[paramIndex] = value;
	}

	setChainPayable(stepId: string, value: string) {
		const step = this.chain.find((s) => s.id === stepId);
		if (step) step.payableValue = value;
	}

	/** value is "literal" or "<sourceStep>:<outputSlot>". */
	setChainParamSource(stepId: string, paramIndex: number, value: string) {
		const step = this.chain.find((s) => s.id === stepId);
		if (!step) return;
		if (value === 'literal') {
			step.refs[paramIndex] = { kind: 'literal' };
			return;
		}
		const [s, o] = value.split(':').map(Number);
		step.refs[paramIndex] = { kind: 'ref', sourceStep: s, outputSlot: o };
	}

	async checkChainHelper() {
		if (!this.rpcUrl) return;
		this.chainHelperDeployed = await isChainedDeployed(this.rpcUrl);
	}

	async deployChainHelper() {
		const wallet = walletStore.activeWallet;
		if (!wallet) {
			this.chainState = { status: 'error', error: t('cc.err.connectWallet') };
			return;
		}
		if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork)) {
			this.chainState = { status: 'error', error: t('cc.err.readOnly') };
			return;
		}
		const { to, data } = chainedDeployCalldata();
		this.chainHelperDeploying = true;
		this.chainState = { status: 'sending', phase: 'checking' };
		const res = await wallet.sendCalls([{ to, value: 0n, data }], {
			chainId: this.selectedChain.chainId,
			onPhase: (s) => {
				if (this.chainState.status === 'sending')
					this.chainState = { ...this.chainState, phase: s };
			}
		});
		this.chainHelperDeploying = false;
		if (res.success) {
			this.chainHelperDeployed = true;
			this.chainState = { status: 'idle' };
		} else {
			this.chainState = { status: 'error', error: res.error };
		}
	}

	private buildChainedCalls(): { ok: boolean; calls?: ChainedCall[]; error?: string } {
		const calls: ChainedCall[] = [];
		for (let i = 0; i < this.chain.length; i++) {
			const step = this.chain[i];
			const args: unknown[] = [];
			for (let idx = 0; idx < step.method.inputs.length; idx++) {
				const inp = step.method.inputs[idx];
				const ref = step.refs[idx];
				try {
					if (ref?.kind === 'ref') args.push(this.placeholderValue(inp.type));
					else args.push(coerceValue(inp.type, getComponents(inp), step.values[idx] ?? ''));
				} catch (e) {
					return {
						ok: false,
						error: `Step ${i + 1} · ${inp.name || `arg ${idx}`}: ${e instanceof Error ? e.message : 'invalid'}`
					};
				}
			}
			let data;
			try {
				data = encodeCall(step.method, args);
			} catch (e) {
				return {
					ok: false,
					error: `Step ${i + 1}: ${e instanceof Error ? e.message : 'encode failed'}`
				};
			}
			const returnRefs = step.refs
				.map((ref, idx) =>
					ref?.kind === 'ref' && ref.sourceStep !== undefined && ref.outputSlot !== undefined
						? staticWordRef(ref.sourceStep, ref.outputSlot, idx)
						: null
				)
				.filter((r): r is NonNullable<typeof r> => r !== null);
			let value = 0n;
			try {
				value = BigInt(step.payableValue || '0');
			} catch {
				value = 0n;
			}
			calls.push({ to: step.to, value, data, returnRefs });
		}
		return { ok: true, calls };
	}

	private placeholderValue(type: string): unknown {
		if (type.startsWith('uint') || type.startsWith('int')) return 0n;
		if (type === 'bool') return false;
		if (type === 'address') return '0x0000000000000000000000000000000000000000';
		const m = type.match(/^bytes(\d+)$/);
		if (m) return `0x${'00'.repeat(parseInt(m[1], 10))}`;
		return '0x';
	}

	async sendChain() {
		const wallet = walletStore.activeWallet;
		if (!wallet) {
			this.chainState = { status: 'error', error: t('cc.err.connectWallet') };
			return;
		}
		if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork)) {
			this.chainState = { status: 'error', error: t('cc.err.chainUnsupported') };
			return;
		}
		if (this.chain.length === 0) return;
		if (!this.chainHelperDeployed) {
			this.chainState = { status: 'error', error: t('cc.err.deployHelperFirst') };
			return;
		}
		const built = this.buildChainedCalls();
		if (!built.ok || !built.calls) {
			this.chainState = { status: 'error', error: built.error };
			return;
		}
		// Returndata-forwarding chains need Safe delegatecall semantics — only the
		// built-in biubiu wallet exposes `sendDelegateCall`.
		if (!wallet.sendDelegateCall) {
			this.chainState = {
				status: 'error',
				error: t('cc.err.chainNeedsBiubiu')
			};
			return;
		}
		const data = encodeExecuteChainDelegated(built.calls);
		this.chainState = { status: 'sending', phase: 'checking' };
		const res = await wallet.sendDelegateCall(
			{ to: CHAINED_MULTISEND_ADDRESS, value: 0n, data },
			{
				chainId: this.selectedChain.chainId,
				onPhase: (s) => {
					if (this.chainState.status === 'sending')
						this.chainState = { ...this.chainState, phase: s };
				}
			}
		);
		this.chainState = res.success
			? { status: 'done', txHash: res.txHash, explorerUrl: res.explorerUrl }
			: { status: 'error', error: res.error };
	}

	// ── Chain demos ──

	/** Parse a demo contract's ABI once and look up a function by name. */
	private getDemoMethod(contract: DemoContractName, fn: string): ParsedMethod {
		let byName = this.demoMethodCache.get(contract);
		if (!byName) {
			const res = parseAbiInput(DEMO_ABI[contract].join('\n'));
			byName = new Map((res.methods ?? []).map((m) => [m.name, m]));
			this.demoMethodCache.set(contract, byName);
		}
		const method = byName.get(fn);
		if (!method) throw new Error(`Demo method ${contract}.${fn} not found`);
		return method;
	}

	/** True once every contract a scenario needs is deployed on this chain. */
	scenarioReady(scenario: DemoScenario): boolean {
		return scenario.contracts.every((c) => this.demoDeployed[c]);
	}

	/** Probe which demo contracts are already deployed on the current RPC. */
	async checkDemos() {
		if (!this.rpcUrl) return;
		this.demoChecking = true;
		try {
			const names = [...new Set(DEMO_SCENARIOS.flatMap((s) => s.contracts))];
			this.demoDeployed = await getDeployedDemos(this.rpcUrl, names);
		} catch {
			/* leave statuses as-is on a probe failure */
		} finally {
			this.demoChecking = false;
		}
	}

	/** Deploy a scenario's missing contracts (one CREATE2 batch). */
	async deployDemo(scenarioId: string) {
		const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
		if (!scenario) return;
		const wallet = walletStore.activeWallet;
		if (!wallet) {
			this.demoState[scenarioId] = { status: 'error', error: t('cc.err.connectWallet') };
			return;
		}
		if (!this.selectedChain || (wallet.kind === 'biubiu' && !this.writeNetwork)) {
			this.demoState[scenarioId] = { status: 'error', error: t('cc.err.readOnly') };
			return;
		}
		const missing = scenario.contracts.filter((c) => !this.demoDeployed[c]);
		if (missing.length === 0) return;
		const calls = missing.map((c) => {
			const { to, data } = demoDeployCalldata(c);
			return { to, value: 0n, data };
		});
		this.demoDeploying[scenarioId] = true;
		this.demoState[scenarioId] = { status: 'sending', phase: 'checking' };
		const res = await wallet.sendCalls(calls, {
			chainId: this.selectedChain.chainId,
			explorerTxBaseUrl: this.explorerBaseUrl ? `${this.explorerBaseUrl}/tx/` : undefined,
			onPhase: (s) => {
				const cur = this.demoState[scenarioId];
				if (cur && cur.status === 'sending') this.demoState[scenarioId] = { ...cur, phase: s };
			}
		});
		this.demoDeploying[scenarioId] = false;
		if (res.success) {
			for (const c of missing) this.demoDeployed[c] = true;
			this.demoState[scenarioId] = {
				status: 'done',
				txHash: res.txHash,
				explorerUrl: res.explorerUrl
			};
		} else {
			this.demoState[scenarioId] = { status: 'error', error: res.error };
		}
	}

	/** Load a scenario's pre-wired chain into the chain builder. */
	loadDemoChain(scenarioId: string) {
		const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
		if (!scenario) return;
		this.chain = scenario.steps.map((step) => {
			const method = this.getDemoMethod(step.contract, step.fn);
			const values = method.inputs.map((_, idx) => {
				const a = step.args[idx];
				return a && a.kind !== 'ref' ? resolveDemoArg(a) : '';
			});
			const refs = method.inputs.map((_, idx) => {
				const a = step.args[idx];
				return a && a.kind === 'ref'
					? { kind: 'ref' as const, sourceStep: a.step, outputSlot: 0 }
					: { kind: 'literal' as const };
			});
			return {
				id: crypto.randomUUID(),
				signature: method.signature,
				name: method.name,
				to: DEMO_ADDRESS[step.contract],
				method,
				values,
				refs,
				payableValue: ''
			};
		});
		this.chainState = { status: 'idle' };
		this.demoLoadedId = scenarioId;
		delete this.demoProof[scenarioId];
		if (this.chainHelperDeployed === null) this.checkChainHelper();
	}

	/** Run a scenario's proof reads to show the chain actually did its thing. */
	async verifyDemo(scenarioId: string) {
		const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
		if (!scenario || !this.rpcUrl) return;
		this.demoVerifying[scenarioId] = true;
		const results: DemoProofResult[] = [];
		for (const p of scenario.proofs) {
			const method = this.getDemoMethod(p.contract, p.fn);
			const rawArgs = method.inputs.map((_, idx) => {
				const a = p.args[idx];
				return a && a.kind !== 'ref' ? resolveDemoArg(a) : '';
			});
			const built = buildArgs(method, rawArgs);
			if (!built.ok) {
				results.push({ labelKey: p.labelKey, error: built.error });
				continue;
			}
			const res = await executeReadWithFailover(
				this.readRpcs,
				DEMO_ADDRESS[p.contract],
				method,
				built.args ?? []
			);
			if (res.ok) {
				const row = toOutputRows(method, res.decoded)[0];
				results.push({ labelKey: p.labelKey, value: row?.value ?? '', type: row?.type });
			} else {
				results.push({ labelKey: p.labelKey, error: res.error });
			}
		}
		this.demoProof[scenarioId] = results;
		this.demoVerifying[scenarioId] = false;
	}

	// ── Navigation ──

	changeNetwork() {
		this.selectedChain = null;
		this.rpcUrl = '';
		this.rpcLatency = null;
		this.rpcError = '';
		this.rpcOptions = [];
		this.usingCustomRpc = false;
		this.customRpcInput = '';
		this.chainError = '';
		this.searchQuery = '';
		this.searchResults = [];
	}

	// ── RPC persistence ──

	private saveRpcChoice(url: string) {
		if (!this.selectedChain) return;
		try {
			const all = JSON.parse(localStorage.getItem(RPC_STORAGE_KEY) ?? '{}');
			all[String(this.selectedChain.chainId)] = url;
			localStorage.setItem(RPC_STORAGE_KEY, JSON.stringify(all));
		} catch {
			/* non-critical */
		}
	}

	private loadSavedRpc(chainId: number): string | null {
		try {
			const all = JSON.parse(localStorage.getItem(RPC_STORAGE_KEY) ?? '{}');
			return all[String(chainId)] ?? null;
		} catch {
			return null;
		}
	}
}

export const contractCallerStore = new ContractCallerStore();
