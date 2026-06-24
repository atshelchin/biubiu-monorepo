/**
 * Approval Revoke — wizard/page state (Svelte 5 runes singleton, same style as
 * tokenSender / walletSweep). The UI only consumes this store; scanning + sending
 * live in core/ + infra/.
 *
 * Flow: connect wallet → pick chain → auto fast-scan → select approvals → revoke
 * (single or one atomic batch via the site ConnectedWallet).
 */
import { getAddress, type Address } from 'viem';
import { walletStore } from '$lib/wallet';
import type { SendResult, SendStatus } from '$lib/wallet';
import type { ApprovalRow, RevokeNetwork, SpenderEntry, TokenEntry, TokenStandard } from './types.js';
import { listNetworks, networkBySlug, customNetworkKey, MULTICALL3, DEFAULT_SLUG } from './infra/networks.js';
import { discover } from './core/discover.js';
import { runRevoke } from './core/revoke.js';
import { fetchErc20Meta, fetchNftMeta, isValidAddress } from './infra/metadata.js';
import { extractRpcUrls } from '$lib/contract-caller/networks.js';
import { getEthereumDataURL } from '$lib/wallet/infra/endpoints.js';
import {
	getCustomTokens,
	saveCustomToken,
	deleteCustomToken,
	getCustomSpenders,
	saveCustomSpender,
	deleteCustomSpender,
	getCustomNetworks,
	saveCustomNetwork,
	deleteCustomNetwork,
} from './infra/custom-store.js';

export type RowFilter = 'all' | 'unlimited';

class RevokeStore {
	// ── selection / chain ──
	networkSlug = $state<string>(DEFAULT_SLUG);

	// ── scan results ──
	rows = $state<ApprovalRow[]>([]);
	scanning = $state(false);
	scanned = $state(false);
	scanError = $state<string | null>(null);
	filter = $state<RowFilter>('all');

	// ── selection ──
	selectedIds = $state<string[]>([]);

	// ── revoke ──
	revoking = $state(false);
	revokePhase = $state<SendStatus | null>(null);
	revokeError = $state<string | null>(null);
	lastResult = $state<SendResult | null>(null);
	/** Row ids currently being revoked (for per-row spinners). */
	pendingIds = $state<string[]>([]);
	/** Auto-revert timer for the success banner. */
	private successTimer: ReturnType<typeof setTimeout> | null = null;

	// ── custom registries (scoped by chainId) + networks ──
	customNetworks = $state<RevokeNetwork[]>([]);
	customTokens = $state<Record<number, TokenEntry[]>>({});
	customSpenders = $state<Record<number, SpenderEntry[]>>({});

	/** Guards the page-driven auto-scan so it fires once per owner+chain. */
	private lastScanKey = '';

	// ── derived ──
	get networks(): RevokeNetwork[] {
		return listNetworks(this.customNetworks);
	}
	get network(): RevokeNetwork {
		return networkBySlug(this.networkSlug, this.customNetworks);
	}
	get owner(): Address | null {
		return walletStore.activeWallet?.address ?? null;
	}
	/** biubiu can't send on custom chains (no bundler infra); external wallets can. */
	get sendSupported(): boolean {
		return !(this.network.isCustom && walletStore.kind === 'biubiu');
	}
	get chainTokens(): TokenEntry[] {
		return this.customTokens[this.network.chainId] ?? [];
	}
	get chainSpenders(): SpenderEntry[] {
		return this.customSpenders[this.network.chainId] ?? [];
	}
	get visibleRows(): ApprovalRow[] {
		return this.filter === 'unlimited' ? this.rows.filter((r) => r.unlimited) : this.rows;
	}
	get selectedRows(): ApprovalRow[] {
		const set = new Set(this.selectedIds);
		return this.rows.filter((r) => set.has(r.id));
	}
	get unlimitedCount(): number {
		return this.rows.filter((r) => r.unlimited).length;
	}

	// ── selection helpers ──
	isSelected(id: string): boolean {
		return this.selectedIds.includes(id);
	}
	toggle(id: string): void {
		this.selectedIds = this.isSelected(id)
			? this.selectedIds.filter((x) => x !== id)
			: [...this.selectedIds, id];
	}
	selectAllVisible(): void {
		this.selectedIds = this.visibleRows.map((r) => r.id);
	}
	clearSelection(): void {
		this.selectedIds = [];
	}

