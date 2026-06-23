import { describe, it, expect } from 'vitest';
import { putSend, listSends, getSend, deleteSend } from './send-history.js';
import type { SendRecord } from '../types.js';

const rec: SendRecord = {
	id: 'send-1',
	createdAt: 1,
	network: 'eth-mainnet',
	networkName: 'Ethereum',
	tokenType: 'native',
	tokenSymbol: 'ETH',
	decimals: 18,
	totalRecipients: 1,
	totalAmount: '1',
	feeWei: '0',
	isMember: false,
	status: 'completed',
	batches: [],
};

// node 测试环境无 indexedDB —— 验证 SSR 安全降级（no-op / 空），不抛异常。
// 真实 IndexedDB CRUD 由浏览器 / e2e 覆盖（fake-indexeddb 未引入，见 DESIGN.md）。
describe('send-history · SSR-safe degradation (no indexedDB)', () => {
	it('does not throw and returns empty/undefined', async () => {
		await expect(putSend(rec)).resolves.toBeUndefined();
		await expect(listSends()).resolves.toEqual([]);
		await expect(getSend('send-1')).resolves.toBeUndefined();
		await expect(deleteSend('send-1')).resolves.toBeUndefined();
	});
});
