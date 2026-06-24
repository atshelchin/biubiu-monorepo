/**
 * Reactive store for the Contract Deployer page.
 * Manages: server connection, contract selection, CREATE2 config, deployment, verification, logs, history.
 */
import { type Address, type Hex } from 'viem';
import { FoundryClient } from './foundry-client.js';
import { buildInitCode, predictCreate2Address, CREATE2_PROXY } from './create2.js';
import { saveDeployment, getDeployments, markVerified, clearDeployments } from './history.js';
import { type GasOverrides } from '$lib/auth/safe-tx/send-contract-call.js';
import type { SendStatus } from '$lib/auth/safe-tx/send-token.js';
import { walletStore } from '$lib/wallet';
import { checkNetworkSupport, type NetworkCheckResult } from './network-check.js';
import type {
	ContractArtifact,
	ConstructorArg,
	DeploymentRecord,
	LogEntry
} from './types.js';
import {
	searchChains as searchChainsApi,
	loadChainInfo,
	probeRpcs,
	rpcCall
} from '$lib/contract-caller/networks.js';
import type { ChainInfo, ChainSearchResult, RpcOption } from '$lib/contract-caller/types.js';
import { getUserOperationGasPrice } from '$lib/wallet/infra/bundler-client.js';

/** Format a gas price value with minimal but sufficient precision */
function formatGasValue(v: number): string {
	if (v === 0) return '0';
	if (v >= 100) return v.toFixed(0);
	if (v >= 1) return v.toFixed(2);
	// For small values: show 2 significant digits
	const digits = Math.max(0, -Math.floor(Math.log10(v))) + 2;
	return v.toFixed(Math.min(digits, 10));
}

/** Verified supported networks — only these are available for deployment */
export interface SupportedNetwork {
	key: string;
	name: string;
	chainId: number;
	nativeSymbol: string;
	/** Canonical block explorer base URL (no trailing slash). */
	explorer: string;
}

/**
 * Shared Etherscan V2 API key, baked in so verification works out of the box.
 * Public/rate-limited — heavy users should paste their own (Verify step links to one).
 */
export const DEFAULT_ETHERSCAN_KEY = '1GA442Z79I7USRD8KWF8DBQ799MCX3JDX2';

/** Why the Deploy button is disabled — UI maps this to `deploy.gate.<key>`. */
export type DeployBlocker =
	| 'server'
	| 'wallet'
	| 'contract'
	| 'network'
	| 'rpc'
	| 'notReady'
	| 'deployed'
	| null;

export const SUPPORTED_NETWORKS: SupportedNetwork[] = [
	{ key: 'eth-mainnet', name: 'Ethereum', chainId: 1, nativeSymbol: 'ETH', explorer: 'https://etherscan.io' },
	{ key: 'arb-mainnet', name: 'Arbitrum', chainId: 42161, nativeSymbol: 'ETH', explorer: 'https://arbiscan.io' },
	{ key: 'base-mainnet', name: 'Base', chainId: 8453, nativeSymbol: 'ETH', explorer: 'https://basescan.org' },
	{ key: 'opt-mainnet', name: 'Optimism', chainId: 10, nativeSymbol: 'ETH', explorer: 'https://optimistic.etherscan.io' },
	{ key: 'matic-mainnet', name: 'Polygon', chainId: 137, nativeSymbol: 'POL', explorer: 'https://polygonscan.com' },
	{ key: 'bnb-mainnet', name: 'BNB Chain', chainId: 56, nativeSymbol: 'BNB', explorer: 'https://bscscan.com' },
	{ key: 'avax-mainnet', name: 'Avalanche', chainId: 43114, nativeSymbol: 'AVAX', explorer: 'https://snowtrace.io' },
	{ key: 'gnosis-mainnet', name: 'Gnosis', chainId: 100, nativeSymbol: 'xDAI', explorer: 'https://gnosisscan.io' }
];

/** Block explorer base URL for a chain id, or null if unknown. */
export function explorerForChain(chainId: number): string | null {
	return SUPPORTED_NETWORKS.find((n) => n.chainId === chainId)?.explorer ?? null;
}

