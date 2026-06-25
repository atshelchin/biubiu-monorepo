<script lang="ts">
	import { t, locale, localizeHref, formatDate } from '$lib/i18n';
	import { getBaseSEO, seoConfig } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import Prose from '$lib/content/Prose.svelte';
	import { getPost, getAdjacentPosts } from '$lib/content/blog';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The compiled component is looked up by slug (not serialized through `load`).
	const post = $derived(getPost(data.slug)!);
	const Content = $derived(post.component);
	const adjacent = $derived(getAdjacentPosts(data.slug));
	const author = $derived(data.meta.author ?? 'BiuBiu Tools');
	const readTime = $derived(t('blog.minRead', { min: String(data.readingMinutes) }));

	const seoProps = $derived(
		getBaseSEO({
			title: `${data.meta.title} — BiuBiu Tools`,
			description: data.meta.description,
			currentLocale: locale.value,
			ogImage: data.meta.cover ? seoConfig.domain + data.meta.cover : undefined,
			ogParams: {
				type: 'article',
				subtitle: data.meta.description,
				author,
				date: data.meta.date,
				readTime
			},
			jsonLd: {
				type: 'Article',
				data: {
					headline: data.meta.title,
					description: data.meta.description,
					datePublished: data.meta.date,
					image: data.meta.cover ? seoConfig.domain + data.meta.cover : undefined,
					author: { type: 'Person', name: author },
					publisher: { name: seoConfig.siteName, url: seoConfig.domain }
				}
			}
		})
	);
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="article-wrap">
	<a class="back" href={localizeHref('/blog')}>{t('blog.allPosts')}</a>

	<article>
		<header class="post-header">
			<div class="meta">
				<time datetime={data.meta.date}>{formatDate(new Date(data.meta.date))}</time>
				<span class="dot">·</span>
				<span>{readTime}</span>
				<span class="dot">·</span>
				<span>{author}</span>
			</div>
			<h1>{data.meta.title}</h1>
			<p class="lede">{data.meta.description}</p>
		</header>

		<Prose>
			<Content />
		</Prose>
	</article>

	{#if adjacent.newer || adjacent.older}
		<nav class="pager" aria-label={t('blog.title')}>
			{#if adjacent.older}
				<a class="pager-link" href={localizeHref(`/blog/${adjacent.older.slug}`)}>
					<span class="dir">{t('blog.older')}</span>
					<span class="ttl">{adjacent.older.meta.title}</span>
				</a>
			{:else}
				<span></span>
			{/if}
			{#if adjacent.newer}
				<a class="pager-link right" href={localizeHref(`/blog/${adjacent.newer.slug}`)}>
					<span class="dir">{t('blog.newer')}</span>
					<span class="ttl">{adjacent.newer.meta.title}</span>
				</a>
			{/if}
		</nav>
	{/if}
</main>

<PageFooter />

<style>
	.article-wrap {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-10) var(--space-6) 0;
	}
	.back {
		display: inline-block;
		margin-bottom: var(--space-7);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}
	.back:hover {
		color: var(--fg-base);
	}
	.post-header {
		margin-bottom: var(--space-8);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}
	.post-header h1 {
		margin: var(--space-3) 0;
		font-size: var(--text-5xl);
		line-height: var(--leading-tight);
		font-weight: var(--weight-bold);
		letter-spacing: -0.03em;
		color: var(--fg-base);
	}
	.lede {
		font-size: var(--text-xl);
		line-height: var(--leading-relaxed);
		color: var(--fg-muted);
	}
	.pager {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
		margin: var(--space-12) 0 0;
		padding-top: var(--space-8);
		border-top: 1px solid var(--border-base);
	}
	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		background: var(--bg-elevated);
		text-decoration: none;
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}
	.pager-link:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}
	.pager-link.right {
		text-align: right;
	}
	.pager-link .dir {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.pager-link .ttl {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	@media (max-width: 560px) {
		.post-header h1 {
			font-size: var(--text-4xl);
		}
		.lede {
			font-size: var(--text-lg);
		}
		.pager {
			grid-template-columns: 1fr;
		}
		.pager-link.right {
			text-align: left;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pager-link {
			transition: none;
		}
		.pager-link:hover {
			transform: none;
		}
	}
</style>
