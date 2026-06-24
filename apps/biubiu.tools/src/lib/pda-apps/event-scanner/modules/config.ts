/**
 * Config module: chain search + RPC, contract, ABI (paste / auto-fetch), proxy
 * resolution, event selection, indexed-topic filters (+ wallet-track shortcut),
 * and the block/date range. Produces the executor input via `buildScanInput`.
 */
import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { type Abi, getAddress } from 'viem';
import { searchChains, loadChainInfo, probeRpcs, rpcCall } from '$lib/contract-caller/networks.js';
import { parseAbiInput } from '$lib/contract-caller/abi.js';
import type { ChainSearchResult, RpcOption } from '$lib/contract-caller/types.js';
import type { FilterSet, ParsedEvent, ScanNetwork } from '../types.js';
import { extractEvents, buildTopicSlot, addressTopic } from '../infra/events.js';
import { networkKey } from '../infra/networks.js';
import { detectProxy, type ScannerProxyInfo } from '../infra/proxy.js';
import { fetchAbi, DEFAULT_ETHERSCAN_KEY } from '../infra/abi-fetch.js';
import { resolveContractFull } from '../infra/abi-resolve.js';
import { PRESETS } from '../infra/presets.js';

export type RangeKind = 'lastNDays' | 'dates' | 'blocks';

interface ConfigCtx {
	// chain
	chainQuery: string;
	chainResults: ChainSearchResult[];
	searching: boolean;
	chain: ScanNetwork | null;
	chainError: string;
	rpcOptions: RpcOption[];
	rpcUrl: string;
	rpcLatency: number | null;
	usingCustomRpc: boolean;
	customRpcInput: string;
	rpcError: string;
	// contract + abi
	contract: string;
	abiInput: string;
	abiError: string;
	abiSourceLabel: string;
	fetchingAbi: boolean;
	// proxy
	proxy: ScannerProxyInfo | null;
	detecting: boolean;
	implNote: string;
	// events (derived from the merged decode ABI)
	events: ParsedEvent[];
	selectedEventSig: string;
	// filters
	indexedValues: Record<number, string>;
	walletTrackEnabled: boolean;
	walletAddress: string;
	// range
	rangeKind: RangeKind;
	days: number;
	fromDate: string;
	toDate: string;
	fromBlock: string;
	toBlock: string;
	// live
	live: boolean;
	liveIntervalSec: number;
	// misc
	etherscanKey: string;
	scanName: string;
	canExecute: boolean;
	/**
	 * Why `canExecute` is false — the single unmet requirement, as an i18n key
	 * suffix under `es.cfg.need.*` ('' when ready). Lets the UI tell the user
	 * exactly what to do next instead of leaving a dead, unexplained button.
	 */
	blockReason: string;
	// internal: merged decode ABI (primary + implementation/facets)
	decodeAbi: unknown[];
}

const ETHERSCAN_KEY_LS = 'es-etherscan-key';

function readEtherscanKey(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(ETHERSCAN_KEY_LS) ?? '';
}

/** The effective key for ABI/proxy resolution (user override or project default). */
function effectiveKey(ctx: { etherscanKey: string }): string {
	return ctx.etherscanKey.trim() || DEFAULT_ETHERSCAN_KEY;
}

/** The currently selected event (or undefined). */
export function selectedEvent(ctx: {
	events: ParsedEvent[];
	selectedEventSig: string;
}): ParsedEvent | undefined {
	return ctx.events.find((e) => e.signature === ctx.selectedEventSig);
}

/** Indexed inputs of an event, paired with their topic slot (1-based). */
export function indexedSlots(
	ev: ParsedEvent
): { paramIndex: number; topicIndex: number; name: string; type: string }[] {
	const out: { paramIndex: number; topicIndex: number; name: string; type: string }[] = [];
	let order = 0;
	ev.inputs.forEach((p, i) => {
		if (p.indexed && order < 3) {
			out.push({ paramIndex: i, topicIndex: order + 1, name: p.name, type: p.type });
			order++;
		}
	});
	return out;
}

