/**
 * 授权撤销：宿主接线的端到端验证（spec 001-biubiu-core-crux，SC-003）。
 *
 * # 这里验的是什么
 *
 * 业务规则由 Rust 侧的 31 个用例覆盖 —— 那些**不需要浏览器**。这个文件验的是另一件事：
 * **规则和页面之间的接线对不对**。真 WASM 核心、真 shell operation 路由、真形状转换、
 * 真 IndexedDB，全部照常跑。
 *
 * # 为什么用替身，而不是真钱包 + 真交易
 *
 * 只有两处被换成受控替身，而且都是**本次迁移没有改动过**的代码：
 *
 * - `scanApprovals` —— Multicall 读链。它是原样复用的；让它连公网既不确定也不可复现。
 * - `walletStore` —— 钱包签名与发送。同样原样复用。
 *
 * 换掉它们反而让三件真交易做不到的事成为可能：制造一次**失败**的撤销、在第一笔**仍在途时**
 * 点第二次、以及不必先发一笔 approve 就有东西可撤。
 *
 * 真交易能额外证明的只有「`buildRevokeCall` + `sendCalls` 仍然可用」—— 那是 wallet 域的事，
 * 本次一行未改，也不在本 spec 范围内。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import type { ApprovalRow, RevokeNetwork, SpenderEntry, TokenEntry } from './types.js';
import type { SendResult, SendStatus } from '$lib/wallet';

// ── 替身 1：读链 ────────────────────────────────────────────────────────────
//
// 记下每次扫描的参数，好断言「扫的是哪条链、谁的地址」；返回值由每个用例自己安排，
// 包括**故意延后**返回，用来复现「扫描中切链」。
type ScanCall = { network: RevokeNetwork; owner: Address; tokens: TokenEntry[]; spenders: SpenderEntry[] };
const scanCalls: ScanCall[] = [];
let scanResponder: (call: ScanCall, index: number) => Promise<ApprovalRow[]>;

vi.mock('./infra/multicall.js', () => ({
	scanApprovals: (
		network: RevokeNetwork,
		owner: Address,
		tokens: TokenEntry[],
		spenders: SpenderEntry[],
	) => {
		const call = { network, owner, tokens, spenders };
		const index = scanCalls.length;
		scanCalls.push(call);
		return scanResponder(call, index);
	},
}));

// ── 替身 2：钱包 ────────────────────────────────────────────────────────────
type SendCallsArgs = { calls: unknown[]; opts: { onPhase?: (p: SendStatus) => void } };
const sendCalls: SendCallsArgs[] = [];
let sendResponder: (args: SendCallsArgs) => Promise<SendResult>;
const wallet = { address: '0x0e00000000000000000000000000000000000001' as Address };

vi.mock('$lib/wallet', () => ({
	walletStore: {
		get activeWallet() {
			return {
				address: wallet.address,
				sendCalls: (calls: unknown[], opts: SendCallsArgs['opts']) => {
					const args = { calls, opts };
					sendCalls.push(args);
					return sendResponder(args);
				},
			};
		},
		kind: 'biubiu',
	},
}));

const { revoke: store } = await import('./store.svelte.js');

// ── 夹具 ────────────────────────────────────────────────────────────────────

/**
 * 造一个合法的 20 字节地址。
 *
 * **必须是真地址**：`buildRevokeCall` 会真的做 ABI 编码，viem 对非法地址直接抛异常。
 * 读链那侧被替身挡住了，编码这侧没有 —— 这恰好说明替身只换掉了该换的那一层。
 */
const addr = (tag: string): Address =>
	`0x${tag.padEnd(40, '0').slice(0, 40)}` as Address;

const TOKEN_A = addr('a11ce');
const TOKEN_B = addr('b0b');
const TOKEN_D = addr('d1dd');
const SPENDER_1 = addr('5eed1');
const SPENDER_2 = addr('5eed2');
const SPENDER_9 = addr('5eed9');

function row(token: Address, spender: Address, unlimited = true): ApprovalRow {
	return {
		id: `erc20:${token.toLowerCase()}:${spender.toLowerCase()}`,
		standard: 'erc20',
		token,
		tokenSymbol: token.slice(2, 6).toUpperCase(),
		spender,
		allowance: unlimited ? 2n ** 256n - 1n : 1000n,
		unlimited,
		decimals: 18,
	};
}

/** 等核心把一轮 Event → Operation → ShellResult → ViewModel 走完。 */
const settle = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

const view = () => store.view!;
const rowIds = () => view().rows.map((r) => r.id);

/** 一个已连接钱包、已完成首次扫描、结果为给定行的干净状态。 */
async function bootWith(rows: ApprovalRow[]) {
	scanResponder = async () => rows;
	await store.start();
	store.syncWallet();
	await settle(150);
}

