<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import ChainSearch from '$lib/widgets/ChainSearch.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { SvelteSet } from 'svelte/reactivity';
	import { getChainLogoUrl, DEFAULT_CHAIN_LOGO, type ChainListItem } from '$lib/chains';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Popular chain IDs to feature, in display order.
	const POPULAR_CHAIN_IDS = [1, 56, 137, 42161, 10, 43114, 8453, 143, 4217];
	const PAGE_SIZE = 60;

	// Chains arrive from `+page.ts` load() — already in the SSR HTML.
	const allChains = $derived(data.chains);
	const logoErrors = new SvelteSet<number>();
	let visibleCount = $state(PAGE_SIZE);

	const popularChains = $derived(
		POPULAR_CHAIN_IDS.map((id) => allChains.find((c) => c.chainId === id)).filter(
			(c): c is ChainListItem => c !== undefined
		)
	);
	const visibleChains = $derived(allChains.slice(0, visibleCount));
	const hasMore = $derived(visibleCount < allChains.length);

	const seoProps = $derived(
		getBaseSEO({
			title: t('chainsList.title'),
			description: t('chainsList.description'),
			currentLocale: locale.value
		})
	);

	function logoSrc(chainId: number): string {
		return logoErrors.has(chainId) ? DEFAULT_CHAIN_LOGO : getChainLogoUrl(chainId);
	}

	function handleLogoError(chainId: number) {
		logoErrors.add(chainId);
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + PAGE_SIZE, allChains.length);
	}

	// Auto-load the next page when the sentinel scrolls into view.
	function infiniteScroll(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ rootMargin: '600px' }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('chainsList.title')}</h1>
		<p class="page-description">{t('chainsList.description')}</p>
	</section>

	<!-- Search (outside fadeInUp to avoid stacking context issues) -->
	<div class="search-wrapper">
		<ChainSearch />
	</div>

	<!-- Popular Chains -->
	<section class="popular-section" use:fadeInUp={{ delay: 50 }}>
		<h2 class="section-title">{t('chainsList.popularChains')}</h2>
		<div class="chains-grid">
			{#each popularChains as chain (chain.chainId)}
				<a href={localizeHref(`/chains/${chain.chainId}`)} class="chain-card">
					<img
						src={logoSrc(chain.chainId)}
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

	<!-- All Chains -->
	<section class="all-section" use:fadeInUp={{ delay: 100 }}>
		<div class="section-header-row">
			<h2 class="section-title">{t('chainsList.allChains')}</h2>
			<span class="chain-count"
				>{t('chainsList.totalChains', { count: allChains.length.toString() })}</span
			>
		</div>

		<div class="all-chains-grid">
			{#each visibleChains as chain (chain.chainId)}
				<a href={localizeHref(`/chains/${chain.chainId}`)} class="chain-row">
					<img
						src={logoSrc(chain.chainId)}
						alt=""
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

		{#if hasMore}
			<div class="load-more" use:infiniteScroll>
				<span class="showing-count"
					>{t('chainsList.showing', {
						shown: visibleChains.length.toString(),
						total: allChains.length.toString()
					})}</span
				>
				<button type="button" class="load-more-btn" onclick={loadMore}>
					{t('chainsList.loadMore')}
				</button>
			</div>
		{/if}

		<!-- Always-rendered crawlable path to the full paginated index. The grid
		     above lazy-loads via JS (crawlers don't scroll), so this link is how
		     search engines reach every chain detail page. -->
		<nav class="browse-all" aria-label={t('chainsList.allChains')}>
			<a href={localizeHref('/chains/browse')} class="browse-all-link"
				>{t('chainsList.allChains')} →</a
			>
		</nav>
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
		margin-bottom: var(--space-8);
	}

	.page-title {
		font-size: var(--text-4xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.025em;
		color: var(--fg-base);
		margin: 0 0 var(--space-3);
		line-height: 1.1;
	}

	.page-description {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		max-width: 540px;
		margin: 0 auto;
		line-height: var(--leading-snug);
	}

	.search-wrapper {
		display: flex;
		justify-content: center;
		position: relative;
		z-index: 200;
		margin-bottom: var(--space-12);
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
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.chain-count {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	/* Popular Chains */
	.popular-section {
		margin-bottom: var(--space-12);
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
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}

	.chain-card:hover {
		transform: translateY(-2px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
	}

	.chain-logo {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
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
		font-weight: var(--weight-semibold);
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
		margin-bottom: var(--space-10);
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
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}

	.chain-row:hover {
		transform: translateY(-1px);
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}

	.chain-row-logo {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		object-fit: contain;
		flex-shrink: 0;
	}

	.chain-row-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
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
		font-variant-numeric: tabular-nums;
	}

	/* Load more */
	.load-more {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-8) 0 var(--space-2);
	}

	.showing-count {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	.load-more-btn {
		padding: var(--space-2) var(--space-6);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}

	.load-more-btn:hover {
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}

	.browse-all {
		display: flex;
		justify-content: center;
		margin-top: var(--space-6);
	}

	.browse-all-link {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		text-decoration: none;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		transition: color var(--motion-fast) var(--easing);
	}

	.browse-all-link:hover {
		color: var(--accent);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}

		.page-title {
			font-size: var(--text-3xl);
		}

		.page-description {
			font-size: var(--text-base);
		}

		.chains-grid,
		.all-chains-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chain-card,
		.chain-row,
		.load-more-btn {
			transition: none;
		}
	}
</style>
