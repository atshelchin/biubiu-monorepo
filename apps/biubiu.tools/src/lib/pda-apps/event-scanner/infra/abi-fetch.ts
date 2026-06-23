/**
 * Best-effort ABI fetch from public verified-source APIs.
 *
 * Order: Etherscan V2 (multichain, reliable with the bundled key) → Sourcify v2.
 * Note: Sourcify deprecated its legacy `repo.sourcify.dev` repo (now 307→503);
 * we use the current Server API v2 (`/server/v2/contract/{chainId}/{address}`).
 *
 * Returns a parsed viem `Abi` via the shared `parseAbiInput` so the rest of the
 * app sees one ABI shape regardless of source.
 */
import { getAddress, type Abi } from 'viem';
import { parseAbiInput } from '$lib/contract-caller/abi.js';

/**
 * Shared project Etherscan V2 (multichain) key — same one the contract deployer
 * ships. Lets ABI auto-fetch work out of the box; a user key overrides it.
 */
export const DEFAULT_ETHERSCAN_KEY = '1GA442Z79I7USRD8KWF8DBQ799MCX3JDX2';

export interface AbiFetchResult {
	ok: boolean;
	abi?: Abi;
	source?: 'etherscan' | 'sourcify';
	error?: string;
}

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const SOURCIFY_V2 = 'https://sourcify.dev/server/v2/contract';

async function tryParse(json: unknown): Promise<Abi | null> {
	const result = parseAbiInput(typeof json === 'string' ? json : JSON.stringify(json));
	return result.ok && result.abi ? result.abi : null;
}

/** Etherscan V2 multichain getabi. */
async function fetchEtherscan(
	chainId: number,
	address: string,
	apiKey: string,
): Promise<AbiFetchResult | null> {
	try {
		const url = `${ETHERSCAN_V2}?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${apiKey}`;
		const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
		if (!res.ok) return null;
		const json = await res.json();
		if (json?.status === '1' && typeof json.result === 'string') {
			const parsed = await tryParse(json.result);
			if (parsed) return { ok: true, abi: parsed, source: 'etherscan' };
		}
		return { ok: false, error: typeof json?.result === 'string' ? json.result : 'Etherscan: not verified' };
	} catch {
		return null;
	}
}

/** Sourcify Server API v2 (current; the legacy repo endpoint is deprecated). */
async function fetchSourcify(chainId: number, address: string): Promise<AbiFetchResult | null> {
	try {
		const url = `${SOURCIFY_V2}/${chainId}/${getAddress(address)}?fields=abi`;
		const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
		if (!res.ok) return null;
		const json = await res.json();
		const parsed = json?.abi ? await tryParse(json.abi) : null;
		if (parsed) return { ok: true, abi: parsed, source: 'sourcify' };
		return null;
	} catch {
		return null;
	}
}

/**
 * Fetch a contract's ABI. Tries Etherscan first (with the user key or the bundled
 * default), then Sourcify v2.
 */
export async function fetchAbi(
	chainId: number,
	address: string,
	etherscanKey?: string,
): Promise<AbiFetchResult> {
	const key = etherscanKey?.trim() || DEFAULT_ETHERSCAN_KEY;

	const es = await fetchEtherscan(chainId, address, key);
	if (es?.ok) return es;

	const sc = await fetchSourcify(chainId, address);
	if (sc?.ok) return sc;

	return { ok: false, error: es?.error ?? 'ABI not found on Etherscan or Sourcify' };
}
