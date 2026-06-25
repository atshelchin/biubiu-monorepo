/**
 * Reactive store for Vela Wallet Chain Setup wizard.
 *
 * Manages: chain search → contract checking → step-by-step deployment guidance.
 * Designed for beginners — hides complexity, surfaces one action at a time.
 */

import {
	REQUIRED_CONTRACTS,
	CONTRACT_ORDER,
	ARACHNID_DEPLOYER_EOA,
	ARACHNID_FUNDING_WEI,
	MULTICALL3_DEPLOYER_EOA,
	MULTICALL3_FUNDING_WEI,
	SAFE_FACTORY_GITHUB_URL,
	type ContractStatus,
	checkAllContracts,
	broadcastArachnidTx,
	broadcastMulticall3Tx,
	waitForTx,
	rpcCall,
	hasCode,
	getBalance,
	getGasPrice,
} from './contracts.js';
import {
	getOrCreateDeployerWallet,
	loadExistingWallet,
	getDeployerBalance,
	sendDeployerTx,
	downloadPrivateKey,
	type DeployerWallet,
} from './deployer-wallet.js';
import deploymentDataJson from './deployment-data.json';
import type { Hex } from 'viem';

/** Deployment data loaded from static JSON */
const DEPLOYMENT_DATA = deploymentDataJson as Record<
	string,
	{ factory: string; salt: string; initCode: string }
>;

// ─── Chain search (reuse ethereum-data API) ───

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

export interface ChainSearchResult {
	chainId: number;
	name: string;
	shortName: string;
	nativeCurrencySymbol: string;
	hasLogo: boolean;
}

export interface ChainInfo {
	chainId: number;
	name: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
	rpcUrls: string[];
	explorerUrl: string;
	logoURL: string;
	isTestnet: boolean;
}

// ─── Types ───

export type WizardStep = 'select-chain' | 'checking' | 'results' | 'complete';

export type DeploySubStep =
	| 'idle'
	| 'fund-deployer'
	| 'broadcast-tx'
	| 'deploying'
	| 'waiting'
	| 'success'
	| 'error';

// ─── Store ───

let _searchCache: ChainSearchResult[] | null = null;

class VelaChainSetupStore {
	// ── Wizard navigation ──
	step = $state<WizardStep>('select-chain');

	// ── Chain search ──
	searchQuery = $state('');
	searchResults = $state<ChainSearchResult[]>([]);
	searching = $state(false);

	// ── Selected chain ──
	selectedChain = $state<ChainInfo | null>(null);

	// ── RPC ──
	rpcUrl = $state('');
	rpcLatency = $state<number | null>(null);
	rpcError = $state('');
	/** All discovered RPC URLs with their probe results */
	rpcOptions = $state<{ url: string; latencyMs: number | null; status: 'ok' | 'error' | 'pending' }[]>([]);
	/** User-entered custom RPC */
	customRpcInput = $state('');
	/** Whether we're using a custom RPC */
	usingCustomRpc = $state(false);

	// ── Contract check results ──
	contractStatuses = $state<ContractStatus[]>([]);
	p256Available = $state(false);
	checking = $state(false);
	checkError = $state('');

	// ── Deployment state ──
	/** Which contract is currently being addressed */
	activeContractKey = $state('');
	deploySubStep = $state<DeploySubStep>('idle');
	deployError = $state('');
	deployTxHash = $state('');

	// ── Arachnid-specific ──
	arachnidDeployerBalance = $state<bigint>(0n);
	currentGasPrice = $state<bigint>(0n);

	// ── Multicall3-specific ──
	multicall3DeployerBalance = $state<bigint>(0n);

	// ── Deployer EOA wallet (generated in-browser) ──
	deployerWallet = $state<DeployerWallet | null>(null);
	deployerBalance = $state<bigint>(0n);
	deployerBalanceLoading = $state(false);

	// ── Computed ──

	get deployedCount(): number {
		return this.contractStatuses.filter((s) => s.deployed).length;
	}

