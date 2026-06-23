import { createApp, z } from '@shelchin/pda';
import { executor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';

export const eventScannerApp = createApp({
	id: 'event-scanner',
	name: 'Event Scanner',
	description:
		'Scan and decode smart-contract event logs on any EVM chain, with proxy resolution and resumable indexing into IndexedDB',
	version: '1.0.0',
	inputSchema,
	outputSchema,
	executor,
});

export type EventScannerInput = z.infer<typeof eventScannerApp.manifest.inputSchema>;
export type EventScannerOutput = z.infer<typeof eventScannerApp.manifest.outputSchema>;
