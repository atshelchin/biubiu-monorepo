/**
 * ChainedMultiSend integration: deterministic CREATE2 deployment + encoding of
 * `executeChainDelegated`, which performs a sequence of calls in ONE transaction
 * and splices earlier calls' return data into later calls' parameters.
 *
 * The Safe wallet delegatecalls into this helper (operation = 1), so target
 * contracts see the Safe as msg.sender. The helper is deployed at the same
 * address on every chain (fixed bytecode + fixed constructor args + fixed salt).
 */
import { type Address, type Hex, encodeFunctionData, encodeAbiParameters, concat } from 'viem';
import { CREATE2_PROXY, predictCreate2Address } from '$lib/deploy/create2.js';
import { isDeployed } from './rpc-client.js';
import { CHAINED_MULTISEND_BYTECODE } from './chained-bytecode.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
/** Fixed constructor args (unused by executeChainDelegated) → deterministic address. */
const CTOR_TRUSTED_FORWARDER: Address = ZERO_ADDRESS;
const CTOR_BIUBIU_PREMIUM: Address = ZERO_ADDRESS;
/** Fixed CREATE2 salt. */
export const CHAINED_SALT: Hex =
	'0x0000000000000000000000000000000000000000000000000000000000000000';

/** initCode = creation bytecode ‖ abi.encode(constructor args). */
function buildInitCode(): Hex {
	const encodedArgs = encodeAbiParameters(
		[{ type: 'address' }, { type: 'address' }],
		[CTOR_TRUSTED_FORWARDER, CTOR_BIUBIU_PREMIUM]
	);
	return concat([CHAINED_MULTISEND_BYTECODE as Hex, encodedArgs]);
}

const INIT_CODE = buildInitCode();

/** Deterministic address of the ChainedMultiSend helper (same on every chain). */
export const CHAINED_MULTISEND_ADDRESS = predictCreate2Address(CHAINED_SALT, INIT_CODE) as Address;

/** CREATE2 deploy calldata: proxy expects salt(32) ‖ initCode. */
export function chainedDeployCalldata(): { to: Address; data: Hex } {
	return {
		to: CREATE2_PROXY as Address,
		data: concat([CHAINED_SALT, INIT_CODE])
	};
}

/** Whether the helper is already deployed on the chain behind `rpcUrl`. */
export async function isChainedDeployed(rpcUrl: string): Promise<boolean> {
	return isDeployed(rpcUrl, CHAINED_MULTISEND_ADDRESS);
}

// ── executeChainDelegated encoding ──

export interface ReturnRef {
	callIndex: number;
	returnOffset: number;
	returnLength: number;
	dataOffset: number;
}

export interface ChainedCall {
	to: Address;
	value: bigint;
	data: Hex;
	returnRefs: ReturnRef[];
}

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

/** Encode the `executeChainDelegated(calls)` call data. */
export function encodeExecuteChainDelegated(calls: ChainedCall[]): Hex {
	return encodeFunctionData({
		abi: CHAINED_ABI,
		functionName: 'executeChainDelegated',
		args: [calls]
	});
}

/**
 * Build a ReturnRef that injects a full 32-byte word from a previous call's
 * return data into a static head parameter of the current call.
 *
 * @param sourceStep  index of the earlier call
 * @param outputSlot  which 32-byte output word of that call (0-based)
 * @param paramIndex  index of the static parameter to overwrite in this call
 */
export function staticWordRef(
	sourceStep: number,
	outputSlot: number,
	paramIndex: number
): ReturnRef {
	return {
		callIndex: sourceStep,
		returnOffset: 32 * outputSlot,
		returnLength: 32,
		dataOffset: 4 + 32 * paramIndex // selector(4) + one head word per param
	};
}
