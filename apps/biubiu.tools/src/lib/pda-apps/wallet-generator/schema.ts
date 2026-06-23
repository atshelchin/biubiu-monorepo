import { z } from '@shelchin/pda';

/** Hard cap on a single batch to keep the UI/CLI responsive and bound memory. */
export const MAX_COUNT = 100_000;

export const inputSchema = z.object({
	passphrase: z
		.string()
		.min(1)
		.describe('Secret passphrase. Deterministically expanded into a BIP39 mnemonic.'),
	wordsLen: z
		.union([z.literal(12), z.literal(24)])
		.default(24)
		.describe('Mnemonic length. 24 ← SHA-256 entropy, 12 ← MD5 entropy.'),
	chain: z.enum(['evm']).default('evm').describe('Chain family to derive for.'),
	addressType: z.string().default('default').describe('Address format variant for the chain.'),
	hdPathType: z
		.string()
		.default('bip44')
		.describe('HD derivation path variant: bip44 | ledgerlive | legacy.'),
	start: z.number().int().min(0).default(0).describe('First derivation index (inclusive).'),
	count: z
		.number()
		.int()
		.min(1)
		.max(MAX_COUNT)
		.default(1)
		.describe('How many sequential wallets to derive from `start`.'),
});

export const outputSchema = z.object({
	mnemonic: z.string().describe('The derived BIP39 mnemonic (sensitive).'),
	wallets: z.array(
		z.object({
			index: z.number(),
			path: z.string(),
			address: z.string(),
			privateKey: z.string().describe('0x-hex private key (sensitive).'),
		}),
	),
	stats: z.object({
		count: z.number(),
		duration: z.number(),
	}),
});