beforeEach(async () => {
	scanCalls.length = 0;
	sendCalls.length = 0;
	sendResponder = async () => ({ success: true });
	store.dispose();
	// 每个用例换一个 owner，让核心把它当作新的目标（否则同一 owner 不会重扫）。
	wallet.address = addr(`0e${Date.now().toString(16)}`);
	// 上一个用例写进 IndexedDB 的自定义条目不该影响下一个。
	indexedDB.deleteDatabase('biubiu-revoke-config');
	await settle(20);
});

// ─────────────────────────────────────────────────────────────────────────────
// quickstart 验证 3 —— 逐项
// ─────────────────────────────────────────────────────────────────────────────

describe('第 1 项：钱包连接后自动扫描一次，同一 owner+链不重复', () => {
	it('连接即扫描，且重复上报同一个钱包不会再扫', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1)]);

		expect(scanCalls).toHaveLength(1);
		expect(scanCalls[0].owner.toLowerCase()).toBe(wallet.address.toLowerCase());
		expect(scanCalls[0].network.chainId).toBe(1);
		expect(view().has_scanned).toBe(true);
		expect(rowIds()).toEqual([`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`]);

		// 页面的钱包 effect 会反复触发；核心必须认出这不是「换了目标」。
		store.syncWallet();
		store.syncWallet();
		await settle();
		expect(scanCalls).toHaveLength(1);
	});

	it('核心把内置注册表合并好再交给宿主 —— 宿主不查注册表', async () => {
		await bootWith([]);

		const { tokens, spenders } = scanCalls[0];
		// 以太坊上的内置条目应当已经在清单里。
		expect(tokens.some((t) => t.symbol === 'USDC')).toBe(true);
		expect(spenders.some((s) => s.label === 'Uniswap Permit2')).toBe(true);
		// Permit2 在跨链表里故意列了两次，去重后只能探测一次。
		const permit2 = spenders.filter((s) => s.kind === 'permit2');
		expect(permit2).toHaveLength(1);
	});
});

describe('第 2 项：切链清空并在新链重扫', () => {
	it('切链后结果、选择、提示全部清空，并在新链上重新扫描', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		await settle();
		expect(view().selected_count).toBe(1);

		scanResponder = async () => [row(TOKEN_B, SPENDER_2)];
		store.setNetwork('base-mainnet');
		await settle(120);

		expect(view().network?.chain_id).toBe(8453);
		expect(view().selected_count).toBe(0);
		expect(view().gas_fee_token).toBeNull();
		expect(scanCalls).toHaveLength(2);
		expect(scanCalls[1].network.chainId).toBe(8453);
		expect(rowIds()).toEqual([`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`]);
	});
});

describe('第 3 项：扫描中切链，旧链结果永不落地', () => {
	it('先前那次扫描晚于切链返回时被丢弃', async () => {
		// 第一次扫描挂起不返回；切链后再放行它。
		let releaseChainA!: (rows: ApprovalRow[]) => void;
		const chainAPending = new Promise<ApprovalRow[]>((r) => (releaseChainA = r));

		scanResponder = async (_call, index) =>
			index === 0 ? chainAPending : [row(TOKEN_B, SPENDER_2)];

		await store.start();
		store.syncWallet();
		await settle(30);
		expect(view().is_scanning).toBe(true);

		store.setNetwork('base-mainnet');
		await settle(80);
		expect(rowIds()).toEqual([`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`]);

		// 旧链的结果现在才回来 —— 一行都不许进。
		releaseChainA([row(TOKEN_A, SPENDER_1), row(addr('cccc'), addr('5eed3'))]);
		await settle(80);

		expect(view().network?.chain_id).toBe(8453);
		expect(rowIds()).toEqual([`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`]);
	});

	it('陈旧扫描的失败同样不会冒出错误提示', async () => {
		let failChainA!: (e: Error) => void;
		const chainAPending = new Promise<ApprovalRow[]>((_, rej) => (failChainA = rej));

		scanResponder = async (_call, index) => (index === 0 ? chainAPending : []);

		await store.start();
		store.syncWallet();
		await settle(30);

		store.setNetwork('base-mainnet');
		await settle(80);

		failChainA(new Error('chain A RPC exploded'));
		await settle(80);

		expect(view().scan_error).toBeNull();
	});
});

