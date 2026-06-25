import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import {
	chainIdForKey,
	tokenLogoUrl,
	nativeCoinLogoUrl,
	tokenRowLogoUrl,
	chainLogoUrl
} from './asset-icons.js';

const TOKEN_BASE = 'https://ethereum-data.awesometools.dev';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

describe('chainIdForKey', () => {
	it('maps each built-in network key to its chain id', () => {
		expect(chainIdForKey('ethereum')).toBe(1);
		expect(chainIdForKey('polygon')).toBe(137);
		expect(chainIdForKey('arbitrum')).toBe(42161);
		expect(chainIdForKey('optimism')).toBe(10);
		expect(chainIdForKey('base')).toBe(8453);
		expect(chainIdForKey('endurance')).toBe(648);
	});

	it('parses the chain id out of a custom-<id> key', () => {
		expect(chainIdForKey('custom-7777')).toBe(7777);
		expect(chainIdForKey('custom-1')).toBe(1);
	});

	it('returns undefined for an unknown built-in key', () => {
		expect(chainIdForKey('dogechain')).toBeUndefined();
		expect(chainIdForKey('')).toBeUndefined();
	});

	it('rejects a non-integer / non-positive custom id', () => {
		expect(chainIdForKey('custom-abc')).toBeUndefined();
		expect(chainIdForKey('custom-0')).toBeUndefined();
		expect(chainIdForKey('custom--5')).toBeUndefined();
		expect(chainIdForKey('custom-1.5')).toBeUndefined();
	});
});

describe('tokenLogoUrl', () => {
	it('builds an eip155 asset path with a checksummed address', () => {
		// input is lowercase; output must be checksummed
		expect(tokenLogoUrl(1, DAI)).toBe(
			`${TOKEN_BASE}/assets/eip155-1/${getAddress(DAI)}/logo.png`
		);
	});

	it('uses the provided chain id in the path', () => {
		expect(tokenLogoUrl(137, DAI)).toBe(
			`${TOKEN_BASE}/assets/eip155-137/${getAddress(DAI)}/logo.png`
		);
	});

	it('returns null when chain id is missing or zero', () => {
		expect(tokenLogoUrl(undefined, DAI)).toBeNull();
		expect(tokenLogoUrl(0, DAI)).toBeNull();
	});

	it('returns null when the address is empty', () => {
		expect(tokenLogoUrl(1, '')).toBeNull();
	});

	it('returns null for an un-checksummable / invalid address', () => {
		expect(tokenLogoUrl(1, '0x1234')).toBeNull();
		expect(tokenLogoUrl(1, 'not-an-address')).toBeNull();
	});
});

describe('nativeCoinLogoUrl', () => {
	it("returns the wrapped-native contract logo for ethereum (WETH)", () => {
		expect(nativeCoinLogoUrl('ethereum')).toBe(
			`${TOKEN_BASE}/assets/eip155-1/${getAddress(WETH)}/logo.png`
		);
	});

	it('uses each network wrapped-native chain id + contract', () => {
		expect(nativeCoinLogoUrl('arbitrum')).toBe(
			`${TOKEN_BASE}/assets/eip155-42161/${getAddress(
				'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
			)}/logo.png`
		);
		expect(nativeCoinLogoUrl('polygon')).toBe(
			`${TOKEN_BASE}/assets/eip155-137/${getAddress(
				'0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
			)}/logo.png`
		);
		expect(nativeCoinLogoUrl('optimism')).toBe(
			`${TOKEN_BASE}/assets/eip155-10/${getAddress(
				'0x4200000000000000000000000000000000000006'
			)}/logo.png`
		);
		expect(nativeCoinLogoUrl('base')).toBe(
			`${TOKEN_BASE}/assets/eip155-8453/${getAddress(
				'0x4200000000000000000000000000000000000006'
			)}/logo.png`
		);
	});

	it('returns null for a network without a wrapped-native mapping', () => {
		// endurance is a known chain but has no WRAPPED_NATIVE entry
		expect(nativeCoinLogoUrl('endurance')).toBeNull();
		expect(nativeCoinLogoUrl('custom-7777')).toBeNull();
		expect(nativeCoinLogoUrl('unknown')).toBeNull();
	});
});

describe('tokenRowLogoUrl', () => {
	it('uses the ERC-20 contract logo when a token address is given', () => {
		expect(tokenRowLogoUrl('ethereum', DAI)).toBe(
			`${TOKEN_BASE}/assets/eip155-1/${getAddress(DAI)}/logo.png`
		);
	});

	it('derives the chain id from the network key for the token logo', () => {
		expect(tokenRowLogoUrl('custom-7777', DAI)).toBe(
			`${TOKEN_BASE}/assets/eip155-7777/${getAddress(DAI)}/logo.png`
		);
	});

	it('falls back to the native coin logo when no token address', () => {
		expect(tokenRowLogoUrl('ethereum')).toBe(nativeCoinLogoUrl('ethereum'));
		expect(tokenRowLogoUrl('base', undefined)).toBe(nativeCoinLogoUrl('base'));
	});

	it('returns null when the network key has no chain id and no native logo', () => {
		expect(tokenRowLogoUrl('unknown', DAI)).toBeNull();
		expect(tokenRowLogoUrl('unknown')).toBeNull();
	});
});

describe('chainLogoUrl', () => {
	it('builds a DeFiLlama chain icon URL for known slugs', () => {
		expect(chainLogoUrl('ethereum')).toBe(
			'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg'
		);
		expect(chainLogoUrl('polygon')).toBe(
			'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg'
		);
		expect(chainLogoUrl('arbitrum')).toBe(
			'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg'
		);
		expect(chainLogoUrl('optimism')).toBe(
			'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg'
		);
		expect(chainLogoUrl('base')).toBe('https://icons.llamao.fi/icons/chains/rsz_base.jpg');
	});

	it('returns null for a network with no distinct chain slug', () => {
		// endurance has a chain id but no CHAIN_SLUG entry
		expect(chainLogoUrl('endurance')).toBeNull();
		expect(chainLogoUrl('custom-7777')).toBeNull();
		expect(chainLogoUrl('unknown')).toBeNull();
	});
});