/** First two indexed address params (the from/to candidates for wallet-track). */
function addressIndexedSlots(ev: ParsedEvent) {
	return indexedSlots(ev).filter((s) => s.type === 'address');
}

function recompute(ctx: ConfigCtx) {
	const ev = selectedEvent(ctx);
	const hasChain = !!ctx.chain && !!ctx.rpcUrl;
	const contract = ctx.contract.trim();
	const hasContract = /^0x[a-fA-F0-9]{40}$/.test(contract);
	const hasEvent = !!ev;
	let rangeOk = false;
	if (ctx.rangeKind === 'lastNDays') rangeOk = ctx.days > 0;
	else if (ctx.rangeKind === 'dates') rangeOk = !!ctx.fromDate && !!ctx.toDate;
	else
		rangeOk =
			ctx.fromBlock !== '' && ctx.toBlock !== '' && Number(ctx.toBlock) >= Number(ctx.fromBlock);
	const walletAddrOk = /^0x[a-fA-F0-9]{40}$/.test(ctx.walletAddress.trim());
	// Wallet-track needs an event with two indexed address params (a from/to pair).
	const walletSupported = !ctx.walletTrackEnabled || (!!ev && addressIndexedSlots(ev).length >= 2);
	const walletOk = !ctx.walletTrackEnabled || (walletSupported && walletAddrOk);
	ctx.canExecute = hasChain && hasContract && hasEvent && rangeOk && walletOk;

	// First unmet requirement, ordered the way a user fills the form top-down.
	ctx.blockReason = !hasChain
		? 'chain'
		: !contract
			? 'contract'
			: !hasContract
				? 'contractInvalid'
				: !hasEvent
					? 'abi'
					: ctx.walletTrackEnabled && !walletSupported
						? 'walletUnsupported'
						: ctx.walletTrackEnabled && !ctx.walletAddress.trim()
							? 'wallet'
							: ctx.walletTrackEnabled && !walletAddrOk
								? 'walletInvalid'
								: !rangeOk
									? 'range'
									: '';
}

function setActiveAbi(ctx: ConfigCtx, abi: Abi) {
	// Plain-ify: ABIs from WhatsABI/bytecode can carry non-cloneable bits that
	// IndexedDB's structured clone rejects when we persist them in ScanMeta. A
	// JSON round-trip guarantees plain, clone-safe objects (and viem decodes fine).
	const plain = JSON.parse(JSON.stringify(abi)) as unknown[];
	ctx.decodeAbi = plain;
	const events = extractEvents(plain as Abi);
	ctx.events = events;
	if (!events.find((e) => e.signature === ctx.selectedEventSig)) {
		ctx.selectedEventSig = events[0]?.signature ?? '';
	}
	ctx.indexedValues = {};
}

