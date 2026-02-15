<script lang="ts">
	import { ChevronUp, ChevronDown, X, ArrowLeftRight, CaseSensitive, Regex } from '@lucide/svelte';

	interface SearchBarI18n {
		search: string;
		replace: string;
		replaceOne: string;
		replaceAll: string;
		prev: string;
		next: string;
		regex: string;
		caseSensitive: string;
		noResults: string;
		results: string;
	}

	interface Props {
		searchQuery: string;
		replaceText: string;
		matchCount: number;
		currentMatch: number;
		isRegex: boolean;
		isCaseSensitive: boolean;
		showReplace?: boolean;
		i18n?: Partial<SearchBarI18n>;
		class?: string;
		onSearch?: (query: string) => void;
		onReplaceTextChange?: (text: string) => void;
		onReplaceOne?: () => void;
		onReplaceAll?: () => void;
		onPrevMatch?: () => void;
		onNextMatch?: () => void;
		onToggleRegex?: () => void;
		onToggleCaseSensitive?: () => void;
		onToggleReplace?: () => void;
		onClose?: () => void;
	}

	// Default i18n
	const defaultI18n: SearchBarI18n = {
		search: 'Search...',
		replace: 'Replace...',
		replaceOne: 'Replace',
		replaceAll: 'Replace All',
		prev: 'Previous',
		next: 'Next',
		regex: 'Regex',
		caseSensitive: 'Case Sensitive',
		noResults: 'No results',
		results: '{current} / {total}'
	};

	let {
		searchQuery,
		replaceText,
		matchCount,
		currentMatch,
		isRegex,
		isCaseSensitive,
		showReplace = false,
		i18n = {},
		class: className = '',
		onSearch,
		onReplaceTextChange,
		onReplaceOne,
		onReplaceAll,
		onPrevMatch,
		onNextMatch,
		onToggleRegex,
		onToggleCaseSensitive,
		onToggleReplace,
		onClose
	}: Props = $props();

	let searchInput: HTMLInputElement;
	let replaceInput: HTMLInputElement;

	const t = $derived({ ...defaultI18n, ...i18n });

	const resultText = $derived(
		matchCount === 0
			? t.noResults
			: t.results
					.replace('{current}', String(currentMatch + 1))
					.replace('{total}', String(matchCount))
	);

	function handleSearchKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			if (e.shiftKey) {
				onPrevMatch?.();
			} else {
				onNextMatch?.();
			}
		} else if (e.key === 'Escape') {
			onClose?.();
		}
	}

	function handleReplaceKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			onReplaceOne?.();
		} else if (e.key === 'Escape') {
			onClose?.();
		}
	}

	export function focus(): void {
		searchInput?.focus();
		searchInput?.select();
	}
</script>

<div class="sb-bar {className}">
	<div class="sb-row">
		<div class="sb-input-wrap">
			<input
				bind:this={searchInput}
				type="text"
				class="sb-input"
				placeholder={t.search}
				value={searchQuery}
				oninput={(e) => onSearch?.(e.currentTarget.value)}
				onkeydown={handleSearchKeydown}
			/>
			<span class="sb-result">{resultText}</span>
		</div>

		<div class="sb-actions">
			<button
				class="sb-btn"
				class:active={isCaseSensitive}
				onclick={() => onToggleCaseSensitive?.()}
				title={t.caseSensitive}
			>
				<CaseSensitive size={14} />
			</button>
			<button
				class="sb-btn"
				class:active={isRegex}
				onclick={() => onToggleRegex?.()}
				title={t.regex}
			>
				<Regex size={14} />
			</button>
			<div class="sb-sep"></div>
			<button class="sb-btn" onclick={() => onPrevMatch?.()} title={t.prev}>
				<ChevronUp size={14} />
			</button>
			<button class="sb-btn" onclick={() => onNextMatch?.()} title={t.next}>
				<ChevronDown size={14} />
			</button>
			<button class="sb-btn" class:active={showReplace} onclick={() => onToggleReplace?.()}>
				<ArrowLeftRight size={14} />
			</button>
			<button class="sb-close" onclick={() => onClose?.()}>
				<X size={14} />
			</button>
		</div>
	</div>

	{#if showReplace}
		<div class="sb-row sb-replace-row">
			<div class="sb-input-wrap">
				<input
					bind:this={replaceInput}
					type="text"
					class="sb-input"
					placeholder={t.replace}
					value={replaceText}
					oninput={(e) => onReplaceTextChange?.(e.currentTarget.value)}
					onkeydown={handleReplaceKeydown}
				/>
			</div>
			<div class="sb-actions">
				<button class="sb-btn sb-btn-text" onclick={() => onReplaceOne?.()}>
					{t.replaceOne}
				</button>
				<button class="sb-btn sb-btn-text" onclick={() => onReplaceAll?.()}>
					{t.replaceAll}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.sb-bar {
		position: absolute;
		top: 0;
		right: 32px;
		background: var(--pe-bg2, #161b22);
		border: 1px solid var(--pe-border, #30363d);
		border-top: none;
		border-radius: 0 0 8px 8px;
		padding: 8px 12px;
		z-index: 200;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.sb-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sb-replace-row {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--pe-border, #30363d);
	}

	.sb-input-wrap {
		position: relative;
		flex: 1;
	}

	.sb-input {
		width: 200px;
		padding: 6px 60px 6px 10px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		color: var(--pe-text, #e6edf3);
		font-size: 13px;
		font-family: inherit;
		outline: none;
	}

	.sb-input:focus {
		border-color: var(--pe-blue, #58a6ff);
	}

	.sb-input::placeholder {
		color: var(--pe-muted, #8b949e);
	}

	.sb-result {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 11px;
		color: var(--pe-muted, #8b949e);
		pointer-events: none;
	}

	.sb-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.sb-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-muted, #8b949e);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sb-btn:hover {
		background: var(--pe-bg, #0d1117);
		color: var(--pe-text, #e6edf3);
	}

	.sb-btn.active {
		background: var(--pe-blue, #58a6ff);
		border-color: var(--pe-blue, #58a6ff);
		color: #fff;
	}

	.sb-btn-text {
		padding: 4px 10px;
	}

	.sb-sep {
		width: 1px;
		height: 16px;
		background: var(--pe-border, #30363d);
		margin: 0 4px;
	}

	.sb-close {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--pe-muted, #8b949e);
		cursor: pointer;
		font-size: 14px;
		padding: 4px 6px;
		margin-left: 4px;
	}

	.sb-close:hover {
		color: var(--pe-text, #e6edf3);
	}

	@media (max-width: 768px) {
		.sb-bar {
			right: 0;
			left: 0;
			border-radius: 0;
			padding: 6px 8px;
		}

		.sb-input {
			width: 100%;
			font-size: 14px;
			padding: 8px 60px 8px 10px;
		}

		.sb-sep {
			display: none;
		}

		.sb-btn {
			padding: 6px 10px;
			font-size: 13px;
		}
	}
</style>
