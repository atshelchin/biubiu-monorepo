/**
 * Token Sender —— **只是核心返回的视图的持有者**。
 *
 * 迁移前（spec 002-token-sender-core）这里有 531 行，其中最重的一块是发送编排：
 * `AbortController`、跨批次的 `for` 循环、`await abortableDelay(2500)`、以及十几个派生 getter。
 * 那条执行流从头持有到尾，而进度只存在 `this.results` 这个内存数组里 —— 关掉页面，已成功的
 * 批次就被彻底遗忘。
 *
 * 现在批次编排是核心里的一张表，一次只请求一批，由结果推进到下一批。
 * 「不重发已成功批次」不再是循环里的一行 `continue`，而是核心的候选集里根本没有 `Succeeded`。
 *
 * **不要往这里加 `if`。** 什么时候能推进、失败要不要重试、哪个响应算过期，都是核心的。
 * 这个文件里出现一个决定业务后果的分支，就说明那条规则走错了地方。
 *
 * 仍然留在宿主的只有一件事：`memberWaiver` 的 passkey 控制权证明。那是一次签名，属于平台；
 * 核心拥有的是它的后果（费用归零、必须重算）—— research.md D18。
 */
import { formatUnits } from 'viem';
import { createCruxSession, type CruxSession } from '$lib/crux/create-crux-session.js';
import type { SenderEvent } from '$lib/generated/sender/SenderEvent';
import type { SenderShellResult } from '$lib/generated/sender/SenderShellResult';
import type { SenderViewModel } from '$lib/generated/sender/SenderViewModel';
import type { DistributionMode } from '$lib/generated/sender/DistributionMode';
import type { TokenType } from '$lib/generated/sender/TokenType';
import type { WizardStep } from '$lib/generated/sender/WizardStep';
import { walletStore } from '$lib/wallet';
import {
	memberWaiver,
	proveMemberControl,
	ensureMembershipLoaded,
	type ProofResult,
} from '$lib/subscription';
import { createSenderShell, type SenderEffect } from './shell/index.js';

type Session = CruxSession<SenderViewModel, SenderEvent, SenderEffect, SenderShellResult>;

class TokenSenderStore {
	/** 核心返回的视图。页面只读这个。 */
	view = $state<SenderViewModel | null>(null);
	loadError = $state<string | null>(null);

	#session: Session | null = null;
	#starting: Promise<void> | null = null;

