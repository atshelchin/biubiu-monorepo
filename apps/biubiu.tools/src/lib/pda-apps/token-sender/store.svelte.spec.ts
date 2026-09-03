/**
 * 批量代币发送：宿主接线的端到端验证（spec 002-token-sender-core）。
 *
 * 业务规则由 Rust 侧的 32 个用例覆盖 —— 那些不需要浏览器。这里验的是**规则与页面之间的
 * 接线**：真 WASM 核心、真 shell operation 路由、真形状转换、真 IndexedDB。
 *
 * 只有 `walletStore` 被换成受控替身，而它是本次迁移**没有改动过**的代码。换掉它反而让三件
 * 真交易做不到的事成为可能：让某一批**恰好失败**、在一批**仍在途时**点暂停、以及不必真的
 * 花钱就跑完一整轮多批发送。
 *
 * 最要紧的一条在最前面：**已打款的地址不会被重复打款**。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import type { SendResult, SendStatus } from '$lib/wallet';

// ── 替身：钱包 ──────────────────────────────────────────────────────────────
type SendCallsArgs = { calls: unknown[]; opts: { onPhase?: (p: SendStatus) => void } };
const sendCalls: SendCallsArgs[] = [];
let sendResponder: (args: SendCallsArgs, index: number) => Promise<SendResult>;

vi.mock('$lib/wallet', () => ({
	walletStore: {
		get activeWallet() {
			return {
				address: '0x0e00000000000000000000000000000000000001' as Address,
				sendCalls: (calls: unknown[], opts: SendCallsArgs['opts']) => {
					const args = { calls, opts };
					const index = sendCalls.length;
					sendCalls.push(args);
					return sendResponder(args, index);
				},
			};
		},
		kind: 'biubiu',
	},
}));

// 会员豁免走 passkey 签名，属于平台动作；这里不验它，只保证它不挡路。
vi.mock('$lib/subscription', () => ({
	memberWaiver: { canProve: false, proving: false, isWaiverActive: false },
	proveMemberControl: async () => ({ ok: false }),
	ensureMembershipLoaded: async () => {},
}));

// 费用报价与余额预检要连公网；固定成确定值，好让批次数与总费用可断言。
vi.mock('./core/fee.js', () => ({
	quoteFee: async () => ({ amount: 1_000n, source: 'config' }),
}));
vi.mock('./core/orchestrator.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./core/orchestrator.js')>();
	return {
		...actual,
		preflight: async () => ({
			ok: true,
			nativeBalance: 10n ** 20n,
			nativeNeeded: 1n,
		}),
	};
});

const { tokenSender: store } = await import('./store.svelte.js');

// ── 夹具 ────────────────────────────────────────────────────────────────────

/** 合法的 20 字节地址（全小写 —— 解析器接受，无大小写信息无从校验）。 */
const addr = (tag: string): Address =>
	`0x${tag.padStart(40, '0')}`.toLowerCase() as Address;

const settle = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));
const view = () => store.view!;

/** 把 n 个收件人、每人 1 个最小单位的文本填进去并解析。 */
function enterRecipients(n: number) {
	const text = Array.from({ length: n }, (_, i) => `${addr((i + 1).toString(16))},1`).join('\n');
	store.parse(text);
}

/** 走到「可以发送」的状态：解析 + 报价 + 预检。 */
async function readyToSend(n: number) {
	await store.start();
	store.syncWallet();
	await settle();
	enterRecipients(n);
	await settle();
	store.goTo('review');
	store.prepareReview();
	await settle(120);
}

