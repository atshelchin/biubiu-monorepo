import { createApp, z } from '@shelchin/pda';
import { executor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';

export const walletGeneratorApp = createApp({
	id: 'wallet-generator',
	name: 'Wallet Generator',
	description:
		'Deterministically generate a batch of wallets from one secret passphrase, with QR export and air-gapped signing.',
	version: '0.1.0',
	inputSchema,
	outputSchema,
	executor,
});

export type WalletGeneratorInput = z.infer<typeof walletGeneratorApp.manifest.inputSchema>;
export type WalletGeneratorOutput = z.infer<typeof walletGeneratorApp.manifest.outputSchema>;
