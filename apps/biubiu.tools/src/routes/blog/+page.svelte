<script lang="ts">
	import { t, locale, localizeHref, formatDate } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { Rss } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const seoProps = $derived(
		getBaseSEO({
			title: t('blog.meta.title'),
			description: t('blog.meta.description'),
			currentLocale: locale.value
		})
	);
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="wrap">
	<header class="intro">
		<h1>{t('blog.title')}</h1>
		<p>{t('blog.subtitle')}</p>
		<a class="rss" href="/blog/rss.xml" data-sveltekit-reload>
			<Rss size={14} aria-hidden="true" />
			{t('blog.rss')}
		</a>
	</header>

	{#if data.posts.length === 0}
		<p class="empty">{t('blog.empty')}</p>
	{:else}
		<ul class="posts">
			{#each data.posts as post (post.slug)}
				<li>
					<a class="card" href={localizeHref(`/blog/${post.slug}`)}>
						<div class="meta">
							<time datetime={post.meta.date}>{formatDate(new Date(post.meta.date))}</time>
							<span class="dot">·</span>
							<span>{t('blog.minRead', { min: String(post.readingMinutes) })}</span>
						</div>
						<h2>{post.meta.title}</h2>
						<p class="excerpt">{post.meta.description}</p>
						{#if post.meta.tags?.length}
							<div class="tags">
								{#each post.meta.tags as tag (tag)}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
						<span class="read">{t('blog.readPost')}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<PageFooter />

<style>
	.wrap {
		max-width: 820px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-6) 0;
	}
	.intro {
		margin-bottom: var(--space-10);
	}
	.intro h1 {
		font-size: var(--text-5xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.03em;
		color: var(--fg-base);
	}
	.intro p {
		margin-top: var(--space-3);
		color: var(--fg-muted);
		font-size: var(--text-xl);
	}
	.rss {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		border-bottom: 1px solid var(--border-base);
		padding-bottom: 1px;
		transition:
			color var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing);
	}
	.rss:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.posts {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.card {
		display: block;
		padding: var(--space-6);
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
	.card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.card h2 {
		margin: var(--space-2) 0;
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
		color: var(--fg-base);
	}
	.excerpt {
		color: var(--fg-muted);
		font-size: var(--text-md);
		line-height: var(--leading-relaxed);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: var(--space-3);
	}
	.tag {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		padding: 2px 10px;
	}
	.read {
		display: inline-block;
		margin-top: var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--accent);
	}
	.empty {
		color: var(--fg-muted);
	}

	@media (max-width: 560px) {
		.intro h1 {
			font-size: var(--text-4xl);
		}
		.card {
			padding: var(--space-5);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
		.card:hover {
			transform: none;
		}
	}
</style>
