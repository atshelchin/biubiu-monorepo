/**
 * Revoke EIP-7702 delegations — the relay broadcasts a type-4 tx whose
 * authorizations target the zero address, clearing each EOA's code back to a
 * plain EOA. Top-level call is a no-op (to = relay).
 */
import { type Address, type Hex, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { makeWalletClient } from './viem-chain.js';
import { getPendingNonce } from './rpc.js';
import { waitForReceipt, chunk, mapLimit } from './tx-utils.js';
import { signEoaAuthorization, getDelegation, REVOKE_TARGET } from './authorizations.js';
import type { SweepNetwork, EoaKey } from '../types.js';
import type { Relayer } from './relayer.js';

const RPC_CONCURRENCY = 12;

export interface RevokeResult {
	succeeded: Address[];
	failed: { address: Address; error: string }[];
}

export async function runRevoke(opts: {
	network: SweepNetwork;
	rpcs: string[];
	relay: Relayer;
	keys: EoaKey[];
	onTx?: (txHash: Hex) => void;
}): Promise<RevokeResult> {
	const { network, rpcs, relay, keys, onTx } = opts;
	const account = privateKeyToAccount(relay.privateKey);
	const wallet = makeWalletClient(network, rpcs, account);
	let nonce = await getPendingNonce(rpcs, relay.address);
	const result: RevokeResult = { succeeded: [], failed: [] };

	for (const group of chunk(keys, network.maxBatchUpgrade)) {
		try {
			const authList = await mapLimit(group, RPC_CONCURRENCY, (k) =>
				signEoaAuthorization(rpcs, k, REVOKE_TARGET, network.chainId),
			);
			const gas = 21_000n + 30_000n * BigInt(group.length);
			const txHash = await wallet.sendTransaction({
				to: relay.address,
				data: '0x',
				value: 0n,
				nonce,
				gas,
				authorizationList: authList,
			});
			nonce += 1;
			onTx?.(txHash);
			await waitForReceipt(network, rpcs, txHash);

			await mapLimit(group, RPC_CONCURRENCY, async (k) => {
				const d = await getDelegation(rpcs, k.address, zeroAddress);
				if (d === 'none') result.succeeded.push(k.address);
				else result.failed.push({ address: k.address, error: `still ${d}` });
			});
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			for (const k of group) result.failed.push({ address: k.address, error });
		}
	}
	return result;
}
