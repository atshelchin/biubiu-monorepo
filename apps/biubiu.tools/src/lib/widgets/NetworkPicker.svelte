<script lang="ts">
	/**
	 * Shared EVM network + RPC picker (search any chain, with logos).
	 *
	 * Props-driven (no store coupling) so Contract Caller and Event Scanner share
	 * one consistent, compact network UX. When a chain is selected it collapses to
	 * a single bar — no redundant repetitions of the RPC endpoint.
	 */
	import type { Snippet } from 'svelte';
	import { chainLogoUrl } from '$lib/contract-caller/networks.js';
	import { t } from '$lib/i18n';

	interface RpcOpt {
		url: string;
		latencyMs: number | null;
		status: 'ok' | 'error' | 'pending';
	}
	interface ChainResult {
		chainId: number;
		name: string;
		shortName?: string;
		nativeCurrencySymbol: string;
	}
	interface SelectedChain {
		chainId: number;
		name: string;
	}

	interface Props {
		searchQuery: string;
		searching?: boolean;
		loadingChain?: boolean;
		chainError?: string;
		searchResults: ChainResult[];
		selectedChain: SelectedChain | null;
		rpcUrl: string;
		rpcOptions: RpcOpt[];
		rpcLatency?: number | null;
		usingCustomRpc?: boolean;
		customRpcInput: string;
		rpcError?: string;
		title?: string;
		subtitle?: string;
		onSearch: (q: string) => void;
		onSelectChain: (chainId: number) => void;
		onChangeNetwork: () => void;
		onSwitchRpc: (url: string) => void;
		onCustomRpcInput: (v: string) => void;
		onApplyCustomRpc: () => void;
		/** Optional badge next to the chain (e.g. Read-only / Read+Write). */
		badge?: Snippet;
	}

	let {
		searchQuery,
		searching = false,
		loadingChain = false,
		chainError = '',
		searchResults,
		selectedChain,
		rpcUrl,
		rpcOptions,
		rpcLatency = null,
		usingCustomRpc = false,
		customRpcInput,
		rpcError = '',
		title = t('widgets.networkPicker.title'),
		subtitle = t('widgets.networkPicker.subtitle'),
		onSearch,
		onSelectChain,
		onChangeNetwork,
		onSwitchRpc,
		onCustomRpcInput,
		onApplyCustomRpc,
		badge
	}: Props = $props();

	let showCustom = $state(false);
	let searchTimer: ReturnType<typeof setTimeout>;
	function handleSearch(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => onSearch(value), 280);
	}
	function handleRpcSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		if (val !== '__custom__') onSwitchRpc(val);
	}
	function hideImg(e: Event) {
		(e.target as HTMLImageElement).style.display = 'none';
	}
	function host(url: string): string {
		return url.replace('https://', '').replace(/\/$/, '');
	}
</script>

{#if !selectedChain}
	<section class="card">
		<div class="head">
			<span class="label">{title}</span>
			<span class="sub">{subtitle}</span>
		</div>
		<div class="search-box">
			<input
				type="text"
				class="input"
				placeholder={t('widgets.networkPicker.searchPlaceholder')}
				oninput={handleSearch}
				value={searchQuery}
			/>
			{#if searching || loadingChain}<div class="spinner"></div>{/if}
		</div>

		{#if chainError}<p class="err">{chainError}</p>{/if}

		{#if searchResults.length > 0}
			<ul class="chain-list">
				{#each searchResults as chain (chain.chainId)}
					<li>
						<button class="chain-item" onclick={() => onSelectChain(chain.chainId)}>
							<img src={chainLogoUrl(chain.chainId)} alt="" class="logo" onerror={hideImg} />
							<span class="chain-info">
								<span class="chain-name">{chain.name}</span>
								<span class="chain-sub">#{chain.chainId} · {chain.nativeCurrencySymbol}</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{:else}
	<section class="card bar">
		<div class="bar-main">
			<img src={chainLogoUrl(selectedChain.chainId)} alt="" class="logo" onerror={hideImg} />
			<div class="meta">
				<span class="name">{selectedChain.name}</span>
				<span class="sub">{t('widgets.networkPicker.chain', { id: selectedChain.chainId })}</span>
			</div>
			{#if badge}{@render badge()}{/if}
			<button class="link" onclick={onChangeNetwork}>{t('widgets.networkPicker.change')}</button>
		</div>

		<div class="bar-rpc">
			<span class="rpc-tag">RPC</span>
			{#if rpcOptions.length > 0}
				<select
					class="rpc-select"
					value={usingCustomRpc ? '__custom__' : rpcUrl}
					onchange={handleRpcSelect}
				>
					{#each rpcOptions as opt (opt.url)}
						<option value={opt.url} disabled={opt.status === 'error'}>
							{host(opt.url).slice(0, 42)}{#if opt.status === 'ok'}
								· {opt.latencyMs}ms{:else if opt.status === 'error'}
								· ✕{:else}
								· …{/if}
						</option>
					{/each}
					{#if usingCustomRpc}<option value="__custom__"
							>{host(customRpcInput).slice(0, 42)} · custom</option
						>{/if}
				</select>
			{:else}
				<code class="rpc-url"
					>{host(rpcUrl)}{#if rpcLatency !== null}
						· {rpcLatency}ms{/if}</code
				>
			{/if}
			<button class="link sm" onclick={() => (showCustom = !showCustom)}
				>{showCustom ? t('widgets.networkPicker.hide') : t('widgets.networkPicker.custom')}</button
			>
		</div>

		{#if showCustom}
			<div class="custom-row">
				<input
					type="text"
					class="input"
					placeholder={t('widgets.networkPicker.customRpcPlaceholder')}
					value={customRpcInput}
					oninput={(e) => onCustomRpcInput((e.target as HTMLInputElement).value)}
					onkeydown={(e) => e.key === 'Enter' && onApplyCustomRpc()}
				/>
				<button class="apply" onclick={onApplyCustomRpc} disabled={!customRpcInput.trim()}
					>{t('widgets.networkPicker.apply')}</button
				>
			</div>
		{/if}
		{#if rpcError}<p class="err">{rpcError}</p>{/if}
	</section>
{/if}

<style>
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.label {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-subtle);
	}
	.sub {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}
	.spinner {
		position: absolute;
		right: var(--space-3);
		width: 15px;
		height: 15px;
		border: 2px solid var(--border-strong);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.chain-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 300px;
		overflow-y: auto;
	}
	.chain-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.chain-item:hover {
		border-color: var(--accent);
	}
	.logo {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		flex: 0 0 auto;
		background: var(--bg-elevated);
	}
	.chain-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
	}
	.chain-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.chain-sub {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	/* selected bar */
	.bar {
		gap: var(--space-2);
	}
	.bar-main {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.meta .sub {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.bar-rpc {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.rpc-tag {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.rpc-select {
		flex: 1;
		min-width: 0;
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--fg-muted);
	}
	.rpc-url {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.custom-row {
		display: flex;
		gap: var(--space-2);
	}
	.apply {
		padding: var(--space-1) var(--space-3);
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		cursor: pointer;
		white-space: nowrap;
	}
	.apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.link {
		background: transparent;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: 0;
		white-space: nowrap;
	}
	.link.sm {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.link.sm:hover {
		color: var(--accent);
	}
	.err {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
	}
</style>
