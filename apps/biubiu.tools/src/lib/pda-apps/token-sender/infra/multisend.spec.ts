import { describe, it, expect } from 'vitest';
import { decodeFunctionData, type Address } from 'viem';
import {
	encodeSubTransaction,
	encodeMultiSend,
	buildBatchSubTransactions,
	batchNativeOutflow,
} from './multisend.js';
import { encodeErc20Transfer } from './erc20.js';
import { FEE_COLLECTOR } from './fee-config.js';

const ADDR1 = '0x1111111111111111111111111111111111111111' as Address;
const ADDR2 = '0x2222222222222222222222222222222222222222' as Address;
const TOKEN = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;

const MULTISEND_ABI = [
	{
		type: 'function',
		name: 'multiSend',
		stateMutability: 'payable',
		inputs: [{ name: 'transactions', type: 'bytes' }],
		outputs: [],
	},
] as const;

describe('encodeSubTransaction (Safe MultiSend packed format)', () => {
	it('packs a native transfer: op‖to‖value‖len(0)‖empty', () => {
		const packed = encodeSubTransaction({ to: ADDR1, value: 1n, data: '0x' });
		const expected =
			'0x' +
			'00' + // operation = CALL
			'1111111111111111111111111111111111111111' + // to (20B)
			'0'.repeat(63) + '1' + // value = 1 (32B)
			'0'.repeat(64); // dataLength = 0 (32B)
		expect(packed).toBe(expected);
		// 1 + 20 + 32 + 32 = 85 bytes = 170 hex
		expect(packed.length - 2).toBe(170);
	});

	it('packs an ERC20 transfer: value 0, data = transfer(), len = 68', () => {
		const data = encodeErc20Transfer(ADDR2, 5n);
		const packed = encodeSubTransaction({ to: TOKEN, value: 0n, data });
		const expected =
			'0x' +
			'00' +
			TOKEN.slice(2).toLowerCase() +
			'0'.repeat(64) + // value = 0
			'0'.repeat(62) + '44' + // dataLength = 68 (0x44)
			data.slice(2);
		expect(packed.toLowerCase()).toBe(expected.toLowerCase());
	});
});

describe('encodeMultiSend', () => {
	it('round-trips: decode(multiSend) === concat of packed subs', () => {
		const subs = [
			{ to: ADDR1, value: 1n, data: '0x' as const },
			{ to: ADDR2, value: 2n, data: '0x' as const },
		];
		const calldata = encodeMultiSend(subs);
		const { functionName, args } = decodeFunctionData({ abi: MULTISEND_ABI, data: calldata });
		expect(functionName).toBe('multiSend');
		const expectedPacked =
			'0x' + subs.map((s) => encodeSubTransaction(s).slice(2)).join('');
		expect((args[0] as string).toLowerCase()).toBe(expectedPacked.toLowerCase());
	});
});

describe('buildBatchSubTransactions', () => {
	it('native batch with fee prepends the fee transfer', () => {
		const subs = buildBatchSubTransactions({
			tokenType: 'native',
			recipients: [
				{ address: ADDR1, amount: 10n },
				{ address: ADDR2, amount: 20n },
			],
			feeCollector: FEE_COLLECTOR,
			feeWei: 7n,
		});
		expect(subs).toHaveLength(3);
		expect(subs[0]).toEqual({ to: FEE_COLLECTOR, value: 7n, data: '0x' });
		expect(subs[1]).toEqual({ to: ADDR1, value: 10n, data: '0x' });
		// native outflow includes fee
		expect(batchNativeOutflow(subs)).toBe(37n);
	});

	it('native batch without fee has no extra transfer', () => {
		const subs = buildBatchSubTransactions({
			tokenType: 'native',
			recipients: [{ address: ADDR1, amount: 10n }],
		});
		expect(subs).toHaveLength(1);
		expect(batchNativeOutflow(subs)).toBe(10n);
	});

	it('erc20 batch encodes transfers to the token, value 0 (no approve)', () => {
		const subs = buildBatchSubTransactions({
			tokenType: 'erc20',
			tokenAddress: TOKEN,
			recipients: [{ address: ADDR1, amount: 100n }],
		});
		expect(subs).toHaveLength(1);
		expect(subs[0].to).toBe(TOKEN);
		expect(subs[0].value).toBe(0n);
		expect(subs[0].data).toBe(encodeErc20Transfer(ADDR1, 100n));
		// erc20 batch has zero native outflow
		expect(batchNativeOutflow(subs)).toBe(0n);
	});

	it('erc20 batch with native fee: fee is native, transfers are token', () => {
		const subs = buildBatchSubTransactions({
			tokenType: 'erc20',
			tokenAddress: TOKEN,
			recipients: [{ address: ADDR1, amount: 100n }],
			feeCollector: FEE_COLLECTOR,
			feeWei: 7n,
		});
		expect(subs).toHaveLength(2);
		expect(subs[0]).toEqual({ to: FEE_COLLECTOR, value: 7n, data: '0x' });
		expect(subs[1].to).toBe(TOKEN);
		// only the native fee counts as native outflow
		expect(batchNativeOutflow(subs)).toBe(7n);
	});

	it('throws if erc20 send is missing tokenAddress', () => {
		expect(() =>
			buildBatchSubTransactions({
				tokenType: 'erc20',
				recipients: [{ address: ADDR1, amount: 1n }],
			}),
		).toThrow(/tokenAddress/);
	});

	it('fee 0 / undefined adds no fee transfer', () => {
		const zero = buildBatchSubTransactions({
			tokenType: 'native',
			recipients: [{ address: ADDR1, amount: 10n }],
			feeCollector: FEE_COLLECTOR,
			feeWei: 0n,
		});
		expect(zero).toHaveLength(1);
	});

	it('throws when feeWei > 0 but feeCollector is missing', () => {
		expect(() =>
			buildBatchSubTransactions({
				tokenType: 'native',
				recipients: [{ address: ADDR1, amount: 1n }],
				feeWei: 5n,
			}),
		).toThrow(/feeCollector/);
	});
});

describe('encodeMultiSend · edge cases', () => {
	it('empty transaction list encodes to multiSend("0x")', () => {
		const calldata = encodeMultiSend([]);
		const { functionName, args } = decodeFunctionData({ abi: MULTISEND_ABI, data: calldata });
		expect(functionName).toBe('multiSend');
		expect(args[0]).toBe('0x');
	});

	it('batchNativeOutflow of empty list is 0', () => {
		expect(batchNativeOutflow([])).toBe(0n);
	});
});
