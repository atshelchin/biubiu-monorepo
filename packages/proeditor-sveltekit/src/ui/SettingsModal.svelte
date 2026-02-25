<script lang="ts">
	import { X, ChevronDown, ChevronUp, RotateCcw } from '@lucide/svelte';
	import type { EditorConfig, ThemeColors } from '../core/types.js';

	interface SettingsModalI18n {
		title: string;
		delimiter: string;
		comma: string;
		tab: string;
		semicolon: string;
		pipe: string;
		expectedCols: string;
		fontSize: string;
		lineHeight: string;
		theme: string;
		themeDark: string;
		themeLight: string;
		customColors: string;
		colorBg: string;
		colorText: string;
		colorBorder: string;
		colorBlue: string;
		colorRed: string;
		colorGreen: string;
		colorYellow: string;
		colorCursor: string;
		colorSelection: string;
		resetColors: string;
		numberFormat: string;
		numberValidation: string;
		thousandSep: string;
		decimalSep: string;
		thousandNone: string;
		thousandComma: string;
		thousandDot: string;
		thousandSpace: string;
		thousandUnderscore: string;
		decimalDot: string;
		decimalComma: string;
		numberColumns: string;
		close: string;
	}

	interface Props {
		config: Partial<EditorConfig>;
		i18n?: Partial<SettingsModalI18n>;
		class?: string;
		onUpdate?: (key: keyof EditorConfig, value: unknown) => void;
		onClose?: () => void;
	}

	// Default i18n
	const defaultI18n: SettingsModalI18n = {
		title: 'Settings',
		delimiter: 'CSV Delimiter',
		comma: 'Comma (,)',
		tab: 'Tab',
		semicolon: 'Semicolon (;)',
		pipe: 'Pipe (|)',
		expectedCols: 'Expected Columns',
		fontSize: 'Font Size',
		lineHeight: 'Line Height',
		theme: 'Theme',
		themeDark: 'Dark',
		themeLight: 'Light',
		customColors: 'Custom Colors',
		colorBg: 'Background',
		colorText: 'Text',
		colorBorder: 'Border',
		colorBlue: 'Blue / Accent',
		colorRed: 'Red / Error',
		colorGreen: 'Green / Success',
		colorYellow: 'Yellow / Warning',
		colorCursor: 'Cursor',
		colorSelection: 'Selection',
		resetColors: 'Reset Colors',
		numberFormat: 'Number Format',
		numberValidation: 'Enable number validation',
		thousandSep: 'Thousand Separator',
		decimalSep: 'Decimal Separator',
		thousandNone: 'None',
		thousandComma: 'Comma (,)',
		thousandDot: 'Dot (.)',
		thousandSpace: 'Space',
		thousandUnderscore: 'Underscore (_)',
		decimalDot: 'Dot (.)',
		decimalComma: 'Comma (,)',
		numberColumns: 'Columns (empty=all)',
		close: 'Close'
	};

	let { config, i18n = {}, class: className = '', onUpdate, onClose }: Props = $props();

	let showCustomColors = $state(false);

	const t = $derived({ ...defaultI18n, ...i18n });

	const delimiterOptions = $derived([
		{ value: ',', label: t.comma },
		{ value: '\t', label: t.tab },
		{ value: ';', label: t.semicolon },
		{ value: '|', label: t.pipe }
	]);

	interface ColorField {
		key: keyof ThemeColors;
		label: string;
	}

	const colorFields = $derived<ColorField[]>([
		{ key: 'bg', label: t.colorBg },
		{ key: 'text', label: t.colorText },
		{ key: 'border', label: t.colorBorder },
		{ key: 'blue', label: t.colorBlue },
		{ key: 'red', label: t.colorRed },
		{ key: 'green', label: t.colorGreen },
		{ key: 'yellow', label: t.colorYellow },
		{ key: 'cursor', label: t.colorCursor },
		{ key: 'selection', label: t.colorSelection }
	]);

	function handleColorChange(key: keyof ThemeColors, value: string): void {
		const current: ThemeColors = config.customColors ?? {};
		onUpdate?.('customColors', { ...current, [key]: value });
	}

	function handleResetColors(): void {
		onUpdate?.('customColors', {});
	}

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === e.currentTarget) {
			onClose?.();
		}
	}
</script>

