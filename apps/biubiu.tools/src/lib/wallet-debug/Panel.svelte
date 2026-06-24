<!--
  Shared card chrome for Wallet Lab panels. Token-driven, theme-correct.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Component } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		icon?: Component;
		/** Right-aligned header actions (buttons, status chips…). */
		actions?: Snippet;
		children: Snippet;
	}

	let { title, description, icon: Icon, actions, children }: Props = $props();
</script>

<section class="panel">
	<header class="panel-head">
		<div class="panel-title">
			{#if Icon}
				<span class="panel-icon"><Icon size={16} /></span>
			{/if}
			<div class="panel-text">
				<h2>{title}</h2>
				{#if description}<p>{description}</p>{/if}
			</div>
		</div>
		{#if actions}
			<div class="panel-actions">{@render actions()}</div>
		{/if}
	</header>
	<div class="panel-body">
		{@render children()}
	</div>
</section>

<style>
	.panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}
	.panel-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.panel-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		flex: none;
		border-radius: var(--radius-md);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.panel-text {
		min-width: 0;
	}
	.panel-text h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		letter-spacing: -0.01em;
	}
	.panel-text p {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	.panel-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
	}
	.panel-body {
		padding: var(--space-5);
	}
</style>
