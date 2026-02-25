<script lang="ts" module>
	let baseZIndex = 1000;
	let currentZIndex = baseZIndex;

	export function getNextZIndex(): number {
		currentZIndex += 10;
		return currentZIndex;
	}
</script>

<script lang="ts">
	import { X } from '@lucide/svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		title?: string;
		maxWidth?: string;
		height?: string;
		closeOnOverlayClick?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}

	let {
		open = false,
		onClose,
		title,
		maxWidth = '400px',
		height = 'fit-content',
		closeOnOverlayClick = true,
		children,
		footer
	}: Props = $props();

	function handleOverlayClick() {
		if (closeOnOverlayClick) {
			onClose();
		}
	}

	let zIndex = $state(baseZIndex);

	// Prevent body scroll when modal is open
	$effect(() => {
		if (typeof window === 'undefined') return;

		if (open) {
			// Get next z-index when modal opens to ensure it's on top
			zIndex = getNextZIndex();

			const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
			document.body.style.overflow = 'hidden';
			document.body.style.paddingRight = `${scrollbarWidth}px`;
		} else {
			document.body.style.overflow = '';
			document.body.style.paddingRight = '';
		}

		return () => {
			document.body.style.overflow = '';
			document.body.style.paddingRight = '';
		};
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pe-modal-overlay" style="z-index: {zIndex}" onclick={handleOverlayClick}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="pe-modal-content"
			style="max-width: {maxWidth}; height: {height}"
			onclick={(e) => e.stopPropagation()}
		>
			{#if title}
				<div class="pe-modal-header">
					<h3>{title}</h3>
					<button class="pe-close-button" onclick={onClose} type="button">
						<X size={20} />
					</button>
				</div>
			{/if}
			<div class="pe-modal-body">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="pe-modal-footer">
					{@render footer?.()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.pe-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(4px);
	}

	.pe-modal-content {
		background: var(--pe-bg2, #161b22);
		border-radius: 12px;
		padding: 24px;
		width: 90%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		border: 1px solid var(--pe-border, #30363d);
	}

	.pe-modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		flex-shrink: 0;
	}

	.pe-modal-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--pe-text, #e6edf3);
	}

	.pe-close-button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--pe-muted, #8b949e);
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.pe-close-button:hover {
		background: var(--pe-bg3, #21262d);
		color: var(--pe-text, #e6edf3);
	}

	.pe-modal-body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.pe-modal-footer {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--pe-border, #30363d);
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.pe-modal-content {
			width: 95%;
			padding: 16px;
		}
	}
</style>
