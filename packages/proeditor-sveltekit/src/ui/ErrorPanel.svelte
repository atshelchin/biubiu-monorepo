<script lang="ts">
	import { X, ExternalLink, EyeOff, Trash2 } from '@lucide/svelte';
	import type { ValidationError } from '../core/types.js';

	interface ErrorPanelI18n {
		title: string;
		noErrors: string;
		line: string;
		error: string;
		warning: string;
		andMore: string;
		clearIgnored: string;
		ignoreThis: string;
	}

	interface Props {
		errors: Map<number, ValidationError>;
		errorLines: number[];
		ignoredCount: number;
		limit?: number;
		i18n?: Partial<ErrorPanelI18n>;
		class?: string;
		onJumpToError?: (line: number) => void;
		onIgnoreError?: (line: number) => void;
		onClearIgnored?: () => void;
		onClose?: () => void;
	}

	// Default i18n
	const defaultI18n: ErrorPanelI18n = {
		title: 'Error List',
		noErrors: 'No errors',
		line: 'Line',
		error: 'Error',
		warning: 'Warning',
		andMore: '{0} more errors...',
		clearIgnored: 'Clear Ignored',
		ignoreThis: 'Ignore this error'
	};

	let {
		errors,
		errorLines,
		ignoredCount,
		limit = 100,
		i18n = {},
		class: className = '',
		onJumpToError,
		onIgnoreError,
		onClearIgnored,
		onClose
	}: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });
	const displayErrors = $derived(errorLines.slice(0, limit));
	const hasMore = $derived(errorLines.length > limit);
	const moreCount = $derived(errorLines.length - limit);

	function handleJump(line: number): void {
		onJumpToError?.(line);
	}

	function handleIgnore(e: MouseEvent | KeyboardEvent, line: number): void {
		e.stopPropagation();
		onIgnoreError?.(line);
	}
</script>

<aside class="ep-panel {className}">
	<div class="ep-header">
		<div class="ep-title">
			<span>{t.title}</span>
			<span class="ep-count">{errorLines.length}</span>
		</div>
		<button class="ep-close" onclick={() => onClose?.()}>
			<X size={16} />
		</button>
	</div>

	<div class="ep-list">
		{#if errorLines.length === 0}
			<div class="ep-empty">{t.noErrors}</div>
			{#if ignoredCount > 0}
				<div class="ep-clear-wrap">
					<button class="ep-btn" onclick={() => onClearIgnored?.()}>
						<Trash2 size={12} />
						{t.clearIgnored} ({ignoredCount})
					</button>
				</div>
			{/if}
		{:else}
			{#each displayErrors as lineNum (lineNum)}
				{@const error = errors.get(lineNum)}
				{#if error}
					<button class="ep-item" onclick={() => handleJump(lineNum)}>
						<div class="ep-item-header">
							<span class="ep-line">
								<ExternalLink size={10} />
								{t.line} {(lineNum + 1).toLocaleString()}
							</span>
							<span
								class="ep-type"
								class:err={error.type === 'col_count'}
								class:warn={error.type !== 'col_count'}
							>
								{error.type === 'col_count' ? t.error : t.warning}
							</span>
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="ep-ignore"
								role="button"
								tabindex="0"
								onclick={(e) => handleIgnore(e, lineNum)}
								onkeydown={(e) => e.key === 'Enter' && handleIgnore(e, lineNum)}
								title={t.ignoreThis}
							>
								<EyeOff size={12} />
							</span>
						</div>
						<div class="ep-message">{error.message}</div>
						{#if error.preview}
							<div class="ep-preview">{error.preview}</div>
						{/if}
					</button>
				{/if}
			{/each}

			{#if hasMore}
				<div class="ep-more">{t.andMore.replace('{0}', moreCount.toLocaleString())}</div>
			{/if}

			{#if ignoredCount > 0}
				<div class="ep-clear-wrap">
					<button class="ep-btn" onclick={() => onClearIgnored?.()}>
						<Trash2 size={12} />
						{t.clearIgnored} ({ignoredCount})
					</button>
				</div>
			{/if}
		{/if}
	</div>
</aside>

<style>
	.ep-panel {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 320px;
		background: var(--pe-bg2, #161b22);
		border-left: 1px solid var(--pe-border, #30363d);
		display: flex;
		flex-direction: column;
		z-index: 100;
	}

	.ep-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--pe-border, #30363d);
		background: var(--pe-bg3, #21262d);
	}

	.ep-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: var(--pe-text, #e6edf3);
	}

	.ep-count {
		background: var(--pe-red, #f85149);
		color: #fff;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
	}

	.ep-close {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--pe-muted, #8b949e);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.ep-close:hover {
		background: var(--pe-bg3, #21262d);
		color: var(--pe-text, #e6edf3);
	}

	.ep-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.ep-empty {
		text-align: center;
		padding: 32px 16px;
		color: var(--pe-green, #3fb950);
		font-size: 14px;
	}

	.ep-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 12px;
		margin-bottom: 8px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.ep-item:hover {
		background: var(--pe-bg3, #21262d);
		border-color: var(--pe-border, #30363d);
	}

	.ep-item-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.ep-line {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--pe-blue, #58a6ff);
	}

	.ep-type {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.ep-type.err {
		background: rgba(248, 81, 73, 0.2);
		color: var(--pe-red, #f85149);
	}

	.ep-type.warn {
		background: rgba(210, 153, 34, 0.2);
		color: var(--pe-yellow, #d29922);
	}

	.ep-ignore {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: auto;
		background: none;
		border: none;
		color: var(--pe-muted, #8b949e);
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.ep-item:hover .ep-ignore {
		opacity: 1;
	}

	.ep-ignore:hover {
		background: rgba(248, 81, 73, 0.2);
		color: var(--pe-red, #f85149);
	}

	.ep-message {
		font-size: 13px;
		color: var(--pe-text, #e6edf3);
		line-height: 1.4;
	}

	.ep-preview {
		margin-top: 6px;
		padding: 6px 8px;
		background: var(--pe-bg2, #161b22);
		border-radius: 4px;
		font-size: 11px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--pe-muted, #8b949e);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ep-more {
		text-align: center;
		padding: 12px;
		color: var(--pe-muted, #8b949e);
		font-size: 12px;
	}

	.ep-clear-wrap {
		text-align: center;
		padding: 12px;
		border-top: 1px solid var(--pe-border, #30363d);
		margin-top: 8px;
	}

	.ep-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-text, #e6edf3);
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.ep-btn:hover {
		background: var(--pe-bg, #0d1117);
		border-color: var(--pe-blue, #58a6ff);
	}

	@media (max-width: 768px) {
		.ep-panel {
			width: 85%;
			max-width: 320px;
			right: 0;
			left: auto;
			border-radius: 8px 0 0 8px;
			box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
		}
	}
</style>