/**
 * Common chains shown as quick-pick when the network search box is empty.
 * NOT a hard allow-list — the user can search ANY EVM chain; the live readiness
 * check decides whether a chain actually has the passkey-wallet infra deployed.
 */
export const COMMON_CHAINS: ChainSearchResult[] = SUPPORTED_NETWORKS.map((n) => ({
	chainId: n.chainId,
	name: n.name,
	shortName: n.key,
	nativeCurrencySymbol: n.nativeSymbol,
	hasLogo: true
}));

// ─── Store ───

let logCounter = 0;

class DeployStore {
	// Server connection
	client = new FoundryClient();
	serverStatus = $state<'disconnected' | 'connecting' | 'connected'>('disconnected');
	serverPath = $state('');
	serverPort = $state(8420);

	// Contracts
	contracts = $state<ContractArtifact[]>([]);
	selectedContractIndex = $state(-1);
	constructorArgs = $state<ConstructorArg[]>([]);

	// Chain selection — search ANY EVM chain via the ethereum-data API.
	searchQuery = $state('');
	searchResults = $state<ChainSearchResult[]>(COMMON_CHAINS);
	searching = $state(false);
	selectedChain = $state<ChainInfo | null>(null);
	loadingChain = $state(false);
	chainError = $state('');

	// Network readiness check (CREATE2 proxy, Safe contracts, P256, bundler, gas)
	networkCheck = $state<NetworkCheckResult | null>(null);
	networkChecking = $state(false);

	// RPC endpoint for the selected chain
	rpcUrl = $state('');
	rpcOptions = $state<RpcOption[]>([]);
	rpcLatency = $state<number | null>(null);
	usingCustomRpc = $state(false);
	customRpcInput = $state('');
	rpcError = $state('');

	// Gas settings (empty = auto-estimate)
	gasLimitInput = $state('');
	maxFeePerGasGwei = $state('');
	maxPriorityFeePerGasGwei = $state('');

	// CREATE2
	salt = $state('0x0000000000000000000000000000000000000000000000000000000000000000');
	predictedAddress = $state<string | null>(null);
	addressAlreadyDeployed = $state(false);
	checkingAddress = $state(false);

	// Deploy state
	deploying = $state(false);
	deployStatus = $state<SendStatus | ''>('');

	// Verify state
	verifyAddress = $state('');
	verifier = $state<'etherscan' | 'blockscout'>('etherscan');
	etherscanKey = $state(DEFAULT_ETHERSCAN_KEY);
	verifying = $state(false);

	// Logs
	logs = $state<LogEntry[]>([]);

	// History
	history = $state<DeploymentRecord[]>([]);
	showHistory = $state(false);

	// Building
	building = $state(false);

	// ─── Derived ───

	get selectedContract(): ContractArtifact | null {
		if (this.selectedContractIndex < 0) return null;
		return this.contracts[this.selectedContractIndex] ?? null;
	}

	/** The active RPC URL (alias kept for the predicted-address deployed check). */
	get effectiveRpc(): string {
		return this.rpcUrl;
	}

	/** Block explorer base URL of the selected chain (no trailing slash). */
	get explorerUrl(): string {
		return this.selectedChain?.explorerUrl?.replace(/\/$/, '') ?? '';
	}

	/**
	 * Estimate gas limit from current initcode size.
	 *
	 * Breakdown:
	 *   - 32000 (CREATE opcode base cost)
	 *   - initcode_bytes × 200 (code deposit: 200 gas per deployed byte)
	 *   - 150000 (Safe executeUserOp overhead + CREATE2 proxy + calldata)
	 *   - constructor execution varies, add 50000 buffer
	 * Minimum 500000 for safety.
	 */
	get estimatedGasLimit(): number {
		const contract = this.selectedContract;
		if (!contract) return 500000;

		const ctor = contract.abi.find((a) => a.type === 'constructor');
		const inputs = ctor?.inputs ?? [];
		const values = this.constructorArgs.map((a) => a.value);
		const initCode = buildInitCode(contract.bytecode, inputs, values);

		const rawBytes = initCode && initCode !== '0x'
			? (initCode.length - 2) / 2
			: (contract.bytecode.length - 2) / 2;

		return Math.max(500000, (32000 + rawBytes * 200 + 200000) * 2);
	}

