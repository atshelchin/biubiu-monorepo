/**
 * biubiu EIP-1193 provider over a `WalletPairSession` (new MessagePack protocol).
 *
 * Replaces the old `walletpair-sdk/evm` `WalletPairProvider`. Method routing mirrors the
 * walletpair-extension's dApp-side split (protocols/ethereum/methods.ts):
 *   - `eth_chainId` / `net_version` / `eth_accounts` → served locally from cached state.
 *   - read-only methods (eth_call / eth_getCode / eth_getTransactionReceipt / …) → biubiu's own
 *     RPC pool (`rpcCall`), NOT the wallet — so the account gate + receipt polling never depend on
 *     the mobile wallet's RPC being reachable.
 *   - wallet methods (eth_requestAccounts / sign / send / wallet_sendCalls / switch) → the encrypted
 *     WalletPair channel (`session.request(.., caip2)`), framed with the current `eip155:<id>` chain.
 *
 * biubiu-specific: `eth_getCode` for the connected counterfactual account returns the wallet-
 * advertised Safe-proxy bytecode (wallet_getCapabilities), so the gate accepts an undeployed
 * smart-contract wallet. The chain is bootstrapped from the wallet's `connect`/`chainChanged`
 * events, with a one-shot `eth_chainId` forward as a deterministic fallback.
 */
import { numberToHex } from 'viem';
import type { Eip1193Provider } from '../eip1193.js';
import { rpcCall } from '../infra/rpc-client.js';
import { ProviderRpcError, type EthereumEvent, type WalletPairSession } from '../walletpair-protocol/index.js';

/** Pure read-only chain-state methods — served from biubiu's RPC pool, never the wallet. */
const READ_ONLY_METHODS = new Set([
	'web3_clientVersion', 'eth_syncing', 'eth_blockNumber', 'eth_call', 'eth_estimateGas',
	'eth_createAccessList', 'eth_feeHistory', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
	'eth_getBalance', 'eth_getStorageAt', 'eth_getProof', 'eth_getTransactionCount',
	'eth_getBlockByHash', 'eth_getBlockByNumber', 'eth_getBlockTransactionCountByHash',
	'eth_getBlockTransactionCountByNumber', 'eth_getTransactionByHash',
	'eth_getTransactionByBlockHashAndIndex', 'eth_getTransactionByBlockNumberAndIndex',
	'eth_getTransactionReceipt', 'eth_getLogs'
]);

/** Explicitly unsupported by the protocol (no legacy signing / raw broadcast). */
const UNSUPPORTED_METHODS = new Set([
	'eth_sign', 'eth_signTransaction', 'eth_sendRawTransaction',
	'eth_getEncryptionPublicKey', 'eth_decrypt'
]);

type Listener = (...args: unknown[]) => void;

