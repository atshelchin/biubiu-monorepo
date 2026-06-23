/**
 * Proxy resolution for the scanner. Reuses contract-caller's `detectProxy`
 * (EIP-1167 / 1967 / beacon / 1822 / getter / Gnosis Safe) and adds EIP-2535
 * Diamond detection (multi-facet) on top.
 *
 * Why this matters: events are emitted *from the proxy address* but defined in
 * the *implementation* ABI. The scanner always queries logs at the proxy address
 * and decodes them with the implementation (or merged facet) ABI.
 */
import {
	type Address,
	type Hex,
	createPublicClient,
	decodeAbiParameters,
	getAddress,
	http,
	isAddress,
} from 'viem';
import { detectProxy as detectBaseProxy } from '$lib/contract-caller/proxy.js';
import type { ProxyInfo } from '$lib/contract-caller/types.js';

export type ScannerProxyKind = ProxyInfo['kind'] | 'diamond';

export interface ScannerProxyInfo {
	kind: ScannerProxyKind;
	/** Primary implementation address (first facet for diamonds). */
	implementation: Address | null;
	beacon?: Address | null;
	/** For EIP-2535 diamonds: every facet address (each has its own ABI). */
	facets?: Address[];
	label: string;
}

// DiamondLoupe.facetAddresses() → address[]
const SELECTOR_FACET_ADDRESSES = '0x52ef6b2c' as Hex;

async function tryFacetAddresses(rpcUrl: string, address: Address): Promise<Address[] | null> {
	try {
		const client = createPublicClient({ transport: http(rpcUrl) });
		const res = await client.call({ to: address, data: SELECTOR_FACET_ADDRESSES });
		if (!res.data || res.data === '0x') return null;
		const [addrs] = decodeAbiParameters([{ type: 'address[]' }], res.data);
		const list = (addrs as readonly string[])
			.filter((a) => isAddress(a) && !/^0x0{40}$/i.test(a))
			.map((a) => getAddress(a));
		return list.length > 0 ? list : null;
	} catch {
		return null;
	}
}

const NONE: ScannerProxyInfo = { kind: 'none', implementation: null, label: '' };

/** Probe an address for every supported proxy pattern (Diamond first). */
export async function detectProxy(rpcUrl: string, address: Address): Promise<ScannerProxyInfo> {
	// Diamond's facetAddresses() is unambiguous and its EIP-1967 slots are empty,
	// so probe it first.
	const facets = await tryFacetAddresses(rpcUrl, address);
	if (facets) {
		return {
			kind: 'diamond',
			implementation: facets[0] ?? null,
			facets,
			label: `EIP-2535 Diamond · ${facets.length} facets`,
		};
	}

	const base = await detectBaseProxy(rpcUrl, address);
	if (base.kind === 'none') return NONE;
	return { kind: base.kind, implementation: base.implementation, beacon: base.beacon, label: base.label };
}
