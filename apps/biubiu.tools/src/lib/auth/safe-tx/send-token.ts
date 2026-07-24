/**
 * Safe 提现编排器（多网络、native + ERC-20，native token 付 gas）。
 *
 * 流程：dummy signature 估算 gas → 真实签名 → 提交。传输已改为直连
 * （wallet/infra/*）。Tempo（无原生 gas 币）委托给 send-contract-call 的 Tempo
 * 分支（稳定币付 gas）。
 */
import { type Address, type Hex, encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { chainInfoBySlug } from '$lib/wallet/infra/chains.js';
import { sendContractCall, type QuotedInBandFee } from './send-contract-call.js';

export type SendStatus =
	| 'checking'
	| 'building'
	| 'estimating'
	| 'signing'
	| 'submitting'
	| 'waiting'
	| 'confirmed'
	| 'failed';

export interface SendResult {
	success: boolean;
	txHash?: string;
	explorerUrl?: string;
	error?: string;
}

export interface SendParams {
	safeAddress: Address;
	publicKeyHex: string;
	credentialId: string;
	rpId: string;
	recipient: Address;
	amount: string;
	network: string;
	tokenAddress: string | null;
	decimals: number;
	/** In-band 结算：用哪个资产付 gas。null/未设 = 原生币；否则白名单稳定币地址（用户所选）。 */
	gasFeeToken?: Address | null;
	/** In-band：confirm UI 已展示并确认的报销报价，逐字节签署（可选）。 */
	quotedFee?: QuotedInBandFee;
	onStatus: (status: SendStatus) => void;
}

/**
 * 提现编排：把「native/ERC-20 转账」表示为一条普通 CALL，统一交给 send-contract-call 的
 * in-band 引擎（maxFee=0 + 向 relay 结算地址追加报销腿）。所有链（含 Tempo）同一路径。
 */
export async function sendToken(params: SendParams): Promise<SendResult> {
	const {
		safeAddress, publicKeyHex, credentialId, rpId,
		recipient, amount, network, tokenAddress, decimals, onStatus
	} = params;

	const chain = chainInfoBySlug(network);
	if (!chain) return { success: false, error: `Unsupported network: ${network}` };

	const amountWei = parseUnits(String(amount), decimals);
	const isNative = !tokenAddress;

	const to: Address = isNative ? recipient : (tokenAddress as Address);
	const value = isNative ? amountWei : 0n;
	const data: Hex = isNative
		? '0x'
		: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, amountWei] });

	return sendContractCall({
		safeAddress, publicKeyHex, credentialId, rpId,
		to, value, data, operation: 0, network, onStatus,
		gasFeeToken: params.gasFeeToken ?? null,
		quotedFee: params.quotedFee
	});
}
