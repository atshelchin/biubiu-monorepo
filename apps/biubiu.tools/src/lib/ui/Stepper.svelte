<script lang="ts">
	/**
	 * Shared wizard stepper — boxed tabs (1 Label | 2 Label | …). Unifies the
	 * step UI across PDA apps (token-sender, wallet-sweep, …).
	 *
	 * - `current` is the 0-based index of the active step.
	 * - Steps before `current` are "done"; steps after are disabled.
	 * - Pass `onNavigate` to allow clicking a completed/active step to jump back.
	 */
	interface Props {
		steps: string[];
		current: number;
		onNavigate?: (index: number) => void;
	}
	let { steps, current, onNavigate }: Props = $props();

	function go(i: number) {
		if (onNavigate && i <= current) onNavigate(i);
	}
</script>

<nav class="stepper" aria-label="progress">
	{#each steps as label, i (i)}
		<button
			class="step"
			class:active={i === current}
			class:done={i < current}
			disabled={i > current || !onNavigate}
			onclick={() => go(i)}
		>
			<span class="step-num">{i < current ? '✓' : i + 1}</span>
			<span class="step-label">{label}</span>
		</button>
	{/each}
</nav>

<style>
	.stepper {
		display: flex;
		gap: var(--space-2);
	}
	.step {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-normal) var(--easing);
	}
	.step:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.step.active {
		border-color: var(--accent);
		color: var(--fg-base);
		background: var(--accent-subtle);
	}
	.step.done {
		color: var(--fg-base);
	}
	.step-num {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		background: var(--bg-elevated);
		display: grid;
		place-items: center;
		font-size: var(--text-xs);
		font-weight: 700;
		flex-shrink: 0;
	}
	.step.active .step-num {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.step.done .step-num {
		background: var(--accent-muted);
		color: var(--accent);
	}
	.step-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}
	@media (max-width: 480px) {
		.step-label {
			display: none;
		}
	}
</style>
