/**
 * Logo URLs for chains and tokens. Token logos come from the ethereum-data mirror
 * (keyed by chainId + checksummed contract); distinct chain logos come from the
 * DeFiLlama icon CDN. Everything is best-effort — callers render a letter avatar
 * when a URL is missing or the image 404s (see AssetIcon.svelte), so a missing
 * logo never breaks the layout.
 */
import { getAddress } from 'viem';

const TOKEN_BASE = 'https://ethereum-data.awesometools.dev';

// Built-in network key → chain id. Custom networks use the `custom-<id>` key, so
// their id is parsed from the key — no extra wiring needed.
const BUILTIN_CHAIN_ID: Record<string, number> = {
	ethereum: 1,
	polygon: 137,
	arbitrum: 42161,
	optimism: 10,
	base: 8453,
	endurance: 648,
};

export function chainIdForKey(networkKey: string): number | undefined {
	if (networkKey.startsWith('custom-')) {
		const n = Number(networkKey.slice('custom-'.length));
		return Number.isInteger(n) && n > 0 ? n : undefined;
	}
	return BUILTIN_CHAIN_ID[networkKey];
}

/** ERC-20 logo by chain id + contract address (checksummed for the asset path). */
export function tokenLogoUrl(chainId: number | undefined, address: string): string | null {
	if (!chainId || !address) return null;
	let checksummed: string;
	try {
		checksummed = getAddress(address);
	} catch {
		return null;
	}
	return `${TOKEN_BASE}/assets/eip155-${chainId}/${checksummed}/logo.png`;
}

// Native coin → its wrapped-token contract, whose logo is the coin's own icon.
const WRAPPED_NATIVE: Record<string, { chainId: number; address: string }> = {
	ethereum: { chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }, // WETH
	arbitrum: { chainId: 42161, address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
	optimism: { chainId: 10, address: '0x4200000000000000000000000000000000000006' },
	base: { chainId: 8453, address: '0x4200000000000000000000000000000000000006' },
	polygon: { chainId: 137, address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' }, // WPOL
};

export function nativeCoinLogoUrl(networkKey: string): string | null {
	const w = WRAPPED_NATIVE[networkKey];
	return w ? tokenLogoUrl(w.chainId, w.address) : null;
}

/** Logo for a result/token row: ERC-20 contract logo, or the native coin's logo. */
export function tokenRowLogoUrl(networkKey: string, tokenAddress?: string): string | null {
	if (tokenAddress) return tokenLogoUrl(chainIdForKey(networkKey), tokenAddress);
	return nativeCoinLogoUrl(networkKey);
}

// Distinct per-chain logo (for the network column / network chips).
const CHAIN_SLUG: Record<string, string> = {
	ethereum: 'ethereum',
	polygon: 'polygon',
	arbitrum: 'arbitrum',
	optimism: 'optimism',
	base: 'base',
};

export function chainLogoUrl(networkKey: string): string | null {
	const slug = CHAIN_SLUG[networkKey];
	return slug ? `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg` : null;
}
