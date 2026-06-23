/**
 * Token Sender 向导状态（Svelte 5 runes class，同 authStore/subscriptionStore 风格）。
 *
 * 编排顺序：选网络/代币 → 录入收件人 → 复核+费用 → 逐批发送（每批一次 passkey）。
 * 发送层依赖注入 core/，UI 仅消费此 store。
 */
import type { Address, Hex } from 'viem';
import { formatUnits } from 'viem';
import { walletStore } from '$lib/wallet';
import { subscriptionStore } from '$lib/subscription';
import { CONTRACTS } from '$lib/auth/safe-tx/constants';
import type {
	BatchOutput,
	DistributionMode,
	FeeQuote,
	SendBatchRecord,
	SendRecord,
	TokenSenderNetwork,
	TokenType,
} from './types.js';
import { listNetworks } from './infra/networks.js';
import { parseRecipients, type ParseResult } from './core/parse.js';
import { quoteFee } from './core/fee.js';
import { preflight, type PreflightResult } from './core/orchestrator.js';
import { runSend } from './core/orchestrator.js';
import { createConnectedWallet } from './core/wallet.js';
import { putSend, listSends } from './history/send-history.js';
import {
	getCustomNetworks,
	saveCustomNetwork,
	deleteCustomNetwork,
	getRpcOverrides,
	saveRpcOverride,
	deleteRpcOverride,
} from './infra/custom-store.js';

export type WizardStep = 1 | 2 | 3 | 4;
export type ExecStatus = 'idle' | 'running' | 'done' | 'aborted';

export interface ProgressState {
	batchIndex: number;
	totalBatches: number;
	phase: string;
}

const DEFAULT_NETWORK = 'eth-mainnet';

class TokenSenderStore {
	// ── 向导 ──
	step = $state<WizardStep>(1);

	// ── Step 1：网络 + 代币 ──
	networkSlug = $state<string>(DEFAULT_NETWORK);
	tokenType = $state<TokenType>('native');
	tokenAddress = $state<string>('');
	tokenMeta = $state<{ symbol: string; decimals: number } | null>(null);
	tokenMetaLoading = $state(false);
	tokenMetaError = $state<string | null>(null);

	// ── Step 2：收件人 ──
	distributionMode = $state<DistributionMode>('specified');
	recipientsText = $state('');
	totalAmountInput = $state('');
	parsed = $state<ParseResult | null>(null);

	// ── Step 3：费用 + 预检 ──
	fee = $state<FeeQuote | null>(null);
	feeLoading = $state(false);
	pre = $state<PreflightResult | null>(null);
	preLoading = $state(false);
	reviewError = $state<string | null>(null);

	// ── Step 4：执行 ──
	execStatus = $state<ExecStatus>('idle');
	progress = $state<ProgressState>({ batchIndex: 0, totalBatches: 0, phase: '' });
	results = $state<BatchOutput[]>([]);
	failures = $state<{ batchIndex: number; error: string }[]>([]);
	private abortController: AbortController | null = null;
	/** 本次发送的起始时间戳，作为历史记录 id；resume 复用以更新同一条记录 */
	private sendStartedAt = 0;

	// ── 历史 ──
	history = $state<SendRecord[]>([]);

	// ── 自定义网络 + RPC 覆盖 ──
	customNetworks = $state<TokenSenderNetwork[]>([]);
	rpcOverrides = $state<Record<string, string[]>>({});

