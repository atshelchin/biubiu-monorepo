/**
 * ERC-4337 account-state reads + gas pricing, keyed by chainId.
 *
 * Replaces the old `safe-tx/bundler-client.ts` read helpers (isDeployed / getNonce
 * / getGasPrices) now that transport is direct-fetch. Chain reads go to the RPC
 * pool (wallet/infra/rpc-client.ts); gas price prefers the bundler's
 * pimlico_getUserOperationGasPrice "standard" tier (vela bundler supports it).
 */

import { type Hex, pad, numberToHex, concat } from 'viem';
import { CONTRACTS } from '$lib/auth/compute-safe-address.js';
import { rpcCall } from './rpc-client.js';
import { getUserOperationGasPrice } from './bundler-client.js';

const ENTRY_POINT = CONTRACTS.entryPoint;

export async function isDeployed(address: string, chainId: number): Promise<boolean> {
	const code = await rpcCall<Hex>('eth_getCode', [address, 'latest'], chainId);
	return code !== '0x' && code !== '0x0';
}

/** EntryPoint.getNonce(sender, key) via eth_call. */
export async function getNonce(sender: string, chainId: number, key: bigint = 0n): Promise<bigint> {
	const result = await rpcCall<Hex>(
		'eth_call',
		[
			{
				to: ENTRY_POINT,
				data: concat(['0x35567e1a', pad(sender as Hex, { size: 32 }), pad(numberToHex(key), { size: 32 })])
			},
			'latest'
		],
		chainId
	);
	return BigInt(result);
}

export interface GasFees {
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}

/**
 * Gas fees for a native-gas UserOp. Prefer the bundler's "standard" tier (tracks
 * network price while meeting bundler minimums — same choice as the old client),
 * fall back to chain eth_gasPrice + eth_maxPriorityFeePerGas.
 */
export async function getGasPrices(chainId: number): Promise<GasFees> {
	const tiers = await getUserOperationGasPrice(chainId);
	if (tiers?.standard) {
		return {
			maxFeePerGas: BigInt(tiers.standard.maxFeePerGas),
			maxPriorityFeePerGas: BigInt(tiers.standard.maxPriorityFeePerGas)
		};
	}

	const [gasPrice, priorityFee] = await Promise.all([
		rpcCall<Hex>('eth_gasPrice', [], chainId).catch(() => '0x0' as Hex),
		rpcCall<Hex>('eth_maxPriorityFeePerGas', [], chainId).catch(() => '0x5f5e100' as Hex)
	]);
	const baseFee = BigInt(gasPrice);
	const priority = BigInt(priorityFee);
	return { maxFeePerGas: baseFee + priority, maxPriorityFeePerGas: priority };
}

/** Raw chain gas price as a bigint — used to price the Tempo reimbursement (attodollars/gas). */
export async function getChainGasPriceAtto(chainId: number): Promise<bigint> {
	const gp = await rpcCall<Hex>('eth_gasPrice', [], chainId).catch(() => '0x0' as Hex);
	return BigInt(gp);
}

/**
 * Rough native-wei cost of a Safe UserOp on this chain — the threshold the bundler
 * gas account must cover (vela funding preflight). Conservative gas-unit estimate:
 * an undeployed Safe carries the deploy initCode (~1.2M), a deployed one ~400k.
 */
export async function estimateUserOpCostWei(chainId: number, deployed: boolean): Promise<bigint> {
	const { maxFeePerGas } = await getGasPrices(chainId);
	const units = deployed ? 400_000n : 1_200_000n;
	return maxFeePerGas * units;
}
