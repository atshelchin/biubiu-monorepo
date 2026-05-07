/**
 * Reactive store for the Contract Deployer page.
 * Manages: server connection, contract selection, CREATE2 config, deployment, verification, logs, history.
 */
import { type Address, type Hex } from 'viem';
import { FoundryClient } from './foundry-client.js';
import { buildInitCode, predictCreate2Address, CREATE2_PROXY } from './create2.js';
import { saveDeployment, getDeployments, markVerified, clearDeployments } from './history.js';
import { sendContractCall, type GasOverrides } from '$lib/auth/safe-tx/send-contract-call.js';
import type { SendStatus } from '$lib/auth/safe-tx/send-token.js';
import { CHAIN_CONFIG } from '$lib/auth/safe-tx/constants.js';
import { authStore } from '$lib/auth/auth-store.svelte.js';
import { checkNetworkSupport, type NetworkCheckResult } from './network-check.js';
import type {
	ContractArtifact,
	ConstructorArg,
	DeploymentRecord,
	LogEntry,
	ChainInfo
} from './types.js';

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface RpcProbeResult {
	url: string;
	status: 'ok' | 'error' | 'pending';
	/** Latency in ms, null if error */
	latencyMs: number | null;
	/** Error message if failed */
	error?: string;
}

/** Resolve CHAIN_CONFIG key from chainId (for Safe AA deployment) */
function findChainConfigKey(chainId: number): string | null {
	for (const [key, cfg] of Object.entries(CHAIN_CONFIG)) {
		if (Number(cfg.chainId) === chainId) return key;
	}
	return null;
}

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

	// Chain index (all chains from ethereum-data API)
	chainIndex = $state<ChainInfo[]>([]);
	chainIndexLoading = $state(false);

	// Chain search & selection
	networkSearchQuery = $state('');
	networkSearchResults = $state<ChainInfo[]>([]);
	networkDropdownOpen = $state(false);
	selectedChain = $state<ChainInfo | null>(null);
	chainDataLoading = $state(false);

	// Network readiness check
	networkCheck = $state<NetworkCheckResult | null>(null);
	networkChecking = $state(false);

	// Full chain data (fetched after selection)
	fullChainData = $state<Record<string, unknown> | null>(null);
	rpcOptions = $state<string[]>([]);
	rpcProbes = $state<Record<string, RpcProbeResult>>({});
	rpcProbing = $state(false);
	selectedRpc = $state('');
	customRpc = $state('');
	explorerUrl = $state('');

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
	etherscanKey = $state('1GA442Z79I7USRD8KWF8DBQ799MCX3JDX2');
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

	get effectiveRpc(): string {
		if (this.selectedRpc === '__custom__' || !this.selectedRpc) {
			return this.customRpc.trim();
		}
		return this.selectedRpc;
	}

	/** The CHAIN_CONFIG key if this chain is supported by Safe AA bundler */
	get safeNetworkKey(): string | null {
		if (!this.selectedChain) return null;
		return findChainConfigKey(this.selectedChain.chainId);
	}

	/**
	 * Estimate gas limit from current initcode size.
	 *
	 * Formula:
	 *   32000 (CREATE base) + initcode_bytes × 150 (code deposit + memory)
	 *   + 100000 (Safe executeUserOp overhead + constructor execution buffer)
	 * Minimum 200000 for small contracts.
	 */
	get estimatedGasLimit(): number {
		const contract = this.selectedContract;
		if (!contract) return 200000;

		const ctor = contract.abi.find((a) => a.type === 'constructor');
		const inputs = ctor?.inputs ?? [];
		const values = this.constructorArgs.map((a) => a.value);
		const initCode = buildInitCode(contract.bytecode, inputs, values);

		if (!initCode || initCode === '0x') {
			// Fallback: estimate from raw bytecode
			const bytes = (contract.bytecode.length - 2) / 2;
			return Math.max(200000, 32000 + bytes * 150 + 100000);
		}

		const bytes = (initCode.length - 2) / 2;
		return Math.max(200000, 32000 + bytes * 150 + 100000);
	}

	/**
	 * Build gas overrides.
	 * Gas limit always uses estimatedGasLimit unless user explicitly overrides.
	 * Gas price fields: empty = auto from bundler.
	 */
	get gasOverrides(): GasOverrides {
		const overrides: GasOverrides = {};

		const gl = this.gasLimitInput.trim();
		overrides.callGasLimit = gl ? BigInt(gl) : BigInt(this.estimatedGasLimit);

		const mf = this.maxFeePerGasGwei.trim();
		if (mf) {
			overrides.maxFeePerGas = BigInt(Math.round(parseFloat(mf) * 1e9));
		}
		const mp = this.maxPriorityFeePerGasGwei.trim();
		if (mp) {
			overrides.maxPriorityFeePerGas = BigInt(Math.round(parseFloat(mp) * 1e9));
		}
		return overrides;
	}

	get canDeploy(): boolean {
		return (
			this.serverStatus === 'connected' &&
			authStore.isLoggedIn &&
			this.selectedContract !== null &&
			this.selectedChain !== null &&
			this.networkCheck?.ready === true &&
			this.effectiveRpc !== '' &&
			this.salt.length === 66 &&
			!this.deploying &&
			!this.addressAlreadyDeployed
		);
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
			this.updatePredictedAddress();
			return;
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
		this.updatePredictedAddress();
	}

	setArgValue(index: number, value: string): void {
		if (this.constructorArgs[index]) {
			this.constructorArgs[index].value = value;
			this.updatePredictedAddress();
		}
	}

	// ─── Chain index (all networks) ───

	async loadChainIndex(): Promise<void> {
		this.chainIndexLoading = true;
		try {
			const resp = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-chains.json`);
			const json = await resp.json();
			this.chainIndex = Array.isArray(json) ? json : (json.data || []);
			this.log(`Loaded ${this.chainIndex.length} networks`, 'info');
		} catch (e) {
			this.log('Failed to load chain index: ' + (e instanceof Error ? e.message : String(e)), 'warn');
		} finally {
			this.chainIndexLoading = false;
		}
	}

	/** Search chains by name, shortName, symbol, or chainId */
	searchNetworks(query: string): ChainInfo[] {
		if (!query.trim()) return this.chainIndex.slice(0, 20);

		const q = query.toLowerCase();
		const filtered = this.chainIndex.filter((c) => {
			const name = (c.name || '').toLowerCase();
			const shortName = (c.shortName || '').toLowerCase();
			const symbol = (c.nativeCurrencySymbol || '').toLowerCase();
			const idStr = String(c.chainId);
			return name.includes(q) || shortName.includes(q) || symbol.includes(q) || idStr === q;
		});

		// Sort: exact matches first, then by name
		return filtered
			.sort((a, b) => {
				const aExact =
					String(a.chainId) === query.trim() || a.shortName?.toLowerCase() === q;
				const bExact =
					String(b.chainId) === query.trim() || b.shortName?.toLowerCase() === q;
				if (aExact && !bExact) return -1;
				if (!aExact && bExact) return 1;
				return (a.name || '').localeCompare(b.name || '');
			})
			.slice(0, 30);
	}

	updateSearchResults(): void {
		this.networkSearchResults = this.searchNetworks(this.networkSearchQuery);
	}

	openNetworkDropdown(): void {
		this.networkDropdownOpen = true;
		this.updateSearchResults();
	}

	closeNetworkDropdown(): void {
		// Delay to allow click on results
		setTimeout(() => {
			this.networkDropdownOpen = false;
		}, 200);
	}

	// ─── Network selection ───

	async selectNetwork(chain: ChainInfo): Promise<void> {
		this.selectedChain = chain;
		this.networkSearchQuery = `${chain.name} (${chain.chainId})`;
		this.networkDropdownOpen = false;
		this.explorerUrl = '';
		this.rpcOptions = [];
		this.selectedRpc = '';
		this.customRpc = '';
		this.networkCheck = null;

		// Fetch full chain data for RPC list & explorer
		this.chainDataLoading = true;
		try {
			const resp = await fetch(
				`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${chain.chainId}.json`
			);
			if (resp.ok) {
				const data = await resp.json();
				this.fullChainData = data;

				// Filter public HTTPS RPCs (no template variables)
				const rpcs = (data.rpc || []).filter(
					(r: string) =>
						typeof r === 'string' &&
						r.startsWith('https://') &&
						!r.includes('${') &&
						!r.includes('$\\{')
				);
				this.rpcOptions = rpcs;
				this.explorerUrl = data.explorers?.[0]?.url || '';

				if (rpcs.length > 0) {
					// Run RPC probing + network check in parallel:
					// 1. Probe all RPCs (updates UI progressively)
					// 2. Network check uses first responding RPC immediately
					const probePromise = this.probeAllRpcs(rpcs);

					// Use first responding RPC for immediate network check
					const firstRpc = await this.raceFirstWorkingRpc(rpcs);
					if (firstRpc) {
						this.selectedRpc = firstRpc;
						this.updatePredictedAddress();
						// Start network check immediately with first working RPC
						this.runNetworkCheck();
					}

					// Wait for all probes to finish, then auto-select fastest
					const fastest = await probePromise;
					if (fastest && fastest !== this.selectedRpc) {
						this.selectedRpc = fastest;
					}
				}
			}
		} catch (e) {
			this.log('Failed to load chain data: ' + (e instanceof Error ? e.message : String(e)), 'warn');
		} finally {
			this.chainDataLoading = false;
		}

		this.updatePredictedAddress();
	}

	/** Called when user switches RPC — re-run network check */
	switchRpc(rpc: string): void {
		this.selectedRpc = rpc;
		if (rpc !== '__custom__') {
			this.customRpc = '';
		}
		// Re-check with new RPC
		this.runNetworkCheck();
	}

	/** Check if the selected network has all required infrastructure */
	async runNetworkCheck(): Promise<void> {
		const rpc = this.effectiveRpc;
		if (!rpc || !this.selectedChain) {
			this.networkCheck = null;
			return;
		}

		this.networkChecking = true;
		this.networkCheck = null;
		this.log(`Checking network ${this.selectedChain.name} (${this.selectedChain.chainId})...`);

		try {
			const result = await checkNetworkSupport({
				rpcUrl: rpc,
				chainId: this.selectedChain.chainId,
				safeAddress: authStore.user?.safeAddress
			});

			this.networkCheck = result;

			if (result.ready) {
				this.log(`Network ready — all contracts deployed, bundler available`, 'ok');
				if (result.gasBalance !== null) {
					const ethBalance = Number(result.gasBalance) / 1e18;
					this.log(`Gas balance: ${ethBalance.toFixed(6)} ${this.selectedChain.nativeCurrencySymbol || 'ETH'}`, 'info');
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

	/**
	 * Race RPCs — resolve as soon as the first one responds OK.
	 * Used to unblock network check immediately while full probing continues.
	 */
	async raceFirstWorkingRpc(rpcs: string[]): Promise<string | null> {
		if (rpcs.length === 0) return null;

		return new Promise((resolve) => {
			let resolved = false;
			let pending = rpcs.length;

			for (const url of rpcs) {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 4000);

				fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
					signal: controller.signal
				})
					.then(async (res) => {
						clearTimeout(timeoutId);
						if (!res.ok) throw new Error();
						const json = await res.json();
						if (json.error) throw new Error();
						if (!resolved) {
							resolved = true;
							resolve(url);
						}
					})
					.catch(() => {
						clearTimeout(timeoutId);
						pending--;
						if (pending === 0 && !resolved) {
							resolve(null);
						}
					});
			}
		});
	}

	/**
	 * Probe all RPCs in parallel, measure latency, store results.
	 * Auto-selects the fastest working RPC.
	 */
	async probeAllRpcs(rpcs: string[]): Promise<string> {
		if (rpcs.length === 0) return '';

		this.rpcProbing = true;

		// Initialize all as pending
		const probes: Record<string, RpcProbeResult> = {};
		for (const url of rpcs) {
			probes[url] = { url, status: 'pending', latencyMs: null };
		}
		this.rpcProbes = { ...probes };

		// Probe each RPC in parallel (5s timeout per probe)
		const probePromises = rpcs.map(async (url) => {
			const start = performance.now();
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);
				const res = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
					signal: controller.signal
				});
				clearTimeout(timeoutId);

				const latencyMs = Math.round(performance.now() - start);

				if (!res.ok) {
					const result: RpcProbeResult = { url, status: 'error', latencyMs: null, error: `HTTP ${res.status}` };
					probes[url] = result;
					this.rpcProbes = { ...probes };
					return result;
				}

				const json = await res.json();
				if (json.error) {
					const result: RpcProbeResult = { url, status: 'error', latencyMs: null, error: json.error.message };
					probes[url] = result;
					this.rpcProbes = { ...probes };
					return result;
				}

				const result: RpcProbeResult = { url, status: 'ok', latencyMs };
				probes[url] = result;
				this.rpcProbes = { ...probes };
				return result;
			} catch (e) {
				const result: RpcProbeResult = {
					url,
					status: 'error',
					latencyMs: null,
					error: e instanceof DOMException ? 'Timeout' : (e instanceof Error ? e.message : 'Failed')
				};
				probes[url] = result;
				this.rpcProbes = { ...probes };
				return result;
			}
		});

		const results = await Promise.all(probePromises);
		this.rpcProbing = false;

		// Pick fastest working RPC
		const working = results
			.filter((r): r is RpcProbeResult & { status: 'ok'; latencyMs: number } =>
				r.status === 'ok' && r.latencyMs !== null
			)
			.sort((a, b) => a.latencyMs - b.latencyMs);

		if (working.length > 0) {
			const best = working[0];
			this.log(`RPC: ${new URL(best.url).hostname} (${best.latencyMs}ms)`, 'info');
			return best.url;
		}

		this.log('No RPC responded — use Custom RPC', 'warn');
		return rpcs[0];
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
		} catch {
			this.addressAlreadyDeployed = false;
		} finally {
			this.checkingAddress = false;
		}
	}

	// ─── Deploy ───

	async deploy(): Promise<void> {
		const contract = this.selectedContract;
		const user = authStore.user;
		const chain = this.selectedChain;
		const networkKey = this.safeNetworkKey;

		if (!contract || !user || !chain || !networkKey || !this.canDeploy) return;

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
		this.log(`Deploying ${contract.name} to ${chain.name} (${chain.chainId})...`);
		this.log(`Predicted address: ${predicted}`);

		try {
			const result = await sendContractCall({
				safeAddress: user.safeAddress as Address,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: CREATE2_PROXY as Address,
				value: 0n,
				data: calldata,
				network: networkKey,
				gasOverrides: this.gasOverrides,
				onStatus: (status: SendStatus) => {
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
					chainId: chain.chainId,
					chainName: chain.name,
					address: predicted as Address,
					salt: this.salt as Hex,
					constructorArgs: values,
					txHash: result.txHash as Hex,
					deployer: user.safeAddress as Address,
					verified: false
				};
				await saveDeployment(record);
				await this.loadHistory();
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
		const chain = this.selectedChain;
		if (!contract || !chain) return;

		const address = this.verifyAddress.trim();
		if (!address) {
			this.log('Enter the deployed contract address', 'error');
			return;
		}

		this.verifying = true;
		this.log(`Verifying ${contract.name} at ${address}...`);

		try {
			const result = await this.client.verify({
				contractName: contract.name,
				contractFile: `src/${contract.file}`,
				address,
				chainId: chain.chainId,
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
		await Promise.all([this.loadHistory(), this.loadChainIndex()]);
		await this.connect();
	}
}

export const deployStore = new DeployStore();
