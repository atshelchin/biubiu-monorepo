<script lang="ts">
	import { locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import DocArticle from '$lib/content/DocArticle.svelte';
	import { getDoc } from '$lib/content/docs';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The compiled component is looked up by slug (not serialized through `load`).
	const doc = $derived(getDoc(data.slug)!);
	const Content = $derived(doc.component);
	const description = $derived(
		data.meta.description ?? `${data.meta.title} — BiuBiu Tools documentation.`
	);

	const seoProps = $derived(
		getBaseSEO({
			title: `${data.meta.title} — BiuBiu Tools`,
			description,
			currentLocale: locale.value,
			ogParams: { type: 'article', subtitle: description }
		})
	);
</script>

<SEO {...seoProps} />

{#key data.slug}
	<DocArticle slug={data.slug}>
		<Content />
	</DocArticle>
{/key}