function toArrayParams(params: unknown[] | object | undefined): unknown[] {
	return Array.isArray(params) ? params : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAccounts(result: unknown): string[] {
	if (!Array.isArray(result)) return [];
	return result
		.map((entry) => (typeof entry === 'string' ? entry : isRecord(entry) && typeof entry.address === 'string' ? entry.address : null))
		.filter((address): address is string => !!address && /^0x[0-9a-fA-F]{40}$/.test(address));
}

/** Target chainId (number) of a wallet_switchEthereumChain request, or null. */
function parseSwitchChainId(params: unknown): number | null {
	const target = Array.isArray(params) && isRecord(params[0]) ? params[0].chainId : undefined;
	if (typeof target !== 'string' || !/^0x[0-9a-fA-F]+$/.test(target)) return null;
	const n = Number.parseInt(target, 16);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/** Best-effort extraction of the wallet-advertised counterfactual bytecode from EIP-5792 caps. */
function extractBytecode(caps: unknown, chainId: number): `0x${string}` | undefined {
	const pick = (record: unknown): `0x${string}` | undefined => {
		if (!isRecord(record)) return undefined;
		const code = record.contractBytecode;
		return typeof code === 'string' && /^0x[0-9a-fA-F]*$/.test(code) && code.length > 2 ? (code as `0x${string}`) : undefined;
	};
	if (!isRecord(caps)) return undefined;
	return pick(caps) ?? pick(caps[numberToHex(chainId)]) ?? pick(caps[String(chainId)]);
}

export class WalletPairProvider implements Eip1193Provider {
	private chainId: number;
	private chainKnown = false;
	private accounts: string[] = [];
	private contractBytecode?: `0x${string}`;
	private readonly listeners = new Map<string, Set<Listener>>();

	constructor(private readonly session: WalletPairSession, initialChainId = 1) {
		this.chainId = initialChainId;
		session.on('ethereumEvent', (event: EthereumEvent) => this.onWalletEvent(event));
	}

	private caip2(chainId = this.chainId): string {
		return `eip155:${chainId}`;
	}

	async request(args: { method: string; params?: unknown[] | object }): Promise<unknown> {
		const { method } = args;
		if (UNSUPPORTED_METHODS.has(method)) throw new ProviderRpcError(4200, `${method} is not supported`);

		if (method === 'eth_chainId') {
			if (!this.chainKnown) await this.bootstrapChain();
			return numberToHex(this.chainId);
		}
		if (method === 'net_version') return String(this.chainId);
		if (method === 'eth_accounts') return [...this.accounts];

		if (method === 'eth_getCode') return this.getCode(toArrayParams(args.params));
		if (READ_ONLY_METHODS.has(method)) return rpcCall(method, toArrayParams(args.params), this.chainId);

		if (method === 'wallet_switchEthereumChain') {
			const target = parseSwitchChainId(args.params);
			if (target != null) {
				this.chainId = target;
				this.chainKnown = true;
			}
			const result = await this.session.request({ method, params: args.params }, this.caip2());
			return result ?? null;
		}

		const result = await this.session.request({ method, params: args.params }, this.caip2());
		if (method === 'eth_requestAccounts' || method === 'wallet_getAccounts') {
			this.accounts = normalizeAccounts(result);
			void this.loadCapabilities();
			return [...this.accounts];
		}
		return result;
	}

	on(event: string, listener: Listener): void {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(listener);
	}

	removeListener(event: string, listener: Listener): void {
		this.listeners.get(event)?.delete(listener);
	}

	// ── internals ──

	/** Learn the wallet's chain deterministically when no connect event has arrived yet. */
	private async bootstrapChain(): Promise<void> {
		try {
			const raw = await this.session.request({ method: 'eth_chainId', params: [] }, this.caip2());
			const n = typeof raw === 'string' ? Number.parseInt(raw, 16) : Number(raw);
			if (Number.isInteger(n) && n > 0) {
				this.chainId = n;
				this.chainKnown = true;
			}
		} catch {
			/* wallet may not serve eth_chainId over the channel — keep the cached/default chain */
		}
	}

	private async getCode(params: unknown[]): Promise<unknown> {
		const target = typeof params[0] === 'string' ? (params[0] as string).toLowerCase() : '';
		const self = this.accounts[0]?.toLowerCase();
		let code: unknown = '0x';
		try {
			code = await rpcCall('eth_getCode', params, this.chainId);
		} catch {
			/* keep 0x — a counterfactual account has no on-chain code */
		}
		if ((code === '0x' || code === '0x0') && this.contractBytecode && target && target === self) {
			return this.contractBytecode;
		}
		return code;
	}

	private async loadCapabilities(): Promise<void> {
		const account = this.accounts[0];
		if (!account) return;
		try {
			const caps = await this.session.request({ method: 'wallet_getCapabilities', params: [account] }, this.caip2());
			this.contractBytecode = extractBytecode(caps, this.chainId);
		} catch {
			/* capabilities are optional; a deployed account needs no bytecode override */
		}
	}

	private onWalletEvent(event: EthereumEvent): void {
		switch (event.event) {
			case 'connect': {
				const hex = isRecord(event.data) && typeof event.data.chainId === 'string' ? event.data.chainId : null;
				if (hex) {
					const n = Number.parseInt(hex, 16);
					if (n > 0) {
						this.chainId = n;
						this.chainKnown = true;
					}
				}
				this.emit('connect', { chainId: numberToHex(this.chainId) });
				break;
			}
			case 'chainChanged': {
				const n = typeof event.data === 'string' ? Number.parseInt(event.data, 16) : NaN;
				if (n > 0) {
					this.chainId = n;
					this.chainKnown = true;
					this.emit('chainChanged', numberToHex(n));
				}
				break;
			}
			case 'accountsChanged':
				if (Array.isArray(event.data)) {
					this.accounts = event.data.filter((a): a is string => typeof a === 'string');
					this.emit('accountsChanged', [...this.accounts]);
				}
				break;
			case 'disconnect':
				this.emit('disconnect', event.data);
				break;
			case 'message':
				this.emit('message', event.data);
				break;
		}
	}

	private emit(event: string, ...args: unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) {
			try {
				listener(...args);
			} catch {
				/* a listener failure must not break the provider */
			}
		}
	}
}
