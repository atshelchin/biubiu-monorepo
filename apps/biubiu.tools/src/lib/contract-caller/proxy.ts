/**
 * Proxy detection. Resolves the implementation contract behind a proxy so the
 * tool can also expose the implementation's methods (calls still target the
 * proxy address, which delegatecalls into the implementation).
 *
 * Supports: EIP-1167 minimal proxies, EIP-1967 (transparent / UUPS logic +
 * beacon), EIP-1822 (UUPS), `implementation()` / `masterCopy()` getters
 * (incl. Gnosis Safe).
 */
import { type Address, type Hex, createPublicClient, http, getAddress, isAddress } from 'viem';
import type { ProxyInfo } from './types.js';

// EIP-1967 logic slot: keccak256('eip1967.proxy.implementation') - 1
const EIP1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// EIP-1967 beacon slot: keccak256('eip1967.proxy.beacon') - 1
const EIP1967_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
// EIP-1822 proxiable slot: keccak256('PROXIABLE')
const EIP1822_SLOT = '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7';

// Common getters
const SELECTOR_IMPLEMENTATION = '0x5c60da1b'; // implementation()
const SELECTOR_MASTERCOPY = '0xa619486e'; // masterCopy()

// EIP-1167 runtime prefixes (standard + PUSH0 variant); each followed by 20 addr bytes.
const MINIMAL_PREFIXES = ['363d3d373d3d3d363d73', '365f5f375f5f5f365f73'];

type Client = ReturnType<typeof createPublicClient>;

/** Extract a non-zero address from a 32-byte storage word / return word. */
function addrFromWord(word: string | null | undefined): Address | null {
	if (!word) return null;
	const hex = word.startsWith('0x') ? word.slice(2) : word;
	if (hex.length < 40) return null;
	const addr = '0x' + hex.slice(-40);
	if (/^0x0{40}$/i.test(addr)) return null;
	if (!isAddress(addr)) return null;
	return getAddress(addr);
}

/** Detect EIP-1167 minimal-proxy target from runtime bytecode. */
export function parseMinimalProxy(code: string | undefined): Address | null {
	if (!code) return null;
	const hex = code.toLowerCase().replace(/^0x/, '');
	for (const prefix of MINIMAL_PREFIXES) {
		const idx = hex.indexOf(prefix);
		if (idx >= 0) {
			const addrHex = hex.slice(idx + prefix.length, idx + prefix.length + 40);
			const addr = addrFromWord('0x' + addrHex.padStart(64, '0'));
			if (addr) return addr;
		}
	}
	return null;
}

async function tryGetter(client: Client, address: Address, selector: Hex): Promise<Address | null> {
	try {
		const res = await client.call({ to: address, data: selector });
		return addrFromWord(res.data ?? null);
	} catch {
		return null;
	}
}

const NONE: ProxyInfo = { kind: 'none', implementation: null, label: '' };

/** Probe an address for the supported proxy patterns. */
export async function detectProxy(rpcUrl: string, address: Address): Promise<ProxyInfo> {
	const client = createPublicClient({ transport: http(rpcUrl) });

	const [code, implWord, beaconWord, proxiableWord] = await Promise.all([
		client.getCode({ address }).catch(() => undefined),
		client.getStorageAt({ address, slot: EIP1967_IMPL }).catch(() => undefined),
		client.getStorageAt({ address, slot: EIP1967_BEACON }).catch(() => undefined),
		client.getStorageAt({ address, slot: EIP1822_SLOT }).catch(() => undefined)
	]);

	// No code at all → not a contract.
	if (!code || code === '0x') return NONE;

	// 1. EIP-1167 minimal proxy
	const minimal = parseMinimalProxy(code);
	if (minimal) return { kind: 'eip1167', implementation: minimal, label: 'EIP-1167 Minimal Proxy' };

	// 2. EIP-1967 implementation slot
	const impl = addrFromWord(implWord);
	if (impl)
		return { kind: 'eip1967', implementation: impl, label: 'EIP-1967 (Transparent / UUPS)' };

	// 3. EIP-1967 beacon → read implementation() off the beacon
	const beacon = addrFromWord(beaconWord);
	if (beacon) {
		const beaconImpl = await tryGetter(client, beacon, SELECTOR_IMPLEMENTATION);
		return { kind: 'beacon', implementation: beaconImpl, beacon, label: 'EIP-1967 Beacon Proxy' };
	}

	// 4. EIP-1822 UUPS
	const proxiable = addrFromWord(proxiableWord);
	if (proxiable) return { kind: 'eip1822', implementation: proxiable, label: 'EIP-1822 (UUPS)' };

	// 5. implementation() getter
	const getterImpl = await tryGetter(client, address, SELECTOR_IMPLEMENTATION);
	if (getterImpl)
		return { kind: 'getter', implementation: getterImpl, label: 'implementation() getter' };

	// 6. Gnosis Safe masterCopy()
	const masterCopy = await tryGetter(client, address, SELECTOR_MASTERCOPY);
	if (masterCopy)
		return { kind: 'gnosis-safe', implementation: masterCopy, label: 'Gnosis Safe (masterCopy)' };

	return NONE;
}