beforeEach(async () => {
	sendCalls.length = 0;
	sendResponder = async () => ({ success: true, txHash: '0xTX' });
	store.dispose();
	indexedDB.deleteDatabase('biubiu-token-sender-config');
	indexedDB.deleteDatabase('biubiu-token-sender-history');
	await settle(20);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('资金安全：已打款的地址不会被重复打款', () => {
	it('续发只重试未成功的批次，一个已成功的批次都不重发', async () => {
		await readyToSend(5);
		// 每批上限 100 太大，这里直接验证 5 个收件人 = 1 批；改用更多收件人拿到多批。
		expect(view().total_batches).toBe(1);

		await readyToSend(250); // 每批 100 ⇒ 3 批
		expect(view().total_batches).toBe(3);

		// 第 0 批成功、第 1 批失败、第 2 批失败。
		sendResponder = async (_args, index) =>
			index === 0 ? { success: true, txHash: '0xA' } : { success: false, error: 'boom' };

		store.send();
		// 批间有 2.5 秒喘息，跑完 3 批需要等两轮。
		await settle(6_000);

		expect(view().send_status).toBe('done');
		expect(view().succeeded_batches).toBe(1);
		expect(view().failed_batches).toBe(2);
		expect(sendCalls).toHaveLength(3);

		// 续发：只该重试 1 和 2。
		const before = sendCalls.length;
		sendResponder = async () => ({ success: true, txHash: '0xB' });
		store.resume();
		await settle(4_000);

		// 只重试两批 —— 第 0 批已打款，一个请求都不发。
		expect(sendCalls.length - before).toBe(2);
		expect(view().succeeded_batches).toBe(3);
		expect(view().can_resume).toBe(false);
	}, 30_000);
});

describe('暂停：停止发新批，但不撤回在途那批', () => {
	it('暂停后不再发新批；在途那批的结果仍被记录', async () => {
		await readyToSend(250); // 3 批

		let release!: (r: SendResult) => void;
		sendResponder = (_args, index) =>
			index === 0
				? new Promise<SendResult>((r) => (release = r))
				: Promise.resolve({ success: true, txHash: '0xB' });

		store.send();
		await settle(100);
		expect(view().send_status).toBe('running');
		expect(sendCalls).toHaveLength(1);

		store.pause();
		await settle(50);
		expect(view().send_status).toBe('paused');

		// 在途那批现在才返回 —— 交易可能已上链，结果必须被记录。
		release({ success: true, txHash: '0xA' });
		await settle(3_000);

		// 暂停后到达的结果仍要记录 —— 交易可能已上链。
		expect(view().succeeded_batches).toBe(1);
		// 但绝不开新批。
		expect(sendCalls).toHaveLength(1);
		expect(view().send_status).toBe('paused');
	}, 30_000);

	it('在批间喘息中暂停会立即生效，不等满 2.5 秒', async () => {
		await readyToSend(250);
		store.send();
		await settle(200);
		expect(sendCalls).toHaveLength(1);

		// 第一批已成功，现在处于批间喘息中。
		store.pause();
		await settle(3_500); // 远超 2.5 秒

		// 喘息到期的回送被核心按 id 丢弃。
		expect(sendCalls).toHaveLength(1);
		expect(view().send_status).toBe('paused');
	}, 30_000);
});

describe('解析、批次与费用穿过整条链路', () => {
	it('批次数、总费用与每批携带的费用都由核心算出', async () => {
		await readyToSend(250);

		expect(view().valid_count).toBe(250);
		expect(view().batch_size).toBe(100);
		expect(view().total_batches).toBe(3);
		expect(view().fee?.amount).toBe('1000');
		// 单批 1000 × 3 批。
		expect(view().fee_total).toBe('3000');

		store.send();
		await settle(6_000);

		// 每一批的 MultiSend 都多一笔费用转账（收件人 + 1）。
		expect(sendCalls).toHaveLength(3);
		expect(sendCalls[0].calls).toHaveLength(101);
		// 最后一批 50 个收件人 + 1 笔费用。
		expect(sendCalls[2].calls).toHaveLength(51);
	}, 30_000);

	it('解析的判定与计数逐项穿过边界', async () => {
		await store.start();
		store.syncWallet();
		await settle();

		const good = addr('a11ce');
		store.parse(
			[
				'# 注释行',
				'',
				`${good},1`,
				`${good},2`, // 重复
				'not-an-address,1',
				`${addr('b0b')}`, // 缺金额
			].join('\n'),
		);
		await settle();

		expect(view().valid_count).toBe(1);
		expect(view().duplicate_count).toBe(1);
		expect(view().invalid.map((i) => i.reason)).toEqual(['invalid-address', 'missing-amount']);
		// 行号从 1 计，注释与空行也占行号。
		expect(view().invalid.map((i) => i.line)).toEqual([5, 6]);
	});

	it('切换网络会清空解析结果 —— 精度可能变了', async () => {
		await readyToSend(5);
		expect(view().valid_count).toBe(5);

		store.setNetwork('base-mainnet');
		await settle();

		expect(view().valid_count).toBe(0);
		expect(view().has_parsed).toBe(false);
	});
});

describe('ViewModel 的边界', () => {
	it('十万级收件人不会进视图，但摘要在', async () => {
		await readyToSend(250);
		const json = JSON.stringify(view());

		expect(json).not.toContain('"recipients"');
		expect(view().valid_count).toBe(250);
		// 尚未开始发送时批次表为空。
		expect(view().batches).toHaveLength(0);
	});
});
