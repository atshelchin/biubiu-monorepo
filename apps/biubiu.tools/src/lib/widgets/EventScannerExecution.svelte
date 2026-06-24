<script lang="ts">
	import { t } from '$lib/i18n';
	import { ChevronDown, ChevronRight, TriangleAlert } from '@lucide/svelte';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';
	import type { LogEntry, ProgressState } from '$lib/pda-apps/event-scanner/modules/execution.js';

	let { progress, logs }: { progress: ProgressState; logs: LogEntry[] } = $props();

	// Before the first chunk lands we have no real percentage — show an
	// indeterminate bar + a reassuring line so it never looks frozen.
	const preparing = $derived(progress.percent <= 0);
	const label = $derived(
		preparing
			? t('es.exec.preparing')
			: t('es.exec.progress', {
					current: progress.current,
					total: progress.total,
					percent: progress.percent
				})
	);
	const warnings = $derived(
		logs.filter((l) => l.level === 'warning' || l.level === 'error').length
	);

	let showLog = $state(false);
</script>

<section class="card">
	<ProgressBar percent={progress.percent} {label} indeterminate={preparing} />

	{#if preparing}
		<p class="prep-hint">{t('es.exec.preparingHint')}</p>
	{/if}

	{#if warnings > 0}
		<p class="warn-note">
			<TriangleAlert size={14} />{t('es.exec.logWarnings', { count: warnings })}
		</p>
	{/if}

	{#if logs.length > 0}
		<div class="log-feed">
			<button class="log-toggle" onclick={() => (showLog = !showLog)} aria-expanded={showLog}>
				{#if showLog}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
				{showLog ? t('es.exec.hideLog') : t('es.exec.showLog')}
			</button>
			{#if showLog}
				<div class="log-entries">
					{#each logs.slice(-50) as log (log.timestamp + log.message)}
						<div class="log-entry log-{log.level}">
							<span class="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
							<span class="log-message">{log.message}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.prep-hint {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
	}
	.warn-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--warning);
		margin: 0;
	}
	.warn-note :global(svg) {
		flex: 0 0 auto;
	}
	.log-feed {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.log-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		align-self: flex-start;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.log-toggle:hover {
		color: var(--fg-muted);
	}
	.log-entries {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 200px;
		overflow-y: auto;
		padding: var(--space-2);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.log-entry {
		display: flex;
		gap: var(--space-2);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.log-time {
		color: var(--fg-faint);
		flex: 0 0 auto;
	}
	.log-message {
		color: var(--fg-muted);
		word-break: break-word;
	}
	.log-warning .log-message {
		color: var(--warning);
	}
	.log-error .log-message {
		color: var(--error);
	}
</style>
