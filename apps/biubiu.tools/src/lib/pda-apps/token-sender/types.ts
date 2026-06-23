import type { Address, Hex } from 'viem';

// ── Token & 分配模式 ──────────────────────────────────────────────────────

export type TokenType = 'native' | 'erc20';
/** specified: 每行 address,amount；equal: 总额按地址数均分 */
export type DistributionMode = 'specified' | 'equal';

// ── 支持的网络 ────────────────────────────────────────────────────────────

/**
 * 支持网络配置。
 *
 * `slug` 必须对齐钱包层 CHAIN_CONFIG（如 'eth-mainnet'），因为最终要调用
 * `sendContractCall({ network: slug })`。
 */
export interface TokenSenderNetwork {
	slug: string;
	name: string;
	chainId: number;
	/** native 代币符号（ETH / POL / BNB ...） */
	symbol: string;
	/** native 精度（EVM 恒为 18） */
	decimals: number;
	/** 公共只读 RPC（价格 / 余额 / ERC20 metadata 用） */
	rpcs: string[];
	/** 区块浏览器 tx 前缀，如 'https://etherscan.io/tx/' */
	explorerTxUrl: string;
	/** Safe MultiSend 1.4.1 地址（全链同址） */
	multiSendAddress: Address;
	/** 每批接收方上限（默认 100） */
	maxBatchNative: number;
	maxBatchErc20: number;
	/** native/USD Chainlink feed（取不到价时为 undefined → 费用走兜底） */
	chainlinkNativeUsdFeed?: Address;
	isTestnet?: boolean;
	isCustom?: boolean;
}

// ── 收件人 & 批次 ─────────────────────────────────────────────────────────

export interface Recipient {
	address: Address;
	amount: bigint;
}

/** MultiSend 单笔子交易（operation 固定 CALL=0） */
export interface SubTransaction {
	to: Address;
	value: bigint;
	/** native 转账为 '0x'；ERC20 为 transfer(to,amount) calldata */
	data: Hex;
}

/**
 * 一个批次（TaskHub job 输入）。
 * amount 以 wei 字符串存储，便于 JSON 序列化与持久化。
 */
export interface BatchInput {
	batchIndex: number;
	recipients: Address[];
	amounts: string[];
	/** 本批附带的 native 费用（wei 字符串，'0' 表示无）。仅首批且非会员 > 0。 */
	feeWei: string;
}

export interface BatchOutput {
	batchIndex: number;
	txHash: Hex;
	successCount: number;
	explorerUrl: string;
}

// ── 费用 ──────────────────────────────────────────────────────────────────

export interface FeeQuote {
	/** 应收 native（wei）；会员为 0n */
	amount: bigint;
	/** 计费来源：member-free=会员免费, config=代码配置, usd=$5 等值, fallback=1 native */
	source: 'member-free' | 'config' | 'usd' | 'fallback';
	/** 等值美元（usd 来源时） */
	usd?: number;
	/** native/USD 单价（取到时） */
	nativeUsdPrice?: number;
}

// ── 历史记录（IndexedDB）─────────────────────────────────────────────────

export interface SendBatchRecord {
	index: number;
	txHash?: string;
	status: 'pending' | 'confirmed' | 'failed';
	count: number;
	error?: string;
	explorerUrl?: string;
}

export interface SendRecord {
	id: string;
	createdAt: number;
	network: string;
	networkName: string;
	tokenType: TokenType;
	tokenAddress?: string;
	tokenSymbol: string;
	decimals: number;
	totalRecipients: number;
	/** 发送总额（wei 字符串，不含费用） */
	totalAmount: string;
	/** 实收费用（native wei 字符串） */
	feeWei: string;
	isMember: boolean;
	status: 'completed' | 'partial' | 'failed';
	/** 关联 TaskHub，用于「继续未完成的发送」 */
	merkleRoot?: string;
	batches: SendBatchRecord[];
}
