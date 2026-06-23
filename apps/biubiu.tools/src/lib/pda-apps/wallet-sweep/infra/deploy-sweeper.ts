/**
 * Lazy CREATE2 deploys, broadcast by the relay:
 *   - BatchSweeper: global per chain (deployed once by whoever sweeps first).
 *   - Sweeper7702: per relay (controller = relay).
 */
import { type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hasCode } from './rpc.js';
import { CREATE2_PROXY } from '$lib/deploy/create2';
import {
	buildSweeperInitCode,
	predictSweeperAddress,
	buildBatchSweeperInitCode,
	predictBatchSweeperAddress,
	SWEEPER_SALT,
} from './sweeper-address.js';
import { makeWalletClient } from './viem-chain.js';
import { waitForReceipt } from './tx-utils.js';
import type { SweepNetwork } from '../types.js';
import type { Relayer } from './relayer.js';

export interface DeployResult {
	address: Address;
	deployed: boolean;
	txHash?: Hex;
}

async function deployVia(
	network: SweepNetwork,
	rpcs: string[],
	relay: Relayer,
	initCode: Hex,
): Promise<Hex> {
	const data = (SWEEPER_SALT + initCode.slice(2)) as Hex;
	const account = privateKeyToAccount(relay.privateKey);
	const wallet = makeWalletClient(network, rpcs, account);
	const txHash = await wallet.sendTransaction({ to: CREATE2_PROXY, data, value: 0n });
	await waitForReceipt(network, rpcs, txHash);
	return txHash;
}

export function batchSweeperAddress(): Address {
	return predictBatchSweeperAddress();
}
export function sweeperAddressFor(relay: Address): Address {
	return predictSweeperAddress(relay);
}

export async function isBatchSweeperDeployed(rpcs: string[]): Promise<boolean> {
	return hasCode(rpcs, predictBatchSweeperAddress());
}
export async function isSweeperDeployed(rpcs: string[], relay: Address): Promise<boolean> {
	return hasCode(rpcs, predictSweeperAddress(relay));
}

export async function ensureBatchSweeper(
	network: SweepNetwork,
	rpcs: string[],
	relay: Relayer,
): Promise<DeployResult> {
	const address = predictBatchSweeperAddress();
	if (await hasCode(rpcs, address)) return { address, deployed: false };
	const txHash = await deployVia(network, rpcs, relay, buildBatchSweeperInitCode());
	if (!(await hasCode(rpcs, address))) throw new Error('BatchSweeper deploy produced no code');
	return { address, deployed: true, txHash };
}

export async function ensureSweeper(
	network: SweepNetwork,
	rpcs: string[],
	relay: Relayer,
): Promise<DeployResult> {
	const address = predictSweeperAddress(relay.address);
	if (await hasCode(rpcs, address)) return { address, deployed: false };
	const txHash = await deployVia(network, rpcs, relay, buildSweeperInitCode(relay.address));
	if (!(await hasCode(rpcs, address))) throw new Error('Sweeper deploy produced no code');
	return { address, deployed: true, txHash };
}
