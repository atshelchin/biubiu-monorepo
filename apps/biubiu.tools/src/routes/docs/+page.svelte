<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import DocArticle from '$lib/content/DocArticle.svelte';
	import { getDoc } from '$lib/content/docs';
	import { DOCS_INDEX_SLUG } from '$lib/content/sidebar';

	const slug = DOCS_INDEX_SLUG;
	const doc = getDoc(slug)!;
	const Content = doc.component;

	const seoProps = $derived(
		getBaseSEO({
			title: t('docs.meta.title'),
			description: t('docs.meta.description'),
			currentLocale: locale.value
		})
	);
</script>

<SEO {...seoProps} />

<DocArticle {slug}>
	<Content />
</DocArticle>
