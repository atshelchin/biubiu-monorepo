<script lang="ts">
	/**
	 * A small round chain/token logo. Falls back to a deterministic letter avatar
	 * when no URL is given or the image fails to load, so it always renders cleanly.
	 */
	let {
		src,
		label,
		size = 20,
	}: {
		src?: string | null;
		label: string;
		size?: number;
	} = $props();

	let failed = $state(false);
	// Reset the failed flag whenever the source changes (component reuse in lists).
	$effect(() => {
		void src;
		failed = false;
	});

	const initial = $derived(
		(label || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?',
	);

	function hueFor(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
		return h;
	}
	const bg = $derived(`hsl(${hueFor(label)}, 42%, 42%)`);
</script>

{#if src && !failed}
	<img
		class="asset-icon"
		{src}
		alt={label}
		loading="lazy"
		onerror={() => (failed = true)}
		style:width="{size}px"
		style:height="{size}px"
	/>
{:else}
	<span
		class="asset-icon fallback"
		aria-hidden="true"
		style:width="{size}px"
		style:height="{size}px"
		style:background={bg}
		style:font-size="{Math.round(size * 0.42)}px"
	>
		{initial}
	</span>
{/if}

<style>
	.asset-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		flex-shrink: 0;
		object-fit: cover;
		vertical-align: middle;
		background: var(--bg-sunken);
	}

	.fallback {
		color: #fff;
		font-weight: var(--weight-semibold);
		line-height: 1;
		letter-spacing: -0.02em;
	}
</style>
