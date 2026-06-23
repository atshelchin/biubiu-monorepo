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

	<div class="layout">
		<div class="main-col" use:fadeInUp={{ delay: 50 }}>
			<ContractCallerConfig />

			{#if store.hasChain && store.methods.length > 0}
				<ContractCallerMethods />
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
		margin-bottom: var(--space-8);
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
