<!-- Copy-to-clipboard icon button with a brief confirmation tick. -->
<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';

	interface Props {
		value: string;
		title?: string;
		size?: number;
	}

	let { value, title = 'Copy', size = 14 }: Props = $props();
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1200);
		} catch {
			/* clipboard blocked — no-op */
		}
	}
</script>

<button class="copy" class:copied title={title} onclick={copy} aria-label={title}>
	{#if copied}<Check {size} />{:else}<Copy {size} />{/if}
</button>

<style>
	.copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-1);
		border: none;
		background: transparent;
		color: var(--fg-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing), background var(--motion-fast) var(--easing);
	}
	.copy:hover {
		color: var(--fg-base);
		background: var(--bg-raised);
	}
	.copy.copied {
		color: var(--success);
	}
</style>
