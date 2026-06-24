<script lang="ts">
	let {
		percent = 0,
		label = '',
		status = '',
		indeterminate = false
	}: {
		percent?: number;
		label?: string;
		status?: string;
		/** Show a looping, position-unknown bar (e.g. before the first chunk lands). */
		indeterminate?: boolean;
	} = $props();
</script>

<div class="progress-container">
	{#if label}
		<div class="progress-header">
			<span class="progress-label">{label}</span>
		</div>
	{/if}
	<div class="progress-track">
		{#if indeterminate}
			<div class="progress-fill indeterminate"></div>
		{:else}
			<div class="progress-fill" style:width="{Math.min(100, Math.max(0, percent))}%"></div>
		{/if}
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

	.progress-fill.indeterminate {
		width: 35%;
		animation: indeterminate-slide 1.4s var(--easing) infinite;
	}

	@keyframes indeterminate-slide {
		0% {
			margin-left: -35%;
		}
		100% {
			margin-left: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-fill.indeterminate {
			width: 100%;
			animation: none;
			opacity: 0.5;
		}
	}

	.progress-status {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}
</style>