	get totalCount(): number {
		return this.contractStatuses.length;
	}

	get allDeployed(): boolean {
		return this.contractStatuses.length > 0 && this.contractStatuses.every((s) => s.deployed);
	}

	get missingContracts(): ContractStatus[] {
		return this.contractStatuses.filter((s) => !s.deployed);
	}

	/** The next contract that needs attention (respects dependency order) */
	get nextAction(): ContractStatus | null {
		// Return the first missing contract in layer order
		for (const key of CONTRACT_ORDER) {
			const status = this.contractStatuses.find((s) => s.key === key);
			if (status && !status.deployed) return status;
		}
		return null;
	}

	get chainLogoUrl(): string {
		if (!this.selectedChain) return '';
		return `${ETHEREUM_DATA_BASE_URL}/chainlogos/eip155-${this.selectedChain.chainId}.png`;
	}

	/** Estimated total deployment cost for missing user-deployable contracts */
	get estimatedTotalGas(): bigint {
		return this.missingContracts
			.filter((s) => s.def.deployMethod !== 'external')
			.reduce((sum, s) => sum + s.def.estimatedGas, 0n);
	}

	// ── Actions ──

	async searchChains(query: string) {
		this.searchQuery = query;
		if (!query.trim()) {
			this.searchResults = [];
			return;
		}

		this.searching = true;
		try {
			const chains = await this.loadSearchIndex();
			const q = query.toLowerCase().trim();
			const chainIdNum = parseInt(q, 10);
			const exactMatch = !isNaN(chainIdNum) ? chains.find((c) => c.chainId === chainIdNum) : null;

			const matches = chains.filter(
				(c) =>
					c.name.toLowerCase().includes(q) ||
					c.nativeCurrencySymbol.toLowerCase().includes(q) ||
					c.shortName.toLowerCase().includes(q) ||
					String(c.chainId).includes(q),
			);

			const results: ChainSearchResult[] = [];
			if (exactMatch) results.push(exactMatch);
			for (const m of matches) {
				if (!results.find((r) => r.chainId === m.chainId)) results.push(m);
				if (results.length >= 10) break;
			}
			this.searchResults = results;
		} catch {
			this.searchResults = [];
		} finally {
			this.searching = false;
		}
	}

	async selectChain(chainId: number) {
		this.step = 'checking';
		this.checking = true;
		this.checkError = '';
		this.contractStatuses = [];
		this.resetDeployState();

		try {
			// Fetch chain info
			const res = await fetch(`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${chainId}.json`);
			if (!res.ok) throw new Error('Chain not found');
			const data = await res.json();

			const rpcUrls = this.extractRpcUrls(data);
			if (rpcUrls.length === 0) throw new Error('No RPC endpoints available for this chain');

			this.selectedChain = {
				chainId: data.chainId ?? chainId,
				name: data.name ?? `Chain ${chainId}`,
				nativeCurrency: {
					name: data.nativeCurrency?.name ?? 'Ether',
					symbol: data.nativeCurrency?.symbol ?? 'ETH',
					decimals: data.nativeCurrency?.decimals ?? 18,
				},
				rpcUrls,
				explorerUrl: data.explorers?.[0]?.url ?? '',
				logoURL: `${ETHEREUM_DATA_BASE_URL}/chainlogos/eip155-${chainId}.png`,
				isTestnet: data.testnet === true,
			};

			// Restore saved RPC or find fastest
			const savedRpc = this.loadSavedRpc(chainId);
			if (savedRpc) {
				this.rpcUrl = savedRpc;
				this.usingCustomRpc = !rpcUrls.includes(savedRpc);
			} else {
				await this.findBestRpc(rpcUrls);
			}
			if (!this.rpcUrl) throw new Error('All RPC endpoints are unreachable');

			// Probe all RPCs in background (for the selector UI)
			this.probeAllRpcs(rpcUrls);

			// Auto-load existing deployer wallet from localStorage
			const existingWallet = loadExistingWallet(chainId);
			if (existingWallet) {
				this.deployerWallet = existingWallet;
				this.refreshDeployerBalance();
			}

			// Check all contracts
			await this.runCheck();
		} catch (e) {
			this.checkError = e instanceof Error ? e.message : 'Failed to load chain info';
			this.step = 'results';
		} finally {
			this.checking = false;
		}
	}

