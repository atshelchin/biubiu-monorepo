<script lang="ts">
	import { t } from '$lib/i18n';
	import { browser } from '$app/environment';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		destructive?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		title,
		message,
		confirmText,
		cancelText,
		destructive = false,
		onConfirm,
		onCancel
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) onCancel();
	}

	$effect(() => {
		if (browser) {
			document.body.style.overflow = open ? 'hidden' : '';
			return () => { document.body.style.overflow = ''; };
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="confirm-backdrop" onclick={onCancel} role="presentation"></div>
	<div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
		<h3 id="confirm-title" class="confirm-title">{title}</h3>
		<p class="confirm-message">{message}</p>
		<div class="confirm-actions">
			<button class="confirm-btn cancel" onclick={onCancel}>
				{cancelText ?? t('common.cancel')}
			</button>
			<button
				class="confirm-btn confirm"
				class:destructive
				onclick={onConfirm}
			>
				{confirmText ?? t('common.confirm')}
			</button>
		</div>
	</div>
{/if}

<style>
	.confirm-backdrop {
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

	.confirm-panel {
		position: fixed;
		z-index: calc(var(--z-modal) + 1);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl);
		padding: var(--space-5);
		animation: scaleIn var(--motion-normal) var(--easing);
	}

	@media (min-width: 769px) {
		.confirm-panel {
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 90%;
			max-width: 360px;
		}

		@keyframes scaleIn {
			from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
			to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
		}
	}

	@media (max-width: 768px) {
		.confirm-panel {
			bottom: 0;
			left: 0;
			right: 0;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			animation: slideUp var(--motion-normal) var(--easing);
		}

		@keyframes slideUp {
			from { opacity: 0; transform: translateY(100%); }
			to { opacity: 1; transform: translateY(0); }
		}
	}

	.confirm-title {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.confirm-message {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0 0 var(--space-5);
	}

	.confirm-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
	}

	.confirm-btn {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.confirm-btn.cancel {
		background: var(--bg-raised);
		color: var(--fg-muted);
		border: 1px solid var(--border-base);
	}

	.confirm-btn.cancel:hover {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}

	.confirm-btn.confirm {
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
	}

	.confirm-btn.confirm:hover {
		background: var(--accent-hover);
	}

	.confirm-btn.confirm.destructive {
		background: var(--error);
	}

	.confirm-btn.confirm.destructive:hover {
		filter: brightness(1.1);
	}

	@media (prefers-reduced-motion: reduce) {
		.confirm-backdrop,
		.confirm-panel {
			animation: none;
		}
	}
</style>
