/**
 * 站点级钱包抽象。
 *
 * biubiu.tools 不再只认 passkey 内置钱包：所有功能页（contract-caller、
 * token-sender、balance-radar…）只依赖 `ConnectedWallet` 接口，而不关心背后
 * 是 passkey+Safe、inject(EIP-6963) 还是 walletpair。
 *
 * 硬约束：不论哪种方式，连接的账户都必须是「智能合约钱包」——已部署的合约账户
 * 或已通过 EIP-7702 升级的 EOA。纯 EOA 一律拒绝（见 `gate.ts`，Phase 2 接入）。
 *
 * 关键设计：`sendCalls` 是跨钱包的通用原语——「原子地执行一组普通 CALL」。
 *   - biubiu：1 条 → Safe executeUserOp(op=0)；N 条 → MultiSend delegatecall(op=1)。
 *   - 外部 EIP-1193：1 条 → eth_sendTransaction；N 条 → EIP-5792 wallet_sendCalls。
 * 唯一无法用「一组普通 CALL」表达的是 ChainedMultiSend 的 returndata 转发，它需要
 * Safe delegatecall 语义，作为可选能力 `sendDelegateCall` 暴露（仅 biubiu 实现）。
 */
import type { Address, Hex } from 'viem';
import type { SendStatus, SendResult } from '$lib/auth/safe-tx/send-token.js';

/** 钱包连接方式。biubiu 为推荐首选。 */
export type WalletKind = 'biubiu' | 'inject' | 'walletpair';

/**
 * 智能账户类型——门禁通过后才能得到这三种之一。
 * - `safe-passkey`：biubiu 内置 Safe（P-256 passkey signer）。
 * - `smart-contract`：外部已部署的合约钱包（Safe / ERC-4337 / …）。
 * - `eip7702`：已通过 EIP-7702 升级（code 以 0xef0100 开头）的 EOA。
 */
export type AccountType = 'safe-passkey' | 'smart-contract' | 'eip7702';

/** 一条普通合约调用（始终是 CALL，不是 delegatecall）。 */
export interface Call {
	to: Address;
	value: bigint;
	data: Hex;
}

export interface SendCallsOptions {
	/** 目标链 chainId。biubiu 内部映射到 Alchemy network key；外部钱包据此切链。 */
	chainId: number;
	/**
	 * 进度回调。沿用 passkey 流程的 `SendStatus` 词表作为统一阶段标签——外部钱包
	 * 把自己的阶段映射到最接近的标签，这样功能页 UI 无需为每种钱包改文案。
	 */
	onPhase?: (phase: SendStatus) => void;
	/**
	 * 可选：区块浏览器 tx 链接前缀（如 `https://basescan.org/tx/`）。外部钱包据此
	 * 拼出 `explorerUrl`；biubiu 用自带 CHAIN_CONFIG，忽略该字段。
	 */
	explorerTxBaseUrl?: string;
	/**
	 * 可选：强制 gas 参数（合约部署等大交易用）。biubiu 透传给 bundler；外部钱包
	 * 自行估算 gas，忽略该字段。
	 */
	gasOverrides?: {
		callGasLimit?: bigint;
		maxFeePerGas?: bigint;
		maxPriorityFeePerGas?: bigint;
	};
}

/**
 * 一个已连接、且已确认为智能合约钱包的账户。
 * 功能页只面向这个接口编程。
 */
export interface ConnectedWallet {
	readonly kind: WalletKind;
	/** 智能账户地址。 */
	readonly address: Address;
	readonly accountType: AccountType;

	/**
	 * 原子地执行一组普通 CALL。空数组视为错误。
	 * 单条与多条的批量策略由各后端自行决定（MultiSend / wallet_sendCalls）。
	 */
	sendCalls(calls: Call[], opts: SendCallsOptions): Promise<SendResult>;

	/**
	 * 可选：以 Safe delegatecall 语义执行单条 payload（returndata 转发链需要）。
	 * 仅具备 Safe 执行能力的钱包（当前仅 biubiu）实现；外部钱包不提供该方法，
	 * 调用方据此判断是否支持「链式调用」功能。
	 */
	sendDelegateCall?(call: Call, opts: SendCallsOptions): Promise<SendResult>;

	/** 断开连接（biubiu = 登出 passkey；外部钱包 = 关闭会话）。 */
	disconnect(): void;
}

export type { SendStatus, SendResult };
