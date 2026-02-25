<script lang="ts">
	interface JumpModalI18n {
		title: string;
		placeholder: string;
		max: string;
		jump: string;
		cancel: string;
		invalidLine: string;
	}

	interface Props {
		maxLine: number;
		currentLine: number;
		i18n?: Partial<JumpModalI18n>;
		class?: string;
		onJump?: (line: number) => void;
		onClose?: () => void;
	}

	// Default i18n
	const defaultI18n: JumpModalI18n = {
		title: 'Go to Line',
		placeholder: 'Enter line number',
		max: 'Max',
		jump: 'Go',
		cancel: 'Cancel',
		invalidLine: 'Invalid line number'
	};

	let {
		maxLine,
		currentLine,
		i18n = {},
		class: className = '',
		onJump,
		onClose
	}: Props = $props();

	let inputValue = $state(String(currentLine + 1));
	let inputEl: HTMLInputElement;

	const t = $derived({ ...defaultI18n, ...i18n });

	function handleSubmit(): void {
		const n = parseInt(inputValue);
		if (isNaN(n) || n < 1 || n > maxLine) {
			return;
		}
		onJump?.(n - 1);
		onClose?.();
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			handleSubmit();
		} else if (e.key === 'Escape') {
			onClose?.();
		}
	}

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === e.currentTarget) {
			onClose?.();
		}
	}

	export function focus(): void {
		inputEl?.focus();
		inputEl?.select();
	}
</script>

<div class="jm-backdrop {className}" onclick={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="jm-modal">
		<div class="jm-header">
			<span class="jm-title">{t.title}</span>
			<span class="jm-max">{t.max}: {maxLine.toLocaleString()}</span>
		</div>
		<div class="jm-body">
			<input
				bind:this={inputEl}
				type="number"
				class="jm-input"
				placeholder={t.placeholder}
				bind:value={inputValue}
				onkeydown={handleKeydown}
				min="1"
				max={maxLine}
			/>
		</div>
		<div class="jm-footer">
			<button class="jm-btn jm-btn-secondary" onclick={() => onClose?.()}>
				{t.cancel}
			</button>
			<button class="jm-btn jm-btn-primary" onclick={handleSubmit}>
				{t.jump}
			</button>
		</div>
	</div>
</div>

<style>
	.jm-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.jm-modal {
		background: var(--pe-bg2, #161b22);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 12px;
		width: 300px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.jm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--pe-border, #30363d);
	}

	.jm-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--pe-text, #e6edf3);
	}

	.jm-max {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
	}

	.jm-body {
		padding: 20px;
	}

	.jm-input {
		width: 100%;
		padding: 10px 14px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 8px;
		color: var(--pe-text, #e6edf3);
		font-size: 16px;
		font-family: inherit;
		outline: none;
		text-align: center;
	}

	.jm-input:focus {
		border-color: var(--pe-blue, #58a6ff);
	}

	.jm-input::placeholder {
		color: var(--pe-muted, #8b949e);
	}

	/* Remove spinners */
	.jm-input::-webkit-outer-spin-button,
	.jm-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.jm-input[type='number'] {
		-moz-appearance: textfield;
	}

	.jm-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 16px 20px;
		border-top: 1px solid var(--pe-border, #30363d);
	}

	.jm-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.jm-btn-secondary {
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		color: var(--pe-text, #e6edf3);
	}

	.jm-btn-secondary:hover {
		background: var(--pe-bg, #0d1117);
	}

	.jm-btn-primary {
		background: var(--pe-blue, #58a6ff);
		border: 1px solid var(--pe-blue, #58a6ff);
		color: #fff;
	}

	.jm-btn-primary:hover {
		background: #4a94e8;
		border-color: #4a94e8;
	}
</style>
