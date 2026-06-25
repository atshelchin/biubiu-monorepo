<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'tip' | 'info' | 'warning' | 'danger';

	let {
		type = 'info',
		title,
		children
	}: { type?: Variant; title?: string; children: Snippet } = $props();

	const defaults: Record<Variant, string> = {
		tip: 'Tip',
		info: 'Note',
		warning: 'Warning',
		danger: 'Caution'
	};
</script>

<aside class="callout {type}">
	<p class="title">{title ?? defaults[type]}</p>
	<div class="body">
		{@render children()}
	</div>
</aside>

<style>
	.callout {
		margin: 1.5em 0;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		border-left-width: 3px;
		background: var(--bg-raised);
	}
	.title {
		margin: 0 0 4px;
		font-weight: var(--weight-semibold);
		font-size: var(--text-sm);
		letter-spacing: 0.01em;
	}
	.body :global(p) {
		margin: 0 0 0.6em;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.body :global(p:last-child) {
		margin-bottom: 0;
	}

	.tip {
		border-left-color: var(--success);
		background: var(--success-subtle, var(--bg-raised));
	}
	.tip .title {
		color: var(--success);
	}
	.info {
		border-left-color: var(--info);
		background: var(--info-subtle, var(--bg-raised));
	}
	.info .title {
		color: var(--info);
	}
	.warning {
		border-left-color: var(--warning);
		background: var(--warning-subtle, var(--bg-raised));
	}
	.warning .title {
		color: var(--warning);
	}
	.danger {
		border-left-color: var(--error);
		background: var(--error-subtle, var(--bg-raised));
	}
	.danger .title {
		color: var(--error);
	}
</style>
