import { encodeFunctionData, type Address } from 'viem';
import type { NftBatchInput, NftType, TransactionRequest } from '../types';

// ── NFT Standard ABIs (for approval checks) ────────────────────────────

export const ERC721_ABI = [
    {
        name: 'isApprovedForAll',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'operator', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'setApprovalForAll',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'operator', type: 'address' },
            { name: 'approved', type: 'bool' },
        ],
        outputs: [],
    },
] as const;

export const ERC1155_ABI = [
    {
        name: 'isApprovedForAll',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'account', type: 'address' },
            { name: 'operator', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'setApprovalForAll',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'operator', type: 'address' },
            { name: 'approved', type: 'bool' },
        ],
        outputs: [],
    },
] as const;

// ── Distribution Contract ABIs ──────────────────────────────────────────

export const ERC721_DISTRIBUTION_ABI = [
    {
        name: 'batchTransfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'nft', type: 'address' },
            { name: 'tokenIds', type: 'uint256[]' },
            { name: 'recipients', type: 'address[]' },
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
                    { name: 'successCount', type: 'uint256' },
                    { name: 'failedIndices', type: 'uint256[]' },
                    { name: 'failedTokenIds', type: 'uint256[]' },
                ],
            },
        ],
    },
] as const;

export const ERC1155_DISTRIBUTION_ABI = [
    {
        name: 'batchTransfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'nft', type: 'address' },
            { name: 'tokenIds', type: 'uint256[]' },
            { name: 'amounts', type: 'uint256[]' },
            { name: 'recipients', type: 'address[]' },
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

// ── Transaction Builders ────────────────────────────────────────────────

export function buildERC721BatchTransferTx(
    contractAddress: Address,
    nftAddress: Address,
    batch: NftBatchInput,
): TransactionRequest {
    const tokenIds = batch.tokenIds.map((id) => BigInt(id));
    const data = encodeFunctionData({
        abi: ERC721_DISTRIBUTION_ABI,
        functionName: 'batchTransfer',
        args: [
            nftAddress,
            tokenIds,
            batch.recipients,
            { allowPartialFailure: true },
        ],
    });
    return { to: contractAddress, data };
}

export function buildERC1155BatchTransferTx(
    contractAddress: Address,
    nftAddress: Address,
    batch: NftBatchInput,
): TransactionRequest {
    const tokenIds = batch.tokenIds.map((id) => BigInt(id));
    const amounts = (batch.amounts ?? []).map((a) => BigInt(a));
    const data = encodeFunctionData({
        abi: ERC1155_DISTRIBUTION_ABI,
        functionName: 'batchTransfer',
        args: [
            nftAddress,
            tokenIds,
            amounts,
            batch.recipients,
            { allowPartialFailure: true },
        ],
    });
    return { to: contractAddress, data };
}

export function buildSetApprovalForAllTx(
    nftAddress: Address,
    operator: Address,
    approved: boolean,
    nftType: NftType,
): TransactionRequest {
    const abi = nftType === 'erc721' ? ERC721_ABI : ERC1155_ABI;
    const data = encodeFunctionData({
        abi,
        functionName: 'setApprovalForAll',
        args: [operator, approved],
    });
    return { to: nftAddress, data };
}
