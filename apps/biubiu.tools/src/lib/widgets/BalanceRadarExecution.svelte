<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';
	import type { ProgressState, LogEntry } from '$lib/pda-apps/balance-radar/modules/execution.js';

	let {
		progress,
		logs,
		stopping = false,
		onStop,
	}: {
		progress: ProgressState;
		logs: LogEntry[];
		stopping?: boolean;
		onStop?: () => void;
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

	// Live elapsed + ETA. We tick once a second; ETA is a linear projection from
	// completed/total, which is good enough to set expectations on a long run.
	let startedAt = 0;
	let now = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		startedAt = Date.now();
		now = startedAt;
		timer = setInterval(() => (now = Date.now()), 1000);
	});
	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	function fmt(ms: number): string {
		const s = Math.max(0, Math.round(ms / 1000));
		if (s < 60) return `${s}s`;
		const m = Math.floor(s / 60);
		const rem = s % 60;
		if (m < 60) return `${m}m ${rem}s`;
		const h = Math.floor(m / 60);
		return `${h}h ${m % 60}m`;
	}

	const elapsedMs = $derived(now && startedAt ? now - startedAt : 0);
	const etaMs = $derived(
		progress.current > 0 && progress.total > progress.current
			? (elapsedMs / progress.current) * (progress.total - progress.current)
			: 0,
	);
</script>

<section class="card">
	<div class="exec-header">
		<ProgressBar percent={progress.percent} label={progressLabel} status={progress.status} />
		{#if onStop}
			<button class="stop-btn" onclick={onStop} disabled={stopping}>
				{stopping ? t('br.execution.stopping') : t('br.execution.stop')}
			</button>
		{/if}
	</div>

	<div class="timing">
		<span>{t('br.execution.elapsed', { time: fmt(elapsedMs) })}</span>
		{#if etaMs > 0}
			<span class="dot">·</span>
			<span>{t('br.execution.eta', { time: fmt(etaMs) })}</span>
		{/if}
	</div>

	{#if logs.length > 0}
		<div class="log-feed">
			<h3 class="log-title">{t('br.logs.title')}</h3>
			<div class="log-entries">
				{#each logs as log, i (i)}
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
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
	}

	.exec-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
	}

	.exec-header :global(.progress-container) {
		flex: 1;
		min-width: 0;
	}

	.stop-btn {
		flex-shrink: 0;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--error);
		background: var(--error-subtle);
		border: 1px solid var(--error);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.stop-btn:not(:disabled):hover {
		background: var(--error);
		color: var(--fg-inverse, #fff);
	}

	.stop-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.stop-btn:focus-visible {
		outline: 2px solid var(--error);
		outline-offset: 2px;
	}

	.timing {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.dot {
		color: var(--fg-faint);
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
