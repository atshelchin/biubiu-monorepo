import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { createPublicClient, http } from 'viem';
import {
	NETWORKS,
	PRESET_TOKENS,
	mergeNetworks,
	nativeToken,
	toViemChain,
	customNetworkKey,
} from '../infra/networks.js';
import { createTokenMetadataCall } from '../infra/multicall-balance.js';
import {
	getCustomNetworks,
	saveCustomNetwork,
	deleteCustomNetwork,
	getCustomTokens,
	saveCustomToken,
	deleteCustomToken,
	customTokenId,
	type StoredCustomToken,
} from '../infra/custom-store.js';
import type { NetworkConfig, NetworkTokenSelection, TokenSpec } from '../types.js';

export interface AddressEntry {
	value: string;
	valid: boolean;
}

export interface NetworkInfo {
	key: string;
	name: string;
	symbol: string;
	chainId: number;
	isCustom: boolean;
}

export interface TokenInfo {
	/** 'native' or the lowercased contract address. */
	id: string;
	kind: 'native' | 'erc20';
	address?: string;
	symbol: string;
	decimals: number;
	isCustom: boolean;
}

const NATIVE_ID = 'native';

// ── Pure builders (shared by init + actions) ─────────────────────────────────

function buildAvailableNetworks(networks: Record<string, NetworkConfig>): NetworkInfo[] {
	return Object.entries(networks).map(([key, config]) => ({
		key,
		name: config.name,
		symbol: config.symbol,
		chainId: config.chainId,
		isCustom: config.isCustom === true,
	}));
}

function buildAvailableTokens(
	networks: Record<string, NetworkConfig>,
	customTokens: StoredCustomToken[],
): Record<string, TokenInfo[]> {
	const byNetwork: Record<string, TokenInfo[]> = {};
	for (const [key, config] of Object.entries(networks)) {
		const native: TokenInfo = {
			id: NATIVE_ID,
			kind: 'native',
			symbol: config.symbol,
			decimals: config.decimals,
			isCustom: false,
		};
		const presets: TokenInfo[] = (PRESET_TOKENS[key] ?? []).map((t) => ({
			id: t.address!.toLowerCase(),
			kind: 'erc20',
			address: t.address,
			symbol: t.symbol,
			decimals: t.decimals,
			isCustom: false,
		}));
		const customs: TokenInfo[] = customTokens
			.filter((t) => t.network === key)
			.map((t) => ({
				id: t.address.toLowerCase(),
				kind: 'erc20',
				address: t.address,
				symbol: t.symbol,
				decimals: t.decimals,
				isCustom: true,
			}));
		byNetwork[key] = [native, ...presets, ...customs];
	}
	return byNetwork;
}

/**
 * Materialize the token-selection payload for the executor from UI state:
 * for every selected network, map its selected token ids to full TokenSpecs.
 */
export function buildTokenSelections(
	selectedNetworks: string[],
	selectedTokens: Record<string, string[]>,
	availableTokens: Record<string, TokenInfo[]>,
): NetworkTokenSelection[] {
	const out: NetworkTokenSelection[] = [];
	for (const network of selectedNetworks) {
		const ids = selectedTokens[network] ?? [NATIVE_ID];
		const pool = availableTokens[network] ?? [];
		const tokens: TokenSpec[] = ids
			.map((id) => pool.find((t) => t.id === id))
			.filter((t): t is TokenInfo => Boolean(t))
			.map((t) => ({ kind: t.kind, address: t.address, symbol: t.symbol, decimals: t.decimals }));
		if (tokens.length > 0) out.push({ network, tokens });
	}
	return out;
}

// ── Initial (built-in only) state ────────────────────────────────────────────

const initialNetworks = NETWORKS;
const availableNetworks = buildAvailableNetworks(initialNetworks);
const availableTokens = buildAvailableTokens(initialNetworks, []);

interface ConfigCtx {
	addresses: AddressEntry[];
	addressInput: string;
	selectedNetworks: string[];
	availableNetworks: NetworkInfo[];
	availableTokens: Record<string, TokenInfo[]>;
	selectedTokens: Record<string, string[]>;
	customNetworks: NetworkConfig[];
	customTokens: StoredCustomToken[];
	validAddressCount: number;
	invalidAddressCount: number;
	totalQueries: number;
	canExecute: boolean;
}

function recomputeDerived(ctx: ConfigCtx) {
	ctx.validAddressCount = ctx.addresses.filter((a) => a.valid).length;
	ctx.invalidAddressCount = ctx.addresses.filter((a) => !a.valid).length;
	const tokensPerNetwork = ctx.selectedNetworks.reduce(
		(sum, n) => sum + (ctx.selectedTokens[n]?.length ?? 0),
		0,
	);
	ctx.totalQueries = ctx.validAddressCount * tokensPerNetwork;
	ctx.canExecute = ctx.validAddressCount > 0 && tokensPerNetwork > 0;
}

