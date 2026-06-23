import { describe, it, expect } from 'vitest';
import { decodeFunctionData, encodeFunctionData, getAddress, pad, toHex } from 'viem';
import { parseAbiInput } from './abi.js';
import { buildArgs, encodeCall, decodeResult } from './encode.js';
import type { ParsedMethod } from './types.js';

const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

function method(sig: string): ParsedMethod {
	return parseAbiInput(sig).methods![0];
}

const approve = method('function approve(address spender, uint256 amount) returns (bool)');

describe('buildArgs', () => {
	it('coerces every parameter to the JS type viem expects', () => {
		const r = buildArgs(approve, [DAI, '100']);
		expect(r.ok).toBe(true);
		expect(r.args).toEqual([getAddress(DAI), 100n]);
	});

	it('reports the failing parameter index and a message', () => {
		const r = buildArgs(approve, ['0x1234', '100']);
		expect(r.ok).toBe(false);
		expect(r.failedIndex).toBe(0);
		expect(r.error).toMatch(/spender/);
	});

	it('fails when a required number is empty', () => {
		const r = buildArgs(approve, [DAI, '']);
		expect(r.ok).toBe(false);
		expect(r.failedIndex).toBe(1);
	});

	it('handles a no-arg method', () => {
		const r = buildArgs(method('function symbol() view returns (string)'), []);
		expect(r).toEqual({ ok: true, args: [] });
	});
});

describe('encodeCall', () => {
	it('produces the same calldata as viem encodeFunctionData', () => {
		const args = buildArgs(approve, [DAI, '100']).args!;
		const data = encodeCall(approve, args);
		const expected = encodeFunctionData({
			abi: [approve.abiItem],
			functionName: 'approve',
			args: [getAddress(DAI), 100n]
		});
		expect(data).toBe(expected);
	});

	it('round-trips through decodeFunctionData', () => {
		const args = buildArgs(approve, [DAI, '100']).args!;
		const data = encodeCall(approve, args);
		const decoded = decodeFunctionData({ abi: [approve.abiItem], data });
		expect(decoded.functionName).toBe('approve');
		expect(decoded.args).toEqual([getAddress(DAI), 100n]);
	});

	it('starts with the function selector', () => {
		const args = buildArgs(approve, [DAI, '0']).args!;
		expect(encodeCall(approve, args).startsWith('0x095ea7b3')).toBe(true);
	});
});

describe('decodeResult', () => {
	it('decodes a single uint256 return value', () => {
		const balanceOf = method('function balanceOf(address) view returns (uint256)');
		const raw = pad(toHex(12345n));
		expect(decodeResult(balanceOf, raw)).toBe(12345n);
	});

	it('decodes a bool return value', () => {
		const raw = pad(toHex(1n));
		expect(decodeResult(approve, raw)).toBe(true);
	});
});