describe('第 5 / 6 项：撤销结果的提示行为', () => {
	it('成功后行消失、成功提示出现、约 6 秒后自动收起', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1), row(TOKEN_B, SPENDER_2)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		await settle();

		sendResponder = async ({ opts }) => {
			opts.onPhase?.('signing');
			opts.onPhase?.('submitting');
			return { success: true, txHash: '0xTX', explorerUrl: 'https://gnosisscan.io/tx/0xTX' };
		};
		store.revokeSelected();
		await settle(80);

		expect(sendCalls).toHaveLength(1);
		expect(rowIds()).toEqual([`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`]);
		expect(view().selected_count).toBe(0);
		expect(view().notice).toEqual({
			kind: 'success',
			tx_hash: '0xTX',
			explorer_url: 'https://gnosisscan.io/tx/0xTX',
		});

		// 自动收起由宿主计时、核心判定。等它真的到期 —— 这是唯一必须等真实时间的地方，
		// 因为验的正是「宿主确实按核心给的 6 秒去计时」。
		await settle(6_400);
		expect(view().notice).toBeNull();
	}, 20_000);

	it('失败提示不自动收起，须由用户关闭', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		await settle();

		sendResponder = async () => ({ success: false, error: 'user rejected' });
		store.revokeSelected();
		await settle(80);

		expect(view().notice).toEqual({ kind: 'failure', message: 'user rejected' });
		// 失败时行不该消失。
		expect(rowIds()).toEqual([`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`]);

		// 远超成功提示的 6 秒，失败提示仍在。
		await settle(6_400);
		expect(view().notice).toEqual({ kind: 'failure', message: 'user rejected' });

		store.dismissNotice();
		await settle();
		expect(view().notice).toBeNull();
	}, 20_000);

	it('手动关闭成功提示后，稍后到期的自动收起不再改动任何东西', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		await settle();

		store.revokeSelected();
		await settle(80);
		expect(view().notice?.kind).toBe('success');

		// 用户立刻关掉 —— 宿主那个 6 秒定时器**没有**被取消（宿主刻意不保存句柄）。
		store.dismissNotice();
		await settle();
		expect(view().notice).toBeNull();

		// 又撤销了一次，产生一条**新的**成功提示。
		store.toggleRow(`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`);
		await settle();

		// 旧定时器到期。核心按 id 丢弃它 —— 正确性不依赖宿主记得 clearTimeout。
		await settle(6_400);
		expect(view().notice).toBeNull();
	}, 20_000);
});

describe('第 8 项：撤销进行中忽略新的触发', () => {
	it('第一笔在途时的第二次点击不产生第二笔发送', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1), row(TOKEN_B, SPENDER_2)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		store.toggleRow(`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`);
		await settle();

		let release!: (r: SendResult) => void;
		sendResponder = () => new Promise<SendResult>((r) => (release = r));

		store.revokeSelected();
		await settle(50);
		expect(view().is_revoking).toBe(true);
		expect(sendCalls).toHaveLength(1);

		// 在途时再点两次 —— 真交易只给你几秒窗口，这里是确定的。
		store.revokeSelected();
		store.revokeOne(`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`);
		await settle(50);
		expect(sendCalls).toHaveLength(1);

		release({ success: true, txHash: '0xTX' });
		await settle(80);
		expect(view().is_revoking).toBe(false);
		expect(rowIds()).toEqual([]);
	});

	it('逐行进行中标记由核心算好，覆盖本次撤销的每一行', async () => {
		await bootWith([row(TOKEN_A, SPENDER_1), row(TOKEN_B, SPENDER_2)]);
		store.toggleRow(`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`);
		await settle();

		sendResponder = () => new Promise<SendResult>(() => {});
		store.revokeSelected();
		await settle(50);

		const byId = Object.fromEntries(view().rows.map((r) => [r.id, r.is_pending]));
		expect(byId[`erc20:${TOKEN_A.toLowerCase()}:${SPENDER_1.toLowerCase()}`]).toBe(true);
		expect(byId[`erc20:${TOKEN_B.toLowerCase()}:${SPENDER_2.toLowerCase()}`]).toBe(false);
	});
});

describe('形状确实穿过了整条链路', () => {
	it('bigint 额度、Permit2 前缀、camelCase 字段都被正确送进核心并回到视图', async () => {
		const permit2Row: ApprovalRow = {
			...row(TOKEN_D, SPENDER_9),
			id: `permit2:${TOKEN_D.toLowerCase()}:${SPENDER_9.toLowerCase()}`,
			allowance: 123456789012345678901234567890n,
			unlimited: false,
			tokenName: 'Test Token',
			spenderLabel: 'Some DEX',
			spenderKind: 'dex',
		};
		await bootWith([permit2Row]);

		const [seen] = view().rows;
		// 核心生成的 id：Permit2 的标准段是字面量 permit2（FR-021）。
		expect(seen.id).toBe(`permit2:${TOKEN_D.toLowerCase()}:${SPENDER_9.toLowerCase()}`);
		expect(seen.is_permit2).toBe(true);
		// bigint 以十进制字符串过界，一位不差。
		expect(seen.allowance).toBe('123456789012345678901234567890');
		expect(seen.token_name).toBe('Test Token');
		expect(seen.spender_label).toBe('Some DEX');
		expect(seen.spender_kind).toBe('dex');
	});
});
