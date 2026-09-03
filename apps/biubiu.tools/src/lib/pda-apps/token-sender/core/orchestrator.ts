/**
 * 余额预检（UI 无关，依赖注入）。
 *
 * 这个文件曾经还有 `planBatches` 与 `runSend` —— 一个跨批次的 `for` 循环，配 `AbortController`
 * 与 `await abortableDelay(2500)`，整轮发送由一条执行流从头持有到尾，进度只存在内存。
 * 它们已被核心的状态机取代（spec 002-token-sender-core，research.md D15）：批次切分是
 * `SendPlan` 的一部分，推进由结果事件驱动，「不重发已成功批次」是候选集的定义而非一行 continue。
 *
 * 留下的只有预检 —— 它是一次读链，属于宿主。
 */
import type { Address } from 'viem';
import type { SendStatus } from '$lib/auth/safe-tx/send-token';
import type { FeeQuote, TokenSenderNetwork, TokenType } from '../types.js';
import type { SafeSenderWallet } from './wallet.js';

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