/** Rebuild availableNetworks/availableTokens from current custom networks + tokens. */
function recomputeRegistry(ctx: ConfigCtx) {
	const { networks } = mergeNetworks(ctx.customNetworks);
	ctx.availableNetworks = buildAvailableNetworks(networks);
	ctx.availableTokens = buildAvailableTokens(networks, ctx.customTokens);
	// Drop selections for networks/tokens that no longer exist
	ctx.selectedNetworks = ctx.selectedNetworks.filter((n) => networks[n]);
	for (const network of Object.keys(ctx.selectedTokens)) {
		const pool = ctx.availableTokens[network];
		if (!pool) {
			delete ctx.selectedTokens[network];
			continue;
		}
		ctx.selectedTokens[network] = ctx.selectedTokens[network].filter((id) =>
			pool.some((t) => t.id === id),
		);
	}
}

export const configModule = defineModule({
	name: 'config',
	description: 'Configure wallet addresses, networks and tokens for balance queries',

	context: {
		addresses: [] as AddressEntry[],
		addressInput: '',
		selectedNetworks: ['ethereum'] as string[],
		availableNetworks,
		availableTokens,
		selectedTokens: { ethereum: [NATIVE_ID] } as Record<string, string[]>,
		customNetworks: [] as NetworkConfig[],
		customTokens: [] as StoredCustomToken[],
		validAddressCount: 0,
		invalidAddressCount: 0,
		totalQueries: 0,
		canExecute: false,
	},

	actions: {
		setAddresses: {
			description: 'Set wallet addresses from text input (comma or newline separated)',
			input: z.object({
				text: z.string().describe('Addresses text, comma or newline separated'),
			}),
			output: z.object({
				validCount: z.number(),
				invalidCount: z.number(),
			}),
			execute({ input, ctx }) {
				const raw = input.text
					.split(/[,\n]/)
					.map((a: string) => a.trim())
					.filter(Boolean);

				ctx.addresses = raw.map((value: string) => ({
					value,
					valid: /^0x[a-fA-F0-9]{40}$/.test(value),
				}));
				ctx.addressInput = input.text;
				recomputeDerived(ctx);

				return {
					validCount: ctx.validAddressCount,
					invalidCount: ctx.invalidAddressCount,
				};
			},
		},

		setValidAddresses: {
			description: 'Set pre-validated wallet addresses (skips parsing, used by LineEditor UI)',
			input: z.object({
				addresses: z.array(z.string()).describe('Array of valid wallet addresses'),
			}),
			execute({ input, ctx }) {
				ctx.addresses = input.addresses.map((value: string) => ({ value, valid: true }));
				ctx.addressInput = input.addresses.join('\n');
				recomputeDerived(ctx);
			},
		},

		removeAddress: {
			description: 'Remove a specific address by index',
			input: z.object({
				index: z.number().min(0).describe('Index of address to remove'),
			}),
			execute({ input, ctx }) {
				ctx.addresses.splice(input.index, 1);
				recomputeDerived(ctx);
			},
		},

		clearAddresses: {
			description: 'Remove all addresses',
			input: z.object({}),
			execute({ ctx }) {
				ctx.addresses = [];
				ctx.addressInput = '';
				recomputeDerived(ctx);
			},
		},

		toggleNetwork: {
			description: 'Toggle a network on or off',
			input: z.object({
				network: z.string().describe('Network key to toggle (e.g. ethereum, polygon)'),
			}),
			execute({ input, ctx }) {
				const idx = ctx.selectedNetworks.indexOf(input.network);
				if (idx === -1) {
					ctx.selectedNetworks.push(input.network);
					// Default to native when first selecting a network
					if (!ctx.selectedTokens[input.network]?.length) {
						ctx.selectedTokens[input.network] = [NATIVE_ID];
					}
				} else {
					ctx.selectedNetworks.splice(idx, 1);
				}
				recomputeDerived(ctx);
			},
		},

		selectAllNetworks: {
			description: 'Select all available networks',
			input: z.object({}),
			execute({ ctx }) {
				ctx.selectedNetworks = ctx.availableNetworks.map((n) => n.key);
				for (const n of ctx.selectedNetworks) {
					if (!ctx.selectedTokens[n]?.length) ctx.selectedTokens[n] = [NATIVE_ID];
				}
				recomputeDerived(ctx);
			},
		},

		deselectAllNetworks: {
			description: 'Deselect all networks',
			input: z.object({}),
			execute({ ctx }) {
				ctx.selectedNetworks = [];
				recomputeDerived(ctx);
			},
		},

		toggleToken: {
			description: 'Toggle a token on or off for a network (at least one must remain)',
			input: z.object({
				network: z.string().describe('Network key'),
				tokenId: z.string().describe("Token id ('native' or lowercased contract address)"),
			}),
			execute({ input, ctx }) {
				const current = ctx.selectedTokens[input.network] ?? [];
				const idx = current.indexOf(input.tokenId);
				if (idx === -1) {
					ctx.selectedTokens[input.network] = [...current, input.tokenId];
				} else if (current.length > 1) {
					// Keep at least one token selected
					ctx.selectedTokens[input.network] = current.filter((id) => id !== input.tokenId);
				}
				recomputeDerived(ctx);
			},
		},

		hydrateCustom: {
			description: 'Load user-defined networks and tokens from IndexedDB',
			input: z.object({}),
			async execute({ ctx }) {
				const [networks, tokens] = await Promise.all([getCustomNetworks(), getCustomTokens()]);
				ctx.customNetworks = networks;
				ctx.customTokens = tokens;
				recomputeRegistry(ctx);
				recomputeDerived(ctx);
			},
		},

		addCustomNetwork: {
			description: 'Add (or update) a user-defined EVM network',
			input: z.object({
				name: z.string().min(1),
				chainId: z.number().int().positive(),
				rpcs: z.array(z.string().url()).min(1),
				symbol: z.string().min(1),
				decimals: z.number().int().min(0).max(36).default(18),
			}),
			output: z.object({ key: z.string() }),
			async execute({ input, ctx }) {
				const config: NetworkConfig = {
					name: input.name,
					chainId: input.chainId,
					rpcs: input.rpcs,
					symbol: input.symbol,
					decimals: input.decimals,
					isCustom: true,
				};
				const saved = await saveCustomNetwork(config);
				ctx.customNetworks = [
					...ctx.customNetworks.filter((n) => n.chainId !== saved.chainId),
					saved,
				];
				recomputeRegistry(ctx);
				recomputeDerived(ctx);
				return { key: saved.key };
			},
		},

		removeCustomNetwork: {
			description: 'Remove a user-defined network by chainId',
			input: z.object({ chainId: z.number().int().positive() }),
			async execute({ input, ctx }) {
				const key = customNetworkKey(input.chainId);
				await deleteCustomNetwork(key);
				// Capture the orphaned token records BEFORE pruning the in-memory list —
				// otherwise the cleanup filter runs against an already-empty array and
				// deleteCustomToken is never called, leaving stale rows in IndexedDB that
				// resurrect when a network with the same chainId is re-added.
				const orphans = ctx.customTokens.filter((t) => t.network === key);
				ctx.customNetworks = ctx.customNetworks.filter((n) => n.chainId !== input.chainId);
				ctx.customTokens = ctx.customTokens.filter((t) => t.network !== key);
				// Best-effort cleanup of orphaned token records (non-critical: a failed
				// delete must not abort network removal).
				await Promise.all(orphans.map((t) => deleteCustomToken(t.id).catch(() => {})));
				recomputeRegistry(ctx);
				recomputeDerived(ctx);
			},
		},

		fetchTokenMetadata: {
			description: 'Read symbol + decimals for an ERC20 contract on a network',
			input: z.object({
				network: z.string(),
				address: z.string(),
			}),
			output: z.object({ symbol: z.string(), decimals: z.number() }),
			async execute({ input, ctx }) {
				const { networks } = mergeNetworks(ctx.customNetworks);
				const config = networks[input.network];
				if (!config) throw new Error(`Unknown network: ${input.network}`);
				const client = createPublicClient({
					chain: toViemChain(config),
					transport: http(config.rpcs[0]),
				});
				const call = createTokenMetadataCall(input.address);
				return call.execute(client);
			},
		},

		addCustomToken: {
			description: 'Add a user-defined ERC20 token to a network',
			input: z.object({
				network: z.string(),
				address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
				symbol: z.string().min(1),
				decimals: z.number().int().min(0).max(36),
			}),
			output: z.object({ id: z.string() }),
			async execute({ input, ctx }) {
				const saved = await saveCustomToken(input.network, {
					address: input.address,
					symbol: input.symbol,
					decimals: input.decimals,
				});
				ctx.customTokens = [...ctx.customTokens.filter((t) => t.id !== saved.id), saved];
				recomputeRegistry(ctx);
				// Auto-select the newly added token on its network
				const current = ctx.selectedTokens[input.network] ?? [NATIVE_ID];
				if (!current.includes(saved.address.toLowerCase())) {
					ctx.selectedTokens[input.network] = [...current, saved.address.toLowerCase()];
				}
				recomputeDerived(ctx);
				return { id: saved.id };
			},
		},

		removeCustomToken: {
			description: 'Remove a user-defined token from a network',
			input: z.object({
				network: z.string(),
				address: z.string(),
			}),
			async execute({ input, ctx }) {
				const id = customTokenId(input.network, input.address);
				await deleteCustomToken(id);
				ctx.customTokens = ctx.customTokens.filter((t) => t.id !== id);
				ctx.selectedTokens[input.network] = (ctx.selectedTokens[input.network] ?? []).filter(
					(tid) => tid !== input.address.toLowerCase(),
				);
				if (ctx.selectedTokens[input.network]?.length === 0) {
					ctx.selectedTokens[input.network] = [NATIVE_ID];
				}
				recomputeRegistry(ctx);
				recomputeDerived(ctx);
			},
		},
	},
});
