<script lang="ts">
	let {
		percent = 0,
		label = '',
		status = '',
	}: {
		percent?: number;
		label?: string;
		status?: string;
	} = $props();
</script>

<div class="progress-container">
	{#if label}
		<div class="progress-header">
			<span class="progress-label">{label}</span>
		</div>
	{/if}
	<div class="progress-track">
		<div class="progress-fill" style:width="{Math.min(100, Math.max(0, percent))}%"></div>
	</div>
	{#if status}
		<p class="progress-status">{status}</p>
	{/if}
</div>

<style>
	.progress-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
	}

	.progress-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.progress-track {
		height: 6px;
		background: var(--bg-sunken);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: var(--radius-full);
		transition: width var(--motion-normal) var(--easing);
	}

	.progress-status {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}
</style>