	// ── 派生 ──
	private withRpc(n: TokenSenderNetwork): TokenSenderNetwork {
		const ov = this.rpcOverrides[n.slug];
		return ov && ov.length > 0 ? { ...n, rpcs: ov } : n;
	}
	get networks(): TokenSenderNetwork[] {
		return [...listNetworks(), ...this.customNetworks].map((n) => this.withRpc(n));
	}
	get network(): TokenSenderNetwork {
		return this.networks.find((n) => n.slug === this.networkSlug) ?? this.networks[0];
	}
	/** 自定义链暂不支持发送（需经 Chain Setup 部署 Safe 基建 + bundler 支持） */
	get sendSupported(): boolean {
		return !this.network.isCustom;
	}
	get decimals(): number {
		return this.tokenType === 'native' ? this.network.decimals : (this.tokenMeta?.decimals ?? 18);
	}
	get symbol(): string {
		return this.tokenType === 'native' ? this.network.symbol : (this.tokenMeta?.symbol ?? 'TOKEN');
	}
	get isMember(): boolean {
		return subscriptionStore.isPremium;
	}
	get batchSize(): number {
		return this.tokenType === 'native' ? this.network.maxBatchNative : this.network.maxBatchErc20;
	}
	get totalBatches(): number {
		const n = this.parsed?.validCount ?? 0;
		return n === 0 ? 0 : Math.ceil(n / this.batchSize);
	}
	/** 本次发送总费用 = 每批费用 × 批次数（每笔交易都收；会员为 0） */
	get feeTotal(): bigint {
		return (this.fee?.amount ?? 0n) * BigInt(this.totalBatches);
	}
	get canProceedFromConfig(): boolean {
		if (this.tokenType === 'native') return true;
		return this.tokenMeta != null && this.tokenMetaError == null;
	}
	get canProceedFromRecipients(): boolean {
		return (this.parsed?.validCount ?? 0) > 0 && (this.parsed?.totalAmount ?? 0n) > 0n;
	}

	// ── 操作 ──

	setNetwork(slug: string): void {
		if (!this.networks.some((n) => n.slug === slug)) return;
		this.networkSlug = slug;
		// 切链后 ERC20 元数据失效
		this.tokenMeta = null;
		this.tokenMetaError = null;
		this.parsed = null;
	}

	setTokenType(t: TokenType): void {
		this.tokenType = t;
		this.tokenMeta = null;
		this.tokenMetaError = null;
		this.parsed = null;
	}

