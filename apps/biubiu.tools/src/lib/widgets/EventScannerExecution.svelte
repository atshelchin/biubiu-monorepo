<script lang="ts">
	import { t } from '$lib/i18n';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';
	import type { LogEntry, ProgressState } from '$lib/pda-apps/event-scanner/modules/execution.js';

	let { progress, logs }: { progress: ProgressState; logs: LogEntry[] } = $props();

	const label = $derived(
		progress.percent > 0
			? t('es.exec.progress', { current: progress.current, total: progress.total, percent: progress.percent })
			: t('es.exec.preparing'),
	);
</script>

<section class="card">
	<ProgressBar percent={progress.percent} {label} status={progress.status} />

	{#if logs.length > 0}
		<div class="log-feed">
			<h3 class="log-title">{t('es.exec.activity')}</h3>
			<div class="log-entries">
				{#each logs.slice(-50) as log (log.timestamp + log.message)}
					<div class="log-entry log-{log.level}">
						<span class="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
						<span class="log-message">{log.message}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.log-feed {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.log-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		margin: 0;
	}
	.log-entries {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 200px;
		overflow-y: auto;
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
