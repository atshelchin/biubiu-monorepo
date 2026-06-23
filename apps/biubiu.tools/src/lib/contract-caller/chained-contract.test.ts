import { describe, it, expect } from 'vitest';
import { decodeFunctionData, isAddress, getAddress, type Address, type Hex } from 'viem';
import {
	CHAINED_MULTISEND_ADDRESS,
	CHAINED_SALT,
	chainedDeployCalldata,
	encodeExecuteChainDelegated,
	staticWordRef,
	type ChainedCall
} from './chained-contract.js';

const CREATE2_PROXY = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
const TOKEN = '0x4200000000000000000000000000000000000006' as Address;

const CHAINED_ABI = [
	{
		type: 'function',
		name: 'executeChainDelegated',
		stateMutability: 'payable',
		inputs: [
			{
				name: 'calls',
				type: 'tuple[]',
				components: [
					{ name: 'to', type: 'address' },
					{ name: 'value', type: 'uint256' },
					{ name: 'data', type: 'bytes' },
					{
						name: 'returnRefs',
						type: 'tuple[]',
						components: [
							{ name: 'callIndex', type: 'uint8' },
							{ name: 'returnOffset', type: 'uint16' },
							{ name: 'returnLength', type: 'uint16' },
							{ name: 'dataOffset', type: 'uint16' }
						]
					}
				]
			}
		],
		outputs: [{ name: 'results', type: 'bytes[]' }]
	}
] as const;

describe('CHAINED_MULTISEND_ADDRESS', () => {
	it('is a valid, deterministic CREATE2 address', () => {
		expect(isAddress(CHAINED_MULTISEND_ADDRESS)).toBe(true);
		// Fixed bytecode + zero ctor args + zero salt → same address on every chain.
		expect(CHAINED_MULTISEND_ADDRESS).toBe('0x528ADDF3364eCDc76440CD4c2Dedb07Bd328f835');
	});
});

describe('chainedDeployCalldata', () => {
	it('targets the standard CREATE2 proxy', () => {
		expect(getAddress(chainedDeployCalldata().to)).toBe(getAddress(CREATE2_PROXY));
	});

	it('prefixes the (zero) salt then the creation bytecode', () => {
		const { data } = chainedDeployCalldata();
		expect(CHAINED_SALT).toBe(`0x${'0'.repeat(64)}`);
		expect(data.slice(0, 66)).toBe(`0x${'0'.repeat(64)}`); // 32-byte salt
		expect(data.slice(66).startsWith('60e034')).toBe(true); // ChainedMultiSend bytecode
	});
});

describe('staticWordRef', () => {
	it('maps (sourceStep, outputSlot, paramIndex) to a full-word splice', () => {
		expect(staticWordRef(0, 0, 1)).toEqual({
			callIndex: 0,
			returnOffset: 0,
			returnLength: 32,
			dataOffset: 36 // selector(4) + 32*1
		});
		expect(staticWordRef(2, 1, 3)).toEqual({
			callIndex: 2,
			returnOffset: 32, // 32 * slot 1
			returnLength: 32,
			dataOffset: 100 // 4 + 32*3
		});
	});
});

describe('encodeExecuteChainDelegated', () => {
	const calls: ChainedCall[] = [
		{ to: TOKEN, value: 0n, data: '0x18160ddd' as Hex, returnRefs: [] },
		{
			to: TOKEN,
			value: 0n,
			data: ('0x095ea7b3' + '00'.repeat(64)) as Hex,
			returnRefs: [staticWordRef(0, 0, 1)]
		}
	];

	it('uses the executeChainDelegated selector matching the compiled contract', () => {
		expect(encodeExecuteChainDelegated(calls).startsWith('0xbd6b0ad2')).toBe(true);
	});

	it('round-trips the calls + return refs through decodeFunctionData', () => {
		const data = encodeExecuteChainDelegated(calls);
		const { functionName, args } = decodeFunctionData({ abi: CHAINED_ABI, data });
		expect(functionName).toBe('executeChainDelegated');
		const decoded = args[0] as ReadonlyArray<{
			to: string;
			value: bigint;
			data: string;
			returnRefs: ReadonlyArray<{
				callIndex: number;
				returnOffset: number;
				returnLength: number;
				dataOffset: number;
			}>;
		}>;
		expect(decoded).toHaveLength(2);
		expect(getAddress(decoded[1].to)).toBe(TOKEN);
		expect(decoded[1].returnRefs[0]).toEqual({
			callIndex: 0,
			returnOffset: 0,
			returnLength: 32,
			dataOffset: 36
		});
	});
});
