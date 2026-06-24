<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import WalletDebug from '$lib/wallet-debug/WalletDebug.svelte';

	const seoProps = $derived(
		getBaseSEO({
			title: t('wd.meta.title'),
			description: t('wd.meta.description'),
			currentLocale: locale.value
		})
	);
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('wd.title')}</h1>
		<p class="page-subtitle">{t('wd.subtitle')}</p>
	</header>

	<WalletDebug />
</main>

<PageFooter />

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4) var(--space-16);
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
		max-width: 640px;
		margin: 0 auto;
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
