<script lang="ts">
	import { Trash2, FileText, AlertCircle } from '@lucide/svelte';

	interface StatusBarI18n {
		valid: string;
		loadExamples: string;
		clear: string;
	}

	interface Props {
		validCount: number;
		errorCount: number;
		duplicateCount: number;
		i18n?: Partial<StatusBarI18n>;
		class?: string;
		showExamples?: boolean;
		exampleCount?: number;
		onToggleErrors?: () => void;
		onLoadExamples?: () => void;
		onClear?: () => void;
	}

	const defaultI18n: StatusBarI18n = {
		valid: 'valid',
		loadExamples: 'Load {0} examples',
		clear: 'Clear'
	};

	let {
		validCount,
		errorCount,
		duplicateCount,
		i18n = {},
		class: className = '',
		showExamples = false,
		exampleCount = 0,
		onToggleErrors,
		onLoadExamples,
		onClear
	}: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });
	const hasErrors = $derived(errorCount > 0 || duplicateCount > 0);
	const totalErrors = $derived(errorCount + duplicateCount);
</script>

<div class="le-status {className}">
	<div class="le-status-left">
		<span class="le-status-valid">
			<FileText size={14} />
			{validCount.toLocaleString()} {t.valid}
		</span>
		{#if hasErrors}
			<button
				class="le-status-warn"
				onclick={() => onToggleErrors?.()}
				title="{errorCount} errors, {duplicateCount} duplicates"
			>
				<AlertCircle size={12} />
				{totalErrors.toLocaleString()}
			</button>
		{/if}
	</div>

	<div class="le-status-right">
		{#if showExamples}
			<button class="le-status-btn" onclick={() => onLoadExamples?.()}>
				{t.loadExamples.replace('{0}', String(exampleCount))}
			</button>
		{/if}
		<button class="le-status-btn le-status-btn-clear" onclick={() => onClear?.()}>
			<Trash2 size={14} />
			{t.clear}
		</button>
	</div>
</div>

<style>
	.le-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: var(--pe-bg2, #161b22);
		border-top: 1px solid var(--pe-border, #30363d);
		gap: 12px;
		flex-shrink: 0;
	}

	.le-status-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.le-status-valid {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--pe-success, #3fb950);
		font-weight: 500;
	}

	.le-status-warn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: rgba(210, 153, 34, 0.15);
		border: 1px solid rgba(210, 153, 34, 0.3);
		color: var(--pe-warning, #d29922);
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.le-status-warn:hover {
		background: rgba(210, 153, 34, 0.25);
		border-color: var(--pe-warning, #d29922);
	}

	.le-status-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.le-status-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-text, #e6edf3);
		padding: 3px 10px;
		border-radius: 6px;
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.le-status-btn:hover {
		background: var(--pe-bg, #0d1117);
		border-color: var(--pe-accent, #58a6ff);
	}

	.le-status-btn-clear {
		color: var(--pe-muted, #8b949e);
	}

	.le-status-btn-clear:hover {
		color: var(--pe-error, #f85149);
		border-color: var(--pe-error, #f85149);
	}

	@media (max-width: 768px) {
		.le-status {
			padding: 4px 8px;
			gap: 8px;
		}

		.le-status-valid {
			font-size: 11px;
		}

		.le-status-warn {
			font-size: 10px;
			padding: 1px 6px;
		}

		.le-status-btn {
			padding: 2px 8px;
			font-size: 11px;
		}
	}
</style>
