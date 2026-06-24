<!--
  Centered status card shared by the chat's full-screen states
  (preparing, securing, invite, ended, error). One layout → consistent look.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Spinner from './Spinner.svelte';

	interface Props {
		/** Show a spinner instead of an icon (busy states). */
		loading?: boolean;
		/** Emoji/glyph shown when not loading. */
		icon?: string;
		tone?: 'neutral' | 'error';
		title: string;
		description?: string;
		/** Optional action area (buttons). */
		action?: Snippet;
	}

	let { loading = false, icon, tone = 'neutral', title, description, action }: Props = $props();
</script>

<section class="status-view">
	{#if loading}
		<Spinner />
	{:else if icon}
		<div class="mark" class:error={tone === 'error'}>{icon}</div>
	{/if}
	<h2>{title}</h2>
	{#if description}<p>{description}</p>{/if}
	{#if action}<div class="action">{@render action()}</div>{/if}
</section>

<style>
	.status-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		max-width: 460px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-6);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
	}

	.mark {
		font-size: var(--text-4xl);
		line-height: 1;
	}
	.mark.error {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: var(--error-muted);
		color: var(--error);
		font-weight: var(--weight-bold);
		font-size: var(--text-2xl);
	}

	h2 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		max-width: 420px;
	}
	.action {
		margin-top: var(--space-2);
		display: flex;
		gap: var(--space-2);
	}
</style>
