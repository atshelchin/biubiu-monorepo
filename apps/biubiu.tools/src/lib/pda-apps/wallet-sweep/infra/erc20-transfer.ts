/**
 * ERC20 `transfer(to, amount)` calldata — used by the refuel executor when an EOA
 * self-sends its tokens (no on-chain contract, pure EOA tx). `erc20.ts` only reads
 * metadata; this is the one write encoder.
 */
import { type Address, type Hex, encodeFunctionData } from 'viem';

const ERC20_TRANSFER_ABI = [
	{
		name: 'transfer',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ type: 'bool' }],
	},
] as const;

export function encodeErc20Transfer(to: Address, amount: bigint): Hex {
	return encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, amount] });
}
