<script lang="ts">
	/**
	 * Collapsible activity log for the Contract Deployer wizard. Renders nothing
	 * until there's something to show, so a first-time user sees only the steps.
	 */
	import { t } from '$lib/i18n';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	/** Turn URLs in a log line into safe, clickable links. */
	function linkify(msg: string): string {
		const escaped = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return escaped.replace(
			/(https?:\/\/[^\s]+)/g,
			'<a href="$1" target="_blank" rel="noopener" class="log-link">$1</a>'
		);
	}

	const latest = $derived(store.logs[0]?.message ?? '');
</script>

{#if store.logs.length > 0}
	<Disclosure title={t('deploy.log.title')} summary={latest} open={store.deploying}>
		<div class="log-head">
			<button class="clear-btn" onclick={() => store.clearLogs()}>{t('deploy.log.clear')}</button>
		</div>
		<div class="log-area">
			{#each store.logs as entry (entry.id)}
				<div class="log-item log-{entry.type}">{@html linkify(entry.message)}</div>
			{/each}
		</div>
	</Disclosure>
{/if}

<style>
	.log-head {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--space-2);
	}
	.clear-btn {
		background: none;
		border: none;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.clear-btn:hover {
		color: var(--fg-base);
	}
	.log-area {
		max-height: 240px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.log-item {
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border-subtle);
		word-break: break-all;
		line-height: var(--leading-normal);
	}
	.log-item:last-child {
		border-bottom: none;
	}
	.log-info {
		color: var(--info);
	}
	.log-ok {
		color: var(--success);
	}
	.log-error {
		color: var(--error);
	}
	.log-warn {
		color: var(--warning);
	}
	:global(.log-link) {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.log-link:hover) {
		opacity: 0.8;
	}
</style>
