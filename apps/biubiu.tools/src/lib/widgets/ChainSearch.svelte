<script lang="ts">
	import { t, localizeHref } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { Search } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		loadAllChains,
		getChainLogoUrl,
		DEFAULT_CHAIN_LOGO,
		type ChainListItem
	} from '$lib/chains';

	interface Props {
		currentChainId?: number;
	}

	let { currentChainId }: Props = $props();

	let searchQuery = $state('');
	let results = $state<ChainListItem[]>([]);
	let isLoading = $state(false);
	let isOpen = $state(false);
	let allChains = $state<ChainListItem[]>([]);
	let selectedIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);
	const logoErrors = new SvelteSet<number>();

	const isApple =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

	$effect(() => {
		isLoading = true;
		loadAllChains()
			.then((chains) => (allChains = chains))
			.finally(() => (isLoading = false));
	});

	// Global ⌘K / Ctrl+K to focus the search.
	$effect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				inputRef?.focus();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function searchChains(query: string): ChainListItem[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];

		return allChains
			.filter(
				(chain) =>
					chain.name.toLowerCase().includes(q) ||
					chain.shortName.toLowerCase().includes(q) ||
					chain.nativeCurrencySymbol.toLowerCase().includes(q) ||
					chain.chainId.toString() === query.trim()
			)
			.sort((a, b) => {
				const aExact = a.chainId.toString() === query.trim() || a.shortName.toLowerCase() === q;
				const bExact = b.chainId.toString() === query.trim() || b.shortName.toLowerCase() === q;
				if (aExact && !bExact) return -1;
				if (!aExact && bExact) return 1;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 8);
	}

	$effect(() => {
		results = searchChains(searchQuery);
		selectedIndex = -1;
	});

	function handleSelect(chain: ChainListItem) {
		goto(localizeHref(`/chains/${chain.chainId}`));
		searchQuery = '';
		results = [];
		isOpen = false;
		inputRef?.blur();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			searchQuery = '';
			results = [];
			inputRef?.blur();
			return;
		}
		if (results.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter' && selectedIndex >= 0) {
			e.preventDefault();
			handleSelect(results[selectedIndex]);
		}
	}

	function handleLogoError(chainId: number) {
		logoErrors.add(chainId);
	}

	const showResults = $derived(isOpen && searchQuery.trim().length > 0);
</script>

<div
	class="chain-search"
	onfocusin={() => (isOpen = true)}
	onfocusout={(e) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) isOpen = false;
	}}
>
	<div class="search-input-wrapper">
		<Search class="search-icon" size={18} />
		<input
			bind:this={inputRef}
			type="text"
			bind:value={searchQuery}
			placeholder={t('chains.search.placeholder')}
			class="search-input"
			autocomplete="off"
			spellcheck="false"
			role="combobox"
			aria-label={t('chains.search.placeholder')}
			aria-expanded={showResults}
			aria-controls="chain-search-results"
			aria-autocomplete="list"
			onkeydown={handleKeydown}
		/>
		{#if isLoading}
			<div class="loading-indicator" aria-hidden="true"></div>
		{:else if !searchQuery}
			<kbd class="search-kbd" aria-hidden="true">{isApple ? '⌘' : 'Ctrl'} K</kbd>
		{/if}
	</div>

	{#if showResults}
		<div class="search-results" id="chain-search-results" role="listbox">
			{#if results.length > 0}
				{#each results as chain, index (chain.chainId)}
					<button
						type="button"
						class="result-item"
						class:selected={index === selectedIndex}
						class:current={chain.chainId === currentChainId}
						role="option"
						aria-selected={index === selectedIndex}
						onclick={() => handleSelect(chain)}
						onmouseenter={() => (selectedIndex = index)}
					>
						<img
							src={logoErrors.has(chain.chainId)
								? DEFAULT_CHAIN_LOGO
								: getChainLogoUrl(chain.chainId)}
							alt=""
							class="result-logo"
							loading="lazy"
							onerror={() => handleLogoError(chain.chainId)}
						/>
						<div class="result-info">
							<span class="result-name">{chain.name}</span>
							<span class="result-meta">{chain.shortName} · {chain.nativeCurrencySymbol}</span>
						</div>
						<span class="result-chain-id">#{chain.chainId}</span>
					</button>
				{/each}
			{:else}
				<div class="no-results">{t('chains.search.noResults')}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chain-search {
		position: relative;
		z-index: 1000;
		width: 100%;
		max-width: 520px;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-input-wrapper :global(.search-icon) {
		position: absolute;
		left: var(--space-4);
		color: var(--fg-subtle);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: var(--space-3) var(--space-4) var(--space-3) var(--space-10);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		color: var(--fg-base);
		font-size: var(--text-base);
		outline: none;
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}

	.search-input::placeholder {
		color: var(--fg-subtle);
	}

	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}

	.search-kbd {
		position: absolute;
		right: var(--space-3);
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 2px var(--space-2);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		pointer-events: none;
	}

	.loading-indicator {
		position: absolute;
		right: var(--space-4);
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.search-results {
		position: absolute;
		top: calc(100% + var(--space-2));
		left: 0;
		right: 0;
		padding: var(--space-1);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		z-index: 9999;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}

	.result-item.selected {
		background: var(--bg-sunken);
	}

	.result-item.current {
		background: var(--accent-muted);
	}

	.result-logo {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		object-fit: contain;
		flex-shrink: 0;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}

	.result-name {
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-meta {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.result-chain-id {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
		flex-shrink: 0;
	}

	.no-results {
		padding: var(--space-4);
		text-align: center;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}

	@media (prefers-reduced-motion: reduce) {
		.search-input,
		.result-item {
			transition: none;
		}
		.loading-indicator {
			animation: none;
		}
	}
</style>
