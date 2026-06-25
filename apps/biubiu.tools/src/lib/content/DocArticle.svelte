<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t, localizeHref } from '$lib/i18n';
	import { getAdjacentDocs, getDocEditUrl } from './docs';
	import { docHref } from './sidebar';
	import { Pencil } from '@lucide/svelte';
	import Prose from './Prose.svelte';
	import Toc from './Toc.svelte';

	let { slug, children }: { slug: string; children: Snippet } = $props();

	const adjacent = $derived(getAdjacentDocs(slug));
	const editUrl = $derived(getDocEditUrl(slug));
</script>

<div class="doc-layout">
	<article class="doc-body">
		<Prose>
			{@render children()}
		</Prose>

		<div class="doc-edit">
			<a href={editUrl} target="_blank" rel="noopener">
				<Pencil size={15} aria-hidden="true" />
				{t('docs.editOnGitHub')}
			</a>
		</div>

		{#if adjacent.prev || adjacent.next}
			<nav class="pager" aria-label={t('docs.navLabel')}>
				{#if adjacent.prev}
					<a class="pager-link" href={localizeHref(docHref(adjacent.prev.slug))}>
						<span class="dir">← {t('docs.previous')}</span>
						<span class="t">{adjacent.prev.title}</span>
					</a>
				{:else}
					<span></span>
				{/if}
				{#if adjacent.next}
					<a class="pager-link right" href={localizeHref(docHref(adjacent.next.slug))}>
						<span class="dir">{t('docs.next')} →</span>
						<span class="t">{adjacent.next.title}</span>
					</a>
				{/if}
			</nav>
		{/if}
	</article>

	<aside class="doc-toc">
		<Toc containerSelector=".doc-body" />
	</aside>
</div>

<style>
	.doc-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--toc-w, 220px);
		gap: var(--space-6);
		align-items: start;
	}
	.doc-body {
		min-width: 0;
		padding: var(--space-2) 0 var(--space-6);
	}
	.doc-edit {
		margin-top: var(--space-10);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border-base);
	}
	.doc-edit a {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}
	.doc-edit a:hover {
		color: var(--accent);
	}
	.pager {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
		margin-top: var(--space-6);
	}
	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 5px;
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
	.pager-link .t {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.doc-toc {
		display: block;
	}

	@media (max-width: 1024px) {
		.doc-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.doc-toc {
			display: none;
		}
	}
	@media (max-width: 560px) {
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
