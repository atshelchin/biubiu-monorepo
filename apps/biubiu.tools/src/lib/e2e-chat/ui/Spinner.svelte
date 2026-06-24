<!-- Shared loading spinner — token-driven, honours prefers-reduced-motion. -->
<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
</script>

<div class="spinner" style="--spinner-size: {size}px" aria-hidden="true"></div>

<style>
	.spinner {
		width: var(--spinner-size);
		height: var(--spinner-size);
		border-radius: var(--radius-full);
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
