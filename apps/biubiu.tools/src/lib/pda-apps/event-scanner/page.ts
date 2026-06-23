import { definePage } from '@shelchin/pagekit';
import { configModule } from './modules/config.js';
import { executionModule } from './modules/execution.js';

export const eventScannerPage = definePage({
	name: 'event-scanner',
	description:
		'Scan and decode smart-contract event logs on any EVM chain, with proxy resolution, human-friendly filters, resumable indexing into IndexedDB, and live-tail',
	modules: [configModule, executionModule],
});
