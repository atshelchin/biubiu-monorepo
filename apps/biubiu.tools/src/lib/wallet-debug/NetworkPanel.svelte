<!-- Network switcher: built-in read/send target chips + add-any-chain search. -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { SvelteSet } from 'svelte/reactivity';
	import { searchChains, chainLogoUrl } from '$lib/contract-caller/networks.js';
	import type { ChainSearchResult } from '$lib/contract-caller/types.js';
	import { debug } from './debug-store.svelte.js';
	import { CURATED_CHAINS, debounce, resolveAddProvider, addOrSwitchChain } from './helpers.js';
	import { canAddChainToWallet } from './gating.js';
	import Panel from './Panel.svelte';
	import { Network, Search, Plus, Check } from '@lucide/svelte';

	const wallet = $derived(debug.wallet);
	// biubiu is a chainless passkey Safe (reads via the RPC pool, no EIP-1193
	// provider). "Add any network" only applies to external wallets — never drive
	// an unrelated injected extension on biubiu's behalf.
	const canAddChain = $derived(canAddChainToWallet(wallet));

	// Chain logos load from ethereum-data; fall back to the colored label on error.
	const logoFailed = new SvelteSet<number>();

	let query = $state('');
	let results = $state<ChainSearchResult[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let busyChain = $state<number | null>(null);

	let searchToken = 0;
	async function doSearch(q: string) {
		const token = ++searchToken;
		if (!q.trim()) {
			results = [];
			searched = false;
			searching = false;
			return;
		}
		searching = true;
		try {
			const r = await searchChains(q);
			if (token === searchToken) {
				results = r;
				searched = true;
			}
		} finally {
			if (token === searchToken) searching = false;
		}
	}
	const debouncedSearch = debounce(doSearch, 250);
	function onInput() {
		// Show the spinner immediately for responsiveness; the fetch is debounced.
		if (query.trim()) searching = true;
		else searching = false;
		debouncedSearch(query);
	}

	/** Choose a built-in chain as the read/send target; sync external wallets. */
	async function pickCurated(chainId: number) {
		debug.selectedChainId = chainId;
		if (wallet && 'ensureChain' in wallet) {
			try {
				await (wallet as { ensureChain(id: number): Promise<void> }).ensureChain(chainId);
				debug.push('wallet_switchEthereumChain', true, { chainId });
			} catch (e) {
				debug.push('wallet_switchEthereumChain', false, {
					chainId,
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}
	}

	let addedChain = $state<number | null>(null);
	async function addChain(r: ChainSearchResult) {
		// Defensive: the section is hidden for biubiu, but never drive a chain add
		// for a wallet that can't have chains added (would hit an unrelated extension).
		if (!canAddChain) return;
		const provider = resolveAddProvider(wallet);
		if (!provider) {
			debug.push('wallet_addEthereumChain', false, { reason: 'no-wallet' });
			return;
		}
		busyChain = r.chainId;
		try {
			const outcome = await addOrSwitchChain(provider, r.chainId);
			const ok = outcome.status === 'added' || outcome.status === 'switched';
			debug.push(
				outcome.status === 'switched' ? 'wallet_switchEthereumChain' : 'wallet_addEthereumChain',
				ok,
				{ chainId: r.chainId, ...outcome }
			);
			if (ok) {
				addedChain = r.chainId;
				setTimeout(() => {
					if (addedChain === r.chainId) addedChain = null;
				}, 1500);
			}
		} finally {
			busyChain = null;
		}
	}
</script>

<Panel title={t('wd.net.title')} description={t('wd.net.desc')} icon={Network}>
	<p class="wd-eyebrow">{t('wd.net.quickPick')}</p>
	<p class="wd-hint top-hint">{t('wd.net.quickPickHint')}</p>
	<div class="chips" role="group" aria-label={t('wd.net.quickPick')}>
		{#each CURATED_CHAINS as c (c.chainId)}
			<button
				class="chip wd-focusable"
				class:active={c.chainId === debug.selectedChainId}
				aria-pressed={c.chainId === debug.selectedChainId}
				onclick={() => pickCurated(c.chainId)}
			>
				{#if logoFailed.has(c.chainId)}
					<span class="dot" style="background:{c.iconBg};color:{c.iconColor}">{c.iconLabel.slice(0, 3)}</span>
				{:else}
					<img
						class="chip-logo"
						src={chainLogoUrl(c.chainId)}
						alt=""
						width="20"
						height="20"
						loading="lazy"
						onerror={() => logoFailed.add(c.chainId)}
					/>
				{/if}
				<span class="chip-name">{c.name}</span>
			</button>
		{/each}
	</div>

	{#if canAddChain}
		<div class="divider"></div>

		<p class="wd-eyebrow">{t('wd.net.searchHeading')}</p>
		<p class="wd-hint top-hint">{t('wd.net.searchHint')}</p>
		<div class="search">
		<Search size={15} class="search-ic" />
		<input
			class="wd-input search-input"
			type="text"
			name="wd-chain-search"
			bind:value={query}
			oninput={onInput}
			placeholder={t('wd.net.searchPlaceholder')}
			autocomplete="off"
			spellcheck="false"
			aria-label={t('wd.net.searchHeading')}
		/>
	</div>

	{#if searching}
		<p class="wd-hint">{t('wd.net.searching')}</p>
	{:else if searched && results.length === 0}
		<p class="wd-hint">{t('wd.net.noResults')}</p>
	{:else if results.length > 0}
		<ul class="results">
			{#each results as r (r.chainId)}
				<li class="res">
					{#if r.hasLogo}
						<img src={chainLogoUrl(r.chainId)} alt="" loading="lazy" width="22" height="22" />
					{:else}
						<span class="res-fallback">{r.nativeCurrencySymbol.slice(0, 3)}</span>
					{/if}
					<span class="res-info">
						<span class="res-name">{r.name}</span>
						<span class="res-meta wd-mono">{r.chainId} · {r.nativeCurrencySymbol}</span>
					</span>
					<button
						class="add wd-focusable"
						class:done={addedChain === r.chainId}
						disabled={busyChain === r.chainId}
						onclick={() => addChain(r)}
					>
						{#if addedChain === r.chainId}
							<Check size={13} />{t('wd.net.added')}
						{:else}
							<Plus size={13} />{t('wd.net.add')}
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		{/if}
	{/if}
</Panel>

<style>
	.top-hint {
		margin-top: 0;
		margin-bottom: var(--space-3);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition:
			border-color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	.chip:hover {
		border-color: var(--border-strong);
	}
	.chip.active {
		border-color: var(--accent);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.dot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: 8px;
		font-weight: var(--weight-bold);
	}
	.chip-logo {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		flex: none;
		object-fit: cover;
		background: var(--bg-sunken);
	}
	.divider {
		height: 1px;
		background: var(--border-subtle);
		margin: var(--space-5) 0;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
	}
	.search :global(.search-ic) {
		position: absolute;
		left: var(--space-3);
		color: var(--fg-subtle);
		pointer-events: none;
	}
	.search-input {
		padding-left: var(--space-8);
	}
	.results {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.res {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-md);
	}
	.res:hover {
		background: var(--bg-raised);
	}
	.res img,
	.res-fallback {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		flex: none;
	}
	.res-fallback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-sunken);
		color: var(--fg-subtle);
		font-size: 8px;
		font-weight: var(--weight-bold);
	}
	.res-info {
		min-width: 0;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
	}
	.res-name {
		font-size: var(--text-sm);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.res-meta {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing), color var(--motion-fast) var(--easing);
	}
	.add:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	.add.done {
		color: var(--success);
		border-color: var(--success-muted);
	}
	.add:disabled {
		opacity: 0.5;
		cursor: progress;
	}
</style>
