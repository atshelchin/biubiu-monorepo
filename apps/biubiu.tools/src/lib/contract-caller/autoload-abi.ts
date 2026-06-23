/**
 * Automatic ABI discovery via WhatsABI (https://github.com/shazow/whatsabi).
 *
 * For verified contracts it pulls the real (typed) ABI from Sourcify; for
 * unverified ones it extracts 4-byte selectors from the bytecode and resolves
 * their signatures. Proxies are detected and the implementation ABI is merged
 * automatically (followProxies). Fully keyless and browser-safe.
 *
 * Sources are chosen to survive the Sourcify v1 repository brownout:
 *  - verified ABIs: Sourcify **v2** API (`/server/v2/contract/{chainId}/{address}`)
 *    — WhatsABI's built-in SourcifyABILoader still hits the deprecated v1 repo.
 *  - signatures: api.4byte.sourcify.dev (OpenChain-compatible) + openchain.xyz.
 *
 * Both loaders take chainId explicitly — autoload does not thread it through.
 */
import { type Address, createPublicClient, http } from 'viem';
import type { Abi } from './types.js';

const SOURCIFY_V2 = 'https://sourcify.dev/server/v2/contract';
const FOURBYTE_SOURCIFY = 'https://api.4byte.sourcify.dev/signature-database/v1/lookup';

/** WhatsABI ABILoader backed by the Sourcify v2 API (returns [] when unverified). */
class SourcifyV2ABILoader {
	readonly name = 'Sourcify v2';
	constructor(readonly chainId: number) {}

	async loadABI(address: string): Promise<unknown[]> {
		try {
			const res = await fetch(`${SOURCIFY_V2}/${this.chainId}/${address}?fields=abi`);
			if (!res.ok) return [];
			const data = (await res.json()) as { abi?: unknown };
			return Array.isArray(data.abi) ? data.abi : [];
		} catch {
			return [];
		}
	}

	async getContract(address: string) {
		const abi = await this.loadABI(address);
		return { abi, name: '', ok: abi.length > 0, loader: this };
	}
}

/** WhatsABI SignatureLookup backed by api.4byte.sourcify.dev (OpenChain protocol). */
class Sourcify4ByteSignatureLookup {
	readonly name = 'api.4byte.sourcify.dev';

	loadFunctions(selector: string): Promise<string[]> {
		return this.lookup('function', selector);
	}
	loadEvents(hash: string): Promise<string[]> {
		return this.lookup('event', hash);
	}

	private async lookup(kind: 'function' | 'event', sig: string): Promise<string[]> {
		try {
			const res = await fetch(`${FOURBYTE_SOURCIFY}?${kind}=${sig}&filter=true`);
			if (!res.ok) return [];
			const data = (await res.json()) as {
				result?: Record<string, Record<string, Array<{ name?: string }>>>;
			};
			const list = data.result?.[kind]?.[sig] ?? [];
			return list.map((x) => x.name).filter((n): n is string => typeof n === 'string');
		} catch {
			return [];
		}
	}
}

/** A function entry WhatsABI couldn't resolve carries no name/inputs. */
function isNamedFunction(e: { type?: string; name?: unknown; inputs?: unknown }): boolean {
	return (
		e.type === 'function' &&
		typeof e.name === 'string' &&
		(e.name as string).length > 0 &&
		Array.isArray(e.inputs)
	);
}

export interface AutoAbiResult {
	ok: boolean;
	abi?: Abi;
	/** Final resolved address (the implementation if a proxy was followed). */
	resolvedAddress?: string;
	/** True when autoload followed a proxy to a different address. */
	followedProxy: boolean;
	/** Where the ABI came from: a verified source name, or bytecode selectors. */
	source: string;
	/** How many 4-byte selectors could not be named (dropped from the list). */
	unresolved: number;
	error?: string;
}

/**
 * Discover the ABI for `address` on the chain behind `rpcUrl`.
 * `chainId` must match that chain (used by the verified-ABI loader).
 */
export async function autoFetchAbi(
	rpcUrl: string,
	chainId: number,
	address: Address
): Promise<AutoAbiResult> {
	try {
		const { whatsabi } = await import('@shazow/whatsabi');
		const client = createPublicClient({ transport: http(rpcUrl) });

		const result = await whatsabi.autoload(address, {
			provider: client,
			abiLoader: new SourcifyV2ABILoader(chainId),
			signatureLookup: new whatsabi.loaders.MultiSignatureLookup([
				new Sourcify4ByteSignatureLookup(),
				new whatsabi.loaders.OpenChainSignatureLookup()
			]),
			followProxies: true
		});

		const rawAbi = (result.abi ?? []) as Array<{ type?: string; name?: unknown; inputs?: unknown }>;
		if (rawAbi.length === 0) {
			return {
				ok: false,
				followedProxy: false,
				source: '',
				unresolved: 0,
				error: 'No ABI or selectors found at this address.'
			};
		}

		const unresolved = rawAbi.filter((e) => e.type === 'function' && !isNamedFunction(e)).length;
		const verifiedFrom = (result as { abiLoadedFrom?: { name?: string } }).abiLoadedFrom?.name;
		const source = verifiedFrom ?? 'bytecode selectors';
		const followedProxy = result.address?.toLowerCase() !== address.toLowerCase();

		return {
			ok: true,
			abi: rawAbi as unknown as Abi,
			resolvedAddress: result.address,
			followedProxy,
			source,
			unresolved
		};
	} catch (e) {
		return {
			ok: false,
			followedProxy: false,
			source: '',
			unresolved: 0,
			error: e instanceof Error ? e.message : 'Auto-fetch failed'
		};
	}
}
