import { describe, it, expect } from 'vitest';
import {
	parseAbiInput,
	extractMethods,
	isStaticWordType,
	staticOutputSlots,
	typeCategory,
	getComponents
} from './abi.js';
import type { Abi } from 'viem';

const ERC20_HUMAN = `function transfer(address to, uint256 amount) returns (bool)
function symbol() view returns (string)
function decimals() view returns (uint8)
function deposit() payable`;

describe('parseAbiInput — input formats', () => {
	it('parses human-readable signatures', () => {
		const r = parseAbiInput(ERC20_HUMAN);
		expect(r.ok).toBe(true);
		expect(r.methods?.map((m) => m.name).sort()).toEqual([
			'decimals',
			'deposit',
			'symbol',
			'transfer'
		]);
	});

	it('parses a JSON ABI array', () => {
		const json = JSON.stringify([
			{
				type: 'function',
				name: 'foo',
				stateMutability: 'view',
				inputs: [],
				outputs: [{ type: 'uint256' }]
			}
		]);
		const r = parseAbiInput(json);
		expect(r.ok).toBe(true);
		expect(r.methods).toHaveLength(1);
	});

	it('parses a Foundry/Hardhat artifact { abi: [...] }', () => {
		const json = JSON.stringify({
			abi: [
				{ type: 'function', name: 'bar', stateMutability: 'nonpayable', inputs: [], outputs: [] }
			]
		});
		const r = parseAbiInput(json);
		expect(r.ok).toBe(true);
		expect(r.methods?.[0].name).toBe('bar');
	});

	it('parses an Etherscan { result: "<stringified abi>" } response', () => {
		const inner = JSON.stringify([
			{
				type: 'function',
				name: 'baz',
				stateMutability: 'view',
				inputs: [],
				outputs: [{ type: 'bool' }]
			}
		]);
		const r = parseAbiInput(JSON.stringify({ result: inner }));
		expect(r.ok).toBe(true);
		expect(r.methods?.[0].name).toBe('baz');
	});
});

describe('parseAbiInput — error paths', () => {
	it('rejects empty input', () => {
		expect(parseAbiInput('   ')).toMatchObject({ ok: false, error: 'ABI is empty' });
	});

	it('rejects malformed JSON', () => {
		expect(parseAbiInput('{not json')).toMatchObject({ ok: false });
	});

	it('rejects JSON that is not an ABI array', () => {
		const r = parseAbiInput('{"foo": 1}');
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/does not contain an ABI array/);
	});

	it('rejects an ABI with no callable functions', () => {
		const json = JSON.stringify([{ type: 'event', name: 'Transfer', inputs: [] }]);
		const r = parseAbiInput(json);
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/No callable functions/);
	});

	it('ignores comment lines in human-readable input', () => {
		const r = parseAbiInput('// a comment\nfunction symbol() view returns (string)');
		expect(r.ok).toBe(true);
		expect(r.methods).toHaveLength(1);
	});
});

describe('extractMethods — metadata & ordering', () => {
	const methods = extractMethods(parseAbiInput(ERC20_HUMAN).abi as Abi);

	it('puts read (view/pure) methods before writes, alphabetical within groups', () => {
		// reads: decimals, symbol ; writes: deposit, transfer
		expect(methods.map((m) => m.name)).toEqual(['decimals', 'symbol', 'deposit', 'transfer']);
	});

	it('computes canonical signatures and 4-byte selectors', () => {
		const transfer = methods.find((m) => m.name === 'transfer')!;
		expect(transfer.signature).toBe('transfer(address,uint256)');
		expect(transfer.selector).toBe('0xa9059cbb');
		const symbol = methods.find((m) => m.name === 'symbol')!;
		expect(symbol.selector).toBe('0x95d89b41');
	});

	it('drops selector-only entries with no name (WhatsABI unresolved selectors)', () => {
		const abi = [
			{
				type: 'function',
				name: 'transfer',
				stateMutability: 'nonpayable',
				inputs: [{ type: 'address' }, { type: 'uint256' }],
				outputs: []
			},
			{ type: 'function', selector: '0x12345678' } // no name / inputs
		] as unknown as Abi;
		expect(extractMethods(abi).map((m) => m.name)).toEqual(['transfer']);
	});

	it('flags read vs write and payable correctly', () => {
		const symbol = methods.find((m) => m.name === 'symbol')!;
		expect(symbol.isRead).toBe(true);
		expect(symbol.payable).toBe(false);
		const deposit = methods.find((m) => m.name === 'deposit')!;
		expect(deposit.isRead).toBe(false);
		expect(deposit.payable).toBe(true);
		const transfer = methods.find((m) => m.name === 'transfer')!;
		expect(transfer.isRead).toBe(false);
		expect(transfer.payable).toBe(false);
	});
});

describe('isStaticWordType', () => {
	it('accepts value types that occupy one 32-byte word', () => {
		for (const t of ['uint256', 'uint8', 'int128', 'address', 'bool', 'bytes32', 'bytes1']) {
			expect(isStaticWordType(t)).toBe(true);
		}
	});

	it('rejects dynamic types, arrays, and tuples', () => {
		for (const t of ['bytes', 'string', 'uint256[]', 'address[3]', 'tuple', 'tuple[]', 'bytes33']) {
			expect(isStaticWordType(t)).toBe(false);
		}
	});
});

describe('staticOutputSlots', () => {
	it('lists each static output word by index', () => {
		const m = parseAbiInput('function getReserves() view returns (uint112,uint112,uint32)')
			.methods![0];
		expect(staticOutputSlots(m).map((s) => s.slot)).toEqual([0, 1, 2]);
	});

	it('skips dynamic outputs but keeps their slot index for the static ones', () => {
		const m = parseAbiInput('function mixed() view returns (uint256 a, string b, address c)')
			.methods![0];
		expect(staticOutputSlots(m).map((s) => s.slot)).toEqual([0, 2]);
	});

	it('returns nothing when there are no static outputs', () => {
		const m = parseAbiInput('function name() view returns (string)').methods![0];
		expect(staticOutputSlots(m)).toEqual([]);
	});
});

describe('typeCategory', () => {
	it('classifies common ABI types', () => {
		expect(typeCategory('uint256')).toBe('uint');
		expect(typeCategory('int8')).toBe('int');
		expect(typeCategory('address')).toBe('address');
		expect(typeCategory('bool')).toBe('bool');
		expect(typeCategory('bytes32')).toBe('bytes');
		expect(typeCategory('bytes')).toBe('bytes');
		expect(typeCategory('string')).toBe('string');
		expect(typeCategory('uint256[]')).toBe('array');
		expect(typeCategory('tuple')).toBe('tuple');
		expect(typeCategory('tuple[]')).toBe('array');
	});
});

describe('getComponents', () => {
	it('returns components for a tuple parameter and undefined otherwise', () => {
		const m = parseAbiInput('function f((uint256 a, address b) p)').methods![0];
		expect(getComponents(m.inputs[0])?.map((c) => c.type)).toEqual(['uint256', 'address']);
		const plain = parseAbiInput('function g(uint256 x)').methods![0];
		expect(getComponents(plain.inputs[0])).toBeUndefined();
	});
});
