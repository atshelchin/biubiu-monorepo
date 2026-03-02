import { definePage } from '@shelchin/pagekit';
import { configModule } from './modules/config.js';
import { executionModule } from './modules/execution.js';

export const balanceRadarPage = definePage({
	name: 'balance-radar',
	description: 'Query native token balances for multiple wallet addresses across multiple EVM chains',
	modules: [configModule, executionModule],
});
