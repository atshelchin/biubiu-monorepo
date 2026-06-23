<script lang="ts">
	/**
	 * Batch tray: queued write calls executed as one atomic Safe transaction
	 * (delegatecall into MultiSend 1.4.1), or exported as a Safe{Wallet}
	 * Transaction Builder file.
	 */
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';
	import { shortenAddress } from '$lib/contract-caller/format.js';
	import { ArrowUp, ArrowDown, X } from '@lucide/svelte';

	function sendingLabel(phase?: string): string {
		switch (phase) {
			case 'building':
				return 'Building…';
			case 'estimating':
				return 'Estimating…';
			case 'signing':
				return 'Sign in wallet…';
			case 'submitting':
				return 'Submitting…';
			case 'waiting':
				return 'Confirming…';
			default:
				return 'Checking…';
		}
	}

	const bs = $derived(store.batchState);
</script>

{#if store.batch.length > 0}
	<section class="card">
		<div class="head">
			<h3 class="title">Batch <span class="count">{store.batch.length}</span></h3>
			<span class="hint">One atomic Safe transaction via MultiSend</span>
		</div>

		<ol class="queue">
			{#each store.batch as call, i (call.id)}
				<li class="item">
					<span class="idx">{i + 1}</span>
					<div class="item-main">
						<span class="item-label">{call.label}</span>
						<span class="item-to"
							>→ {shortenAddress(call.to)}{call.value > 0n ? ` · ${call.value} wei` : ''}</span
						>
					</div>
					<div class="item-actions">
						<button
							class="icon"
							onclick={() => store.moveBatch(call.id, 'up')}
							disabled={i === 0}
							title="Move up"><ArrowUp size={14} /></button
						>
						<button
							class="icon"
							onclick={() => store.moveBatch(call.id, 'down')}
							disabled={i === store.batch.length - 1}
							title="Move down"><ArrowDown size={14} /></button
						>
						<button
							class="icon danger"
							onclick={() => store.removeFromBatch(call.id)}
							title="Remove"><X size={14} /></button
						>
					</div>
				</li>
			{/each}
		</ol>

		<div class="actions">
			{#if store.canWrite}
				{#if store.isLoggedIn}
					<button
						class="btn primary"
						onclick={() => store.sendBatch()}
						disabled={bs.status === 'sending'}
					>
						{bs.status === 'sending' ? sendingLabel(bs.phase) : 'Execute batch'}
					</button>
				{:else}
					<button class="btn primary" disabled>Sign in to execute</button>
				{/if}
			{/if}
			<button class="btn" onclick={() => store.exportSafeBatch()}>Export Safe file</button>
			<button class="btn ghost" onclick={() => store.clearBatch()}>Clear</button>
		</div>

		{#if !store.canWrite}
			<p class="hint">
				This network is read-only in-app — export the Safe file and run it from your Safe.
			</p>
		{/if}

		{#if bs.status === 'done'}
			<div class="result ok">
				<span class="result-name">✓ batch sent</span>
				{#if bs.explorerUrl}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="result-val" href={bs.explorerUrl} target="_blank" rel="noopener noreferrer"
						>{bs.txHash}</a
					>
				{:else}
					<span class="result-val">{bs.txHash}</span>
				{/if}
			</div>
		{:else if bs.status === 'error'}
			<div class="result err">{bs.error}</div>
		{/if}
	</section>
{/if}

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border-base));
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-md);
		margin-bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.title {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.count {
		font-size: var(--text-xs);
		font-weight: var(--weight-normal);
		color: var(--accent);
		background: var(--accent-subtle);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.idx {
		flex: 0 0 auto;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		background: var(--bg-elevated);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.item-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.item-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-to {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.item-actions {
		display: flex;
		gap: var(--space-1);
		flex: 0 0 auto;
	}
	.icon {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-xs);
		transition: all var(--motion-fast) var(--easing);
	}
	.icon:hover:not(:disabled) {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.icon.danger:hover:not(:disabled) {
		color: var(--error);
		border-color: color-mix(in srgb, var(--error) 40%, transparent);
	}
	.icon:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		border-color: transparent;
		color: var(--accent-fg);
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn.ghost {
		background: transparent;
		color: var(--fg-muted);
	}
	.btn.ghost:hover {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.result {
		border-radius: var(--radius-md);
		padding: var(--space-3);
		font-size: var(--text-sm);
	}
	.result.ok {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.result.err {
		background: var(--error-subtle);
		color: var(--error);
		border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
		word-break: break-word;
	}
	.result-name {
		font-size: var(--text-xs);
		color: var(--success);
	}
	.result-val {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent);
		word-break: break-all;
		text-decoration: none;
	}
	.result-val:hover {
		text-decoration: underline;
	}
</style>
