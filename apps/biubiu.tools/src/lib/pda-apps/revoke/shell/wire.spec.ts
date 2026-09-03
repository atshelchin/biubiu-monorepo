/**
 * 宿主适配层的形状转换测试。
 *
 * 业务规则由 Rust 侧的 30 个用例覆盖（`cargo test -p biubiu-core --features crux`）。这里测的
 * 是**另一件事**：两侧形状对不上的地方。它们不会在编译期暴露 —— `snake_case` / `camelCase`
 * 的错配、`bigint` 掉进 JSON、`is_permit2` 判定漏掉 —— 只会在运行时静默出错。
 */
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import type { ApprovalRow, RevokeNetwork } from '../types.js';
import {
	fromRevokeNetwork,
	fromTokenEntry,
	toRevokeNetwork,
	toScannedApproval,
	toTokenEntry,
} from './wire.js';

const row = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
	id: 'erc20:0xaaa:0xbbb',
	standard: 'erc20',
	token: '0xAAA' as Address,
	tokenSymbol: 'USDC',
	spender: '0xBBB' as Address,
	unlimited: false,
	...over,
});

describe('扫描结果 → 核心入参', () => {
	it('把 bigint 额度转成十进制字符串', () => {
		// JSON.stringify(1n) 直接抛 TypeError —— 边界上 bigint 必须先变字符串。
		const huge = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
		expect(toScannedApproval(row({ allowance: huge })).allowance).toBe(huge.toString());
	});

	it('额度缺失映射为 null，不是 undefined', () => {
		// undefined 会被 JSON.stringify 整个丢掉字段，Rust 侧的 Option 就收不到它。
		expect(toScannedApproval(row()).allowance).toBeNull();
	});

	it('按 id 前缀识别 Permit2 子额度', () => {
		expect(toScannedApproval(row({ id: 'permit2:0xaaa:0xbbb' })).is_permit2).toBe(true);
		expect(toScannedApproval(row()).is_permit2).toBe(false);
	});

	it('不携带 id —— 它由核心生成（FR-021）', () => {
		expect(toScannedApproval(row())).not.toHaveProperty('id');
	});

	it('camelCase 字段全部改名到 snake_case', () => {
		const out = toScannedApproval(
			row({
				tokenName: 'USD Coin',
				spenderLabel: 'Uniswap',
				spenderKind: 'dex',
				approvedForAll: true,
				fromLogs: true,
			}),
		);
		expect(out.token_name).toBe('USD Coin');
		expect(out.spender_label).toBe('Uniswap');
		expect(out.spender_kind).toBe('dex');
		expect(out.approved_for_all).toBe(true);
		expect(out.from_logs).toBe(true);
	});
});

describe('网络与代币的双向转换', () => {
	const network: RevokeNetwork = {
		slug: 'eth-mainnet',
		chainId: 1,
		name: 'Ethereum',
		symbol: 'ETH',
		rpcs: ['https://rpc.example'],
		explorerUrl: 'https://etherscan.io',
		multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11' as Address,
		isTestnet: false,
		isCustom: true,
	};

	it('往返后与原值一致', () => {
		expect(toRevokeNetwork(fromRevokeNetwork(network))).toEqual(network);
	});

	it('可选布尔缺失时补 false，而不是留 undefined', () => {
		const { isTestnet: _t, isCustom: _c, ...bare } = network;
		const core = fromRevokeNetwork(bare as RevokeNetwork);
		expect(core.is_testnet).toBe(false);
		expect(core.is_custom).toBe(false);
	});

	it('代币条目往返保留符号与精度', () => {
		const token = {
			standard: 'erc20' as const,
			address: '0xAAA' as Address,
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			isCustom: true,
		};
		expect(toTokenEntry(fromTokenEntry(token))).toEqual(token);
	});
});
