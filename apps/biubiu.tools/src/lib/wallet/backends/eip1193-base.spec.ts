import { describe, it, expect } from 'vitest';
import { type Address, type Hex } from 'viem';
import { Eip1193Wallet } from './eip1193-base.js';
import type { Eip1193Provider } from '../eip1193.js';
import type { Call } from '../types.js';

const ADDR = '0x1111111111111111111111111111111111111111' as Address;
const TO = '0x2222222222222222222222222222222222222222' as Address;
const DATA = '0xa9059cbb' as Hex;
const SMART_CODE = '0x6080604052';

/** A scripted EIP-1193 provider that records calls and answers per method. */
function fakeProvider(handlers: Record<string, (params: unknown) => unknown>) {
	const calls: { method: string; params: unknown }[] = [];
	const provider: Eip1193Provider = {
		request: async ({ method, params }) => {
			calls.push({ method, params });
			const h = handlers[method];
			if (!h) throw new Error(`unexpected method ${method}`);
			return h(params);
		}
	};
	return { provider, calls };
}

/** Concrete subclass (base is abstract on `kind`). */
class TestWallet extends Eip1193Wallet {
	readonly kind = 'inject' as const;
}

function lastParams(calls: { method: string; params: unknown }[], method: string) {
	const hit = [...calls].reverse().find((c) => c.method === method);
	return (hit?.params as unknown[])?.[0] as Record<string, unknown>;
}

describe('Eip1193Wallet.sendCalls — single', () => {
	it('sends eth_sendTransaction with correctly hex-encoded params and confirms', async () => {
		const { provider, calls } = fakeProvider({
			eth_getCode: () => SMART_CODE,
			eth_sendTransaction: () => '0xhash',
			eth_getTransactionReceipt: () => ({ status: '0x1', transactionHash: '0xhash' })
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);

		const call: Call = { to: TO, value: 1000n, data: DATA };
		const res = await wallet.sendCalls([call], {
			chainId: 8453,
			explorerTxBaseUrl: 'https://basescan.org/tx/'
		});

		expect(res.success).toBe(true);
		expect(res.txHash).toBe('0xhash');
		expect(res.explorerUrl).toBe('https://basescan.org/tx/0xhash');

		const tx = lastParams(calls, 'eth_sendTransaction');
		expect(tx).toEqual({ from: ADDR, to: TO, value: '0x3e8', data: DATA });
		// same chain → no switch
		expect(calls.find((c) => c.method === 'wallet_switchEthereumChain')).toBeUndefined();
	});

	it('switches chain when provider is on a different chain', async () => {
		const { provider, calls } = fakeProvider({
			wallet_switchEthereumChain: () => null,
			eth_getCode: () => SMART_CODE,
			eth_sendTransaction: () => '0xhash',
			eth_getTransactionReceipt: () => ({ status: '0x1' })
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 1);
		await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], { chainId: 8453 });

		expect(lastParams(calls, 'wallet_switchEthereumChain')).toEqual({ chainId: '0x2105' });
	});

	it('rejects when the account is not a smart contract wallet on the target chain', async () => {
		const { provider } = fakeProvider({
			eth_getCode: () => '0x' // EOA on this chain
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/not a smart contract wallet/i);
	});

	it('reports a reverted receipt as failure', async () => {
		const { provider } = fakeProvider({
			eth_getCode: () => SMART_CODE,
			eth_sendTransaction: () => '0xhash',
			eth_getTransactionReceipt: () => ({ status: '0x0' })
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/reverted/i);
	});
});

describe('Eip1193Wallet.sendCalls — batch (EIP-5792)', () => {
	const calls2: Call[] = [
		{ to: TO, value: 0n, data: DATA },
		{ to: ADDR, value: 5n, data: '0x' }
	];

	it('uses wallet_sendCalls and resolves via wallet_getCallsStatus', async () => {
		const { provider, calls } = fakeProvider({
			eth_getCode: () => SMART_CODE,
			wallet_sendCalls: () => ({ id: 'batch-1' }),
			wallet_getCallsStatus: () => ({
				receipts: [{ status: '0x1', transactionHash: '0xbatchhash' }]
			})
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls(calls2, { chainId: 8453 });

		expect(res.success).toBe(true);
		expect(res.txHash).toBe('0xbatchhash');

		const batch = lastParams(calls, 'wallet_sendCalls');
		expect(batch.version).toBe('2.0.0');
		expect(batch.from).toBe(ADDR);
		expect(batch.chainId).toBe('0x2105');
		expect(batch.atomicRequired).toBe(true);
		expect(batch.calls).toEqual([
			{ to: TO, value: '0x0', data: DATA },
			{ to: ADDR, value: '0x5', data: '0x' }
		]);
	});

	it('errors clearly when the wallet does not support EIP-5792', async () => {
		const { provider } = fakeProvider({
			eth_getCode: () => SMART_CODE,
			wallet_sendCalls: () => {
				throw new Error('method not supported');
			}
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls(calls2, { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/EIP-5792/);
	});

	it('reports a reverted batch receipt as failure', async () => {
		const { provider } = fakeProvider({
			eth_getCode: () => SMART_CODE,
			wallet_sendCalls: () => 'batch-2', // string id form
			wallet_getCallsStatus: () => ({ receipts: [{ status: '0x0', transactionHash: '0xrev' }] })
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls(calls2, { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(res.txHash).toBe('0xrev');
		expect(res.error).toMatch(/reverted/i);
	});
});

describe('Eip1193Wallet.sendCalls — boundary & guard paths', () => {
	it('empty call list → error, touches no provider method', async () => {
		const { provider, calls } = fakeProvider({});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 8453);
		const res = await wallet.sendCalls([], { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it('chain-switch failure surfaces a clear error and never signs', async () => {
		const { provider, calls } = fakeProvider({
			wallet_switchEthereumChain: () => {
				throw new Error('user rejected');
			}
		});
		const wallet = new TestWallet(provider, ADDR, 'smart-contract', 1); // provider on chain 1, target 8453
		const res = await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], { chainId: 8453 });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/switch your wallet/i);
		expect(calls.find((c) => c.method === 'eth_sendTransaction')).toBeUndefined();
	});
});
