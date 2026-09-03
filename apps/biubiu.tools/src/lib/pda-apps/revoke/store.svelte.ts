/**
 * Approval Revoke —— **只是核心返回的视图的持有者**。
 *
 * 迁移前（spec 001-biubiu-core-crux）这里有 413 行：扫描的代次计数器 `scanGen`、自动扫描的
 * 去重键 `lastScanKey`、成功横幅的 `setTimeout` 句柄、以及十几个派生 getter。那些**全部**是
 * 业务规则，现在住在 `rust/crates/biubiu-core/src/app/revoke.rs`，并且有 21 个不需要浏览器
 * 就能跑的测试。
 *
 * 这里剩下的只有三件事：持有 ViewModel、把交互转成 Event、把 Event 送进核心。
 *
 * **不要往这里加 `if`。** 凡是「什么时候允许点这个按钮」「失败后回滚到哪」「哪个响应算过期」
 * 这类判断，都是核心的（宪法原则 II）。这个文件里出现一个决定业务后果的分支，就说明那条规则
 * 走错了地方。
 */
import { createCruxSession, type CruxSession } from '$lib/crux/create-crux-session.js';
import type { RevokeEvent } from '$lib/generated/revoke/RevokeEvent';
import type { RevokeShellResult } from '$lib/generated/revoke/RevokeShellResult';
import type { RevokeViewModel } from '$lib/generated/revoke/RevokeViewModel';
import type { RowFilter } from '$lib/generated/revoke/RowFilter';
import type { TokenStandard } from '$lib/generated/revoke/TokenStandard';
import { walletStore } from '$lib/wallet';
import { BUILTIN_NETWORKS } from './infra/networks.js';
import { fetchErc20Meta, fetchNftMeta, isValidAddress } from './infra/metadata.js';
import { createRevokeShell, type RevokeEffect } from './shell/index.js';
import { fromRevokeNetwork } from './shell/wire.js';
import { networkBySlug } from './infra/networks.js';

type Session = CruxSession<RevokeViewModel, RevokeEvent, RevokeEffect, RevokeShellResult>;

class RevokeStore {
	/** 核心返回的视图。页面只读这个。 */
	view = $state<RevokeViewModel | null>(null);
	/** 核心加载失败（WASM 取不到等），与业务失败无关。 */
	loadError = $state<string | null>(null);

	#session: Session | null = null;
	#starting: Promise<void> | null = null;

	/** 幂等：页面重复挂载不会创建第二个核心。 */
	async start(): Promise<void> {
		if (this.#session) return;
		if (this.#starting) return this.#starting;

		this.#starting = (async () => {
			const shell = createRevokeShell({ dispatch: (event) => this.#session?.dispatch(event) });
			try {
				this.#session = await createCruxSession<
					RevokeViewModel,
					RevokeEvent,
					RevokeEffect,
					RevokeShellResult
				>({
					createCore: (wasm) => new wasm.RevokeCore(),
					initialEvent: { type: 'page_ready' },
					onView: (view) => {
						this.view = view;
					},
					execute: (effect) => shell.execute(effect),
					toFailure: (effect, error) => shell.toFailure(effect, error),
					onError: (error) => {
						this.loadError = error instanceof Error ? error.message : String(error);
					},
				});
				// 内置网络表由宿主供给：它派生自钱包的 CHAINS，属于尚未迁移的 wallet 域，
				// 复制进核心会制造两份真相（research.md D12）。
				this.#session.dispatch({
					type: 'networks_provided',
					networks: BUILTIN_NETWORKS.map(fromRevokeNetwork),
				});
			} catch (error) {
				this.loadError = error instanceof Error ? error.message : String(error);
			} finally {
				this.#starting = null;
			}
		})();

		return this.#starting;
	}

	dispose(): void {
		this.#session?.dispose();
		this.#session = null;
		this.view = null;
	}

	#send(event: RevokeEvent): void {
		this.#session?.dispatch(event);
	}

	/** 由页面的钱包 effect 调用。是否算「换了目标」由核心判断。 */
	syncWallet(): void {
		this.#send({
			type: 'wallet_changed',
			owner: walletStore.activeWallet?.address ?? null,
			is_biubiu: walletStore.kind === 'biubiu',
		});
	}

	setNetwork(slug: string): void {
		this.#send({ type: 'set_network', slug });
	}
	rescan(): void {
		this.#send({ type: 'request_scan' });
	}
	setFilter(filter: RowFilter): void {
		this.#send({ type: 'set_filter', filter });
	}
	toggleRow(id: string): void {
		this.#send({ type: 'toggle_row', id });
	}
	selectAllVisible(): void {
		this.#send({ type: 'select_all_visible' });
	}
	clearSelection(): void {
		this.#send({ type: 'clear_selection' });
	}
	setGasFeeToken(token: string | null): void {
		this.#send({ type: 'set_gas_fee_token', token });
	}
	revokeOne(id: string): void {
		this.#send({ type: 'revoke_one', id });
	}
	revokeSelected(): void {
		this.#send({ type: 'revoke_selected' });
	}
	dismissNotice(): void {
		this.#send({ type: 'dismiss_notice' });
	}

	addCustomToken(
		standard: TokenStandard,
		address: string,
		meta: { symbol: string; name?: string; decimals?: number },
	): void {
		this.#send({
			type: 'add_custom_token',
			standard,
			address,
			symbol: meta.symbol,
			name: meta.name ?? null,
			decimals: meta.decimals ?? null,
		});
	}
	removeCustomToken(address: string): void {
		this.#send({ type: 'remove_custom_token', address });
	}
	addCustomSpender(address: string, label: string): void {
		this.#send({ type: 'add_custom_spender', address, label });
	}
	removeCustomSpender(address: string): void {
		this.#send({ type: 'remove_custom_spender', address });
	}
	addNetworkByChainId(chainId: number, rpcOverride?: string): void {
		this.#send({
			type: 'add_network_by_chain_id',
			chain_id: chainId,
			rpc_override: rpcOverride?.trim() || null,
		});
	}
	removeCustomNetwork(slug: string): void {
		this.#send({ type: 'remove_custom_network', slug });
	}

	/**
	 * 添加自定义代币前，先把元数据读出来填进表单。
	 *
	 * 这是一次**纯读取**，不改变任何业务状态，因此不必绕核心一圈 —— 它更像是表单的自动填充，
	 * 而不是一次业务转换。读到的值随 `addCustomToken` 一起进核心。
	 */
	fetchTokenMeta(
		standard: TokenStandard,
		address: string,
	): Promise<{ symbol: string; name?: string; decimals?: number }> {
		const slug = this.view?.network?.slug ?? '';
		const network = networkBySlug(slug, []);
		if (standard === 'erc20') return fetchErc20Meta(network, address as `0x${string}`);
		return fetchNftMeta(network, address as `0x${string}`).then((m) => ({
			symbol: m.symbol ?? 'NFT',
			name: m.name,
		}));
	}

	isValidAddress(address: string): boolean {
		return isValidAddress(address);
	}
}

export const revoke = new RevokeStore();