	/**
	 * Build gas overrides from UI fields.
	 * All fields should be pre-filled with actual values — no "auto".
	 */
	get gasOverrides(): GasOverrides {
		const overrides: GasOverrides = {};

		const gl = this.gasLimitInput.trim();
		overrides.callGasLimit = gl ? BigInt(gl) : BigInt(this.estimatedGasLimit);

		const toWei = (v: string): bigint => {
			const n = parseFloat(v);
			if (isNaN(n)) return 0n;
			return this.gasPriceUnit === 'wei'
				? BigInt(Math.round(n))
				: BigInt(Math.round(n * 1e9));
		};

		const mf = this.maxFeePerGasGwei.trim();
		if (mf) overrides.maxFeePerGas = toWei(mf);

		const mp = this.maxPriorityFeePerGasGwei.trim();
		if (mp) overrides.maxPriorityFeePerGas = toWei(mp);

		return overrides;
	}

	get canDeploy(): boolean {
		return (
			this.serverStatus === 'connected' &&
			walletStore.isConnected &&
			this.selectedContract !== null &&
			this.selectedChain !== null &&
			this.networkCheck?.ready === true &&
			this.rpcUrl !== '' &&
			this.salt.length === 66 &&
			!this.deploying &&
			!this.addressAlreadyDeployed
		);
	}

	/** First reason the Deploy button is blocked, or null when ready. */
	get deployBlocker(): DeployBlocker {
		if (this.serverStatus !== 'connected') return 'server';
		if (!walletStore.isConnected) return 'wallet';
		if (!this.selectedContract) return 'contract';
		if (!this.selectedChain) return 'network';
		if (!this.rpcUrl) return 'rpc';
		if (this.networkCheck?.ready !== true) return 'notReady';
		if (this.addressAlreadyDeployed) return 'deployed';
		return null;
	}

	// ─── Progressive-reveal gates (single-screen flow) ───

	/** Setup done: both the build server and a wallet are connected. */
	get setupReady(): boolean {
		return this.serverStatus === 'connected' && walletStore.isConnected;
	}

	/** A contract is selected and its args encode to a valid address. */
	get contractReady(): boolean {
		return this.selectedContract !== null && this.predictedAddress !== null;
	}

	/** A chain and a usable RPC endpoint are set. */
	get networkReady(): boolean {
		return this.selectedChain !== null && this.rpcUrl !== '';
	}

	// ─── Server connection ───

	async connect(): Promise<void> {
		this.serverStatus = 'connecting';
		this.client.setPort(this.serverPort);
		try {
			const info = await this.client.getInfo();
			if (!info.isFoundry) {
				this.log('Not a Foundry project', 'error');
				this.serverStatus = 'disconnected';
				return;
			}
			this.serverPath = info.cwd;
			this.serverStatus = 'connected';
			this.log(`Connected to ${info.cwd}`, 'ok');
			await this.loadContracts();
		} catch {
			this.serverStatus = 'disconnected';
			this.log('Cannot connect to Foundry server. Make sure it is running.', 'error');
		}
	}

	async buildContracts(): Promise<void> {
		if (this.serverStatus !== 'connected') return;
		this.building = true;
		this.log('Running forge build...');
		try {
			const result = await this.client.build();
			if (result.ok) {
				this.log('Build successful', 'ok');
				await this.loadContracts();
			} else {
				this.log('Build failed: ' + result.output, 'error');
			}
		} catch (e) {
			this.log('Build error: ' + (e instanceof Error ? e.message : String(e)), 'error');
		} finally {
			this.building = false;
		}
	}

	async loadContracts(): Promise<void> {
		try {
			this.contracts = await this.client.getContracts();
			this.log(`Loaded ${this.contracts.length} contract(s)`, 'info');
		} catch (e) {
			this.log('Failed to load contracts: ' + (e instanceof Error ? e.message : String(e)), 'error');
		}
	}

	// ─── Contract selection ───

