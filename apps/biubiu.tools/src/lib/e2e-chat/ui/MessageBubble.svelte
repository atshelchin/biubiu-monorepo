<!--
  One chat bubble. Mine = accent-tinted, right; theirs = raised bg, left.
  Plaintext lives only in memory (the store); nothing is persisted.
-->
<script lang="ts">
	import type { ChatMessage } from '../store.svelte.js';

	let { message }: { message: ChatMessage } = $props();

	const URL_RE = /(https?:\/\/[^\s]+)/g;

	// Split into text + link parts for safe linkification (no @html).
	const parts = $derived(
		message.text.split(URL_RE).map((chunk) => ({ chunk, isLink: URL_RE.test(chunk) }))
	);

	const time = $derived(
		new Date(message.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
	);
</script>

<div class="row" class:mine={message.dir === 'out'}>
	<div class="bubble" class:mine={message.dir === 'out'}>
		<span class="text">
			{#each parts as part (part.chunk)}
				{#if part.isLink}
					<a href={part.chunk} target="_blank" rel="noopener noreferrer nofollow">{part.chunk}</a>
				{:else}{part.chunk}{/if}
			{/each}
		</span>
		<span class="meta">
			<span class="time">{time}</span>
			{#if message.dir === 'out' && message.status === 'sending'}
				<span class="dot" aria-hidden="true"></span>
			{/if}
		</span>
	</div>
</div>

<style>
	.row {
		display: flex;
		justify-content: flex-start;
	}
	.row.mine {
		justify-content: flex-end;
	}

	.bubble {
		max-width: min(78%, 560px);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		color: var(--fg-base);
		font-size: var(--text-base);
		line-height: var(--leading-normal);
		box-shadow: var(--shadow-sm);
	}
	.bubble.mine {
		background: var(--accent-muted);
		border-color: var(--accent-subtle);
		border-bottom-right-radius: var(--radius-sm);
	}
	.row:not(.mine) .bubble {
		border-bottom-left-radius: var(--radius-sm);
	}

	.text {
		white-space: pre-wrap;
		word-break: break-word;
	}
	.text a {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.time {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--fg-faint);
	}
</style>