	async runCheck() {
		this.checking = true;
		this.checkError = '';

		try {
			const result = await checkAllContracts(this.rpcUrl);
			this.contractStatuses = result.contracts;
			this.p256Available = result.p256Available;

			if (this.allDeployed && this.p256Available) {
				this.step = 'complete';
			} else {
				this.step = 'results';
			}
		} catch (e) {
			this.checkError = e instanceof Error ? e.message : 'Check failed';
			this.step = 'results';
		} finally {
			this.checking = false;
		}
	}

	async recheck() {
		if (!this.rpcUrl) return;
		this.step = 'checking';
		await this.runCheck();
	}

	// ── RPC management ──

	/** Switch to a discovered RPC and re-check */
	async switchRpc(url: string) {
		this.rpcUrl = url;
		this.usingCustomRpc = false;
		this.rpcLatency = this.rpcOptions.find((r) => r.url === url)?.latencyMs ?? null;
		this.saveRpcChoice(url);
		await this.recheck();
	}

	/** Apply a custom RPC URL and re-check */
	async applyCustomRpc() {
		const url = this.customRpcInput.trim();
		if (!url) return;

		// Quick validation: try eth_chainId
		this.rpcError = '';
		try {
			const result = (await rpcCall(url, 'eth_chainId', [])) as string;
			const remoteChainId = parseInt(result, 16);
			if (this.selectedChain && remoteChainId !== this.selectedChain.chainId) {
				this.rpcError = `Chain ID mismatch: RPC returned ${remoteChainId}, expected ${this.selectedChain.chainId}`;
				return;
			}
		} catch (e) {
			this.rpcError = e instanceof Error ? e.message : 'RPC is unreachable';
			return;
		}

		this.rpcUrl = url;
		this.usingCustomRpc = true;
		this.rpcLatency = null;
		this.saveRpcChoice(url);
		await this.recheck();
	}

