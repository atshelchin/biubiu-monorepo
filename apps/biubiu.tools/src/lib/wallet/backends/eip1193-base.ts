/**
 * 外部 EIP-1193 钱包通用后端（inject / walletpair 共用）。
 *
 * 与 biubiu 内置钱包的根本区别：这里 biubiu.tools 只是 dApp，签名与广播都交给外部
 * 钱包。`sendCalls` 把「原子执行一组 CALL」映射到：
 *   - 单条 → eth_sendTransaction
 *   - 多条 → EIP-5792 wallet_sendCalls（原子批量）；钱包不支持则报错（不静默降级为
 *            非原子的顺序发送——那会破坏批量语义）。
 *
 * 不提供 `sendDelegateCall`：delegatecall 只有账户自身执行逻辑能做，外部 dApp 无法表达。
 */
import { type Address, type Hex, numberToHex } from 'viem';
import type {
	AccountType,
	Call,
	ConnectedWallet,
	SendCallsOptions,
	SendResult,
	WalletKind
} from '../types.js';
import type { Eip1193Provider } from '../eip1193.js';
import { isSmartAccountOnChain } from '../gate.js';

const RECEIPT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface EvmReceipt {
	status?: string | number;
	transactionHash?: Hex;
}

export abstract class Eip1193Wallet implements ConnectedWallet {
	abstract readonly kind: WalletKind;

	constructor(
		readonly provider: Eip1193Provider,
		readonly address: Address,
		readonly accountType: AccountType,
		/** provider 当前所在链，ensureChain 时更新。 */
		protected currentChainId: number
	) {}

	/** 把外部钱包切到目标链（已在则跳过）。 */
	async ensureChain(chainId: number): Promise<void> {
		if (this.currentChainId === chainId) return;
		try {
			await this.provider.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: numberToHex(chainId) }]
			});
			this.currentChainId = chainId;
		} catch {
			throw new Error(`Switch your wallet to chain ${chainId} and try again.`);
		}
	}

	async sendCalls(calls: Call[], opts: SendCallsOptions): Promise<SendResult> {
		if (calls.length === 0) return { success: false, error: 'No calls to send' };
		const onPhase = opts.onPhase ?? (() => {});

		try {
			onPhase('checking');
			await this.ensureChain(opts.chainId);

			// 智能账户状态按链而定——发交易前对目标链复检。
			if (!(await isSmartAccountOnChain(this.provider, this.address, opts.chainId))) {
				onPhase('failed');
				return {
					success: false,
					error: `This account is not a smart contract wallet on chain ${opts.chainId}.`
				};
			}

			onPhase('signing');
			let txHash: Hex;
			let ok: boolean;
			if (calls.length === 1) {
				txHash = await this.sendSingle(calls[0]);
				onPhase('waiting');
				ok = await this.waitForReceipt(txHash);
			} else {
				const batchId = await this.submitBatch(calls, opts.chainId);
				onPhase('waiting');
				({ txHash, success: ok } = await this.waitForCallsStatus(batchId));
			}

			if (!ok) {
				onPhase('failed');
				return { success: false, txHash, error: 'Transaction reverted' };
			}

			onPhase('confirmed');
			return {
				success: true,
				txHash,
				explorerUrl: opts.explorerTxBaseUrl ? `${opts.explorerTxBaseUrl}${txHash}` : undefined
			};
		} catch (err) {
			onPhase('failed');
			return { success: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	private async sendSingle(call: Call): Promise<Hex> {
		const txHash = (await this.provider.request({
			method: 'eth_sendTransaction',
			params: [
				{
					from: this.address,
					to: call.to,
					value: numberToHex(call.value),
					data: call.data
				}
			]
		})) as Hex;
		return txHash;
	}

	/** 提交 EIP-5792 原子批量，返回 batch id。钱包不支持则抛错。 */
	private async submitBatch(calls: Call[], chainId: number): Promise<string> {
		let result: unknown;
		try {
			result = await this.provider.request({
				method: 'wallet_sendCalls',
				params: [
					{
						version: '2.0.0',
						from: this.address,
						chainId: numberToHex(chainId),
						atomicRequired: true,
						calls: calls.map((c) => ({
							to: c.to,
							value: numberToHex(c.value),
							data: c.data
						}))
					}
				]
			});
		} catch {
			throw new Error(
				'This wallet does not support atomic batch (EIP-5792). Use the built-in biubiu wallet, or export the Safe batch.'
			);
		}
		return typeof result === 'string' ? result : (result as { id: string }).id;
	}

	/** 轮询 wallet_getCallsStatus 直到出现 receipt，返回末条 tx hash + 是否全部成功。 */
	private async waitForCallsStatus(batchId: string): Promise<{ txHash: Hex; success: boolean }> {
		const start = Date.now();
		while (Date.now() - start < RECEIPT_TIMEOUT_MS) {
			const status = (await this.provider.request({
				method: 'wallet_getCallsStatus',
				params: [batchId]
			})) as { receipts?: EvmReceipt[] } | null;
			const receipts = status?.receipts;
			if (receipts && receipts.length > 0) {
				const hash = receipts[receipts.length - 1].transactionHash;
				if (hash) return { txHash: hash, success: receipts.every((r) => receiptOk(r.status)) };
			}
			await sleep(POLL_INTERVAL_MS);
		}
		throw new Error('Batch confirmation timed out');
	}

	/** 轮询 eth_getTransactionReceipt，返回是否成功。 */
	private async waitForReceipt(txHash: Hex): Promise<boolean> {
		const start = Date.now();
		while (Date.now() - start < RECEIPT_TIMEOUT_MS) {
			const receipt = (await this.provider.request({
				method: 'eth_getTransactionReceipt',
				params: [txHash]
			})) as EvmReceipt | null;
			if (receipt) return receiptOk(receipt.status);
			await sleep(POLL_INTERVAL_MS);
		}
		throw new Error('Transaction confirmation timed out');
	}

	disconnect(): void {
		// 子类如有需要可覆写（移除监听 / 关闭会话）。
	}
}

/** receipt.status 兼容 '0x1' / 1 / 'success'。 */
function receiptOk(status: string | number | undefined): boolean {
	return status === '0x1' || status === 1 || status === 'success';
}
