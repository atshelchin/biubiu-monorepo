<script lang="ts">
	import { t } from '$lib/i18n';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';
	import type { ProgressState, LogEntry } from '$lib/pda-apps/balance-radar/modules/execution.js';

	let {
		progress,
		logs,
	}: {
		progress: ProgressState;
		logs: LogEntry[];
	} = $props();

	const progressLabel = $derived(
		progress.percent > 0
			? t('br.execution.progress', {
					current: progress.current,
					total: progress.total,
					percent: progress.percent,
				})
			: t('br.execution.preparing'),
	);
</script>

<section class="card">
	<ProgressBar percent={progress.percent} label={progressLabel} status={progress.status} />

	{#if logs.length > 0}
		<div class="log-feed">
			<h3 class="log-title">{t('br.logs.title')}</h3>
			<div class="log-entries">
				{#each logs as log}
					<div class="log-entry log-{log.level}">
						<span class="log-time">
							{new Date(log.timestamp).toLocaleTimeString()}
						</span>
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
	}

	/* Log Feed */
	.log-feed {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-4);
		margin-top: var(--space-4);
	}

	.log-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		margin: 0 0 var(--space-2);
	}

	.log-entries {
		max-height: 200px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.log-entry {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: var(--leading-normal);
		border-left: 2px solid var(--border-subtle);
	}

	.log-info {
		border-left-color: var(--info);
	}

	.log-warning {
		border-left-color: var(--warning);
	}

	.log-error {
		border-left-color: var(--error);
	}

	.log-time {
		color: var(--fg-subtle);
		white-space: nowrap;
	}

	.log-message {
		color: var(--fg-muted);
		word-break: break-word;
	}

	@media (max-width: 640px) {
		.card {
			padding: var(--space-4);
		}
	}
</style>
