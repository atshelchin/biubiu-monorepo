<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	let { containerSelector = '.doc-body' }: { containerSelector?: string } = $props();

	type Heading = { id: string; text: string; level: number };

	let headings = $state<Heading[]>([]);
	let activeId = $state('');

	onMount(() => {
		const container = document.querySelector(containerSelector);
		if (!container) return;

		const els = Array.from(container.querySelectorAll('h2, h3')).filter(
			(el): el is HTMLElement => el instanceof HTMLElement && !!el.id
		);

		headings = els.map((el) => ({
			id: el.id,
			text: el.textContent?.trim() ?? '',
			level: el.tagName === 'H2' ? 2 : 3
		}));

		if (els.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) activeId = entry.target.id;
				}
			},
			{ rootMargin: '-80px 0px -70% 0px', threshold: 0 }
		);
		for (const el of els) observer.observe(el);

		return () => observer.disconnect();
	});
</script>

{#if headings.length > 1}
	<nav class="toc" aria-label={t('docs.onThisPage')}>
		<p class="toc-title">{t('docs.onThisPage')}</p>
		<ul>
			{#each headings as h (h.id)}
				<li class:sub={h.level === 3}>
					<a href={`#${h.id}`} class:active={activeId === h.id}>{h.text}</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	.toc {
		position: sticky;
		top: calc(var(--header-h, 64px) + var(--space-7, 28px));
		font-size: var(--text-sm);
	}
	.toc-title {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-subtle);
		font-weight: var(--weight-semibold);
		margin-bottom: var(--space-3);
	}
	ul {
		list-style: none;
		border-left: 1px solid var(--border-base);
	}
	li {
		margin: 0;
	}
	li a {
		display: block;
		padding: 5px 0 5px 14px;
		margin-left: -1px;
		border-left: 1px solid transparent;
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		transition: color var(--motion-fast) var(--easing);
	}
	li.sub a {
		padding-left: 28px;
		font-size: var(--text-xs);
	}
	li a:hover {
		color: var(--fg-base);
	}
	li a.active {
		color: var(--accent);
		border-left-color: var(--accent);
	}
</style>
