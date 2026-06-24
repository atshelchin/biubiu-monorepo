<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import ContractCallerConfig from '$lib/widgets/ContractCallerConfig.svelte';
	import ContractCallerMethods from '$lib/widgets/ContractCallerMethods.svelte';
	import ContractCallerBatch from '$lib/widgets/ContractCallerBatch.svelte';
	import ContractCallerChain from '$lib/widgets/ContractCallerChain.svelte';
	import ContractCallerDemos from '$lib/widgets/ContractCallerDemos.svelte';
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';

	const seoProps = $derived(
		getBaseSEO({
			title: t('cc.meta.title'),
			description: t('cc.meta.description'),
			currentLocale: locale.value
		})
	);

	// Batch + Chain become a sticky sidebar on wide screens (and stack at the
	// bottom on mobile) so they stay in view while you work with the methods.
	const hasTrays = $derived(store.batch.length > 0 || store.chain.length > 0);
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page" class:with-trays={hasTrays}>
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('cc.title')}</h1>
		<p class="page-subtitle">{t('cc.subtitle')}</p>
	</header>

	{#if !store.selectedChain}
		<ol class="guide" use:fadeInUp={{ delay: 30 }}>
			<li class="guide-step">
				<span class="guide-num">1</span>
				<div class="guide-text">
					<span class="guide-title">{t('cc.guide.step1Title')}</span>
					<span class="guide-desc">{t('cc.guide.step1Desc')}</span>
				</div>
			</li>
			<li class="guide-step">
				<span class="guide-num">2</span>
				<div class="guide-text">
					<span class="guide-title">{t('cc.guide.step2Title')}</span>
					<span class="guide-desc">{t('cc.guide.step2Desc')}</span>
				</div>
			</li>
			<li class="guide-step">
				<span class="guide-num">3</span>
				<div class="guide-text">
					<span class="guide-title">{t('cc.guide.step3Title')}</span>
					<span class="guide-desc">{t('cc.guide.step3Desc')}</span>
				</div>
			</li>
		</ol>
	{/if}

	<div class="layout">
		<div class="main-col" use:fadeInUp={{ delay: 50 }}>
			<ContractCallerConfig />

			{#if store.hasChain && store.methods.length > 0}
				<ContractCallerMethods />
			{/if}

			{#if store.hasChain && store.canChain}
				<ContractCallerDemos />
			{/if}
		</div>

		{#if hasTrays}
			<aside class="trays" use:fadeInUp={{ delay: 0 }}>
				{#if store.batch.length > 0}
					<ContractCallerBatch />
				{/if}
				{#if store.chain.length > 0}
					<ContractCallerChain />
				{/if}
			</aside>
		{/if}
	</div>
</main>

<PageFooter />

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4) var(--space-16);
		transition: max-width var(--motion-normal) var(--easing);
	}
	/* Widen to fit the sidebar once there's a batch/chain to show. */
	.page.with-trays {
		max-width: 1180px;
	}
	.layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.main-col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.trays {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	@media (min-width: 1024px) {
		.page.with-trays .layout {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			gap: var(--space-6);
			align-items: start;
		}
		.page.with-trays .trays {
			position: sticky;
			top: var(--space-6);
			max-height: calc(100vh - var(--space-12));
			overflow-y: auto;
		}
	}
	.page-header {
		text-align: center;
		margin-bottom: var(--space-6);
	}
	/* First-open orientation: the three steps the user is about to take. */
	.guide {
		list-style: none;
		margin: 0 0 var(--space-5);
		padding: var(--space-4);
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-xl);
	}
	.guide-step {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		min-width: 0;
	}
	.guide-num {
		flex: 0 0 auto;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		background: var(--accent-subtle);
		color: var(--accent);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
	.guide-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.guide-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.guide-desc {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	@media (max-width: 640px) {
		.guide {
			grid-template-columns: 1fr;
			gap: var(--space-3);
		}
	}
	.page-title {
		font-size: var(--text-4xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}
	.page-subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: 0;
	}
	@media (max-width: 640px) {
		.page {
			padding: var(--space-6) var(--space-3) var(--space-12);
		}
		.page-title {
			font-size: var(--text-3xl);
		}
		.page-subtitle {
			font-size: var(--text-base);
		}
	}
</style>
