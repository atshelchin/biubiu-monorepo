import type { ChainConfig, ChainId } from '../types';

/**
 * Chain registry driving the Step 1 selectors and executor validation.
 * v1 ships EVM only; the shape mirrors the legacy tool's per-chain
 * (addressType × hdPath) matrix so BTC/TRON/SOLANA/APTOS slot in later.
 *
 * EVM HD-path variants are kept byte-identical to the legacy worker:
 *   bip44      → m/44'/60'/0'/0/{i}
 *   ledgerlive → m/44'/60'/{i}'/0/0
 *   legacy     → m/44'/60'/0'/{i}
 */
export const CHAINS: Record<ChainId, ChainConfig> = {
	evm: {
		id: 'evm',
		name: 'EVM',
		coinType: 60,
		addressTypes: [{ value: 'default', label: 'Ethereum / EVM' }],
		hdPaths: [
			{ value: 'bip44', label: "BIP44 — m/44'/60'/0'/0/i" },
			{ value: 'ledgerlive', label: "Ledger Live — m/44'/60'/i'/0/0" },
			{ value: 'legacy', label: "Legacy — m/44'/60'/0'/i" },
		],
	},
};

export const CHAIN_IDS = Object.keys(CHAINS) as ChainId[];

export function getChain(id: string): ChainConfig | undefined {
	return CHAINS[id as ChainId];
}
