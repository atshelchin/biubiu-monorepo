import { describe, expect, it } from 'vitest';
import { searchChains } from './api';
import type { ChainListItem } from './types';

const CHAINS: ChainListItem[] = [
	{ chainId: 2868, name: 'HyperAGI Mainnet', shortName: 'hypt', nativeCurrencySymbol: 'HYPT' },
	{ chainId: 999, name: 'HyperEVM', shortName: 'hype-evm', nativeCurrencySymbol: 'HYPE' },
	{ chainId: 998, name: 'Hyperliquid EVM Testnet', shortName: 'hype-evm-testnet', nativeCurrencySymbol: 'HYPE' }
];

describe('searchChains', () => {
	it('normalizes separators and ranks an exact name first', () => {
		expect(searchChains(CHAINS, 'hyper_evm', 1)[0]?.chainId).toBe(999);
	});

	it('supports an exact short name', () => {
		expect(searchChains(CHAINS, 'hype-evm-testnet', 1)[0]?.chainId).toBe(998);
	});
});