	selectContract(index: number): void {
		this.selectedContractIndex = index;
		const contract = this.selectedContract;
		if (!contract) {
			this.constructorArgs = [];
			this.gasLimitInput = '';
			this.updatePredictedAddress();
			return;
		}

		if (!contract.bytecode || contract.bytecode === '0x' || contract.bytecode.length < 10) {
			this.log(`${contract.name} has no deployable bytecode (interface or abstract contract?)`, 'warn');
		}

		const ctor = contract.abi.find((a) => a.type === 'constructor');
		if (ctor?.inputs?.length) {
			this.constructorArgs = ctor.inputs.map((inp) => ({
				name: inp.name,
				type: inp.type,
				value: ''
			}));
		} else {
			this.constructorArgs = [];
		}
		// Pre-fill gas limit based on bytecode size
		this.gasLimitInput = String(this.estimatedGasLimit);
		this.updatePredictedAddress();
	}

	setArgValue(index: number, value: string): void {
		if (this.constructorArgs[index]) {
			this.constructorArgs[index].value = value;
			this.gasLimitInput = String(this.estimatedGasLimit);
			this.updatePredictedAddress();
		}
	}

	// ─── Network selection (search any EVM chain) ───

	/** Search the chain index; empty query falls back to the common quick-pick. */
	async searchChains(query: string): Promise<void> {
		this.searchQuery = query;
		if (!query.trim()) {
			this.searchResults = COMMON_CHAINS;
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

	/** Load a chain by id, auto-pick the fastest RPC, then run the readiness check. */
	async selectChain(chainId: number): Promise<void> {
		this.loadingChain = true;
		this.chainError = '';
		this.searchResults = [];
		this.searchQuery = '';
		// Reset all chain-dependent state.
		this.networkCheck = null;
		this.rpcUrl = '';
		this.rpcOptions = [];
		this.rpcLatency = null;
		this.usingCustomRpc = false;
		this.customRpcInput = '';
		this.rpcError = '';
		this.predictedAddress = null;
		this.addressAlreadyDeployed = false;
		this.maxFeePerGasGwei = '';
		this.maxPriorityFeePerGasGwei = '';
		this.gasPriceUnit = 'gwei';

		try {
			const chain = await loadChainInfo(chainId);
			this.selectedChain = chain;

			await this.findBestRpc(chain.rpcUrls);
			if (!this.rpcUrl) throw new Error('All RPC endpoints are unreachable');

			this.probeAllRpcs(chain.rpcUrls); // keep probing in the background
			this.updatePredictedAddress();
			this.runNetworkCheck();
			this.fetchGasPrices();
		} catch (e) {
			this.chainError = e instanceof Error ? e.message : 'Failed to load chain';
			this.selectedChain = null;
		} finally {
			this.loadingChain = false;
		}
	}

	/** Go back to the chain search. */
	changeNetwork(): void {
		this.selectedChain = null;
		this.searchQuery = '';
		this.searchResults = COMMON_CHAINS;
		this.rpcUrl = '';
		this.rpcOptions = [];
		this.rpcLatency = null;
		this.usingCustomRpc = false;
		this.customRpcInput = '';
		this.rpcError = '';
		this.networkCheck = null;
		this.predictedAddress = null;
		this.addressAlreadyDeployed = false;
	}

	/** User picked a different RPC from the list — re-check readiness + gas. */
	switchRpc(url: string): void {
		this.rpcUrl = url;
		this.usingCustomRpc = false;
		this.rpcLatency = this.rpcOptions.find((r) => r.url === url)?.latencyMs ?? null;
		this.runNetworkCheck();
		this.fetchGasPrices();
	}

	/** Validate + apply a user-supplied custom RPC (must match the chain id). */
	async applyCustomRpc(): Promise<void> {
		const url = this.customRpcInput.trim();
		if (!url) return;
		this.rpcError = '';
		try {
			const result = (await rpcCall(url, 'eth_chainId', [])) as string;
			const remoteChainId = parseInt(result, 16);
			if (this.selectedChain && remoteChainId !== this.selectedChain.chainId) {
				this.rpcError = `Chain ID mismatch: RPC is chain ${remoteChainId}, expected ${this.selectedChain.chainId}`;
				return;
			}
		} catch (e) {
			this.rpcError = e instanceof Error ? e.message : 'RPC is unreachable';
			return;
		}
		this.rpcUrl = url;
		this.usingCustomRpc = true;
		this.rpcLatency = null;
		this.customRpcInput = '';
		this.runNetworkCheck();
		this.fetchGasPrices();
	}

	/** Check if the selected chain has all required passkey-wallet infrastructure */
	async runNetworkCheck(): Promise<void> {
		const rpc = this.rpcUrl;
		const chain = this.selectedChain;
		if (!rpc || !chain) {
			this.networkCheck = null;
			return;
		}

		this.networkChecking = true;
		this.networkCheck = null;
		this.log(`Checking ${chain.name} (${chain.chainId})...`);

		try {
			const result = await checkNetworkSupport({
				rpcUrl: rpc,
				chainId: chain.chainId,
				safeAddress: walletStore.activeWallet?.address
			});

			this.networkCheck = result;

			if (result.ready) {
				this.log(`Network ready — all contracts deployed, bundler available`, 'ok');
				if (result.gasBalance !== null) {
					const ethBalance = Number(result.gasBalance) / 1e18;
					this.log(`Gas balance: ${ethBalance.toFixed(6)} ${chain.nativeCurrency.symbol}`, 'info');
				}
			} else {
				for (const issue of result.issues) {
					this.log(issue, 'error');
				}
			}
		} catch (e) {
			this.log('Network check failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
		} finally {
			this.networkChecking = false;
		}
	}

	/** Probe all RPCs in parallel (for the dropdown latencies). */
	private async probeAllRpcs(urls: string[]): Promise<void> {
		this.rpcOptions = urls.map((url) => ({ url, latencyMs: null, status: 'pending' as const }));
		this.rpcOptions = await probeRpcs(urls);
	}

	/** Probe RPCs and pick the fastest working one. */
	private async findBestRpc(urls: string[]): Promise<void> {
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
			this.log(`RPC: ${new URL(best.url).hostname} (${best.latencyMs}ms)`, 'info');
		} else if (urls.length > 0) {
			this.rpcUrl = urls[0];
			this.rpcLatency = null;
		}
	}

	/** Gas unit: 'gwei' or 'wei', auto-detected from chain gas price */
	gasPriceUnit = $state<'gwei' | 'wei'>('gwei');

	/** Fetch gas prices from both chain RPC and bundler, use the higher (bundler has minimums) */
	async fetchGasPrices(): Promise<void> {
		const rpc = this.rpcUrl;
		const chain = this.selectedChain;
		if (!rpc || !chain) return;

		try {
			// Fetch chain RPC price + bundler price in parallel
			const [chainRes, bundlerData] = await Promise.all([
				fetch(rpc, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] })
				}).then(r => r.json()).catch(() => null),
				getUserOperationGasPrice(chain.chainId).catch(() => null)
			]);