	// ── chain switching ──
	setNetwork(slug: string): void {
		if (slug === this.networkSlug) return;
		this.networkSlug = slug;
		this.rows = [];
		this.scanned = false;
		this.scanError = null;
		this.selectedIds = [];
		this.lastResult = null;
		this.lastScanKey = ''; // force a fresh auto-scan on the new chain
	}

	// ── scanning ──
	/** Called from the page effect; scans once per owner+chain change. */
	autoScan(owner: Address): void {
		const key = `${owner.toLowerCase()}:${this.network.chainId}`;
		if (key === this.lastScanKey || this.scanning) return;
		this.lastScanKey = key;
		void this.scan();
	}

	async scan(): Promise<void> {
		const owner = this.owner;
		if (!owner) return;
		this.scanning = true;
		this.scanError = null;
		this.selectedIds = [];
		try {
			this.rows = await discover({
				network: this.network,
				owner,
				customTokens: this.chainTokens,
				customSpenders: this.chainSpenders,
			});
			this.scanned = true;
		} catch (e) {
			this.scanError = e instanceof Error ? e.message : String(e);
			this.rows = [];
		} finally {
			this.scanning = false;
		}
	}

	// ── revoke ──
	/** Dismiss the success / error banner (also cancels the auto-revert). */
	dismissStatus(): void {
		if (this.successTimer) {
			clearTimeout(this.successTimer);
			this.successTimer = null;
		}
		this.lastResult = null;
		this.revokeError = null;
	}

	private async revokeRows(rows: ApprovalRow[]): Promise<void> {
		if (rows.length === 0 || this.revoking) return;
		this.revoking = true;
		this.dismissStatus();
		this.revokePhase = 'checking';
		this.pendingIds = rows.map((r) => r.id);
		try {
			const res = await runRevoke({
				network: this.network,
				rows,
				onPhase: (p) => (this.revokePhase = p),
			});
			this.lastResult = res;
			if (res.success) {
				const ids = new Set(rows.map((r) => r.id));
				this.rows = this.rows.filter((r) => !ids.has(r.id));
				this.selectedIds = this.selectedIds.filter((id) => !ids.has(id));
				// Success is transient — auto-revert the banner (kept long enough that the
				// explorer link stays clickable). Error banners persist until dismissed.
				this.successTimer = setTimeout(() => {
					this.lastResult = null;
					this.successTimer = null;
				}, 6000);
			} else {
				this.revokeError = res.error ?? 'failed';
			}
		} catch (e) {
			this.revokeError = e instanceof Error ? e.message : String(e);
		} finally {
			this.revoking = false;
			this.revokePhase = null;
			this.pendingIds = [];
		}
	}
	revokeOne(row: ApprovalRow): Promise<void> {
		return this.revokeRows([row]);
	}
	revokeSelected(): Promise<void> {
		return this.revokeRows(this.selectedRows);
	}

	// ── custom tokens ──
	async addCustomToken(
		standard: TokenStandard,
		address: string,
		meta: { symbol: string; name?: string; decimals?: number },
	): Promise<void> {
		const addr = getAddress(address.trim());
		const entry: TokenEntry = {
			standard,
			address: addr,
			symbol: meta.symbol,
			name: meta.name,
			decimals: meta.decimals,
			isCustom: true,
		};
		const cid = this.network.chainId;
		const list = (this.customTokens[cid] ?? []).filter(
			(t) => !(t.address.toLowerCase() === addr.toLowerCase() && t.standard === standard),
		);
		this.customTokens = { ...this.customTokens, [cid]: [...list, entry] };
		try {
			await saveCustomToken(cid, entry);
		} catch {
			// persistence failure shouldn't block this session
		}
		await this.scan();
	}
	async removeCustomToken(address: Address): Promise<void> {
		const cid = this.network.chainId;
		this.customTokens = {
			...this.customTokens,
			[cid]: (this.customTokens[cid] ?? []).filter(
				(t) => t.address.toLowerCase() !== address.toLowerCase(),
			),
		};
		try {
			await deleteCustomToken(cid, address);
		} catch {
			// ignore
		}
		await this.scan();
	}

	/** Resolve metadata for a custom token before adding (for the add form). */
	async fetchTokenMeta(
		standard: TokenStandard,
		address: string,
	): Promise<{ symbol: string; name?: string; decimals?: number }> {
		if (standard === 'erc20') return fetchErc20Meta(this.network, getAddress(address.trim()));
		const m = await fetchNftMeta(this.network, getAddress(address.trim()));
		return { symbol: m.symbol ?? 'NFT', name: m.name };
	}

