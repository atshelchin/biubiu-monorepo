<script lang="ts">
	import { Undo2, Redo2, Indent, CornerDownLeft, Search, AlertTriangle, Settings } from '@lucide/svelte';

	interface MobileMenuI18n {
		undo: string;
		redo: string;
		tab: string;
		enter: string;
		search: string;
		errors: string;
		settings: string;
	}

	interface Props {
		i18n?: Partial<MobileMenuI18n>;
		class?: string;
		onUndo?: () => void;
		onRedo?: () => void;
		onTab?: () => void;
		onEnter?: () => void;
		onSearch?: () => void;
		onToggleErrorPanel?: () => void;
		onSettings?: () => void;
	}

	// Default i18n
	const defaultI18n: MobileMenuI18n = {
		undo: 'Undo',
		redo: 'Redo',
		tab: 'Tab',
		enter: 'Enter',
		search: 'Search',
		errors: 'Errors',
		settings: 'Settings'
	};

	let {
		i18n = {},
		class: className = '',
		onUndo,
		onRedo,
		onTab,
		onEnter,
		onSearch,
		onToggleErrorPanel,
		onSettings
	}: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });
</script>

<div class="mm-bar {className}">
	<button class="mm-btn" onclick={() => onUndo?.()} title={t.undo}>
		<Undo2 size={14} />
		<span>{t.undo}</span>
	</button>
	<button class="mm-btn" onclick={() => onRedo?.()} title={t.redo}>
		<Redo2 size={14} />
		<span>{t.redo}</span>
	</button>
	<button class="mm-btn" onclick={() => onTab?.()} title={t.tab}>
		<Indent size={14} />
		<span>{t.tab}</span>
	</button>
	<button class="mm-btn" onclick={() => onEnter?.()} title={t.enter}>
		<CornerDownLeft size={14} />
		<span>{t.enter}</span>
	</button>
	<button class="mm-btn" onclick={() => onSearch?.()} title={t.search}>
		<Search size={14} />
		<span>{t.search}</span>
	</button>
	<button class="mm-btn" onclick={() => onToggleErrorPanel?.()} title={t.errors}>
		<AlertTriangle size={14} />
		<span>{t.errors}</span>
	</button>
	<button class="mm-btn" onclick={() => onSettings?.()} title={t.settings}>
		<Settings size={14} />
		<span>{t.settings}</span>
	</button>
</div>

<style>
	.mm-bar {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--pe-bg2, #161b22);
		border-top: 1px solid var(--pe-border, #30363d);
		align-items: center;
		padding: 8px;
		gap: 4px;
		z-index: 300;
		-webkit-tap-highlight-color: transparent;
	}

	@media (max-width: 768px) {
		.mm-bar {
			display: flex;
		}
	}

	.mm-btn {
		flex: 1;
		max-width: 70px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-align: center;
		padding: 8px 4px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 4px;
		color: var(--pe-text, #e6edf3);
		font-size: 10px;
		font-family: inherit;
		white-space: nowrap;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition: background 0.15s;
	}

	.mm-btn span {
		font-size: 9px;
	}

	.mm-btn:active {
		background: var(--pe-bg, #0d1117);
	}
</style>
