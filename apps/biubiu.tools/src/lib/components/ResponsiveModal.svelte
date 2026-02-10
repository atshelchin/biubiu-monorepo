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

	// Prevent body scroll when modal is open
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
	<div class="modal-backdrop" onclick={onClose} role="presentation"></div>

	<!-- Modal Panel -->
	<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
		<!-- Drag handle for mobile -->
		<div class="modal-handle"></div>

		<!-- Header -->
		{#if title}
			<div class="modal-header">
				<h2 id="modal-title" class="modal-title">{title}</h2>
				<button class="modal-close" onclick={onClose} aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
		{/if}

		<!-- Content -->
		<div class="modal-content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	/* Backdrop */
	.modal-backdrop {
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

	/* Modal Panel - Desktop: centered, Mobile: bottom sheet */
	.modal-panel {
		position: fixed;
		z-index: calc(var(--z-modal) + 1);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Desktop styles */
	@media (min-width: 769px) {
		.modal-panel {
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 90%;
			max-width: 420px;
			max-height: 85vh;
			border-radius: var(--radius-xl);
			box-shadow: var(--shadow-xl);
			animation: scaleIn var(--motion-normal) var(--easing);
		}

		@keyframes scaleIn {
			from {
				opacity: 0;
				transform: translate(-50%, -50%) scale(0.95);
			}
			to {
				opacity: 1;
				transform: translate(-50%, -50%) scale(1);
			}
		}

		.modal-handle {
			display: none;
		}
	}

	/* Mobile styles - Bottom Sheet */
	@media (max-width: 768px) {
		.modal-panel {
			bottom: 0;
			left: 0;
			right: 0;
			max-height: 85vh;
			max-height: 85dvh;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			animation: slideUp var(--motion-normal) var(--easing);
		}

		@keyframes slideUp {
			from {
				opacity: 0;
				transform: translateY(100%);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.modal-handle {
			display: flex;
			justify-content: center;
			padding: var(--space-3) 0 var(--space-1);
		}

		.modal-handle::after {
			content: '';
			width: 36px;
			height: 4px;
			background: var(--fg-faint);
			border-radius: var(--radius-full);
		}
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}

	@media (max-width: 768px) {
		.modal-header {
			padding-top: var(--space-2);
		}
	}

	.modal-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.modal-close:hover {
		background: var(--bg-raised);
		color: var(--fg-base);
	}

	/* Content */
	.modal-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
	}

	/* Reduced Motion */
	@media (prefers-reduced-motion: reduce) {
		.modal-backdrop,
		.modal-panel {
			animation: none;
		}
	}
</style>
