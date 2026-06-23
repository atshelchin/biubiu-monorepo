/**
 * native/USD 价格（Chainlink）。
 *
 * 读取每条链上的 native/USD 聚合器 latestRoundData。取不到（无 feed / RPC 失败 /
 * 价格异常）返回 null，由 fee 逻辑落到「1 native」兜底。
 *
 * 注：vela-wallet 的 price-service 还叠加了 DEX 与主网 feed 兜底；此处先用最直接的
 * 单链 Chainlink 读取，后续可按需增强。
 */
import { createPublicClient, http, fallback } from 'viem';
import type { TokenSenderNetwork } from '../types.js';

const AGGREGATOR_ABI = [
	{
		type: 'function',
		name: 'latestRoundData',
		stateMutability: 'view',
		inputs: [],
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' },
		],
	},
	{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

export async function fetchNativeUsdPrice(network: TokenSenderNetwork): Promise<number | null> {
	const feed = network.chainlinkNativeUsdFeed;
	if (!feed) return null;

	try {
		const client = createPublicClient({ transport: fallback(network.rpcs.map((u) => http(u))) });
		const [round, dec] = await Promise.all([
			client.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: 'latestRoundData' }) as Promise<
				readonly [bigint, bigint, bigint, bigint, bigint]
			>,
			client.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: 'decimals' }) as Promise<number>,
		]);
		const answer = round[1];
		if (answer <= 0n) return null;
		return Number(answer) / 10 ** Number(dec);
	} catch {
		return null;
	}
}
