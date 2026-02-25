<script lang="ts">
	import { t, localizeHref } from '$lib/i18n';
	import { goto } from '$app/navigation';

	interface ContractItem {
		chainId: number;
		address: string;
		name: string;
	}

	interface Props {
		currentChainId?: number;
		currentAddress?: string;
	}

	let { currentChainId, currentAddress }: Props = $props();

	let searchQuery = $state('');
	let results = $state<ContractItem[]>([]);
	let isLoading = $state(false);
	let isFocused = $state(false);
	let allContracts = $state<ContractItem[]>([]);
	let selectedIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);

	const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

	// Load contract data on mount
	$effect(() => {
		loadContractData();
	});

	async function loadContractData() {
		try {
			isLoading = true;
			const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-contracts.json`);
			const json = await response.json();
			allContracts = json.data || [];
		} catch (err) {
			console.error('Failed to load contract data:', err);
		} finally {
			isLoading = false;
		}
	}

	// Search contracts
	function searchContracts(query: string): ContractItem[] {
		if (!query.trim()) return [];

		const lowerQuery = query.toLowerCase();
		const filtered = allContracts.filter((contract) => {
			return (
				contract.name.toLowerCase().includes(lowerQuery) ||
				contract.address.toLowerCase().includes(lowerQuery) ||
				contract.chainId.toString() === query.trim()
			);
		});

		// Sort: exact name matches first, then by name
		return filtered
			.sort((a, b) => {
				const aExact = a.name.toLowerCase() === lowerQuery;
				const bExact = b.name.toLowerCase() === lowerQuery;
				if (aExact && !bExact) return -1;
				if (!aExact && bExact) return 1;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 8);
	}

	// Update results when query changes
	$effect(() => {
		results = searchContracts(searchQuery);
		selectedIndex = -1;
	});

	function handleSelect(contract: ContractItem) {
		goto(localizeHref(`/contracts/${contract.chainId}/${contract.address}`));
		searchQuery = '';
		results = [];
		inputRef?.blur();
	}

	function handleKeydown(e: KeyboardEvent) {
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
		} else if (e.key === 'Escape') {
			searchQuery = '';
			results = [];
			inputRef?.blur();
		}
	}

	function handleFocus() {
		isFocused = true;
	}

	function handleBlur() {
		// Delay to allow click on results
		setTimeout(() => {
			isFocused = false;
		}, 200);
	}

	function shortenAddress(address: string): string {
		if (address.length <= 12) return address;
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

<div class="contract-search">
	<div class="search-input-wrapper">
		<svg
			class="search-icon"
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
		<input
			bind:this={inputRef}
			type="text"
			bind:value={searchQuery}
			placeholder={t('contracts.search.placeholder')}
			class="search-input"
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
		/>
		{#if isLoading}
			<div class="loading-indicator"></div>
		{/if}
	</div>

	{#if isFocused && searchQuery.trim().length > 0}
		<div class="search-results">
			{#if results.length > 0}
				{#each results as contract, index}
					<button
						class="result-item"
						class:selected={index === selectedIndex}
						class:current={contract.chainId === currentChainId &&
							contract.address.toLowerCase() === currentAddress?.toLowerCase()}
						onclick={() => handleSelect(contract)}
					>
						<div class="result-info">
							<span class="result-name">{contract.name}</span>
							<span class="result-meta">
								Chain #{contract.chainId}
							</span>
						</div>
						<span class="result-address">{shortenAddress(contract.address)}</span>
					</button>
				{/each}
			{:else}
				<div class="no-results">
					{t('contracts.search.noResults')}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.contract-search {
		position: relative;
		z-index: 1000;
		width: 100%;
		max-width: 480px;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: var(--space-4);
		color: var(--fg-subtle);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: var(--space-3) var(--space-4) var(--space-3) var(--space-10);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		color: var(--fg-base);
		font-size: var(--text-base);
		outline: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.search-input::placeholder {
		color: var(--fg-subtle);
	}

	.search-input:focus {
		border-color: var(--accent);
		background: rgba(255, 255, 255, 0.08);
	}

	.loading-indicator {
		position: absolute;
		right: var(--space-4);
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-subtle);
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
		background-color: #0a0f0d;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		overflow: hidden;
		z-index: 9999;
	}

	:global([data-theme='light']) .search-results {
		background-color: #ffffff;
	}

	.result-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: transparent;
		border: none;
		color: var(--fg-base);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}

	.result-item:hover,
	.result-item.selected {
		background: rgba(255, 255, 255, 0.05);
	}

	.result-item.current {
		background: var(--accent-muted);
	}

	.result-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.result-name {
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.result-meta {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.result-address {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.no-results {
		padding: var(--space-4);
		text-align: center;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