/** Merge two ABIs deduped by item identity. */
function mergeAbis(a: Abi, b: Abi): Abi {
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

export const configModule = defineModule({
	name: 'config',
	description:
		'Configure the chain, contract, ABI (with proxy resolution), event filters and block range',

	context: {
		chainQuery: '',
		chainResults: [] as ChainSearchResult[],
		searching: false,
		chain: null as ScanNetwork | null,
		chainError: '',
		rpcOptions: [] as RpcOption[],
		rpcUrl: '',
		rpcLatency: null as number | null,
		usingCustomRpc: false,
		customRpcInput: '',
		rpcError: '',
		contract: '',
		abiInput: '',
		abiError: '',
		abiSourceLabel: '',
		fetchingAbi: false,
		proxy: null as ScannerProxyInfo | null,
		detecting: false,
		implNote: '',
		events: [] as ParsedEvent[],
		selectedEventSig: '',
		indexedValues: {} as Record<number, string>,
		walletTrackEnabled: false,
		walletAddress: '',
		rangeKind: 'lastNDays' as RangeKind,
		days: 7,
		fromDate: '',
		toDate: '',
		fromBlock: '',
		toBlock: '',
		live: false,
		liveIntervalSec: 12,
		etherscanKey: '',
		scanName: '',
		canExecute: false,
		blockReason: 'chain',
		decodeAbi: [] as unknown[]
	},

	actions: {
		hydrate: {
			description: 'Load saved settings (Etherscan key) from localStorage',
			input: z.object({}),
			execute({ ctx }) {
				ctx.etherscanKey = readEtherscanKey();
			}
		},

		searchChains: {
			description: 'Search the chain index by name / symbol / chainId',
			input: z.object({ query: z.string() }),
			async execute({ input, ctx }) {
				ctx.chainQuery = input.query;
				if (!input.query.trim()) {
					ctx.chainResults = [];
					return;
				}
				ctx.searching = true;
				try {
					ctx.chainResults = await searchChains(input.query);
				} finally {
					ctx.searching = false;
				}
			}
		},

		selectChain: {
			description: 'Select a chain: load its info + probe RPCs',
			input: z.object({ chainId: z.number() }),
			async execute({ input, ctx }) {
				ctx.chainError = '';
				ctx.rpcError = '';
				try {
					const info = await loadChainInfo(input.chainId);
					const net: ScanNetwork = {
						key: networkKey(info.chainId),
						name: info.name,
						chainId: info.chainId,
						rpcs: info.rpcUrls,
						symbol: info.nativeCurrency.symbol,
						decimals: info.nativeCurrency.decimals,
						explorerUrl: info.explorerUrl
					};
					ctx.chain = net;
					ctx.chainResults = [];
					ctx.chainQuery = `${info.name} (${info.chainId})`;
					ctx.rpcUrl = info.rpcUrls[0] ?? '';
					ctx.rpcOptions = info.rpcUrls.map((url) => ({
						url,
						latencyMs: null,
						status: 'pending' as const
					}));
					recompute(ctx);
					// Probe in the background; pick the fastest.
					const probed = await probeRpcs(info.rpcUrls);
					ctx.rpcOptions = probed.map((p) => ({
						url: p.url,
						latencyMs: p.latencyMs,
						status: p.status
					}));
					const fastest = probed
						.filter((p) => p.status === 'ok' && p.latencyMs !== null)
						.sort((a, b) => (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9))[0];
					if (fastest) {
						ctx.rpcUrl = fastest.url;
						ctx.rpcLatency = fastest.latencyMs;
						ctx.usingCustomRpc = false;
					}
				} catch (e) {
					ctx.chainError = e instanceof Error ? e.message : 'Failed to load chain';
				}
				recompute(ctx);
			}
		},

		clearChain: {
			description: 'Clear the selected chain to pick a different one',
			input: z.object({}),
			execute({ ctx }) {
				ctx.chain = null;
				ctx.rpcOptions = [];
				ctx.rpcUrl = '';
				ctx.rpcLatency = null;
				ctx.usingCustomRpc = false;
				ctx.customRpcInput = '';
				ctx.chainQuery = '';
				ctx.chainResults = [];
				recompute(ctx);
			}
		},

		switchRpc: {
			description: 'Use a specific discovered RPC',
			input: z.object({ url: z.string() }),
			execute({ input, ctx }) {
				ctx.rpcUrl = input.url;
				ctx.usingCustomRpc = false;
				ctx.rpcLatency = ctx.rpcOptions.find((r) => r.url === input.url)?.latencyMs ?? null;
				if (ctx.chain) ctx.chain = { ...ctx.chain, rpcs: dedupeRpcs(input.url, ctx.rpcOptions) };
				recompute(ctx);
			}
		},

		setCustomRpcInput: {
			description: 'Update the custom RPC text field',
			input: z.object({ value: z.string() }),
			execute({ input, ctx }) {
				ctx.customRpcInput = input.value;
			}
		},

		applyCustomRpc: {
			description: 'Validate and use a custom RPC URL',
			input: z.object({ url: z.string() }),
			async execute({ input, ctx }) {
				const url = input.url.trim();
				ctx.rpcError = '';
				if (!url || !ctx.chain) return;
				try {
					const res = (await rpcCall(url, 'eth_chainId', [])) as string;
					const remote = parseInt(res, 16);
					if (remote !== ctx.chain.chainId) {
						ctx.rpcError = `Chain ID mismatch: RPC is ${remote}, expected ${ctx.chain.chainId}`;
						return;
					}
				} catch (e) {
					ctx.rpcError = e instanceof Error ? e.message : 'RPC unreachable';
					return;
				}
				ctx.rpcUrl = url;
				ctx.usingCustomRpc = true;
				ctx.rpcLatency = null;
				ctx.chain = { ...ctx.chain, rpcs: [url, ...ctx.chain.rpcs.filter((r) => r !== url)] };
				ctx.rpcOptions = [{ url, latencyMs: null, status: 'ok' }, ...ctx.rpcOptions];
				recompute(ctx);
			}
		},

		setContract: {
			description: 'Set the contract (proxy) address to scan',
			input: z.object({ address: z.string() }),
			execute({ input, ctx }) {
				ctx.contract = input.address;
				ctx.proxy = null;
				ctx.implNote = '';
				recompute(ctx);
			}
		},

		loadAbi: {
			description: 'Parse pasted ABI text into the event list',
			input: z.object({ text: z.string() }),
			execute({ input, ctx }) {
				ctx.abiInput = input.text;
				ctx.abiError = '';
				const result = parseAbiInput(input.text);
				if (!result.ok || !result.abi) {
					ctx.abiError = result.error ?? 'Invalid ABI';
					return;
				}
				ctx.abiSourceLabel = 'pasted';
				setActiveAbi(ctx, result.abi);
				recompute(ctx);
			}
		},

		autoFetchAbi: {
			description: 'Auto-resolve the ABI via WhatsABI (verified sources + bytecode + proxy follow)',
			input: z.object({}),
			async execute({ ctx }) {
				if (!ctx.chain || !/^0x[a-fA-F0-9]{40}$/.test(ctx.contract.trim())) {
					ctx.abiError = 'Select a chain and enter a valid contract address first';
					return;
				}
				ctx.fetchingAbi = true;
				ctx.abiError = '';
				try {
					const res = await resolveContractFull(
						ctx.chain,
						ctx.rpcUrl,
						getAddress(ctx.contract.trim()),
						effectiveKey(ctx)
					);
					ctx.proxy = res.proxy;
					if (res.abi.length > 0) {
						setActiveAbi(ctx, res.abi);
						ctx.abiInput = JSON.stringify(res.abi, null, 2);
						ctx.abiSourceLabel = res.sourceLabel;
						ctx.implNote =
							res.proxy.kind !== 'none'
								? `${res.proxy.label}${res.resolvedAddress ? ` → ${res.resolvedAddress.slice(0, 10)}…${res.resolvedAddress.slice(-6)}` : ''}`
								: '';
					}
					if (res.eventCount === 0) {
						ctx.abiError = 'No events found for this contract — paste the ABI manually.';
					}
				} catch (e) {
					ctx.abiError = e instanceof Error ? e.message : 'Auto-resolve failed';
				} finally {
					ctx.fetchingAbi = false;
				}
				recompute(ctx);
			}
		},

		detectProxy: {
			description: 'Detect a proxy and resolve + merge the implementation ABI',
			input: z.object({}),
			async execute({ ctx }) {
				if (!ctx.chain || !/^0x[a-fA-F0-9]{40}$/.test(ctx.contract.trim())) return;
				ctx.detecting = true;
				ctx.implNote = '';
				try {
					const info = await detectProxy(ctx.rpcUrl, getAddress(ctx.contract.trim()));
					ctx.proxy = info;
					if (info.kind === 'none') {
						ctx.implNote = 'No proxy detected — this is a regular contract.';
						return;
					}
					// Fetch + merge implementation / facet ABIs.
					const targets = info.facets ?? (info.implementation ? [info.implementation] : []);
					let merged: Abi = (ctx.decodeAbi as Abi) ?? [];
					let fetched = 0;
					for (const addr of targets) {
						const res = await fetchAbi(ctx.chain.chainId, addr, effectiveKey(ctx));
						if (res.ok && res.abi) {
							merged = mergeAbis(merged, res.abi);
							fetched++;
						}
					}
					if (fetched > 0) {
						setActiveAbi(ctx, merged);
						ctx.abiInput = JSON.stringify(merged, null, 2);
						ctx.abiSourceLabel = `${info.label} (impl ABI merged)`;
						ctx.implNote = `${info.label}: merged events from ${fetched} implementation contract(s).`;
					} else {
						ctx.implNote = `${info.label} detected, but the implementation ABI couldn't be fetched — paste it manually.`;
					}
				} catch (e) {
					ctx.implNote = e instanceof Error ? e.message : 'Proxy detection failed';
				} finally {
					ctx.detecting = false;
				}
				recompute(ctx);
			}
		},

		selectEvent: {
			description: 'Choose which event to scan',
			input: z.object({ signature: z.string() }),
			execute({ input, ctx }) {
				ctx.selectedEventSig = input.signature;
				ctx.indexedValues = {};
				ctx.walletTrackEnabled = false;
				recompute(ctx);
			}
		},

		setIndexedValue: {
			description: 'Set an indexed-topic filter value for one event param (empty = wildcard)',
			input: z.object({ paramIndex: z.number(), value: z.string() }),
			execute({ input, ctx }) {
				ctx.indexedValues = { ...ctx.indexedValues, [input.paramIndex]: input.value };
				recompute(ctx);
			}
		},

		setWalletTrack: {
			description: 'Toggle "track a wallet" (scans both incoming + outgoing)',
			input: z.object({ enabled: z.boolean(), address: z.string().optional() }),
			execute({ input, ctx }) {
				ctx.walletTrackEnabled = input.enabled;
				if (input.address !== undefined) ctx.walletAddress = input.address;
				recompute(ctx);
			}
		},

		setRange: {
			description: 'Set the scan range (lastNDays / dates / blocks)',
			input: z.object({
				kind: z.enum(['lastNDays', 'dates', 'blocks']).optional(),
				days: z.number().optional(),
				fromDate: z.string().optional(),
				toDate: z.string().optional(),
				fromBlock: z.string().optional(),
				toBlock: z.string().optional()
			}),
			execute({ input, ctx }) {
				if (input.kind) ctx.rangeKind = input.kind;
				if (input.days !== undefined) ctx.days = input.days;
				if (input.fromDate !== undefined) ctx.fromDate = input.fromDate;
				if (input.toDate !== undefined) ctx.toDate = input.toDate;
				if (input.fromBlock !== undefined) ctx.fromBlock = input.fromBlock;
				if (input.toBlock !== undefined) ctx.toBlock = input.toBlock;
				recompute(ctx);
			}
		},

		setLive: {
			description: 'Toggle live-tail after the historical scan',
			input: z.object({ live: z.boolean(), intervalSec: z.number().optional() }),
			execute({ input, ctx }) {
				ctx.live = input.live;
				if (input.intervalSec !== undefined) ctx.liveIntervalSec = input.intervalSec;
			}
		},

		setScanName: {
			description: 'Set a human label for the scan',
			input: z.object({ name: z.string() }),
			execute({ input, ctx }) {
				ctx.scanName = input.name;
			}
		},

		setEtherscanKey: {
			description: 'Store an Etherscan V2 API key (for ABI auto-fetch fallback)',
			input: z.object({ key: z.string() }),
			execute({ input, ctx }) {
				ctx.etherscanKey = input.key.trim();
				if (typeof localStorage !== 'undefined')
					localStorage.setItem(ETHERSCAN_KEY_LS, ctx.etherscanKey);
			}
		},

		applyPreset: {
			description: 'Apply a built-in preset (ERC-20 transfers, USDT-BSC, ERC-7708 native…)',
			input: z.object({ id: z.string() }),
			output: z.object({ chainId: z.number().optional() }),
			execute({ input, ctx }) {
				const preset = PRESETS.find((p) => p.id === input.id);
				if (!preset) return {};
				if (preset.contract) {
					ctx.contract = preset.contract;
					ctx.proxy = null;
				}
				setActiveAbi(ctx, preset.abi);
				ctx.abiInput = JSON.stringify(preset.abi, null, 2);
				ctx.abiSourceLabel = 'preset';
				ctx.selectedEventSig = preset.eventSignature;
				ctx.walletTrackEnabled = preset.walletTrack;
				ctx.implNote =
					preset.noteKey === 'erc7708'
						? 'ERC-7708 is a draft — verify the native-transfer log emitter address for your chain before trusting results.'
						: '';
				recompute(ctx);
				// The UI calls selectChain({ chainId }) when one is returned.
				return { chainId: preset.chainId };
			}
		}
	}
});

function dedupeRpcs(primary: string, options: RpcOption[]): string[] {
	const rest = options.map((o) => o.url).filter((u) => u !== primary);
	return [primary, ...rest];
}

// ── Build executor input from config state ───────────────────────────────────

export interface BuildScanResult {
	ok: boolean;
	error?: string;
	input?: import('../executor.js').Input;
}

/** Materialize the executor input from the current config context. */
export function buildScanInput(ctx: ConfigCtx): BuildScanResult {
	if (!ctx.chain) return { ok: false, error: 'No chain selected' };
	const ev = selectedEvent(ctx);
	if (!ev) return { ok: false, error: 'No event selected' };
	if (!/^0x[a-fA-F0-9]{40}$/.test(ctx.contract.trim()))
		return { ok: false, error: 'Invalid contract address' };

	const slots = indexedSlots(ev);
	const topicCount = slots.length;
	const baseTopics: FilterSet['topics'] = [ev.topic0];
	for (let i = 0; i < topicCount; i++) baseTopics.push(null);

	// Apply generic indexed filters into base topics.
	for (const slot of slots) {
		const raw = (ctx.indexedValues[slot.paramIndex] ?? '').trim();
		if (raw)
			baseTopics[slot.topicIndex] = buildTopicSlot(
				slot.type,
				raw
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			);
	}

	let filterSets: FilterSet[];
	if (ctx.walletTrackEnabled) {
		const addrSlots = addressIndexedSlots(ev);
		if (addrSlots.length < 2) {
			return {
				ok: false,
				error: 'Wallet-track needs an event with two indexed address params (e.g. Transfer).'
			};
		}
		if (!/^0x[a-fA-F0-9]{40}$/.test(ctx.walletAddress.trim())) {
			return { ok: false, error: 'Enter a valid wallet address to track' };
		}
		const walletTopic = addressTopic(ctx.walletAddress.trim());
		const [fromSlot, toSlot] = addrSlots;
		const out = [...baseTopics];
		out[fromSlot.topicIndex] = walletTopic;
		const incoming = [...baseTopics];
		incoming[toSlot.topicIndex] = walletTopic;
		filterSets = [
			{ id: 'out', topics: out },
			{ id: 'in', topics: incoming }
		];
	} else {
		filterSets = [{ id: 'all', topics: baseTopics }];
	}

	const range =
		ctx.rangeKind === 'lastNDays'
			? { kind: 'lastNDays' as const, days: ctx.days }
			: ctx.rangeKind === 'dates'
				? { kind: 'dates' as const, fromMs: Date.parse(ctx.fromDate), toMs: Date.parse(ctx.toDate) }
				: undefined;

	const input: import('../executor.js').Input = {
		network: ctx.chain,
		contract: getAddress(ctx.contract.trim()),
		abi: ctx.decodeAbi,
		eventName: ev.name,
		eventSignature: ev.signature,
		topic0: ev.topic0,
		filterSets,
		scanName: ctx.scanName || undefined,
		live: ctx.live,
		liveIntervalMs: ctx.liveIntervalSec * 1000,
		...(ctx.rangeKind === 'blocks'
			? { fromBlock: Number(ctx.fromBlock), toBlock: Number(ctx.toBlock) }
			: { range })
	};
	return { ok: true, input };
}