<div class="sm-backdrop {className}" onclick={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="sm-modal">
		<div class="sm-header">
			<span class="sm-title">{t.title}</span>
			<button class="sm-close" onclick={() => onClose?.()}>
				<X size={16} />
			</button>
		</div>

		<div class="sm-body">
			<!-- CSV Delimiter -->
			<div class="sm-row">
				<span class="sm-label">{t.delimiter}</span>
				<div class="sm-value">
					<select
						class="sm-select"
						value={config.delimiter ?? ','}
						onchange={(e) => onUpdate?.('delimiter', e.currentTarget.value)}
					>
						{#each delimiterOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Expected Columns -->
			<div class="sm-row">
				<span class="sm-label">{t.expectedCols}</span>
				<div class="sm-value">
					<input
						type="number"
						class="sm-input sm-input-number"
						value={config.expectedColumns ?? 5}
						min="1"
						max="100"
						onchange={(e) => onUpdate?.('expectedColumns', parseInt(e.currentTarget.value) || 5)}
					/>
				</div>
			</div>

			<!-- Font Size -->
			<div class="sm-row">
				<span class="sm-label">{t.fontSize}</span>
				<div class="sm-value">
					<input
						type="number"
						class="sm-input sm-input-number"
						value={config.fontSize ?? 14}
						min="10"
						max="24"
						onchange={(e) => onUpdate?.('fontSize', parseInt(e.currentTarget.value) || 14)}
					/>
					<span class="sm-unit">px</span>
				</div>
			</div>

			<!-- Line Height -->
			<div class="sm-row">
				<span class="sm-label">{t.lineHeight}</span>
				<div class="sm-value">
					<input
						type="number"
						class="sm-input sm-input-number"
						value={config.lineHeight ?? 22}
						min="16"
						max="40"
						onchange={(e) => onUpdate?.('lineHeight', parseInt(e.currentTarget.value) || 22)}
					/>
					<span class="sm-unit">px</span>
				</div>
			</div>

			<!-- Number Format -->
			<div class="sm-row">
				<span class="sm-label">{t.numberValidation}</span>
				<div class="sm-value">
					<label class="sm-switch">
						<input
							type="checkbox"
							checked={config.numberValidation ?? false}
							onchange={(e) => onUpdate?.('numberValidation', e.currentTarget.checked)}
						/>
						<span class="sm-slider"></span>
					</label>
				</div>
			</div>

			{#if config.numberValidation}
				<div class="sm-row">
					<span class="sm-label">{t.thousandSep}</span>
					<div class="sm-value">
						<select
							class="sm-select"
							value={config.thousandSeparator ?? ','}
							onchange={(e) => onUpdate?.('thousandSeparator', e.currentTarget.value)}
						>
							<option value="">{t.thousandNone}</option>
							<option value=",">{t.thousandComma}</option>
							<option value=".">{t.thousandDot}</option>
							<option value=" ">{t.thousandSpace}</option>
							<option value="_">{t.thousandUnderscore}</option>
						</select>
					</div>
				</div>

				<div class="sm-row">
					<span class="sm-label">{t.decimalSep}</span>
					<div class="sm-value">
						<select
							class="sm-select"
							value={config.decimalSeparator ?? '.'}
							onchange={(e) => onUpdate?.('decimalSeparator', e.currentTarget.value)}
						>
							<option value=".">{t.decimalDot}</option>
							<option value=",">{t.decimalComma}</option>
						</select>
					</div>
				</div>

				<div class="sm-row">
					<span class="sm-label">{t.numberColumns}</span>
					<div class="sm-value">
						<input
							type="text"
							class="sm-input"
							style="width: 100px"
							placeholder="1,3,5"
							value={(config.numberColumns ?? []).join(',')}
							onchange={(e) => {
								const val = e.currentTarget.value.trim();
								const cols = val
									? val
											.split(',')
											.map((s) => parseInt(s.trim()))
											.filter((n) => !isNaN(n))
									: [];
								onUpdate?.('numberColumns', cols);
							}}
						/>
					</div>
				</div>
			{/if}

			<!-- Theme -->
			<div class="sm-row">
				<span class="sm-label">{t.theme}</span>
				<div class="sm-value">
					<div class="sm-toggle-group">
						<button
							class="sm-toggle"
							class:active={config.theme !== 'light'}
							onclick={() => onUpdate?.('theme', 'dark')}
						>
							{t.themeDark}
						</button>
						<button
							class="sm-toggle"
							class:active={config.theme === 'light'}
							onclick={() => onUpdate?.('theme', 'light')}
						>
							{t.themeLight}
						</button>
					</div>
				</div>
			</div>

			<!-- Custom Colors -->
			<div class="sm-row sm-row-col">
				<div class="sm-row-header">
					<span class="sm-label">{t.customColors}</span>
					<button class="sm-link-btn" onclick={() => (showCustomColors = !showCustomColors)}>
						{#if showCustomColors}
							<ChevronUp size={14} />
						{:else}
							<ChevronDown size={14} />
						{/if}
					</button>
				</div>
				{#if showCustomColors}
					<div class="sm-color-grid">
						{#each colorFields as field (field.key)}
							<label class="sm-color-item">
								<input
									type="color"
									class="sm-color-input"
									value={config.customColors?.[field.key] ?? '#000000'}
									oninput={(e) => handleColorChange(field.key, e.currentTarget.value)}
								/>
								<span class="sm-color-label">{field.label}</span>
							</label>
						{/each}
					</div>
					<button class="sm-reset-btn" onclick={handleResetColors}>
						<RotateCcw size={12} />
						{t.resetColors}
					</button>
				{/if}
			</div>
		</div>

		<div class="sm-footer">
			<button class="sm-btn" onclick={() => onClose?.()}>{t.close}</button>
		</div>
	</div>
</div>

<style>
	.sm-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.sm-modal {
		background: var(--pe-bg2, #161b22);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 12px;
		width: 400px;
		max-width: 90vw;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.sm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--pe-border, #30363d);
	}

	.sm-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--pe-text, #e6edf3);
	}

	.sm-close {
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

	.sm-close:hover {
		background: var(--pe-bg3, #21262d);
		color: var(--pe-text, #e6edf3);
	}

	.sm-body {
		padding: 16px 20px;
	}

	.sm-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 0;
		border-bottom: 1px solid var(--pe-border, #30363d);
	}

	.sm-row:last-child {
		border-bottom: none;
	}

	.sm-label {
		font-size: 14px;
		color: var(--pe-text, #e6edf3);
	}

	.sm-value {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sm-select {
		padding: 6px 10px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		color: var(--pe-text, #e6edf3);
		font-size: 13px;
		font-family: inherit;
		outline: none;
		cursor: pointer;
	}

	.sm-select:focus {
		border-color: var(--pe-blue, #58a6ff);
	}

	.sm-input {
		padding: 6px 10px;
		background: var(--pe-bg, #0d1117);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		color: var(--pe-text, #e6edf3);
		font-size: 13px;
		font-family: inherit;
		outline: none;
	}

	.sm-input:focus {
		border-color: var(--pe-blue, #58a6ff);
	}

	.sm-input-number {
		width: 70px;
		text-align: center;
	}

	.sm-unit {
		font-size: 12px;
		color: var(--pe-muted, #8b949e);
	}

	/* Toggle switch */
	.sm-switch {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
	}

	.sm-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.sm-slider {
		position: absolute;
		cursor: pointer;
		inset: 0;
		background: var(--pe-bg3, #21262d);
		border-radius: 10px;
		transition: 0.2s;
	}

	.sm-slider::before {
		content: '';
		position: absolute;
		height: 14px;
		width: 14px;
		left: 3px;
		bottom: 3px;
		background: var(--pe-muted, #8b949e);
		border-radius: 50%;
		transition: 0.2s;
	}

	.sm-switch input:checked + .sm-slider {
		background: var(--pe-blue, #58a6ff);
	}

	.sm-switch input:checked + .sm-slider::before {
		transform: translateX(16px);
		background: #fff;
	}

	.sm-toggle-group {
		display: flex;
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		overflow: hidden;
	}

	.sm-toggle {
		padding: 6px 12px;
		background: var(--pe-bg, #0d1117);
		border: none;
		color: var(--pe-muted, #8b949e);
		font-size: 13px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sm-toggle:not(:last-child) {
		border-right: 1px solid var(--pe-border, #30363d);
	}

	.sm-toggle.active {
		background: var(--pe-blue, #58a6ff);
		color: #fff;
	}

	/* Custom colors */
	.sm-row-col {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}

	.sm-row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.sm-link-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--pe-muted, #8b949e);
		cursor: pointer;
		padding: 2px 6px;
	}

	.sm-link-btn:hover {
		color: var(--pe-text, #e6edf3);
	}

	.sm-color-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}

	.sm-color-item {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.sm-color-input {
		width: 28px;
		height: 28px;
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 4px;
		padding: 1px;
		background: transparent;
		cursor: pointer;
	}

	.sm-color-input::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.sm-color-input::-webkit-color-swatch {
		border: none;
		border-radius: 3px;
	}

	.sm-color-label {
		font-size: 11px;
		color: var(--pe-dim, #8b949e);
		white-space: nowrap;
	}

	.sm-reset-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: transparent;
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 4px;
		color: var(--pe-muted, #8b949e);
		font-size: 11px;
		font-family: inherit;
		cursor: pointer;
		align-self: flex-start;
	}

	.sm-reset-btn:hover {
		color: var(--pe-red, #f85149);
		border-color: var(--pe-red, #f85149);
	}

	.sm-footer {
		padding: 16px 20px;
		border-top: 1px solid var(--pe-border, #30363d);
		display: flex;
		justify-content: flex-end;
	}

	.sm-btn {
		padding: 8px 16px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		color: var(--pe-text, #e6edf3);
		font-size: 14px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sm-btn:hover {
		background: var(--pe-bg, #0d1117);
		border-color: var(--pe-blue, #58a6ff);
	}
</style>
