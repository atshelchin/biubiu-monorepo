<!-- A labelled, copyable monospace JSON/hex block. -->
<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	interface Props {
		value: string;
		label?: string;
		copyTitle?: string;
	}
	let { value, label, copyTitle }: Props = $props();
</script>

<div class="block">
	{#if label}
		<div class="head">
			<span class="label">{label}</span>
			<CopyButton {value} title={copyTitle ?? label} />
		</div>
	{/if}
	<pre class="wd-code">{value}</pre>
</div>

<style>
	.block {
		margin-top: var(--space-3);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-1);
	}
	.label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
	}
</style>
