/**
 * 发送编排（UI 无关，依赖注入）。
 *
 * - planBatches: 按 chunk 切分
 * - preflight:   余额预检（返回所需金额，供 UI 展示/拦截）
 * - runSend:     逐批构建 MultiSend → sendMultiSend（每批一次 passkey）→ 进度/结果回调
 */
import type { Address } from 'viem';
import type { SendStatus } from '$lib/auth/safe-tx/send-token';
import type {
	BatchOutput,
	FeeQuote,
	Recipient,
	TokenSenderNetwork,
	TokenType,
} from '../types.js';
import {
	buildBatchSubTransactions,
} from '../infra/multisend.js';
import { FEE_COLLECTOR } from '../infra/fee-config.js';
import type { SafeSenderWallet } from './wallet.js';

export function planBatches(recipients: Recipient[], batchSize: number): Recipient[][] {
	const out: Recipient[][] = [];
	const size = Math.max(1, batchSize);
	for (let i = 0; i < recipients.length; i += size) {
		out.push(recipients.slice(i, i + size));
	}
	return out;
}

export interface PreflightInput {
	wallet: SafeSenderWallet;
	network: TokenSenderNetwork;
	tokenType: TokenType;
	tokenAddress?: Address;
	totalAmount: bigint;
	fee: FeeQuote;
}

export interface PreflightResult {
	ok: boolean;
	/** 缺口说明（ok=false 时） */
	reason?: string;
	/** Safe 当前 native 余额 */
	nativeBalance: bigint;
	/** 需要的 native（native 发送总额 + 费用；不含 gas） */
	nativeNeeded: bigint;
	/** ERC20 余额（erc20 发送时） */
	tokenBalance?: bigint;
	/** ERC20 需求（= totalAmount） */
	tokenNeeded?: bigint;
}

/**
 * 预检 Safe 余额。注意：gas 由 Safe 用 native 另付（经 bundler），此处无法精确预估，
 * 仅校验确定性的「发送额 + 费用」，gas 不足会在发送时以批次失败暴露。
 */
export async function preflight(input: PreflightInput): Promise<PreflightResult> {
	const { wallet, network, tokenType, tokenAddress, totalAmount, fee } = input;
	const nativeBalance = await wallet.getNativeBalance(network);

	if (tokenType === 'native') {
		const nativeNeeded = totalAmount + fee.amount;
		const ok = nativeBalance >= nativeNeeded;
		return {
			ok,
			reason: ok ? undefined : 'insufficient-native',
			nativeBalance,
			nativeNeeded,
		};
	}

	// erc20：native 只需覆盖费用（+gas），代币需覆盖发送额
	if (!tokenAddress) throw new Error('tokenAddress required for erc20 preflight');
	const tokenBalance = await wallet.getErc20Balance(network, tokenAddress);
	const nativeNeeded = fee.amount;
	const okNative = nativeBalance >= nativeNeeded;
	const okToken = tokenBalance >= totalAmount;
	return {
		ok: okNative && okToken,
		reason: !okToken ? 'insufficient-token' : !okNative ? 'insufficient-native' : undefined,
		nativeBalance,
		nativeNeeded,
		tokenBalance,
		tokenNeeded: totalAmount,
	};
}

export interface RunSendDeps {
	wallet: SafeSenderWallet;
	network: TokenSenderNetwork;
	tokenType: TokenType;
	tokenAddress?: Address;
	recipients: Recipient[];
	batchSize: number;
	fee: FeeQuote;
	failurePolicy?: 'skip' | 'abort';
	onProgress?: (p: { batchIndex: number; totalBatches: number; status: SendStatus | 'building' }) => void;
	onBatchDone?: (b: BatchOutput) => void;
	onBatchFailed?: (f: { batchIndex: number; error: string }) => void;
	signal?: AbortSignal;
	/** 已成功完成的批次索引——resume 时跳过，避免对已打款地址重复发送/重复收费 */
	completedBatchIndices?: Set<number>;
	/** 批次之间的喘息间隔（ms）：避免签名弹窗连珠炮。0 = 连续 */
	interBatchDelayMs?: number;
}

export interface RunSendResult {
	results: BatchOutput[];
	failures: { batchIndex: number; error: string }[];
	aborted: boolean;
}

/** 可被 AbortSignal 提前结束的延时（Pause 时立刻返回） */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (!ms || signal?.aborted) return resolve();
		const finish = () => {
			clearTimeout(t);
			signal?.removeEventListener('abort', finish);
			resolve();
		};
		const t = setTimeout(finish, ms);
		signal?.addEventListener('abort', finish, { once: true });
	});
}

export async function runSend(deps: RunSendDeps): Promise<RunSendResult> {
	const batches = planBatches(deps.recipients, deps.batchSize);
	const results: BatchOutput[] = [];
	const failures: { batchIndex: number; error: string }[] = [];
	const policy = deps.failurePolicy ?? 'skip';
	let aborted = false;

	for (let i = 0; i < batches.length; i++) {
		if (deps.signal?.aborted) {
			aborted = true;
			break;
		}

		// resume：跳过已成功的批（其费用也已随首批支付，不重复收）
		if (deps.completedBatchIndices?.has(i)) continue;

		// 批次间喘息：从第二个发送的批起，每批前缓一下，避免签名弹窗连珠炮（Pause 可打断）
		if (results.length > 0 && deps.interBatchDelayMs) {
			await abortableDelay(deps.interBatchDelayMs, deps.signal);
			if (deps.signal?.aborted) {
				aborted = true;
				break;
			}
		}

		const chunk = batches[i];
		const feeWei = deps.fee.amount; // 每笔交易都收（会员 fee.amount = 0）

		deps.onProgress?.({ batchIndex: i, totalBatches: batches.length, status: 'building' });

		const subs = buildBatchSubTransactions({
			tokenType: deps.tokenType,
			tokenAddress: deps.tokenAddress,
			recipients: chunk,
			feeCollector: FEE_COLLECTOR,
			feeWei,
		});
		try {
			const { txHash, explorerUrl } = await deps.wallet.sendBatch({
				network: deps.network,
				calls: subs,
				onStatus: (status) =>
					deps.onProgress?.({ batchIndex: i, totalBatches: batches.length, status }),
			});
			const out: BatchOutput = {
				batchIndex: i,
				txHash,
				successCount: chunk.length,
				explorerUrl,
			};
			results.push(out);
			deps.onBatchDone?.(out);
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			failures.push({ batchIndex: i, error });
			deps.onBatchFailed?.({ batchIndex: i, error });
			if (policy === 'abort') {
				aborted = true;
				break;
			}
		}
	}

	return { results, failures, aborted };
}