	/** Probe all RPCs in parallel for latency display */
	private async probeAllRpcs(urls: string[]) {
		this.rpcOptions = urls.map((url) => ({ url, latencyMs: null, status: 'pending' as const }));

		await Promise.allSettled(
			urls.map(async (url, i) => {
				try {
					const start = performance.now();
					const res = await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
						signal: AbortSignal.timeout(5000),
					});
					const json = await res.json();
					if (json.error) throw new Error(json.error.message);
					const latency = Math.round(performance.now() - start);
					this.rpcOptions[i] = { url, latencyMs: latency, status: 'ok' };
				} catch {
					this.rpcOptions[i] = { url, latencyMs: null, status: 'error' };
				}
			}),
		);
	}

	// ── Arachnid proxy deployment (Nick's method) ──

	async startArachnidDeploy() {
		this.activeContractKey = 'arachnidProxy';
		this.deployError = '';
		this.deploySubStep = 'fund-deployer';

		try {
			// Check deployer balance
			this.arachnidDeployerBalance = await getBalance(this.rpcUrl, ARACHNID_DEPLOYER_EOA);
			this.currentGasPrice = await getGasPrice(this.rpcUrl);
		} catch (e) {
			this.deployError = e instanceof Error ? e.message : 'Failed to check deployer balance';
		}
	}

	async refreshArachnidBalance() {
		try {
			this.arachnidDeployerBalance = await getBalance(this.rpcUrl, ARACHNID_DEPLOYER_EOA);
		} catch {
			// ignore
		}
	}

	get arachnidFunded(): boolean {
		// The pre-signed tx uses 100 gwei gas price. Check if deployer has enough.
		return this.arachnidDeployerBalance >= ARACHNID_FUNDING_WEI;
	}

	async broadcastArachnid() {
		this.deploySubStep = 'broadcast-tx';
		this.deployError = '';

		try {
			const txHash = await broadcastArachnidTx(this.rpcUrl);
			this.deployTxHash = txHash;
			this.deploySubStep = 'waiting';

			const success = await waitForTx(this.rpcUrl, txHash);
			if (success) {
				this.deploySubStep = 'success';
				// Update contract status
				await this.recheck();
			} else {
				this.deploySubStep = 'error';
				this.deployError = 'Transaction failed or timed out';
			}
		} catch (e) {
			this.deploySubStep = 'error';
			this.deployError = e instanceof Error ? e.message : 'Broadcast failed';
		}
	}

	// ── Multicall3 deployment (pre-signed tx) ──

	async startMulticall3Deploy() {
		this.activeContractKey = 'multicall3';
		this.deployError = '';
		this.deploySubStep = 'fund-deployer';

		try {
			this.multicall3DeployerBalance = await getBalance(this.rpcUrl, MULTICALL3_DEPLOYER_EOA);
			this.currentGasPrice = await getGasPrice(this.rpcUrl);
		} catch (e) {
			this.deployError = e instanceof Error ? e.message : 'Failed to check deployer balance';
		}
	}

	async refreshMulticall3Balance() {
		try {
			this.multicall3DeployerBalance = await getBalance(this.rpcUrl, MULTICALL3_DEPLOYER_EOA);
		} catch {
			// ignore
		}
	}

	get multicall3Funded(): boolean {
		return this.multicall3DeployerBalance >= MULTICALL3_FUNDING_WEI;
	}

	async broadcastMulticall3() {
		this.deploySubStep = 'broadcast-tx';
		this.deployError = '';

		try {
			const txHash = await broadcastMulticall3Tx(this.rpcUrl);
			this.deployTxHash = txHash;
			this.deploySubStep = 'waiting';

			const success = await waitForTx(this.rpcUrl, txHash);
			if (success) {
				this.deploySubStep = 'success';
				// Update status in-place
				const status = this.contractStatuses.find((s) => s.key === 'multicall3');
				if (status) {
					status.deployed = true;
					status.verified = true;
				}
			} else {
				this.deploySubStep = 'error';
				this.deployError = 'Transaction failed or timed out';
			}
		} catch (e) {
			this.deploySubStep = 'error';
			this.deployError = e instanceof Error ? e.message : 'Broadcast failed';
		}
	}

	// ── Safe Singleton Factory (external — just info) ──

	get safeSingletonFactoryUrl(): string {
		return SAFE_FACTORY_GITHUB_URL;
	}

	// ── Deployer wallet management ──

	/**
	 * Initialize or retrieve the deployer wallet for the selected chain.
	 * Generates a random private key if none exists, stored in localStorage.
	 */
	initDeployerWallet() {
		if (!this.selectedChain) return;
		this.deployerWallet = getOrCreateDeployerWallet(this.selectedChain.chainId);
		this.refreshDeployerBalance();
	}

	async refreshDeployerBalance() {
		if (!this.deployerWallet || !this.rpcUrl) return;
		this.deployerBalanceLoading = true;
		try {
			this.deployerBalance = await getDeployerBalance(this.rpcUrl, this.deployerWallet.address);
		} catch {
			// Non-critical
		} finally {
			this.deployerBalanceLoading = false;
		}
	}

	downloadDeployerKey() {
		if (!this.deployerWallet) return;
		downloadPrivateKey(this.deployerWallet);
	}

	get deployerHasFunds(): boolean {
		return this.deployerBalance > 0n;
	}

	/**
	 * Deploy a contract using the deployer wallet.
	 * Handles both Arachnid proxy calls and Safe Singleton Factory calls.
	 */
	/** Deploy a single contract. Updates status in-place without full recheck. */
	async deployContract(contractKey: string): Promise<boolean> {
		const status = this.contractStatuses.find((s) => s.key === contractKey);
		if (!status || status.deployed) return true;
		if (!this.deployerWallet || !this.selectedChain) return false;

		this.activeContractKey = contractKey;
		this.deploySubStep = 'deploying';
		this.deployError = '';
		this.deployTxHash = '';

		try {
			const { to, data } = this.getDeployCalldata(contractKey);

			// Estimate gas on-chain
			let gasLimit = status.def.estimatedGas;
			try {
				const estimated = (await rpcCall(this.rpcUrl, 'eth_estimateGas', [
					{ from: this.deployerWallet.address, to, data },
				])) as string;
				const onChainGas = (BigInt(estimated) * 120n) / 100n;
				gasLimit = onChainGas > gasLimit ? onChainGas : gasLimit;
			} catch {
				// Use hardcoded estimate
			}

			const txHash = await sendDeployerTx(
				this.rpcUrl,
				this.selectedChain.chainId,
				this.deployerWallet.privateKey,
				{ to: to as `0x${string}`, data: data as Hex, gas: gasLimit },
			);
			this.deployTxHash = txHash;
			this.deploySubStep = 'waiting';

			const success = await waitForTx(this.rpcUrl, txHash, 120_000);
			if (success) {
				// Update this contract's status in-place (no full recheck)
				status.deployed = true;
				status.verified = true;
				this.deploySubStep = 'success';
				return true;
			} else {
				this.deploySubStep = 'error';
				this.deployError = 'Transaction reverted. Check explorer for details.';
				return false;
			}
		} catch (e) {
			this.deploySubStep = 'error';
			const msg = e instanceof Error ? e.message : 'Deployment failed';
			if (msg.includes('insufficient funds')) {
				this.deployError = 'Insufficient funds — send more native tokens to the deployer wallet.';
			} else if (msg.includes('already known')) {
				this.deployError = 'Transaction already submitted. Wait for confirmation.';
			} else if (msg.includes('nonce')) {
				this.deployError = 'Nonce conflict — a previous tx may still be pending. Wait and retry.';
			} else {
				this.deployError = msg;
			}
			return false;
		}
	}

	/**
	 * Deploy all deployable missing contracts sequentially.
	 * Shows progress for each, pauses briefly between successes, stops on error.
	 */
	deploying = $state(false);
	deployProgress = $state('');

	async deployAllMissing(keys?: string[]) {
		if (!this.deployerWallet || !this.selectedChain) return;

		// Honor the UI-scoped set when keys are passed. The deploy page renders a
		// live progress list over exactly these contracts, so the loop, the count,
		// and `activeContractKey` must match it — otherwise we'd silently deploy
		// contracts the user never saw (and possibly hit a getDeployCalldata throw
		// for presigned-tx/nicks-method contracts with no DEPLOYMENT_DATA entry).
		const deployable =
			keys && keys.length
				? keys
						.map((k) => this.contractStatuses.find((s) => s.key === k))
						.filter((s): s is ContractStatus => !!s && !s.deployed)
				: this.missingContracts.filter((c) => c.def.deployMethod !== 'external');
		if (deployable.length === 0) return;

		this.deploying = true;
		let successCount = 0;

		for (const contract of deployable) {
			this.deployProgress = `Deploying ${contract.def.name} (${successCount + 1}/${deployable.length})...`;

			const ok = await this.deployContract(contract.key);
			if (!ok) {
				// Stop on failure — user can retry
				break;
			}

			successCount++;

			// Brief pause between deploys to let user see the success
			if (successCount < deployable.length) {
				await new Promise((r) => setTimeout(r, 1500));
			}
		}

		this.deploying = false;
		this.deployProgress = '';

		// Refresh balance after all deploys
		await this.refreshDeployerBalance();

		// If all deployed and P256 available, go to complete
		if (this.allDeployed && this.p256Available) {
			this.step = 'complete';
		}
	}

	/**
	 * Get deployment calldata for a contract.
	 *
	 * Both Arachnid proxy and Safe Singleton Factory use the same calldata format:
	 * data = salt (32 bytes) + initCode (creation bytecode)
	 */
	getDeployCalldata(contractKey: string): { to: string; data: string } {
		const def = REQUIRED_CONTRACTS[contractKey];
		if (!def) throw new Error(`Unknown contract: ${contractKey}`);

		const deployData = DEPLOYMENT_DATA[contractKey];
		if (!deployData) {
			throw new Error(`Deployment data for ${def.name} is not configured.`);
		}

		// Determine factory address
		const ARACHNID_PROXY = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
		const SAFE_FACTORY = '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7';

		const to = deployData.factory === 'arachnid' ? ARACHNID_PROXY : SAFE_FACTORY;

		// Calldata = salt (32 bytes, no 0x) + initCode (no 0x)
		const salt = deployData.salt.startsWith('0x') ? deployData.salt.slice(2) : deployData.salt;
		const initCode = deployData.initCode.startsWith('0x')
			? deployData.initCode.slice(2)
			: deployData.initCode;
		const data = '0x' + salt + initCode;

		return { to, data };
	}

	// ── Helpers ──

	resetDeployState() {
		this.activeContractKey = '';
		this.deploySubStep = 'idle';
		this.deployError = '';
		this.deployTxHash = '';
		this.arachnidDeployerBalance = 0n;
		// Note: deployerWallet is NOT reset — it persists across re-checks
	}

	goBack() {
		this.step = 'select-chain';
		this.selectedChain = null;
		this.contractStatuses = [];
		this.searchQuery = '';
		this.searchResults = [];
		this.rpcUrl = '';
		this.rpcLatency = null;
		this.rpcError = '';
		this.rpcOptions = [];
		this.customRpcInput = '';
		this.usingCustomRpc = false;
		this.checkError = '';
		this.deployerWallet = null;
		this.deployerBalance = 0n;
		this.resetDeployState();
	}

	private async findBestRpc(urls: string[]) {
		// Race all RPCs — pick first to respond
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		try {
			const results = await Promise.allSettled(
				urls.map(async (url) => {
					const start = performance.now();
					const res = await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
						signal: controller.signal,
					});
					const json = await res.json();
					if (json.error) throw new Error(json.error.message);
					return { url, latency: performance.now() - start };
				}),
			);

			// Pick fastest successful
			let best: { url: string; latency: number } | null = null;
			for (const r of results) {
				if (r.status === 'fulfilled' && (!best || r.value.latency < best.latency)) {
					best = r.value;
				}
			}

			if (best) {
				this.rpcUrl = best.url;
				this.rpcLatency = Math.round(best.latency);
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	private extractRpcUrls(data: any): string[] {
		if (!Array.isArray(data.rpc)) return [];
		return data.rpc.filter(
			(u: unknown) =>
				typeof u === 'string' &&
				u.startsWith('https://') &&
				!u.includes('${') &&
				!u.includes('API_KEY'),
		) as string[];
	}

	private async loadSearchIndex(): Promise<ChainSearchResult[]> {
		if (_searchCache) return _searchCache;
		const res = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-chains.json`);
		if (!res.ok) return [];
		const json = await res.json();
		_searchCache = json.data as ChainSearchResult[];
		return _searchCache;
	}

	// ── RPC persistence ──

	private static readonly RPC_STORAGE_KEY = 'vela-chain-setup-rpc';

	private saveRpcChoice(url: string) {
		if (!this.selectedChain) return;
		try {
			const all = JSON.parse(localStorage.getItem(VelaChainSetupStore.RPC_STORAGE_KEY) ?? '{}');
			all[String(this.selectedChain.chainId)] = url;
			localStorage.setItem(VelaChainSetupStore.RPC_STORAGE_KEY, JSON.stringify(all));
		} catch { /* non-critical */ }
	}

	private loadSavedRpc(chainId: number): string | null {
		try {
			const all = JSON.parse(localStorage.getItem(VelaChainSetupStore.RPC_STORAGE_KEY) ?? '{}');
			return all[String(chainId)] ?? null;
		} catch {
			return null;
		}
	}
}

export const velaSetupStore = new VelaChainSetupStore();
