<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import ChainSearch from '$lib/widgets/ChainSearch.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';

	const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

	interface ChainItem {
		chainId: number;
		name: string;
		shortName: string;
		nativeCurrencySymbol: string;
		hasLogo?: boolean;
	}

	// Popular chain IDs to feature
	const POPULAR_CHAIN_IDS = [1, 56, 137, 42161, 10, 43114, 8453, 324, 250, 1101, 59144, 534352];

	let allChains = $state<ChainItem[]>([]);
	let isLoading = $state(true);
	let logoErrors = $state<Set<number>>(new Set());

	const popularChains = $derived(
		POPULAR_CHAIN_IDS
			.map((id) => allChains.find((c) => c.chainId === id))
			.filter((c): c is ChainItem => c !== undefined)
	);

	const seoProps = $derived(
		getBaseSEO({
			title: t('chainsList.title'),
			description: t('chainsList.description'),
			currentLocale: locale.value
		})
	);

	$effect(() => {
		if (browser) {
			loadChains();
		}
	});

	async function loadChains() {
		try {
			isLoading = true;
			const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-chains.json`);
			const json = await response.json();
			allChains = json.data || [];
		} catch {
			// silent fail
		} finally {
			isLoading = false;
		}
	}

	function getLogoUrl(chainId: number): string {
		return `${ETHEREUM_DATA_BASE_URL}/chainlogos/eip155-${chainId}.png`;
	}

	function handleLogoError(chainId: number) {
		logoErrors = new Set(logoErrors).add(chainId);
	}

	const defaultLogoUrl =
		'data:image/svg+xml,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#2d3748"/><path d="M16 6L22 16L16 22L10 16L16 6Z" fill="#a0aec0"/><path d="M16 24L22 18L16 22L10 18L16 24Z" fill="#718096"/></svg>`
		);
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header + Search -->
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('chainsList.title')}</h1>
		<p class="page-description">{t('chainsList.description')}</p>
		<div class="search-wrapper">
			<ChainSearch />
		</div>
	</section>

	<!-- Popular Chains -->
	{#if popularChains.length > 0}
		<section class="popular-section" use:fadeInUp={{ delay: 50 }}>
			<h2 class="section-title">{t('chainsList.popularChains')}</h2>
			<div class="chains-grid">
				{#each popularChains as chain}
					<a
						href={localizeHref(`/chains/${chain.chainId}`)}
						class="chain-card glass-card"
					>
						<img
							src={logoErrors.has(chain.chainId) ? defaultLogoUrl : getLogoUrl(chain.chainId)}
							alt={chain.name}
							class="chain-logo"
							onerror={() => handleLogoError(chain.chainId)}
						/>
						<div class="chain-info">
							<span class="chain-name">{chain.name}</span>
							<span class="chain-meta">{chain.shortName} · {chain.nativeCurrencySymbol}</span>
						</div>
						<span class="chain-id">#{chain.chainId}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- All Chains -->
	<section class="all-section" use:fadeInUp={{ delay: 100 }}>
		<div class="section-header-row">
			<h2 class="section-title">{t('chainsList.allChains')}</h2>
			{#if !isLoading}
				<span class="chain-count">{t('chainsList.totalChains', { count: allChains.length.toString() })}</span>
			{/if}
		</div>

		{#if isLoading}
			<div class="loading-state">
				<div class="loading-spinner"></div>
				<span>{t('common.loading')}</span>
			</div>
		{:else}
			<div class="all-chains-grid">
				{#each allChains as chain}
					<a
						href={localizeHref(`/chains/${chain.chainId}`)}
						class="chain-row glass-card"
					>
						<img
							src={logoErrors.has(chain.chainId) ? defaultLogoUrl : getLogoUrl(chain.chainId)}
							alt={chain.name}
							class="chain-row-logo"
							loading="lazy"
							onerror={() => handleLogoError(chain.chainId)}
						/>
						<span class="chain-row-name">{chain.name}</span>
						<span class="chain-row-symbol">{chain.nativeCurrencySymbol}</span>
						<span class="chain-row-id">#{chain.chainId}</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</main>

<PageFooter />

<style>
	main.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

	/* Header */
	.page-header {
		text-align: center;
		margin-bottom: var(--space-10);
	}

	.page-title {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
		line-height: 1.2;
	}

	.page-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: 0 0 var(--space-6);
	}

	.search-wrapper {
		display: flex;
		justify-content: center;
		position: relative;
		z-index: 100;
	}

	/* Section */
	.section-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.section-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.chain-count {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	/* Popular Chains Grid */
	.popular-section {
		margin-bottom: var(--space-10);
	}

	.popular-section .section-title {
		margin-bottom: var(--space-4);
	}

	.chains-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-3);
	}

	.chain-card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		text-decoration: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.chain-card:hover {
		transform: translateY(-2px);
		background: rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	.chain-logo {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		object-fit: contain;
		flex-shrink: 0;
	}

	.chain-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.chain-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chain-meta {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.chain-id {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
		flex-shrink: 0;
	}

	/* All Chains */
	.all-section {
		margin-bottom: var(--space-8);
	}

	.all-chains-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-2);
	}

	.chain-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: background var(--motion-fast) var(--easing);
	}

	.chain-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.chain-row-logo {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		object-fit: contain;
		flex-shrink: 0;
	}

	.chain-row-name {
		font-size: var(--text-sm);
		color: var(--fg-base);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chain-row-symbol {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		flex-shrink: 0;
	}

	.chain-row-id {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
		flex-shrink: 0;
	}

	/* Loading */
	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12);
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
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

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}

		.page-title {
			font-size: var(--text-2xl);
		}

		.chains-grid {
			grid-template-columns: 1fr;
		}

		.all-chains-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