	async loadTokenMeta(): Promise<void> {
		const connected = walletStore.activeWallet;
		const addr = this.tokenAddress.trim();
		if (!connected) {
			this.tokenMetaError = 'Connect your wallet first';
			return;
		}
		if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
			this.tokenMetaError = 'Invalid token contract address';
			this.tokenMeta = null;
			return;
		}
		this.tokenMetaLoading = true;
		this.tokenMetaError = null;
		try {
			const wallet = createConnectedWallet(connected);
			const meta = await wallet.getErc20Meta(this.network, addr as Address);
			this.tokenMeta = meta;
		} catch {
			this.tokenMeta = null;
			this.tokenMetaError = 'Failed to read token metadata (check the address & network)';
		} finally {
			this.tokenMetaLoading = false;
		}
	}

	parse(): void {
		this.parsed = parseRecipients({
			text: this.recipientsText,
			mode: this.distributionMode,
			decimals: this.decimals,
			totalAmount: this.totalAmountInput || undefined,
		});
	}

	/** 进入 Step 3：算费用 + 预检 */
	async prepareReview(): Promise<void> {
		const connected = walletStore.activeWallet;
		this.reviewError = null;
		if (!connected) {
			this.reviewError = 'Connect your wallet first';
			return;
		}
		if (!this.parsed || this.parsed.validCount === 0) return;

		this.feeLoading = true;
		this.preLoading = true;
		try {
			const fee = await quoteFee({ network: this.network, isMember: this.isMember });
			this.fee = fee;

			const wallet = createConnectedWallet(connected);
			this.pre = await preflight({
				wallet,
				network: this.network,
				tokenType: this.tokenType,
				tokenAddress: this.tokenType === 'erc20' ? (this.tokenAddress.trim() as Address) : undefined,
				totalAmount: this.parsed.totalAmount,
				// 每笔都收 → 预检用总费用（每批 × 批次数）
				fee: { ...fee, amount: fee.amount * BigInt(this.totalBatches) },
			});
		} catch (e) {
			this.reviewError = e instanceof Error ? e.message : String(e);
		} finally {
			this.feeLoading = false;
			this.preLoading = false;
		}
	}

	/** 执行发送（逐批 passkey 确认） */
	async send(): Promise<void> {
		const connected = walletStore.activeWallet;
		if (!connected || !this.parsed || !this.fee) return;

		this.step = 4;
		this.execStatus = 'running';
		this.results = [];
		this.failures = [];
		this.progress = { batchIndex: 0, totalBatches: this.totalBatches, phase: 'starting' };
		this.abortController = new AbortController();

		const wallet = createConnectedWallet(connected);
		this.sendStartedAt = Date.now();
		const startedAt = this.sendStartedAt;

		const outcome = await runSend({
			wallet,
			network: this.network,
			tokenType: this.tokenType,
			tokenAddress: this.tokenType === 'erc20' ? (this.tokenAddress.trim() as Address) : undefined,
			recipients: this.parsed.recipients,
			batchSize: this.batchSize,
			fee: this.fee,
			interBatchDelayMs: 2500,
			signal: this.abortController.signal,
			onProgress: (p) => {
				this.progress = { batchIndex: p.batchIndex, totalBatches: p.totalBatches, phase: String(p.status) };
			},
			onBatchDone: (b) => {
				this.results = [...this.results, b];
			},
			onBatchFailed: (f) => {
				this.failures = [...this.failures, f];
			},
		});

		this.execStatus = outcome.aborted ? 'aborted' : 'done';

		await this.persistHistory(startedAt, outcome.results, outcome.failures);
	}

	abort(): void {
		this.abortController?.abort();
	}

	/** 尚未成功的批次数（>0 时显示「继续发送」） */
	get remainingBatches(): number {
		return Math.max(0, this.totalBatches - this.results.length);
	}

	/**
	 * 继续发送：仅跑尚未成功的批次，跳过已完成的——不对已打款地址重复发送，
	 * 费用也不重复收（已随首批支付）。失败的批会被重试。
	 */
	async resume(): Promise<void> {
		const connected = walletStore.activeWallet;
		if (!connected || !this.parsed || !this.fee || this.remainingBatches <= 0) return;

		this.step = 4;
		this.execStatus = 'running';
		this.failures = [];
		this.abortController = new AbortController();

		const completed = new Set(this.results.map((r) => r.batchIndex));
		const wallet = createConnectedWallet(connected);
		const startedAt = this.sendStartedAt || Date.now();

		const outcome = await runSend({
			wallet,
			network: this.network,
			tokenType: this.tokenType,
			tokenAddress: this.tokenType === 'erc20' ? (this.tokenAddress.trim() as Address) : undefined,
			recipients: this.parsed.recipients,
			batchSize: this.batchSize,
			fee: this.fee,
			interBatchDelayMs: 2500,
			completedBatchIndices: completed,
			signal: this.abortController.signal,
			onProgress: (p) => {
				this.progress = { batchIndex: p.batchIndex, totalBatches: p.totalBatches, phase: String(p.status) };
			},
			onBatchDone: (b) => {
				this.results = [...this.results, b];
			},
			onBatchFailed: (f) => {
				this.failures = [...this.failures, f];
			},
		});

		this.execStatus = outcome.aborted ? 'aborted' : 'done';
		await this.persistHistory(startedAt, this.results, outcome.failures);
	}

	private async persistHistory(
		startedAt: number,
		results: BatchOutput[],
		failures: { batchIndex: number; error: string }[],
	): Promise<void> {
		if (!this.parsed || !this.fee) return;
		const batches: SendBatchRecord[] = [];
		const sentCount = results.reduce((s, r) => s + r.successCount, 0);
		for (const r of results) {
			batches.push({
				index: r.batchIndex,
				txHash: r.txHash,
				status: 'confirmed',
				count: r.successCount,
				explorerUrl: r.explorerUrl,
			});
		}
		for (const f of failures) {
			batches.push({ index: f.batchIndex, status: 'failed', count: 0, error: f.error });
		}
		batches.sort((a, b) => a.index - b.index);

		const status: SendRecord['status'] =
			failures.length === 0 ? 'completed' : results.length === 0 ? 'failed' : 'partial';

		const record: SendRecord = {
			id: `send-${startedAt}`,
			createdAt: startedAt,
			network: this.network.slug,
			networkName: this.network.name,
			tokenType: this.tokenType,
			tokenAddress: this.tokenType === 'erc20' ? this.tokenAddress.trim() : undefined,
			tokenSymbol: this.symbol,
			decimals: this.decimals,
			totalRecipients: sentCount,
			totalAmount: this.parsed.totalAmount.toString(),
			feeWei: this.fee.amount.toString(),
			isMember: this.isMember,
			status,
			batches,
		};

		try {
			await putSend(record);
			await this.loadHistory();
		} catch {
			// 历史写入失败不影响主流程
		}
	}

	async loadHistory(): Promise<void> {
		try {
			this.history = await listSends(50);
		} catch {
			this.history = [];
		}
	}

	// ── 自定义网络 / RPC ──

	async hydrateCustom(): Promise<void> {
		try {
			const [nets, ov] = await Promise.all([getCustomNetworks(), getRpcOverrides()]);
			this.customNetworks = nets;
			this.rpcOverrides = ov;
		} catch {
			// ignore
		}
	}

	async addCustomNetwork(input: {
		name: string;
		chainId: number;
		rpc: string;
		symbol: string;
		explorerTxUrl?: string;
	}): Promise<void> {
		const slug = `custom-${input.chainId}`;
		const net: TokenSenderNetwork = {
			slug,
			name: input.name.trim() || `Chain ${input.chainId}`,
			chainId: input.chainId,
			symbol: input.symbol.trim() || 'TOKEN',
			decimals: 18,
			rpcs: [input.rpc.trim()],
			explorerTxUrl: (input.explorerTxUrl ?? '').trim(),
			multiSendAddress: CONTRACTS.multiSend as Address,
			maxBatchNative: 100,
			maxBatchErc20: 100,
			isCustom: true,
		};
		this.customNetworks = [...this.customNetworks.filter((n) => n.slug !== slug), net];
		this.networkSlug = slug;
		this.tokenMeta = null;
		this.parsed = null;
		try {
			await saveCustomNetwork(net);
		} catch {
			// 持久化失败不影响本次会话使用
		}
	}

	async removeCustomNetwork(slug: string): Promise<void> {
		this.customNetworks = this.customNetworks.filter((n) => n.slug !== slug);
		if (this.networkSlug === slug) this.networkSlug = DEFAULT_NETWORK;
		const next = { ...this.rpcOverrides };
		delete next[slug];
		this.rpcOverrides = next;
		try {
			await deleteCustomNetwork(slug);
			await deleteRpcOverride(slug);
		} catch {
			// ignore
		}
	}

	async setRpcOverride(slug: string, rpcs: string[]): Promise<void> {
		const clean = rpcs.map((r) => r.trim()).filter(Boolean);
		if (clean.length === 0) {
			await this.clearRpcOverride(slug);
			return;
		}
		this.rpcOverrides = { ...this.rpcOverrides, [slug]: clean };
		try {
			await saveRpcOverride(slug, clean);
		} catch {
			// ignore
		}
	}

	async clearRpcOverride(slug: string): Promise<void> {
		const next = { ...this.rpcOverrides };
		delete next[slug];
		this.rpcOverrides = next;
		try {
			await deleteRpcOverride(slug);
		} catch {
			// ignore
		}
	}

	/** 校验某 RPC 上 MultiSend 1.4.1 是否部署（添加网络时给用户反馈） */
	async verifyMultiSend(rpc: string): Promise<boolean> {
		try {
			const res = await fetch(rpc.trim(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_getCode',
					params: [CONTRACTS.multiSend, 'latest'],
				}),
			});
			const json = await res.json();
			const code = json?.result;
			return typeof code === 'string' && code !== '0x' && code.length > 2;
		} catch {
			return false;
		}
	}

	/** 格式化金额（用当前代币精度） */
	fmt(wei: bigint, decimals = this.decimals): string {
		return formatUnits(wei, decimals);
	}

	goTo(step: WizardStep): void {
		this.step = step;
	}

	reset(): void {
		this.step = 1;
		this.execStatus = 'idle';
		this.results = [];
		this.failures = [];
		this.parsed = null;
		this.fee = null;
		this.pre = null;
		this.recipientsText = '';
		this.totalAmountInput = '';
		this.progress = { batchIndex: 0, totalBatches: 0, phase: '' };
		this.abortController = null;
	}
}

export const tokenSender = new TokenSenderStore();
