<script lang="ts">
	import { encode } from 'uqr';

	interface Props {
		/** One or more UR fragment strings. >1 → animated (fountain QR). */
		frames: string[];
		/** Pixel size of the rendered QR. */
		size?: number;
		/** Frame interval in ms. */
		intervalMs?: number;
	}

	let { frames, size = 256, intervalMs = 200 }: Props = $props();

	let idx = $state(0);

	// Cycle frames while there is more than one. Reset index when the set changes.
	$effect(() => {
		idx = 0;
		if (frames.length <= 1) return;
		const id = setInterval(() => {
			idx = (idx + 1) % frames.length;
		}, intervalMs);
		return () => clearInterval(id);
	});

	const matrix = $derived.by(() => {
		const text = frames[idx] ?? frames[0];
		if (!text) return null;
		return encode(text, { ecc: 'L' });
	});
</script>

{#if matrix}
	<svg
		class="qr"
		viewBox="0 0 {matrix.size} {matrix.size}"
		width={size}
		height={size}
		shape-rendering="crispEdges"
		role="img"
		aria-label="QR code"
	>
		<rect width={matrix.size} height={matrix.size} fill="#fff" />
		{#each matrix.data as row, y (y)}
			{#each row as cell, x (x)}
				{#if cell}
					<rect {x} {y} width="1" height="1" fill="#000" />
				{/if}
			{/each}
		{/each}
	</svg>
	{#if frames.length > 1}
		<div class="frame-dots">
			{#each [...Array(frames.length).keys()] as i (i)}
				<span class="dot" class:on={i === idx}></span>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.qr {
		border-radius: var(--radius-md);
		display: block;
	}
	.frame-dots {
		display: flex;
		gap: 4px;
		justify-content: center;
		margin-top: var(--space-2);
		flex-wrap: wrap;
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: var(--radius-full);
		background: var(--border-strong, var(--border-base));
	}
	.dot.on {
		background: var(--accent);
	}
</style>
