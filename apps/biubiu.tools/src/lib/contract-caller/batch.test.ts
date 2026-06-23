import { describe, it, expect } from 'vitest';
import { decodeFunctionData, type Address, type Hex } from 'viem';
import {
	MULTISEND_ADDRESS,
	encodeMultiSendTx,
	packMultiSend,
	encodeMultiSendCall,
	totalBatchValue,
	buildSafeBatchJson
} from './batch.js';
import type { QueuedCall } from './types.js';

const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const APPROVE_DATA =
	'0x095ea7b30000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000005f5e100' as Hex;

const MULTISEND_ABI = [
	{
		type: 'function',
		name: 'multiSend',
		stateMutability: 'payable',
		inputs: [{ name: 'transactions', type: 'bytes' }],
		outputs: []
	}
] as const;

function call(over: Partial<QueuedCall> = {}): QueuedCall {
	return {
		id: 'id',
		label: 'approve(...)',
		to: TOKEN,
		value: 0n,
		data: APPROVE_DATA,
		signature: 'approve(address,uint256)',
		...over
	};
}

describe('MULTISEND_ADDRESS', () => {
	it('is the canonical Safe 1.4.1 MultiSend address', () => {
		expect(MULTISEND_ADDRESS).toBe('0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526');
	});
});

describe('encodeMultiSendTx (packed sub-tx)', () => {
	it('packs op(1) ‖ to(20) ‖ value(32) ‖ len(32) ‖ data', () => {
		const packed = encodeMultiSendTx(TOKEN, 0n, APPROVE_DATA, 0);
		const dataBytes = APPROVE_DATA.slice(2);
		const expected =
			'0x' +
			'00' +
			TOKEN.slice(2).toLowerCase() +
			'0'.repeat(64) + // value 0
			(dataBytes.length / 2).toString(16).padStart(64, '0') + // length = 68 (0x44)
			dataBytes;
		expect(packed.toLowerCase()).toBe(expected.toLowerCase());
		// 1 + 20 + 32 + 32 + 68 = 153 bytes
		expect((packed.length - 2) / 2).toBe(153);
	});

	it('encodes value and the delegatecall operation byte', () => {
		const packed = encodeMultiSendTx(TOKEN, 7n, '0x', 1);
		expect(packed.slice(2, 4)).toBe('01'); // operation = DELEGATECALL
		expect(packed.slice(4, 44)).toBe(TOKEN.slice(2).toLowerCase());
		expect(BigInt('0x' + packed.slice(44, 108))).toBe(7n); // value word
		expect(packed.slice(108, 172)).toBe('0'.repeat(64)); // len 0
	});
});

describe('packMultiSend / encodeMultiSendCall', () => {
	it('concatenates packed sub-txs', () => {
		const calls = [call(), call({ value: 1n })];
		const packed = packMultiSend(calls);
		const expected =
			'0x' + calls.map((c) => encodeMultiSendTx(c.to, c.value, c.data, 0).slice(2)).join('');
		expect(packed).toBe(expected);
	});

	it('round-trips through multiSend(bytes) and uses the right selector', () => {
		const calls = [call(), call()];
		const data = encodeMultiSendCall(calls);
		expect(data.startsWith('0x8d80ff0a')).toBe(true);
		const { functionName, args } = decodeFunctionData({ abi: MULTISEND_ABI, data });
		expect(functionName).toBe('multiSend');
		expect((args[0] as string).toLowerCase()).toBe(packMultiSend(calls).toLowerCase());
	});
});

describe('totalBatchValue', () => {
	it('sums sub-call values', () => {
		expect(totalBatchValue([call({ value: 3n }), call({ value: 4n })])).toBe(7n);
		expect(totalBatchValue([])).toBe(0n);
	});
});

describe('buildSafeBatchJson', () => {
	it('produces a Transaction Builder file with stringified values', () => {
		const json = buildSafeBatchJson(8453, [call({ value: 5n })], 1700000000000) as Record<
			string,
			unknown
		>;
		expect(json.version).toBe('1.0');
		expect(json.chainId).toBe('8453');
		expect(json.createdAt).toBe(1700000000000);
		const txs = json.transactions as Array<Record<string, unknown>>;
		expect(txs).toHaveLength(1);
		expect(txs[0]).toMatchObject({
			to: TOKEN,
			value: '5',
			data: APPROVE_DATA,
			contractMethod: null,
			contractInputsValues: null
		});
		expect((json.meta as Record<string, unknown>).description).toBe('1 transaction');
	});

	it('pluralizes the transaction count in meta', () => {
		const json = buildSafeBatchJson(1, [call(), call()], 0) as Record<string, unknown>;
		expect((json.meta as Record<string, unknown>).description).toBe('2 transactions');
	});
});
