/**
 * Build + send revoke transactions through the site `ConnectedWallet`.
 *
 * One `ApprovalRow` → one `Call`. Selected rows are sent as a single atomic batch
 * (`wallet.sendCalls`): biubiu → Safe MultiSend (one passkey fingerprint);
 * inject/walletpair → EIP-5792 wallet_sendCalls. A single row → a single tx.
 */
import { encodeFunctionData } from 'viem';
import { walletStore } from '$lib/wallet';
import type { Call, SendResult, SendStatus } from '$lib/wallet';
import { ERC20_ABI, NFT_ABI, PERMIT2_ABI, PERMIT2_ADDRESS } from '../infra/abis.js';
import type { ApprovalRow, RevokeNetwork } from '../types.js';

/** The on-chain call that revokes one approval. */
export function buildRevokeCall(row: ApprovalRow): Call {
	// Permit2 sub-allowance → lockdown([{token, spender}]) sets the amount to 0.
	if (row.id.startsWith('permit2:')) {
		return {
			to: PERMIT2_ADDRESS,
			value: 0n,
			data: encodeFunctionData({
				abi: PERMIT2_ABI,
				functionName: 'lockdown',
				args: [[{ token: row.token, spender: row.spender }]],
			}),
		};
	}
	// ERC20 allowance → approve(spender, 0).
	if (row.standard === 'erc20') {
		return {
			to: row.token,
			value: 0n,
			data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [row.spender, 0n] }),
		};
	}
	// ERC721 / ERC1155 operator → setApprovalForAll(operator, false).
	return {
		to: row.token,
		value: 0n,
		data: encodeFunctionData({ abi: NFT_ABI, functionName: 'setApprovalForAll', args: [row.spender, false] }),
	};
}

export interface RevokeRunInput {
	network: RevokeNetwork;
	rows: ApprovalRow[];
	onPhase?: (phase: SendStatus) => void;
}

/** Revoke the given approvals in one atomic batch. */
export async function runRevoke({ network, rows, onPhase }: RevokeRunInput): Promise<SendResult> {
	const wallet = walletStore.activeWallet;
	if (!wallet) return { success: false, error: 'no-wallet' };
	if (rows.length === 0) return { success: false, error: 'empty' };

	const calls: Call[] = rows.map(buildRevokeCall);
	return wallet.sendCalls(calls, {
		chainId: network.chainId,
		onPhase,
		explorerTxBaseUrl: `${network.explorerUrl}/tx/`,
	});
}
