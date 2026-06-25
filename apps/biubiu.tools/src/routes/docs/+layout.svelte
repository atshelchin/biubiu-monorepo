<script lang="ts">
	import { page } from '$app/state';
	import { t, localizeHref } from '$lib/i18n';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { DOCS_INDEX_SLUG, docHref, sidebar } from '$lib/content/sidebar';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let menuOpen = $state(false);

	function isActive(slug: string) {
		const target = docHref(slug);
		// Compare against the de-prefixed pathname so /zh/docs/x also matches.
		const path = page.url.pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '');
		return (path || '/') === target;
	}
</script>

<PageHeader />

<div class="docs">
	<button class="sidebar-toggle" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}>
		<span class="bars" aria-hidden="true"></span>
		{menuOpen ? t('docs.hide') : t('docs.browse')}
	</button>

	<aside class="sidebar" class:open={menuOpen}>
		<nav aria-label={t('docs.navLabel')}>
			{#each sidebar as group (group.title)}
				<div class="group">
					<p class="group-title">{group.title}</p>
					<ul>
						{#each group.items as item (item.slug)}
							<li>
								<a
									href={localizeHref(docHref(item.slug))}
									class:active={isActive(item.slug)}
									aria-current={isActive(item.slug) ? 'page' : undefined}
									onclick={() => (menuOpen = false)}
								>
									{item.title}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</aside>

	<div class="content">
		{@render children()}
	</div>
</div>

<PageFooter />

<style>
	.docs {
		--header-h: 64px;
		--sidebar-w: 240px;
		--toc-w: 220px;
		max-width: 1180px;
		margin: 0 auto;
		padding: 0 var(--space-6);
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}
	.sidebar {
		position: sticky;
		top: var(--header-h);
		align-self: start;
		max-height: calc(100vh - var(--header-h));
		overflow-y: auto;
		padding: var(--space-8) 0 var(--space-12);
	}
	.group {
		margin-bottom: var(--space-6);
	}
	.group-title {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-subtle);
		font-weight: var(--weight-semibold);
		margin-bottom: var(--space-2);
	}
	.group ul {
		list-style: none;
	}
	.group li a {
		display: block;
		padding: 6px 12px;
		margin: 1px 0;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		transition:
			color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	.group li a:hover {
		color: var(--fg-base);
		background: var(--bg-raised);
	}
	.group li a.active {
		color: var(--accent);
		background: var(--accent-muted);
		font-weight: var(--weight-medium);
	}
	.content {
		min-width: 0;
		padding: var(--space-8) 0 0;
	}

	.sidebar-toggle {
		display: none;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-5) 0 0;
		padding: 9px 16px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}
	.sidebar-toggle .bars {
		width: 16px;
		height: 10px;
		border-top: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		position: relative;
	}
	.sidebar-toggle .bars::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 0;
		right: 0;
		height: 2px;
		background: currentColor;
	}

	@media (max-width: 860px) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}
		.sidebar-toggle {
			display: inline-flex;
		}
		.sidebar {
			position: static;
			max-height: none;
			overflow: visible;
			padding: var(--space-4) 0 var(--space-2);
			margin-bottom: var(--space-2);
			border-bottom: 1px solid var(--border-base);
			display: none;
		}
		.sidebar.open {
			display: block;
		}
		.content {
			padding-top: var(--space-4);
		}
	}
</style>
