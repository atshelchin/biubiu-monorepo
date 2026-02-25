<script lang="ts">
	import { Undo2, Redo2, Search, ArrowUpDown, ChevronUp, ChevronDown, Settings, Upload, Download } from '@lucide/svelte';

	interface ToolbarI18n {
		undo: string;
		redo: string;
		search: string;
		jumpTo: string;
		prevError: string;
		nextError: string;
		errors: string;
		settings: string;
		import: string;
		export: string;
		line: string;
		col: string;
		modified: string;
		hint: string;
	}

	interface Props {
		lineCount: number;
		errorCount: number;
		cursorLine: number;
		cursorCol: number;
		isModified: boolean;
		i18n?: Partial<ToolbarI18n>;
		class?: string;
		onUndo?: () => void;
		onRedo?: () => void;
		onSearch?: () => void;
		onJumpTo?: () => void;
		onPrevError?: () => void;
		onNextError?: () => void;
		onToggleErrorPanel?: () => void;
		onSettings?: () => void;
		onImport?: () => void;
		onExport?: () => void;
	}

	// Default i18n
	const defaultI18n: ToolbarI18n = {
		undo: 'Undo',
		redo: 'Redo',
		search: 'Search',
		jumpTo: 'Go to',
		prevError: 'Previous Error',
		nextError: 'Next Error',
		errors: 'errors',
		settings: 'Settings',
		import: 'Import',
		export: 'Export',
		line: 'Line',
		col: 'Col',
		modified: 'Modified',
		hint: 'Ctrl+F Search | Ctrl+G Jump | F8 Error Panel'
	};

	let {
		lineCount,
		errorCount,
		cursorLine,
		cursorCol,
		isModified,
		i18n = {},
		class: className = '',
		onUndo,
		onRedo,
		onSearch,
		onJumpTo,
		onPrevError,
		onNextError,
		onToggleErrorPanel,
		onSettings,
		onImport,
		onExport
	}: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });
</script>

<div class="tb-bar {className}">
	<div class="tb-left">
		<button class="tb-btn" onclick={() => onUndo?.()} title={t.undo}>
			<Undo2 size={14} />
		</button>
		<button class="tb-btn" onclick={() => onRedo?.()} title={t.redo}>
			<Redo2 size={14} />
		</button>
		<div class="tb-sep"></div>
		<button class="tb-btn" onclick={() => onSearch?.()} title={t.search}>
			<Search size={14} />
		</button>
		<button class="tb-btn" onclick={() => onJumpTo?.()} title={t.jumpTo}>
			<ArrowUpDown size={14} />
		</button>
		<div class="tb-sep"></div>
		<button class="tb-btn" onclick={() => onPrevError?.()} title={t.prevError}>
			<ChevronUp size={14} />
		</button>
		<button class="tb-btn" onclick={() => onNextError?.()} title={t.nextError}>
			<ChevronDown size={14} />
		</button>
		{#if errorCount > 0}
			<button class="tb-btn tb-btn-error" onclick={() => onToggleErrorPanel?.()}>
				{errorCount}
				{t.errors}
			</button>
		{/if}
	</div>

	<div class="tb-center">
		<span class="tb-hint">{t.hint}</span>
	</div>

	<div class="tb-right">
		<button class="tb-btn" onclick={() => onImport?.()} title={t.import}>
			<Upload size={14} />
		</button>
		<button class="tb-btn" onclick={() => onExport?.()} title={t.export}>
			<Download size={14} />
		</button>
		<div class="tb-sep"></div>
		<button class="tb-btn" onclick={() => onSettings?.()} title={t.settings}>
			<Settings size={14} />
		</button>
		<div class="tb-sep"></div>
		<span class="tb-status">
			{t.line}
			{(cursorLine + 1).toLocaleString()}, {t.col}
			{cursorCol + 1}
		</span>
		<span class="tb-status">
			{lineCount.toLocaleString()}
			{t.line}
		</span>
		{#if isModified}
			<span class="tb-modified">{t.modified}</span>
		{/if}
	</div>
</div>

<style>
	.tb-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: var(--pe-bg2, #161b22);
		border-bottom: 1px solid var(--pe-border, #30363d);
		gap: 16px;
	}

	.tb-left,
	.tb-right {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tb-center {
		flex: 1;
		display: flex;
		justify-content: center;
	}

	.tb-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-text, #e6edf3);
		padding: 5px 10px;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tb-btn:hover {
		background: var(--pe-bg, #0d1117);
		border-color: var(--pe-blue, #58a6ff);
	}

	.tb-btn-error {
		background: rgba(248, 81, 73, 0.15);
		border-color: var(--pe-red, #f85149);
		color: var(--pe-red, #f85149);
	}

	.tb-btn-error:hover {
		background: rgba(248, 81, 73, 0.25);
	}

	.tb-sep {
		width: 1px;
		height: 20px;
		background: var(--pe-border, #30363d);
		margin: 0 4px;
	}

	.tb-hint {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
	}

	.tb-status {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
		padding: 0 8px;
	}

	.tb-modified {
		font-size: 11px;
		color: var(--pe-yellow, #d29922);
		padding: 2px 8px;
		background: rgba(210, 153, 34, 0.15);
		border-radius: 4px;
	}

	@media (max-width: 768px) {
		.tb-bar {
			padding: 4px 8px;
			gap: 8px;
		}

		.tb-center {
			display: none;
		}

		.tb-hint {
			display: none;
		}

		.tb-sep {
			display: none;
		}

		.tb-btn {
			padding: 3px 6px;
			font-size: 12px;
		}

		.tb-status {
			font-size: 10px;
			padding: 0 4px;
		}

		.tb-modified {
			font-size: 10px;
			padding: 1px 4px;
		}
	}
</style>
