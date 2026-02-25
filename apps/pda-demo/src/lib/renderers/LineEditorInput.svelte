<script lang="ts">
	/**
	 * Line Editor Input - High-performance address input using LineEditor
	 * Supports validation, duplicate detection, and large lists
	 */
	import { LineEditor, type LineValidator } from '@shelchin/proeditor-sveltekit';
	import type { InputRendererProps } from '@shelchin/pda-sveltekit';
	import { isAddress } from 'viem';

	interface Props extends InputRendererProps<string> {}

	let { field, value, onChange, disabled = false, error }: Props = $props();

	// Parsed addresses from the editor
	let validLines = $state<string[]>([]);
	let validCount = $state(0);
	let errorCount = $state(0);
	let duplicateCount = $state(0);

	// Ethereum address validator
	const validateAddress: LineValidator = (line: string) => {
		if (!line.trim()) return null; // Empty lines handled by LineEditor
		if (!isAddress(line)) {
			return 'Invalid Ethereum address';
		}
		return null;
	};

	// Sync validLines to parent value
	$effect(() => {
		// Join valid lines and update parent
		const newValue = validLines.join('\n');
		if (newValue !== value) {
			onChange(newValue);
		}
	});

	// Example addresses for demo
	const exampleAddresses = [
		'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
		'0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
		'0x742d35Cc6634C0532925a3b844Bc9e7595f1e3b1'
	];

	// i18n for LineEditor
	const lineEditorI18n = {
		statusBar: {
			valid: 'valid addresses',
			loadExamples: 'Load {0} examples',
			clear: 'Clear'
		},
		errorDrawer: {
			title: 'Invalid Addresses',
			noErrors: 'All addresses are valid',
			line: 'Line',
			error: 'Invalid address',
			duplicate: 'Duplicate',
			andMore: '{0} more...',
			close: 'Close'
		},
		validation: {
			duplicate: 'Duplicate address',
			emptyLine: 'Empty line'
		},
		upload: 'Upload'
	};
</script>

<div class="line-editor-input">
	<label for={field.name}>
		{field.label}
		{#if field.required}
			<span class="required">*</span>
		{/if}
	</label>

	{#if field.description}
		<p class="description">{field.description}</p>
	{/if}

	<div class="editor-wrapper" class:disabled class:has-error={error}>
		<LineEditor
			validate={validateAddress}
			placeholder="Enter Ethereum addresses, one per line&#10;0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
			examples={exampleAddresses}
			i18n={lineEditorI18n}
			detectDuplicates={true}
			minHeight={160}
			maxHeight={400}
			showUploadButton={true}
			bind:validLines
			bind:validCount
			bind:errorCount
			bind:duplicateCount
		/>
	</div>

	{#if error}
		<span class="error-text">{error}</span>
	{/if}

	<div class="stats">
		<span class="stat valid">{validCount} valid</span>
		{#if errorCount > 0}
			<span class="stat error">{errorCount} invalid</span>
		{/if}
		{#if duplicateCount > 0}
			<span class="stat duplicate">{duplicateCount} duplicates</span>
		{/if}
	</div>
</div>

<style>
	.line-editor-input {
		margin-bottom: 20px;
	}

	label {
		display: block;
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 8px;
		color: var(--text-primary, #1d1d1f);
	}

	.required {
		color: var(--error, #ff453a);
		margin-left: 2px;
	}

	.description {
		font-size: 13px;
		color: var(--text-muted, rgba(0, 0, 0, 0.5));
		margin: 0 0 12px 0;
	}

	.editor-wrapper {
		border-radius: 8px;
		overflow: hidden;
	}

	.editor-wrapper.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.editor-wrapper.has-error {
		box-shadow: 0 0 0 2px var(--error, #ff453a);
	}

	.error-text {
		display: block;
		font-size: 12px;
		color: var(--error, #ff453a);
		margin-top: 4px;
	}

	.stats {
		display: flex;
		gap: 12px;
		margin-top: 8px;
		font-size: 12px;
	}

	.stat {
		padding: 2px 8px;
		border-radius: 4px;
		font-weight: 500;
	}

	.stat.valid {
		background: rgba(52, 199, 89, 0.15);
		color: var(--success, #34c759);
	}

	.stat.error {
		background: rgba(255, 69, 58, 0.15);
		color: var(--error, #ff453a);
	}

	.stat.duplicate {
		background: rgba(255, 159, 10, 0.15);
		color: var(--warning, #ff9f0a);
	}

	/* Dark mode support */
	:global([data-theme='dark']) label {
		color: var(--text-primary, #f5f5f7);
	}

	:global([data-theme='dark']) .description {
		color: var(--text-muted, rgba(255, 255, 255, 0.5));
	}
</style>
