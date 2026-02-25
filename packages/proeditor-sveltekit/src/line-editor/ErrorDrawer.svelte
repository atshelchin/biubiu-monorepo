<script lang="ts">
	import { X, AlertTriangle, Copy } from '@lucide/svelte';
	import type { ValidationError } from '../core/types.js';

	interface ErrorDrawerI18n {
		title: string;
		noErrors: string;
		line: string;
		error: string;
		duplicate: string;
		andMore: string;
		close: string;
	}

	interface Props {
		errors: Map<number, ValidationError>;
		errorLines: number[];
		limit?: number;
		i18n?: Partial<ErrorDrawerI18n>;
		class?: string;
		onJumpToError?: (line: number) => void;
		onClose?: () => void;
	}

	const defaultI18n: ErrorDrawerI18n = {
		title: 'Error List',
		noErrors: 'No errors',
		line: 'Line',
		error: 'Format error',
		duplicate: 'Duplicate',
		andMore: '{0} more...',
		close: 'Close'
	};

	let {
		errors,
		errorLines,
		limit = 100,
		i18n = {},
		class: className = '',
		onJumpToError,
		onClose
	}: Props = $props();

	const t = $derived({ ...defaultI18n, ...i18n });
	const displayErrors = $derived(errorLines.slice(0, limit));
	const hasMore = $derived(errorLines.length > limit);
	const moreCount = $derived(errorLines.length - limit);

	function handleJump(line: number): void {
		onJumpToError?.(line);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ed-backdrop" onclick={() => onClose?.()}></div>
<aside class="ed-panel {className}">
	<div class="ed-header">
		<div class="ed-title">
			<AlertTriangle size={16} />
			<span>{t.title}</span>
			<span class="ed-count">{errorLines.length}</span>
		</div>
		<button class="ed-close" onclick={() => onClose?.()}>
			<X size={14} />
			{t.close}
		</button>
	</div>

	<div class="ed-list">
		{#if errorLines.length === 0}
			<div class="ed-empty">{t.noErrors}</div>
		{:else}
			{#each displayErrors as lineNum (lineNum)}
				{@const error = errors.get(lineNum)}
				{#if error}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="ed-item" onclick={() => handleJump(lineNum)}>
						<div class="ed-item-header">
							<span class="ed-line">{t.line} {(lineNum + 1).toLocaleString()}</span>
							<span
								class="ed-type"
								class:ed-type-err={error.type !== 'duplicate'}
								class:ed-type-dup={error.type === 'duplicate'}
							>
								{error.type === 'duplicate' ? t.duplicate : t.error}
							</span>
						</div>
						<div class="ed-message">{error.message}</div>
						{#if error.preview}
							<div class="ed-preview">
								<Copy size={10} />
								{error.preview}
							</div>
						{/if}
					</div>
				{/if}
			{/each}

			{#if hasMore}
				<div class="ed-more">{t.andMore.replace('{0}', moreCount.toLocaleString())}</div>
			{/if}
		{/if}
	</div>
</aside>

<style>
	.ed-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 99;
	}

	.ed-panel {
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
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
	}

	.ed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--pe-border, #30363d);
		background: var(--pe-bg3, #21262d);
		flex-shrink: 0;
	}

	.ed-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: var(--pe-text, #e6edf3);
	}

	.ed-count {
		background: var(--pe-error, #f85149);
		color: #fff;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
	}

	.ed-close {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-muted, #8b949e);
		cursor: pointer;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 4px;
		font-family: inherit;
		transition: all 0.15s;
	}

	.ed-close:hover {
		background: var(--pe-bg, #0d1117);
		color: var(--pe-text, #e6edf3);
	}

	.ed-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.ed-empty {
		text-align: center;
		padding: 32px 16px;
		color: var(--pe-success, #3fb950);
		font-size: 14px;
	}

	.ed-item {
		padding: 12px;
		margin-bottom: 8px;
		background: var(--pe-bg, #0d1117);
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.ed-item:hover {
		background: var(--pe-bg3, #21262d);
	}

	.ed-item-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.ed-line {
		font-size: 12px;
		font-weight: 500;
		color: var(--pe-accent, #58a6ff);
	}

	.ed-type {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.ed-type-err {
		background: rgba(248, 81, 73, 0.2);
		color: var(--pe-error, #f85149);
	}

	.ed-type-dup {
		background: rgba(210, 153, 34, 0.2);
		color: var(--pe-warning, #d29922);
	}

	.ed-message {
		font-size: 13px;
		color: var(--pe-text, #e6edf3);
		line-height: 1.4;
	}

	.ed-preview {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		padding: 6px 8px;
		background: var(--pe-bg2, #161b22);
		border-radius: 4px;
		font-size: 11px;
		font-family: var(--pe-font, 'JetBrains Mono', monospace);
		color: var(--pe-muted, #8b949e);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ed-more {
		text-align: center;
		padding: 12px;
		color: var(--pe-muted, #8b949e);
		font-size: 12px;
	}

	@media (max-width: 768px) {
		.ed-panel {
			width: 85%;
			max-width: 320px;
			border-radius: 8px 0 0 8px;
		}
	}
</style>
