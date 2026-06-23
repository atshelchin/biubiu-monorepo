/**
 * 智能合约钱包门禁。
 *
 * biubiu.tools 的硬约束：连接的账户必须是智能合约钱包——已部署的合约账户，或已通过
 * EIP-7702 升级的 EOA。纯 EOA 一律拒绝（升级引导留 Phase 4）。
 *
 * 判定基于目标链上的 `eth_getCode`：
 *   - 0xef0100… → EIP-7702 delegation designator（已升级的 EOA）
 *   - 其它非空 code → 已部署的合约钱包
 *   - 0x（空）→ 纯 EOA，拒绝
 *
 * 注意：智能账户状态是「按链」的——同一地址在 Base 已部署 ≠ 在 Arbitrum 已部署。
 * 因此连接时按当前链校验，每次发交易前还要对目标链复检。
 */
import type { Eip1193Provider } from './eip1193.js';

/** 已升级 EOA / 已部署合约（gate 通过后的两种智能账户类型）。 */
export type GatedAccountType = 'smart-contract' | 'eip7702';

export class NotSmartAccountError extends Error {
	constructor(
		public readonly address: string,
		public readonly chainId: number
	) {
		super(
			`${address} is a plain EOA on chain ${chainId}. biubiu requires a smart contract wallet — ` +
				`use a deployed smart account, or upgrade this EOA via EIP-7702.`
		);
		this.name = 'NotSmartAccountError';
	}
}

/** EIP-7702 delegation designator 前缀。 */
const EIP7702_PREFIX = '0xef0100';

/**
 * 读 `eth_getCode` 判定账户类型。纯 EOA 抛 `NotSmartAccountError`。
 * @param chainId 仅用于错误信息与「当前链」语义；调用方需保证 provider 已在该链上。
 */
export async function classifyAccount(
	provider: Eip1193Provider,
	address: string,
	chainId: number
): Promise<GatedAccountType> {
	const raw = (await provider.request({ method: 'eth_getCode', params: [address, 'latest'] })) as
		| string
		| null;
	const code = (raw ?? '0x').toLowerCase();
	if (code.startsWith(EIP7702_PREFIX)) return 'eip7702';
	if (code.length > 2) return 'smart-contract';
	throw new NotSmartAccountError(address, chainId);
}

/** 不抛错版本：目标链上是否仍是智能账户（发交易前复检用）。 */
export async function isSmartAccountOnChain(
	provider: Eip1193Provider,
	address: string,
	chainId: number
): Promise<boolean> {
	try {
		await classifyAccount(provider, address, chainId);
		return true;
	} catch {
		return false;
	}
}
