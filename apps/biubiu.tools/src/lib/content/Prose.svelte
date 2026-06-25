<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="prose">
	{@render children()}
</div>

<style>
	.prose {
		color: var(--fg-base);
		font-size: var(--text-md);
		line-height: var(--leading-relaxed);
		word-wrap: break-word;
	}

	/* Headings */
	.prose :global(h1) {
		font-size: var(--text-4xl);
		line-height: var(--leading-tight);
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
		margin: 0 0 0.6em;
		color: var(--fg-base);
	}
	.prose :global(h2) {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.01em;
		margin: 2.2em 0 0.7em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--border-base);
		color: var(--fg-base);
	}
	.prose :global(h3) {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: 1.8em 0 0.5em;
		color: var(--fg-base);
	}
	.prose :global(h4) {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		margin: 1.5em 0 0.4em;
		color: var(--fg-base);
	}
	.prose :global(h2:first-child),
	.prose :global(h3:first-child) {
		margin-top: 0;
	}
	/* Anchorable headings: keep clear of the sticky header when jumped to. */
	.prose :global(h2),
	.prose :global(h3),
	.prose :global(h4) {
		scroll-margin-top: calc(var(--header-h, 64px) + var(--space-4));
	}

	/* Text */
	.prose :global(p) {
		margin: 0 0 1.15em;
	}
	.prose :global(a) {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.prose :global(a:hover) {
		border-bottom-color: var(--accent);
	}
	.prose :global(strong) {
		color: var(--fg-base);
		font-weight: var(--weight-semibold);
	}
	.prose :global(small) {
		color: var(--fg-muted);
		font-size: 0.85em;
	}

	/* Lists */
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 1.15em;
		padding-left: 1.4em;
	}
	.prose :global(li) {
		margin: 0.35em 0;
	}
	.prose :global(li::marker) {
		color: var(--fg-subtle);
	}

	/* Quote */
	.prose :global(blockquote) {
		margin: 1.5em 0;
		padding: 0.2em 1.1em;
		border-left: 3px solid var(--accent);
		color: var(--fg-muted);
		font-style: italic;
	}
	.prose :global(blockquote p) {
		margin: 0.4em 0;
	}

	/* Inline code */
	.prose :global(:not(pre) > code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		padding: 0.12em 0.4em;
		color: var(--accent);
	}

	/* Code blocks (Shiki output — carries its own inline background) */
	.prose :global(pre) {
		margin: 1.4em 0;
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-base);
		overflow-x: auto;
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		-webkit-overflow-scrolling: touch;
	}
	.prose :global(pre code) {
		font-family: var(--font-mono);
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		color: inherit;
	}
	.prose :global(pre .line) {
		display: inline-block;
		width: 100%;
	}

	/* Media */
	.prose :global(img),
	.prose :global(video) {
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-base);
		margin: 1.4em 0;
	}

	/* Tables */
	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 1.5em 0;
		font-size: var(--text-sm);
		display: block;
		overflow-x: auto;
	}
	.prose :global(th),
	.prose :global(td) {
		border: 1px solid var(--border-base);
		padding: 9px 13px;
		text-align: left;
	}
	.prose :global(th) {
		background: var(--bg-raised);
		font-weight: var(--weight-semibold);
	}

	/* Rule */
	.prose :global(hr) {
		border: none;
		border-top: 1px solid var(--border-base);
		margin: 2.4em 0;
	}

	/* Keyboard */
	.prose :global(kbd) {
		font-family: var(--font-mono);
		font-size: 0.8em;
		background: var(--bg-raised);
		border: 1px solid var(--border-strong);
		border-bottom-width: 2px;
		border-radius: var(--radius-sm);
		padding: 0.1em 0.45em;
	}
</style>