	// ── custom spenders ──
	async addCustomSpender(address: string, label: string): Promise<void> {
		const addr = getAddress(address.trim());
		const entry: SpenderEntry = {
			address: addr,
			label: label.trim() || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
			kind: 'other',
			isCustom: true,
		};
		const cid = this.network.chainId;
		const list = (this.customSpenders[cid] ?? []).filter(
			(s) => s.address.toLowerCase() !== addr.toLowerCase(),
		);
		this.customSpenders = { ...this.customSpenders, [cid]: [...list, entry] };
		try {
			await saveCustomSpender(cid, entry);
		} catch {
			// ignore
		}
		await this.scan();
	}
	async removeCustomSpender(address: Address): Promise<void> {
		const cid = this.network.chainId;
		this.customSpenders = {
			...this.customSpenders,
			[cid]: (this.customSpenders[cid] ?? []).filter(
				(s) => s.address.toLowerCase() !== address.toLowerCase(),
			),
		};
		try {
			await deleteCustomSpender(cid, address);
		} catch {
			// ignore
		}
		await this.scan();
	}

	// ── custom networks ──
	/**
	 * Add a custom network by chainId — name / symbol / explorer / public RPCs are
	 * pulled from the ethereum-data index (same source the rest of the app uses), so
	 * the user only searches & picks. An optional `rpcOverride` is preferred over the
	 * fetched RPCs. Returns `need-rpc` when the chain exposes no public RPC and none
	 * was supplied.
	 */
	async addNetworkByChainId(
		chainId: number,
		rpcOverride?: string,
	): Promise<{ ok: boolean; error?: 'need-rpc' | 'failed' }> {
		// Already available (built-in or previously added) → just select it, no duplicate.
		const existing = this.networks.find((n) => n.chainId === chainId);
		if (existing) {
			this.setNetwork(existing.slug);
			return { ok: true };
		}

		let meta: {
			name?: string;
			nativeCurrency?: { symbol?: string };
			explorers?: Array<{ url?: string }>;
			testnet?: boolean;
			rpc?: unknown;
		} | null = null;
		try {
			const res = await fetch(`${getEthereumDataURL()}/chains/eip155-${chainId}.json`);
			if (res.ok) meta = await res.json();
		} catch {
			meta = null;
		}

		const override = rpcOverride?.trim();
		const fetched = meta ? extractRpcUrls(meta) : [];
		const rpcs = [...new Set([...(override ? [override] : []), ...fetched])];
		if (rpcs.length === 0) return { ok: false, error: 'need-rpc' };

		const slug = customNetworkKey(chainId);
		const net: RevokeNetwork = {
			slug,
			chainId,
			name: meta?.name ?? `Chain ${chainId}`,
			symbol: meta?.nativeCurrency?.symbol ?? 'ETH',
			rpcs,
			explorerUrl: (meta?.explorers?.[0]?.url ?? '').replace(/\/$/, ''),
			multicall3: MULTICALL3,
			isCustom: true,
			isTestnet: meta?.testnet === true,
		};
		this.customNetworks = [...this.customNetworks.filter((n) => n.slug !== slug), net];
		try {
			await saveCustomNetwork(net);
		} catch {
			// persistence failure shouldn't block this session
		}
		this.setNetwork(slug);
		return { ok: true };
	}
	async removeCustomNetwork(slug: string): Promise<void> {
		this.customNetworks = this.customNetworks.filter((n) => n.slug !== slug);
		if (this.networkSlug === slug) this.setNetwork(DEFAULT_SLUG);
		try {
			await deleteCustomNetwork(slug);
		} catch {
			// ignore
		}
	}

	// ── hydrate from IndexedDB ──
	async hydrate(): Promise<void> {
		try {
			const [nets, toks, spenders] = await Promise.all([
				getCustomNetworks(),
				getCustomTokens(),
				getCustomSpenders(),
			]);
			this.customNetworks = nets;
			this.customTokens = toks;
			this.customSpenders = spenders;
		} catch {
			// ignore — custom data is best-effort
		}
	}

	isValidAddress(addr: string): boolean {
		return isValidAddress(addr);
	}
}

export const revoke = new RevokeStore();
