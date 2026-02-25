import { encodeFunctionData, type Address, type Hex } from 'viem';
import type { BatchInput, TransactionRequest } from '../types';

// ── Minimal ABIs ────────────────────────────────────────────────────────

export const ETH_DISTRIBUTION_ABI = [
    {
        name: 'distributeSpecified',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'recipients', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
            {
                name: 'options',
                type: 'tuple',
                components: [
                    { name: 'gasLimit', type: 'uint256' },
                    { name: 'allowPartialFailure', type: 'bool' },
                ],
            },
        ],
        outputs: [
            {
                name: 'result',
                type: 'tuple',
                components: [
                    { name: 'totalSent', type: 'uint256' },
                    { name: 'successCount', type: 'uint256' },
                    { name: 'failedIndices', type: 'uint256[]' },
                ],
            },
        ],
    },
] as const;

export const ERC20_DISTRIBUTION_ABI = [
    {
        name: 'distributeSpecifiedDirect',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'recipients', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
            {
                name: 'options',
                type: 'tuple',
                components: [
                    { name: 'allowPartialFailure', type: 'bool' },
                ],
            },
        ],
        outputs: [
            {
                name: 'result',
                type: 'tuple',
                components: [
                    { name: 'totalSent', type: 'uint256' },
                    { name: 'successCount', type: 'uint256' },
                    { name: 'failedIndices', type: 'uint256[]' },
                ],
            },
        ],
    },
] as const;

export const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
    {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
    },
] as const;

// ── Transaction Builders ────────────────────────────────────────────────

export function buildNativeDistributeTx(
    contractAddress: Address,
    batch: BatchInput,
): TransactionRequest {
    const amounts = batch.amounts.map((a) => BigInt(a));
    const data = encodeFunctionData({
        abi: ETH_DISTRIBUTION_ABI,
        functionName: 'distributeSpecified',
        args: [
            batch.recipients,
            amounts,
            { gasLimit: 0n, allowPartialFailure: true },
        ],
    });
    return {
        to: contractAddress,
        data,
        value: BigInt(batch.totalValue),
    };
}

export function buildERC20DistributeTx(
    contractAddress: Address,
    tokenAddress: Address,
    batch: BatchInput,
): TransactionRequest {
    const amounts = batch.amounts.map((a) => BigInt(a));
    const data = encodeFunctionData({
        abi: ERC20_DISTRIBUTION_ABI,
        functionName: 'distributeSpecifiedDirect',
        args: [
            tokenAddress,
            batch.recipients,
            amounts,
            { allowPartialFailure: true },
        ],
    });
    return {
        to: contractAddress,
        data,
    };
}

export function buildApproveTx(
    tokenAddress: Address,
    spender: Address,
    amount: bigint,
): TransactionRequest {
    const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
    });
    return {
        to: tokenAddress,
        data,
    };
}
