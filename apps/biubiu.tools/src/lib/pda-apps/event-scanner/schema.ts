import { z } from '@shelchin/pda';

export const scanNetworkSchema = z.object({
	key: z.string(),
	name: z.string(),
	chainId: z.number(),
	rpcs: z.array(z.string()),
	symbol: z.string().default('ETH'),
	decimals: z.number().default(18),
	explorerUrl: z.string().optional(),
});

/** A topic slot: exact (hex), OR-set (hex[]), or wildcard (null). */
const topicSchema = z.union([z.string(), z.array(z.string()), z.null()]);

export const filterSetSchema = z.object({
	id: z.string(),
	topics: z.array(topicSchema),
});

/** Human-friendly range; resolved to fromBlock/toBlock if those are omitted. */
const rangeSchema = z.union([
	z.object({ kind: z.literal('lastNDays'), days: z.number().positive() }),
	z.object({ kind: z.literal('dates'), fromMs: z.number(), toMs: z.number() }),
]);

export const inputSchema = z.object({
	network: scanNetworkSchema.describe('The chain to scan (key/chainId/rpcs)'),
	contract: z.string().describe('Contract (proxy) address to scan logs at'),
	abi: z.array(z.any()).describe('Decode ABI (merged implementation ABI for proxies)'),
	eventName: z.string().describe('Event name, e.g. Transfer'),
	eventSignature: z.string().describe('Canonical signature, e.g. Transfer(address,address,uint256)'),
	topic0: z.string().describe('Event signature hash (topic0)'),
	filterSets: z
		.array(filterSetSchema)
		.describe('One or more topic filter sets; wallet-track produces in/out sets'),
	fromBlock: z.number().int().min(0).optional().describe('Start block (inclusive)'),
	toBlock: z.number().int().min(0).optional().describe('End block (inclusive)'),
	range: rangeSchema.optional().describe('Used to resolve blocks when from/toBlock omitted'),
	chunkSize: z.number().int().positive().optional().describe('Block span per job (default per-chain)'),
	scanName: z.string().optional().describe('Human label for the saved scan'),
	live: z.boolean().optional().describe('Keep tailing new blocks after the historical scan'),
	liveIntervalMs: z.number().int().positive().optional(),
});

export const outputSchema = z.object({
	scanId: z.string(),
	eventCount: z.number(),
	scannedBlocks: z.number(),
	totalBlocks: z.number(),
	duration: z.number(),
});
