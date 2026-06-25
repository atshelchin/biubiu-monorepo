<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const seoProps = $derived(
		getBaseSEO({
			title:
				data.page > 1
					? `${t('chainsList.title')} — ${data.page} / ${data.totalPages}`
					: t('chainsList.title'),
			description: t('chainsList.description'),
			currentLocale: locale.value
		})
	);

	function pageHref(n: number): string {
		return localizeHref(n === 1 ? '/chains/browse' : `/chains/browse/${n}`);
	}

	// Few pages (≈13 for ~2.6k chains): render every page link so each browse
	// page — and through it every chain — is one hop from any other.
	const pageNumbers = $derived(Array.from({ length: data.totalPages }, (_, i) => i + 1));
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<section class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('chainsList.allChains')}</h1>
		<p class="page-description">{t('chainsList.description')}</p>
		<span class="chain-count">{t('chainsList.totalChains', { count: data.total.toString() })}</span>
	</section>

	<nav class="chain-index" use:fadeInUp={{ delay: 50 }} aria-label={t('chainsList.allChains')}>
		<ul>
			{#each data.chains as chain (chain.chainId)}
				<li>
					<a href={localizeHref(`/chains/${chain.chainId}`)} class="chain-link">
						<span class="cl-name">{chain.name}</span>
						<span class="cl-meta">{chain.shortName} · #{chain.chainId}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	{#if data.totalPages > 1}
		<nav class="pager" aria-label={t('chainsList.allChains')}>
			{#if data.page > 1}
				<a class="pager-step" rel="prev" href={pageHref(data.page - 1)} aria-label={String(data.page - 1)}
					>←</a
				>
			{/if}
			{#each pageNumbers as n (n)}
				{#if n === data.page}
					<span class="pager-num is-current" aria-current="page">{n}</span>
				{:else}
					<a class="pager-num" href={pageHref(n)}>{n}</a>
				{/if}
			{/each}
			{#if data.page < data.totalPages}
				<a class="pager-step" rel="next" href={pageHref(data.page + 1)} aria-label={String(data.page + 1)}
					>→</a
				>
			{/if}
		</nav>
	{/if}

	<div class="back-row">
		<a href={localizeHref('/chains')} class="back-link">{t('chainsList.title')}</a>
	</div>
</main>

<PageFooter />

<style>
	main.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

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
		margin: 0 auto var(--space-3);
		line-height: var(--leading-snug);
	}

	.chain-count {
		display: inline-block;
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	/* Chain link grid */
	.chain-index ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-2);
	}

	.chain-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		transition:
			border-color var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}

	.chain-link:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.cl-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cl-meta {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	/* Pager */
	.pager {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-8);
	}

	.pager-num,
	.pager-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		text-decoration: none;
		transition:
			border-color var(--motion-fast) var(--easing),
			color var(--motion-fast) var(--easing);
	}

	.pager-num:hover,
	.pager-step:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.pager-num.is-current {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
		font-weight: var(--weight-semibold);
	}

	.back-row {
		display: flex;
		justify-content: center;
		margin-top: var(--space-8);
	}

	.back-link {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.back-link:hover {
		color: var(--accent);
	}

	@media (max-width: 768px) {
		.chain-index ul {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chain-link {
			transition: none;
		}
	}
</style>
