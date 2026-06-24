<!-- Rolling JSON log of every action — the Sequence "Output" box, refined. -->
<script lang="ts">
	import { t, formatRelativeTime } from '$lib/i18n';
	import { debug } from './debug-store.svelte.js';
	import { safeJson } from './helpers.js';
	import Panel from './Panel.svelte';
	import Btn from './Btn.svelte';
	import CopyButton from './CopyButton.svelte';
	import { Terminal } from '@lucide/svelte';

	const all = $derived(safeJson(debug.log));
</script>

<Panel title={t('wd.console.title')} description={t('wd.console.desc')} icon={Terminal}>
	{#snippet actions()}
		{#if debug.log.length > 0}
			<CopyButton value={all} title={t('wd.console.copyAll')} />
			<Btn size="sm" variant="ghost" onclick={() => debug.clear()}>{t('wd.console.clear')}</Btn>
		{/if}
	{/snippet}

	{#if debug.log.length === 0}
		<p class="empty">{t('wd.console.empty')}</p>
	{:else}
		<ul class="log">
			{#each debug.log as entry (entry.id)}
				<li class="entry">
					<div class="entry-head">
						<span class="badge" class:ok={entry.ok} class:fail={!entry.ok}>
							{entry.ok ? '✓' : '✕'}
						</span>
						<span class="action">{entry.action}</span>
						<span class="time">{formatRelativeTime(entry.ts)}</span>
						<CopyButton value={safeJson(entry.data)} />
					</div>
					<pre class="payload">{safeJson(entry.data)}</pre>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>

<style>
	.empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-height: 60vh;
		overflow-y: auto;
	}
	.entry {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.entry-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		font-size: 9px;
		font-weight: var(--weight-bold);
		flex: none;
	}
	.badge.ok {
		background: var(--success-muted);
		color: var(--success);
	}
	.badge.fail {
		background: var(--error-muted);
		color: var(--error);
	}
	.action {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.time {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.payload {
		margin: 0;
		padding: var(--space-3);
		background: var(--bg-sunken);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: var(--leading-snug);
		color: var(--fg-muted);
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
