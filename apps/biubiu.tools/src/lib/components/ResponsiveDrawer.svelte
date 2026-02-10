<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		title?: string;
		children: Snippet;
	}

	let { open, onClose, title, children }: Props = $props();

	// Close on escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			onClose();
		}
	}

	// Prevent body scroll when drawer is open
	$effect(() => {
		if (browser) {
			if (open) {
				document.body.style.overflow = 'hidden';
			} else {
				document.body.style.overflow = '';
			}
			return () => {
				document.body.style.overflow = '';
			};
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div class="drawer-backdrop" onclick={onClose} role="presentation"></div>

	<!-- Drawer Panel -->
	<div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby={title ? 'drawer-title' : undefined}>
		<!-- Header -->
		<div class="drawer-header">
			{#if title}
				<h2 id="drawer-title" class="drawer-title">{title}</h2>
			{:else}
				<div></div>
			{/if}
			<button class="drawer-close" onclick={onClose} aria-label="Close">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="drawer-content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	/* Backdrop */
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		background: var(--bg-overlay);
		backdrop-filter: blur(var(--blur-sm));
		z-index: var(--z-modal);
		animation: fadeIn var(--motion-fast) var(--easing);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	/* Drawer Panel */
	.drawer-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 320px;
		max-width: 85vw;
		z-index: calc(var(--z-modal) + 1);
		background: var(--bg-elevated);
		border-left: 1px solid var(--border-base);
		display: flex;
		flex-direction: column;
		animation: slideIn var(--motion-normal) var(--easing);
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(100%);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Header */
	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}

	.drawer-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.drawer-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-close:hover {
		background: var(--bg-raised);
		color: var(--fg-base);
	}

	/* Content */
	.drawer-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
	}

	/* Reduced Motion */
	@media (prefers-reduced-motion: reduce) {
		.drawer-backdrop,
		.drawer-panel {
			animation: none;
		}
	}
</style>
