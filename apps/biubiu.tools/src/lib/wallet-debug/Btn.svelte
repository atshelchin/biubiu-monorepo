<!-- Shared button for Wallet Lab. Token-driven; restrained hover (≤1px). -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'default' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		type?: 'button' | 'submit';
		disabled?: boolean;
		loading?: boolean;
		title?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		title,
		onclick,
		children
	}: Props = $props();
</script>

<button
	{type}
	{title}
	class="btn {variant} {size}"
	class:loading
	disabled={disabled || loading}
	{onclick}
>
	{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-family: inherit;
		font-weight: var(--weight-semibold);
		font-size: var(--text-sm);
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	.btn.sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-sm);
	}
	.btn:active:not(:disabled) {
		transform: translateY(0);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		border-color: transparent;
		color: var(--accent-fg, var(--fg-inverse));
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn.ghost {
		background: transparent;
		border-color: transparent;
		color: var(--fg-muted);
	}
	.btn.ghost:hover:not(:disabled) {
		background: var(--bg-raised);
		color: var(--fg-base);
	}
	.btn.danger {
		background: var(--error-muted);
		border-color: transparent;
		color: var(--error);
	}
	.spinner {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.btn,
		.btn:hover:not(:disabled) {
			transform: none;
		}
		.spinner {
			animation-duration: 1.2s;
		}
	}
</style>
