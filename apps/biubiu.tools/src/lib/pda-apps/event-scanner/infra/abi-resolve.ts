/**
 * One-shot contract ABI + proxy resolution, powered by WhatsABI.
 *
 * WhatsABI (`autoload`) does the heavy lifting: it loads a verified ABI from
 * Sourcify / Etherscan, follows standard proxies (EIP-1967/1822/1167/beacon) to
 * the implementation, AND — for unverified contracts — recovers a best-effort ABI
 * straight from bytecode (functions reliably, events best-effort). We layer two
 * things on top:
 *   - EIP-2535 Diamonds: WhatsABI deliberately does not auto-follow selector-
 *     relative proxies, so we use our own `detectProxy` to enumerate facets and
 *     merge each facet's verified ABI.
 *   - A direct Sourcify/Etherscan fallback if WhatsABI yields no events.
 */
import { whatsabi } from '@shazow/whatsabi';
import { type Abi, type Address, createPublicClient, http } from 'viem';
import { toViemChain } from './networks.js';
import { detectProxy, type ScannerProxyInfo } from './proxy.js';
import { fetchAbi, DEFAULT_ETHERSCAN_KEY } from './abi-fetch.js';
import { extractEvents } from './events.js';
import type { ScanNetwork } from '../types.js';

export interface ResolveResult {
	abi: Abi;
	eventCount: number;
	/** Where the ABI came from (verified source, bytecode, preset…). */
	sourceLabel: string;
	proxy: ScannerProxyInfo;
	resolvedAddress?: Address;
}

/** Merge two ABIs, deduped by item identity. */
function mergeAbi(a: Abi, b: Abi): Abi {
	const seen = new Set<string>();
	const out: Abi[number][] = [];
	for (const item of [...a, ...b]) {
		const key = JSON.stringify(item);
		if (!seen.has(key)) {
			seen.add(key);
			out.push(item);
		}
	}
	return out;
}

async function whatsabiLoad(
	net: ScanNetwork,
	rpcUrl: string,
	address: Address,
	etherscanKey?: string,
): Promise<{ abi: Abi; verified: boolean; isProxy: boolean; resolved: Address } | null> {
	try {
		const client = createPublicClient({ chain: toViemChain({ ...net, rpcs: [rpcUrl] }), transport: http(rpcUrl) });
		// Etherscan V2 only — whatsabi 0.26's bundled Sourcify loader hits the
		// deprecated repo endpoint (307→503). We do Sourcify v2 ourselves in fetchAbi.
		const abiLoader = new whatsabi.loaders.EtherscanV2ABILoader({
			apiKey: etherscanKey?.trim() || DEFAULT_ETHERSCAN_KEY,
			chainId: net.chainId,
		});
		const result = await whatsabi.autoload(address, {
			provider: client as never,
			followProxies: true,
			abiLoader,
			signatureLookup: new whatsabi.loaders.OpenChainSignatureLookup(),
			onError: () => true, // keep going through phase errors
		});
		// Plain-ify: whatsabi ABI objects can be non-cloneable for IndexedDB.
		const abi = JSON.parse(JSON.stringify(result.abi)) as Abi;
		return {
			abi,
			verified: !!result.abiLoadedFrom,
			isProxy: (result.proxies?.length ?? 0) > 0,
			resolved: result.address as Address,
		};
	} catch {
		return null;
	}
}

/** Resolve a contract's decode ABI (events included), following proxies. */
export async function resolveContractFull(
	net: ScanNetwork,
	rpcUrl: string,
	address: Address,
	etherscanKey?: string,
): Promise<ResolveResult> {
	let abi: Abi = [];
	let sourceLabel = '';
	let resolvedAddress: Address | undefined;

	// 1. WhatsABI: verified ABI + bytecode fallback + standard proxy follow.
	const wa = await whatsabiLoad(net, rpcUrl, address, etherscanKey);
	if (wa) {
		abi = wa.abi;
		sourceLabel = wa.verified ? 'verified (WhatsABI)' : 'recovered from bytecode (WhatsABI)';
		if (wa.resolved.toLowerCase() !== address.toLowerCase()) resolvedAddress = wa.resolved;
	}

	// 2. Precise proxy detection + Diamond facets (WhatsABI won't auto-follow these).
	const proxy = await detectProxy(rpcUrl, address);
	if (proxy.kind !== 'none') {
		resolvedAddress = proxy.implementation ?? resolvedAddress;
		const targets = proxy.facets ?? (proxy.implementation ? [proxy.implementation] : []);
		for (const target of targets) {
			const res = await fetchAbi(net.chainId, target, etherscanKey);
			if (res.ok && res.abi) abi = mergeAbi(abi, res.abi);
		}
	}

	// 3. Fallback: still no events → try a direct verified-source fetch on the proxy.
	//    A verified source is better than a bytecode guess, so update the label too.
	if (extractEvents(abi).length === 0) {
		const res = await fetchAbi(net.chainId, address, etherscanKey);
		if (res.ok && res.abi) {
			abi = mergeAbi(abi, res.abi);
			sourceLabel = res.source ?? 'verified source';
		}
	}

	return {
		abi,
		eventCount: extractEvents(abi).length,
		sourceLabel: sourceLabel || 'no ABI found',
		proxy,
		resolvedAddress,
	};
}
