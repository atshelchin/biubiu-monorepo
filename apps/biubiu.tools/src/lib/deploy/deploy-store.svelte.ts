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
}

export const SUPPORTED_NETWORKS: SupportedNetwork[] = [
	{ key: 'eth-mainnet', name: 'Ethereum', chainId: 1, nativeSymbol: 'ETH' },
	{ key: 'arb-mainnet', name: 'Arbitrum', chainId: 42161, nativeSymbol: 'ETH' },
	{ key: 'base-mainnet', name: 'Base', chainId: 8453, nativeSymbol: 'ETH' },
	{ key: 'opt-mainnet', name: 'Optimism', chainId: 10, nativeSymbol: 'ETH' },
	{ key: 'matic-mainnet', name: 'Polygon', chainId: 137, nativeSymbol: 'POL' },
	{ key: 'bnb-mainnet', name: 'BNB Chain', chainId: 56, nativeSymbol: 'BNB' },
	{ key: 'avax-mainnet', name: 'Avalanche', chainId: 43114, nativeSymbol: 'AVAX' },
	{ key: 'gnosis-mainnet', name: 'Gnosis', chainId: 100, nativeSymbol: 'xDAI' }
];

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

	// Chain selection (from verified SUPPORTED_NETWORKS only)
	selectedNetworkKey = $state('');
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

	get selectedNetwork(): SupportedNetwork | null {
		return SUPPORTED_NETWORKS.find((n) => n.key === this.selectedNetworkKey) ?? null;
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
			authStore.isLoggedIn &&
			this.selectedContract !== null &&
			this.selectedNetwork !== null &&
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
			this.gasLimitInput = '';
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

	// ─── Network selection ───

	async selectNetwork(key: string): Promise<void> {
		this.selectedNetworkKey = key;
		this.explorerUrl = '';
		this.rpcOptions = [];
		this.selectedRpc = '';
		this.customRpc = '';
		this.networkCheck = null;

		const network = this.selectedNetwork;
		if (!network) return;

		// Fetch full chain data for RPC list & explorer
		this.chainDataLoading = true;
		try {
			const resp = await fetch(
				`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${network.chainId}.json`
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
					// RPC probing + network check in parallel
					const probePromise = this.probeAllRpcs(rpcs);

					// Use first responding RPC for immediate network check + gas price fetch
					const firstRpc = await this.raceFirstWorkingRpc(rpcs);
					if (firstRpc) {
						this.selectedRpc = firstRpc;
						this.updatePredictedAddress();
						this.runNetworkCheck();
						this.fetchGasPrices();
					}

					// Wait for all probes, auto-select fastest
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

	/** Called when user switches RPC — re-run network check + refresh gas prices */
	switchRpc(rpc: string): void {
		this.selectedRpc = rpc;
		if (rpc !== '__custom__') {
			this.customRpc = '';
		}
		this.runNetworkCheck();
		this.fetchGasPrices();
	}

	/** Check if the selected network has all required infrastructure */
	async runNetworkCheck(): Promise<void> {
		const rpc = this.effectiveRpc;
		const network = this.selectedNetwork;
		if (!rpc || !network) {
			this.networkCheck = null;
			return;
		}

		this.networkChecking = true;
		this.networkCheck = null;
		this.log(`Checking ${network.name} (${network.chainId})...`);

		try {
			const result = await checkNetworkSupport({
				rpcUrl: rpc,
				chainId: network.chainId,
				safeAddress: authStore.user?.safeAddress
			});

			this.networkCheck = result;

			if (result.ready) {
				this.log(`Network ready — all contracts deployed, bundler available`, 'ok');
				if (result.gasBalance !== null) {
					const ethBalance = Number(result.gasBalance) / 1e18;
					this.log(`Gas balance: ${ethBalance.toFixed(6)} ${network.nativeSymbol}`, 'info');
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

	/** Gas unit: 'gwei' or 'wei', auto-detected from chain gas price */
	gasPriceUnit = $state<'gwei' | 'wei'>('gwei');

	/** Fetch gas prices from both chain RPC and bundler, use the higher (bundler has minimums) */
	async fetchGasPrices(): Promise<void> {
		const rpc = this.effectiveRpc;
		const network = this.selectedNetwork;
		if (!rpc || !network) return;

		try {
			// Fetch chain RPC price + bundler price in parallel
			const [chainRes, bundlerRes] = await Promise.all([
				fetch(rpc, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] })
				}).then(r => r.json()).catch(() => null),
				fetch('/api/bundler', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ method: 'pimlico_getUserOperationGasPrice', params: [], chainId: network.chainId })
				}).then(r => r.json()).catch(() => null)
			]);

			// Chain gas price
			const chainGasWei = chainRes?.result ? BigInt(chainRes.result) : 0n;

			// Bundler minimum (use "standard" tier — cheapest that bundler accepts)
			let bundlerMaxFee = 0n;
			let bundlerPriority = 0n;
			const bundlerData = bundlerRes?.result;
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
		} catch {
			// Non-critical
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
		const network = this.selectedNetwork;

		if (!contract || !user || !network || !this.canDeploy) return;

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
			const result = await sendContractCall({
				safeAddress: user.safeAddress as Address,
				publicKeyHex: user.publicKey,
				credentialId: user.credentialId,
				rpId: user.rpId,
				to: CREATE2_PROXY as Address,
				value: 0n,
				data: calldata,
				network: network.key,
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
					chainId: network.chainId,
					chainName: network.name,
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
		const network = this.selectedNetwork;
		if (!contract || !network) return;

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
