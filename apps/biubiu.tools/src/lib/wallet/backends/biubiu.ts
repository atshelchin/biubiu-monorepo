/**
 * biubiu 内置钱包后端：passkey + Safe 智能账户（推荐首选）。
 *
 * 只是把现有 `sendContractCall`（ERC-4337 UserOp + WebAuthn 签名）包装成统一的
 * `ConnectedWallet` 接口。passkey 发送路径逐字节不变——多条批量内部走 MultiSend
 * delegatecall，与 contract-caller 原先的 sendBatch 完全一致。
 */
import { type Address, type Hex, encodeFunctionData, concat } from 'viem';
import type { AuthUser } from '$lib/auth';
import { CONTRACTS } from '$lib/auth/compute-safe-address.js';
import { slugForChainId } from '$lib/wallet/infra/chains.js';
import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call.js';
import type { SendResult } from '$lib/auth/safe-tx/send-token.js';
import type { Call, ConnectedWallet, SendCallsOptions } from '../types.js';

const MULTISEND_ADDRESS = CONTRACTS.multiSend as Address;

const MULTISEND_ABI = [
	{
		type: 'function',
		name: 'multiSend',
		stateMutability: 'payable',
		inputs: [{ name: 'transactions', type: 'bytes' }],
		outputs: []
	}
] as const;

/**
 * 一条 MultiSend 子交易的打包格式：operation(1) ‖ to(20) ‖ value(32) ‖ len(32) ‖ data。
 * 与 contract-caller/batch.ts 的 encodeMultiSendTx 保持字节一致（有 spec 守护）。
 */
function encodeMultiSendTx(to: Address, value: bigint, data: Hex): Hex {
	const op = '00'; // 所有子调用都是普通 CALL
	const toBytes = to.toLowerCase().replace(/^0x/, '').padStart(40, '0');
	const valueBytes = value.toString(16).padStart(64, '0');
	const dataBytes = data === '0x' ? '' : data.replace(/^0x/, '');
	const dataLength = (dataBytes.length / 2).toString(16).padStart(64, '0');
	return `0x${op}${toBytes}${valueBytes}${dataLength}${dataBytes}` as Hex;
}

/** 把一组普通 CALL 编码成 Safe 将 delegatecall 进入的 `multiSend(bytes)` calldata。 */
export function encodeMultiSend(calls: Call[]): Hex {
	const packed = concat(calls.map((c) => encodeMultiSendTx(c.to, c.value, c.data)));
	return encodeFunctionData({ abi: MULTISEND_ABI, functionName: 'multiSend', args: [packed] });
}

/** chainId → 网络 slug（biubiu 支持的链），无则返回 null。源为 wallet/infra/chains.ts。 */
export function networkKeyForChainId(chainId: number): string | null {
	return slugForChainId(chainId) ?? null;
}

export class BiubiuWallet implements ConnectedWallet {
	readonly kind = 'biubiu' as const;
	readonly accountType = 'safe-passkey' as const;

	constructor(private readonly user: AuthUser) {}

	get address(): Address {
		return this.user.safeAddress as Address;
	}

	/** passkey 签名所需的固定凭据。 */
	private get creds() {
		return {
			safeAddress: this.user.safeAddress as Address,
			publicKeyHex: this.user.publicKey,
			credentialId: this.user.credentialId,
			rpId: this.user.rpId
		};
	}

	async sendCalls(calls: Call[], opts: SendCallsOptions): Promise<SendResult> {
		if (calls.length === 0) return { success: false, error: 'No calls to send' };

		const network = networkKeyForChainId(opts.chainId);
		if (!network) {
			return { success: false, error: `Built-in wallet doesn't support chain ${opts.chainId}` };
		}
		const onStatus = opts.onPhase ?? (() => {});

		// 单条 → 直接 executeUserOp(op=0)；多条 → MultiSend delegatecall(op=1)。
		// `calls` 原样透传：Tempo 分支需要原始子调用来追加报销 transfer（native 忽略）。
		if (calls.length === 1) {
			const c = calls[0];
			return sendContractCall({
				...this.creds,
				to: c.to,
				value: c.value,
				data: c.data,
				operation: 0,
				calls,
				network,
				onStatus,
				gasOverrides: opts.gasOverrides
			});
		}

		return sendContractCall({
			...this.creds,
			to: MULTISEND_ADDRESS,
			value: 0n,
			data: encodeMultiSend(calls),
			operation: 1,
			calls,
			network,
			onStatus,
			gasOverrides: opts.gasOverrides
		});
	}

	/** Safe delegatecall：returndata 转发链（ChainedMultiSend）等高级功能用。 */
	async sendDelegateCall(call: Call, opts: SendCallsOptions): Promise<SendResult> {
		const network = networkKeyForChainId(opts.chainId);
		if (!network) {
			return { success: false, error: `Built-in wallet doesn't support chain ${opts.chainId}` };
		}
		return sendContractCall({
			...this.creds,
			to: call.to,
			value: call.value,
			data: call.data,
			operation: 1,
			network,
			onStatus: opts.onPhase ?? (() => {})
		});
	}

	disconnect(): void {
		// 由 walletStore 调 authStore.logout()，此处无外部会话需关闭。
	}
}