			// Chain gas price
			const chainGasWei = chainRes?.result ? BigInt(chainRes.result) : 0n;

			// Bundler minimum (use "standard" tier — cheapest that bundler accepts)
			let bundlerMaxFee = 0n;
			let bundlerPriority = 0n;
			if (bundlerData?.standard) {
				bundlerMaxFee = BigInt(bundlerData.standard.maxFeePerGas);
				bundlerPriority = BigInt(bundlerData.standard.maxPriorityFeePerGas);
			}

			// Use max(chain price * 1.2, bundler minimum) — bundler won't accept less
			const maxFeeWei = chainGasWei * 12n / 10n > bundlerMaxFee
				? chainGasWei * 12n / 10n
				: bundlerMaxFee;
			const priorityWei = chainGasWei / 2n > bundlerPriority
				? chainGasWei / 2n
				: bundlerPriority;

			const maxFeeNum = Number(maxFeeWei);
			const priorityNum = Number(priorityWei);

			// Pick best unit
			const gweiVal = maxFeeNum / 1e9;
			if (gweiVal >= 0.0001) {
				this.gasPriceUnit = 'gwei';
				this.maxFeePerGasGwei = formatGasValue(gweiVal);
				this.maxPriorityFeePerGasGwei = formatGasValue(priorityNum / 1e9);
			} else {
				this.gasPriceUnit = 'wei';
				this.maxFeePerGasGwei = String(Math.round(maxFeeNum));
				this.maxPriorityFeePerGasGwei = String(Math.max(Math.round(priorityNum), 1));
			}
		} catch (e) {
			this.log('Failed to fetch gas prices — bundler defaults will be used', 'warn');
		}
	}

	// ─── CREATE2 address prediction ───

	updatePredictedAddress(): void {
		const contract = this.selectedContract;
		if (!contract || this.salt.length !== 66) {
			this.predictedAddress = null;
			return;
		}

		const ctor = contract.abi.find((a) => a.type === 'constructor');
		const inputs = ctor?.inputs ?? [];
		const values = this.constructorArgs.map((a) => a.value);

		const initCode = buildInitCode(contract.bytecode, inputs, values);
		if (!initCode) {
			this.predictedAddress = null;
			return;
		}

		this.predictedAddress = predictCreate2Address(this.salt as Hex, initCode);
	}

	async checkAddressDeployed(): Promise<void> {
		if (!this.predictedAddress || !this.effectiveRpc) {
			this.addressAlreadyDeployed = false;
			return;
		}

		this.checkingAddress = true;
		try {
			const resp = await fetch(this.effectiveRpc, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_getCode',
					params: [this.predictedAddress, 'latest']
				})
			});
			const data = await resp.json();
			const code = data.result;
			this.addressAlreadyDeployed = !!code && code !== '0x' && code !== '0x0';
				// Auto-fill verify address for already-deployed contracts
				if (this.addressAlreadyDeployed && this.predictedAddress) {
					this.verifyAddress = this.predictedAddress;
				}
		} catch (e) {
			this.addressAlreadyDeployed = false;
			this.log('Failed to check address: ' + (e instanceof Error ? e.message : String(e)), 'warn');
		} finally {
			this.checkingAddress = false;
		}
	}

	// ─── Deploy ───

	async deploy(): Promise<void> {
		const contract = this.selectedContract;
		const wallet = walletStore.activeWallet;
		const network = this.selectedChain;

		if (!contract || !wallet || !network || !this.canDeploy) return;
		if (this.addressAlreadyDeployed) {
			this.log('Contract already deployed at predicted address', 'error');
			return;
		}

		const ctor = contract.abi.find((a) => a.type === 'constructor');
		const inputs = ctor?.inputs ?? [];
		const values = this.constructorArgs.map((a) => a.value);

		const initCode = buildInitCode(contract.bytecode, inputs, values);
		if (!initCode) {
			this.log('Invalid constructor arguments', 'error');
			return;
		}

		const predicted = predictCreate2Address(this.salt as Hex, initCode);
		if (!predicted) {
			this.log('Cannot compute predicted address', 'error');
			return;
		}

		// Prepare calldata: salt + initcode (without 0x prefix)
		const calldata = (this.salt + initCode.slice(2)) as Hex;

		this.deploying = true;
		this.log(`Deploying ${contract.name} to ${network.name} (${network.chainId})...`);
		this.log(`Predicted address: ${predicted}`);

		try {
			const result = await wallet.sendCalls([{ to: CREATE2_PROXY as Address, value: 0n, data: calldata }], {
				chainId: network.chainId,
				gasOverrides: this.gasOverrides,
				onPhase: (status: SendStatus) => {
					this.deployStatus = status;
					const statusMessages: Record<SendStatus, string> = {
						checking: 'Checking wallet status...',
						building: 'Building transaction...',
						estimating: 'Estimating gas...',
						signing: 'Please confirm with your passkey...',
						submitting: 'Submitting transaction...',
						waiting: 'Waiting for confirmation...',
						confirmed: 'Transaction confirmed!',
						failed: 'Transaction failed'
					};
					this.log(statusMessages[status] || status, status === 'failed' ? 'error' : 'info');
				}
			});

			if (result.success) {
				this.log(`Deployed at ${predicted}`, 'ok');
				this.log(`Tx: ${result.txHash}`, 'ok');
				if (result.explorerUrl) {
					this.log(`Explorer: ${result.explorerUrl}`, 'info');
				}

				this.verifyAddress = predicted;

				// Save to history
				const record: DeploymentRecord = {
					id: crypto.randomUUID(),
					timestamp: Date.now(),
					contractName: contract.name,
					contractFile: contract.file,
					chainId: network.chainId,
					chainName: network.name,
					address: predicted as Address,
					salt: this.salt as Hex,
					constructorArgs: values,
					txHash: result.txHash as Hex,
					deployer: wallet.address,
					verified: false,
					explorerUrl: this.explorerUrl || undefined
				};
				await saveDeployment(record);
				await this.loadHistory();
				// verifyAddress is already pre-filled above; the Verify card reveals
				// itself once history is non-empty.
			} else {
				this.log(`Deploy failed: ${result.error}`, 'error');
			}
		} catch (e) {
			this.log('Deploy error: ' + (e instanceof Error ? e.message : String(e)), 'error');
		} finally {
			this.deploying = false;
			this.deployStatus = '';
		}
	}

	// ─── Verify ───

	async verifyContract(): Promise<void> {
		const contract = this.selectedContract;
		const network = this.selectedChain;
		if (!contract || !network) return;

		const address = this.verifyAddress.trim();
		if (!address) {
			this.log('Enter the deployed contract address', 'error');
			return;
		}

		this.verifying = true;
		this.log(`Verifying ${contract.name} at ${address}...`);

		try {
			// The server returns the source path relative to the project root
			// (e.g. "src/tools/Forever.sol"). Older servers returned just the
			// basename (e.g. "Forever.sol") — prepend "src/" only in that case.
			const contractFile = contract.file.includes('/')
				? contract.file
				: `src/${contract.file}`;
			const result = await this.client.verify({
				contractName: contract.name,
				contractFile,
				address,
				chainId: network.chainId,
				verifier: this.verifier,
				etherscanKey: this.verifier === 'etherscan' ? this.etherscanKey : undefined,
				constructorArgs: this.getEncodedConstructorArgs(),
				blockscoutUrl:
					this.verifier === 'blockscout' ? this.explorerUrl : undefined
			});

			if (result.ok) {
				this.log('Verification successful!', 'ok');
				// Update history record
				const record = this.history.find((h) => h.address.toLowerCase() === address.toLowerCase());
				if (record) {
					await markVerified(record.id);
					await this.loadHistory();
				}
			} else {
				if (
					this.verifier === 'etherscan' &&
					(result.output.includes('Invalid API Key') || result.output.includes('NOTOK'))
				) {
					this.log('Invalid Etherscan API key', 'error');
				} else {
					this.log(result.output || 'Verification failed', 'error');
				}
			}
		} catch (e) {
			this.log('Verify error: ' + (e instanceof Error ? e.message : String(e)), 'error');
		} finally {
			this.verifying = false;
		}
	}

	private getEncodedConstructorArgs(): string | undefined {
		const contract = this.selectedContract;
		if (!contract) return undefined;
		const ctor = contract.abi.find((a) => a.type === 'constructor');
		if (!ctor?.inputs?.length) return undefined;

		const values = this.constructorArgs.map((a) => a.value);
		const initCode = buildInitCode('0x' as Hex, ctor.inputs, values);
		if (!initCode || initCode === '0x') return undefined;
		// initCode here is just the encoded args (bytecode was empty '0x')
		return initCode.slice(2);
	}

	// ─── Logs ───

	log(message: string, type: LogEntry['type'] = 'info'): void {
		this.logs = [
			{ id: ++logCounter, timestamp: Date.now(), message, type },
			...this.logs.slice(0, 199) // Keep last 200
		];
	}

	clearLogs(): void {
		this.logs = [];
	}

	// ─── History ───

	async loadHistory(): Promise<void> {
		try {
			this.history = await getDeployments();
		} catch {
			// Non-critical
		}
	}

	async clearHistory(): Promise<void> {
		await clearDeployments();
		this.history = [];
	}

	// ─── Init ───

	async init(): Promise<void> {
		await this.loadHistory();
		await this.connect();
	}
}

export const deployStore = new DeployStore();
