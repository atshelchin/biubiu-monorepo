<script lang="ts">
	import { browser } from '$app/environment';
	import { slide } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Short current-value preview shown on the right when collapsed. */
		summary?: string;
		/** Initial expanded state (toggle mode only). */
		open?: boolean;
		/** Show a small accent dot when collapsed — signals "customised here". */
		marked?: boolean;
		/** Leading icon. */
		icon?: Snippet;
		/** Body content (toggle mode). */
		children?: Snippet;
		/**
		 * When provided the head acts as a navigation row: clicking calls this
		 * instead of toggling, the chevron points right, and no body is rendered.
		 */
		onActivate?: () => void;
	}
	let { title, summary = '', open = false, marked = false, icon, children, onActivate }: Props = $props();

	const isNav = $derived(typeof onActivate === 'function');
	let expanded = $state(open);

	// Honour reduced-motion: collapse the slide to an instant change.
	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const dur = reduced ? 0 : 160;

	function onHeadClick() {
		if (isNav) onActivate?.();
		else expanded = !expanded;
	}
</script>

<section class="disclosure" class:open={expanded && !isNav}>
	<button
		type="button"
		class="disclosure-head"
		aria-expanded={isNav ? undefined : expanded}
		onclick={onHeadClick}
	>
		{#if icon}
			<span class="disclosure-icon">{@render icon()}</span>
		{/if}
		<span class="disclosure-title">{title}</span>
		{#if marked && (isNav || !expanded)}
			<span class="disclosure-dot" aria-hidden="true"></span>
		{/if}
		{#if summary && (isNav || !expanded)}
			<span class="disclosure-summary">{summary}</span>
		{/if}
		<svg
			class="disclosure-chevron"
			class:rot={expanded && !isNav}
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6" />
		</svg>
	</button>

	{#if !isNav && expanded}
		<div class="disclosure-body" transition:slide={{ duration: dur }}>
			{@render children?.()}
		</div>
	{/if}
</section>

<style>
	.disclosure {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--bg-raised);
		overflow: hidden;
	}

	.disclosure-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: none;
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-align: left;
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}

	.disclosure-head:hover {
		background: var(--bg-elevated);
	}

	/* Inset the focus ring: the card clips overflow, so an outer ring (the global
	   default) would bleed through as a hard line between the head and body. */
	.disclosure-head:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: var(--radius-lg);
	}

	.disclosure-icon {
		display: flex;
		flex-shrink: 0;
		color: var(--fg-muted);
	}

	.disclosure-title {
		flex-shrink: 0;
	}

	.disclosure-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--accent);
	}

	.disclosure-summary {
		flex: 1;
		min-width: 0;
		text-align: right;
		font-weight: var(--weight-normal);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.disclosure-chevron {
		flex-shrink: 0;
		margin-left: auto;
		color: var(--fg-faint);
		transition: transform var(--motion-fast) var(--easing);
	}

	/* When a summary takes the flexible space, the chevron no longer needs it. */
	.disclosure-summary ~ .disclosure-chevron {
		margin-left: var(--space-2);
	}

	.disclosure-chevron.rot {
		transform: rotate(90deg);
	}

	.disclosure-body {
		padding: 0 var(--space-4) var(--space-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.disclosure-chevron {
			transition: none;
		}
	}
</style>