	async start(): Promise<void> {
		if (this.#session) return;
		if (this.#starting) return this.#starting;

		this.#starting = (async () => {
			const shell = createSenderShell({ dispatch: (event) => this.#session?.dispatch(event) });
			try {
				this.#session = await createCruxSession<
					SenderViewModel,
					SenderEvent,
					SenderEffect,
					SenderShellResult
				>({
					createCore: (wasm) => new wasm.SenderCore(),
					initialEvent: { type: 'page_ready' },
					onView: (view) => {
						this.view = view;
					},
					execute: (effect) => shell.execute(effect),
					toFailure: (effect, error) => shell.toFailure(effect, error),
					onError: (error) => {
						this.loadError = error instanceof Error ? error.message : String(error);
					},
				});
			} catch (error) {
				this.loadError = error instanceof Error ? error.message : String(error);
			} finally {
				this.#starting = null;
			}
		})();

		return this.#starting;
	}

	dispose(): void {
		this.#session?.dispose();
		this.#session = null;
		this.view = null;
	}

	#send(event: SenderEvent): void {
		this.#session?.dispatch(event);
	}

	/** 由页面的钱包 effect 调用。核心只需要知道「有没有钱包」。 */
	syncWallet(): void {
		this.#send({ type: 'wallet_changed', has_wallet: !!walletStore.activeWallet });
	}

	// ── 向导 ──
	goTo(step: WizardStep): void {
		this.#send({ type: 'go_to_step', step });
	}
	reset(): void {
		this.#send({ type: 'reset' });
	}

	// ── Step 1：网络 + 代币 ──
	setNetwork(slug: string): void {
		this.#send({ type: 'set_network', slug });
	}
	setTokenType(token_type: TokenType): void {
		this.#send({ type: 'set_token_type', token_type });
	}
	setTokenAddress(address: string): void {
		this.#send({ type: 'set_token_address', address });
	}
	loadTokenMeta(): void {
		this.#send({ type: 'load_token_meta' });
	}

	// ── Step 2：收件人 ──
	setDistributionMode(mode: DistributionMode): void {
		this.#send({ type: 'set_distribution_mode', mode });
	}
	setTotalAmountInput(amount: string): void {
		this.#send({ type: 'set_total_amount_input', amount });
	}
	/**
	 * 解析收件人。**文本由调用方传入，核心不保存它。**
	 *
	 * 十万行文本约 4.5 MB —— 存进核心就意味着每次 render 都把它序列化一遍送回来。
	 * 它是编辑器缓冲区，属于 UI 状态（research.md D23）。
	 */
	parse(text: string): void {
		this.#send({ type: 'parse', text });
	}

	// ── Step 3：费用 + 预检 ──
	prepareReview(): void {
		this.#send({ type: 'prepare_review' });
	}
	setGasFeeToken(token: string | null): void {
		this.#send({ type: 'set_gas_fee_token', token });
	}

	/** 懒加载链上会员状态（进入流程时调用）。 */
	loadMembership(): void {
		void ensureMembershipLoaded();
	}
	/** 有资格签名豁免：已登录 Pro，但本会话尚未签名。 */
	get canWaiveFee(): boolean {
		return memberWaiver.canProve;
	}
	get waiveProving(): boolean {
		return memberWaiver.proving;
	}
	/**
	 * passkey 控制权证明。
	 *
	 * 签名本身是平台动作，留在宿主；证明**成功之后**要重算费用这条时序规则在核心 ——
	 * 迁移前它藏在 `if (this.step === 3) await this.prepareReview()` 里，换个入口就会漏掉。
	 */
	async waiveFeeWithPasskey(): Promise<ProofResult> {
		const res = await proveMemberControl();
		this.#send({ type: 'member_proven', waived: res.ok });
		return res;
	}

	// ── Step 4：执行 ──
	/** 时钟在宿主：起始时间戳随事件传入，核心不读时间。 */
	send(): void {
		this.#send({ type: 'start_send', started_at_ms: Date.now() });
	}
	pause(): void {
		this.#send({ type: 'pause' });
	}
	resume(): void {
		this.#send({ type: 'resume' });
	}
	/** 丢弃磁盘上的未完成发送记录。 */
	discardPending(): void {
		this.#send({ type: 'discard_pending_send' });
	}
	/**
	 * 裁决一个状态未知的批次：**确认它没到账**，让它成为可重试的批次。
	 *
	 * 「未知」只由崩溃恢复产生，系统无法确认那一批是否上链。它不参与自动续发 ——
	 * 必须由看得见链上情况的人来定（spec 003 research.md D25）。
	 */
	markBatchUnsent(batchIndex: number): void {
		this.#send({ type: 'mark_batch_unsent', batch_index: batchIndex });
	}
	/** 裁决：**确认它已到账**，标记完成且不再发送。 */
	markBatchDone(batchIndex: number, txHash?: string): void {
		this.#send({
			type: 'mark_batch_done',
			batch_index: batchIndex,
			tx_hash: txHash ?? null,
		});
	}

	// ── 自定义网络 / RPC ──
	addCustomNetwork(input: {
		name: string;
		chainId: number;
		rpc: string;
		symbol: string;
		explorerTxUrl?: string;
	}): void {
		this.#send({
			type: 'add_custom_network',
			name: input.name,
			chain_id: input.chainId,
			rpc: input.rpc,
			symbol: input.symbol,
			explorer_tx_url: input.explorerTxUrl ?? null,
		});
	}
	removeCustomNetwork(slug: string): void {
		this.#send({ type: 'remove_custom_network', slug });
	}
	setRpcOverride(slug: string, rpcs: string[]): void {
		this.#send({ type: 'set_rpc_override', slug, rpcs });
	}
	clearRpcOverride(slug: string): void {
		this.#send({ type: 'clear_rpc_override', slug });
	}
	verifyMultiSend(rpc: string): void {
		this.#send({ type: 'verify_multi_send', rpc });
	}

	/**
	 * 按精度格式化一个最小单位金额，供界面显示。
	 *
	 * 纯展示，不改变任何业务状态 —— 因此没必要绕核心一圈。金额本身（十进制字符串）
	 * 是核心算出来的，这里只负责插小数点。
	 */
	fmt(amount: string, decimals = this.view?.decimals ?? 18): string {
		return formatUnits(BigInt(amount || '0'), decimals);
	}
}

export const tokenSender = new TokenSenderStore();
