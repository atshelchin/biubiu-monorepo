/**
 * Safe MultiSend 1.4.1 编码。
 *
 * 一批转账打包进 `multiSend(bytes)`，由 Safe 经 delegatecall(operation=1) 执行。
 * Safe 在 MultiSend 上下文里对每笔做内部 CALL：native 从 Safe 余额扣、
 * ERC20 transfer 的 msg.sender = Safe（代币从 Safe 转出，无需 approve）。
 *
 * packed 格式（每笔顺序拼接，非 abi.encode）:
 *   operation(uint8=0) ‖ to(address,20B) ‖ value(uint256,32B) ‖ dataLength(uint256,32B) ‖ data
 */
import { encodePacked, encodeFunctionData, size as hexSize, type Address, type Hex } from 'viem';
import { encodeErc20Transfer } from './erc20.js';
import type { SubTransaction, TokenType, Recipient } from '../types.js';

const MULTISEND_ABI = [
	{
		type: 'function',
		name: 'multiSend',
		stateMutability: 'payable',
		inputs: [{ name: 'transactions', type: 'bytes' }],
		outputs: [],
	},
] as const;

/** operation: 0 = CALL（MultiSend 子交易恒用 CALL） */
const CALL = 0;

/** 把一笔子交易打包成 Safe MultiSend packed 格式 */
export function encodeSubTransaction(tx: SubTransaction): Hex {
	const dataLength = BigInt(hexSize(tx.data));
	return encodePacked(
		['uint8', 'address', 'uint256', 'uint256', 'bytes'],
		[CALL, tx.to, tx.value, dataLength, tx.data],
	);
}

/** 拼接所有子交易 → `multiSend(bytes)` 的 calldata */
export function encodeMultiSend(txs: SubTransaction[]): Hex {
	const packed = ('0x' +
		txs.map((t) => encodeSubTransaction(t).slice(2)).join('')) as Hex;
	return encodeFunctionData({ abi: MULTISEND_ABI, functionName: 'multiSend', args: [packed] });
}

/**
 * 由收件人 + tokenType + 可选费用，构建一批的子交易列表。
 * 费用（native）作为首笔加在最前（仅当 feeWei > 0）。
 */
export function buildBatchSubTransactions(params: {
	tokenType: TokenType;
	tokenAddress?: Address;
	recipients: Recipient[];
	feeCollector?: Address;
	feeWei?: bigint;
}): SubTransaction[] {
	const { tokenType, tokenAddress, recipients, feeCollector, feeWei } = params;
	const subs: SubTransaction[] = [];

	if (feeWei && feeWei > 0n) {
		if (!feeCollector) throw new Error('feeCollector required when feeWei > 0');
		subs.push({ to: feeCollector, value: feeWei, data: '0x' });
	}

	for (const r of recipients) {
		if (tokenType === 'native') {
			subs.push({ to: r.address, value: r.amount, data: '0x' });
		} else {
			if (!tokenAddress) throw new Error('tokenAddress required for erc20 send');
			subs.push({
				to: tokenAddress,
				value: 0n,
				data: encodeErc20Transfer(r.address, r.amount),
			});
		}
	}

	return subs;
}

/** 该批需要 Safe 持有的 native（子交易 value 之和；用于余额预检） */
export function batchNativeOutflow(subs: SubTransaction[]): bigint {
	return subs.reduce((sum, t) => sum + t.value, 0n);
}
