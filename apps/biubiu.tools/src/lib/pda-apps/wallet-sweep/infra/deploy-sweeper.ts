/**
 * Lazy per-Safe Sweeper deployment via the Arachnid CREATE2 proxy.
 *
 * The Sweeper's controller (the user's passkey Safe) is a constructor arg, so
 * the address is deterministic per Safe. We deploy it once per (chain, Safe),
 * broadcast by the relayer. The proxy payload is salt(32) || initCode.
 */
import { type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hasCode } from '$lib/vela-chain-setup/contracts';
import { CREATE2_PROXY } from '$lib/deploy/create2';
import { buildSweeperInitCode, predictSweeperAddress, SWEEPER_SALT } from './sweeper-address.js';
import { makeWalletClient } from './viem-chain.js';
import { waitForReceipt } from './tx-utils.js';
import type { SweepNetwork } from '../types.js';
import type { Relayer } from './relayer.js';

export interface DeployResult {
	address: Address;
	txHash?: Hex;
	alreadyDeployed: boolean;
}

export async function isSweeperDeployed(rpcUrl: string, controller: Address): Promise<boolean> {
	return hasCode(rpcUrl, predictSweeperAddress(controller));
}

export async function ensureSweeper(
	network: SweepNetwork,
	rpcUrl: string,
	relayer: Relayer,
	controller: Address,
): Promise<DeployResult> {
	const address = predictSweeperAddress(controller);
	if (await hasCode(rpcUrl, address)) return { address, alreadyDeployed: true };

	const initCode = buildSweeperInitCode(controller);
	const data = (SWEEPER_SALT + initCode.slice(2)) as Hex;

	const account = privateKeyToAccount(relayer.privateKey);
	const wallet = makeWalletClient(network, rpcUrl, account);
	const txHash = await wallet.sendTransaction({ to: CREATE2_PROXY, data, value: 0n });
	await waitForReceipt(network, rpcUrl, txHash);

	if (!(await hasCode(rpcUrl, address))) {
		throw new Error('Sweeper deploy did not produce code at the predicted address');
	}
	return { address, txHash, alreadyDeployed: false };
}
