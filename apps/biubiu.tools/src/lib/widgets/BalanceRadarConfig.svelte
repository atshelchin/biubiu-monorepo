<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import { LineEditor, FileUploadModal } from '@shelchin/proeditor-sveltekit';
	import type { AddressEntry, NetworkInfo } from '$lib/pda-apps/balance-radar/modules/config.js';

	interface Props {
		addresses: AddressEntry[];
		addressInput: string;
		selectedNetworks: string[];
		availableNetworks: NetworkInfo[];
		validAddressCount: number;
		invalidAddressCount: number;
		totalQueries: number;
		canExecute: boolean;
		executionStatus: string;
		errorMessage: string;
		isRunning: boolean;
		onSetValidAddresses: (addresses: string[]) => void;
		onAddressInput: (text: string) => void;
		onClearAddresses: () => void;
		onToggleNetwork: (network: string) => void;
		onSelectAll: () => void;
		onDeselectAll: () => void;
		onStartQuery: () => void;
	}

	let {
		addresses,
		addressInput,
		selectedNetworks,
		availableNetworks,
		validAddressCount,
		invalidAddressCount,
		totalQueries,
		canExecute,
		executionStatus,
		errorMessage,
		isRunning,
		onSetValidAddresses,
		onAddressInput,
		onClearAddresses,
		onToggleNetwork,
		onSelectAll,
		onDeselectAll,
		onStartQuery,
	}: Props = $props();

	// LineEditor ref and bindable outputs
	let editorRef: ReturnType<typeof LineEditor>;
	let validLines = $state<string[]>([]);
	let editorValidCount = $state(0);
	let editorErrorCount = $state(0);
	let editorDuplicateCount = $state(0);

	// Bidirectional sync: loop guard + debounce
	let lastSyncedLines = '';
	let lastSyncedInput = '';
	let syncTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (syncTimer) clearTimeout(syncTimer);
	});

	// Ethereum address validator
	const validateAddress = (line: string) =>
		/^0x[a-fA-F0-9]{40}$/.test(line) ? null : t('br.lineEditor.validation.invalidAddress');

	// LineEditor i18n from app translations
	const lineEditorI18n = $derived({
		statusBar: {
			valid: t('br.lineEditor.statusBar.valid'),
		},
		errorDrawer: {
			title: t('br.lineEditor.errorDrawer.title'),
			line: t('br.lineEditor.errorDrawer.line'),
			error: t('br.lineEditor.errorDrawer.error'),
			duplicate: t('br.lineEditor.errorDrawer.duplicate'),
			andMore: t('br.lineEditor.errorDrawer.andMore'),
			close: t('br.lineEditor.errorDrawer.close'),
		},
		validation: {
			duplicate: t('br.lineEditor.validation.duplicate'),
		},
	});

	// Derived: local summary (immediate, no module round-trip)
	const localTotalQueries = $derived(editorValidCount * selectedNetworks.length);
	const localCanExecute = $derived(editorValidCount > 0 && selectedNetworks.length > 0);

	// User → Module: debounced sync of validLines only (O(n) array, no full-text parse)
	$effect(() => {
		const lines = validLines;
		const key = lines.join('\n');

		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			if (key !== lastSyncedLines) {
				lastSyncedLines = key;
				lastSyncedInput = key;
				onSetValidAddresses(lines);
			}
		}, 150);
	});

	// AI/Module → LineEditor: sync when addressInput changes externally
	$effect(() => {
		if (addressInput !== lastSyncedInput) {
			lastSyncedInput = addressInput;
			lastSyncedLines = '';
			editorRef?.loadContent(addressInput);
		}
	});
</script>

{#if executionStatus === 'idle' || executionStatus === 'error'}
	<section class="card">
		<!-- Address Input -->
		<div class="field-group">
			<div class="field-header">
				<label class="field-label">{t('br.addresses.label')}</label>
				{#if addresses.length > 0}
					<button class="link-button" onclick={onClearAddresses}>
						{t('br.addresses.clearAll')}
					</button>
				{/if}
			</div>

			<div
				class="editor-wrapper"
				style="
					--color-surface-1: var(--bg-sunken);
					--color-surface-2: var(--bg-raised);
					--color-surface-3: var(--bg-raised);
					--color-border: var(--border-base);
					--color-border-strong: var(--border-strong, var(--border-base));
					--color-foreground: var(--fg-base);
					--color-muted-foreground: var(--fg-muted);
					--color-primary: var(--accent);
					--color-success: var(--success);
					--color-error: var(--error);
					--color-warning: var(--warning, #d29922);
				"
			>
				<LineEditor
					bind:this={editorRef}
					validate={validateAddress}
					placeholder={t('br.addresses.placeholder')}
					i18n={lineEditorI18n}
					detectDuplicates={true}
					minHeight={260}
					maxHeight={500}
					bind:validLines
					bind:validCount={editorValidCount}
					bind:errorCount={editorErrorCount}
					bind:duplicateCount={editorDuplicateCount}
				>
					{#snippet fileUploadModal({ open, onClose, onConfirm })}
						<FileUploadModal {open} {onClose} {onConfirm} columnCount={1} columnLabels={[t('br.addresses.label')]} />
					{/snippet}
				</LineEditor>
			</div>
		</div>

		<!-- Network Selector -->
		<div class="field-group">
			<div class="field-header">
				<span class="field-label">{t('br.networks.label')}</span>
				<div class="network-actions">
					<button class="link-button" onclick={onSelectAll}>
						{t('br.networks.selectAll')}
					</button>
					<span class="separator">|</span>
					<button class="link-button" onclick={onDeselectAll}>
						{t('br.networks.deselectAll')}
					</button>
				</div>
			</div>

			<div class="network-chips">
				{#each availableNetworks as network}
					{@const selected = selectedNetworks.includes(network.key)}
					<button
						class="chip"
						class:chip-selected={selected}
						onclick={() => onToggleNetwork(network.key)}
					>
						{network.name}
						<span class="chip-symbol">({network.symbol})</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Error from previous run -->
		{#if executionStatus === 'error' && errorMessage}
			<div class="error-banner">
				<strong>{t('br.error.title')}</strong>
				<p>{errorMessage}</p>
			</div>
		{/if}

		<!-- Summary & Start -->
		<div class="summary-bar">
			{#if localCanExecute}
				<span class="summary-text">
					{t('br.summary.queries', {
						addresses: editorValidCount,
						networks: selectedNetworks.length,
						total: localTotalQueries,
					})}
				</span>
			{:else}
				<span></span>
			{/if}

			<button
				class="btn btn-primary"
				disabled={!localCanExecute || isRunning}
				onclick={onStartQuery}
			>
				{isRunning ? t('br.summary.running') : t('br.summary.start')}
			</button>
		</div>
	</section>
{/if}

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
	}

	.field-group {
		margin-bottom: var(--space-6);
	}

	.field-group:last-child {
		margin-bottom: 0;
	}

	.field-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-2);
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.editor-wrapper {
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	/* Network Chips */
	.network-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.separator {
		color: var(--fg-faint);
		font-size: var(--text-xs);
	}

	.network-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		user-select: none;
	}

	.chip:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.chip-selected {
		background: var(--accent-muted);
		border-color: var(--accent);
		color: var(--accent);
	}

	.chip-selected:hover {
		background: var(--accent-subtle);
	}

	.chip-symbol {
		font-size: var(--text-xs);
		opacity: 0.7;
	}

	/* Link Button */
	.link-button {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--accent);
		cursor: pointer;
		transition: opacity var(--motion-fast) var(--easing);
	}

	.link-button:hover {
		opacity: 0.8;
	}

	/* Error Banner */
	.error-banner {
		padding: var(--space-3) var(--space-4);
		background: var(--error-subtle);
		border: 1px solid var(--error);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
	}

	.error-banner strong {
		color: var(--error);
		font-size: var(--text-sm);
	}

	.error-banner p {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		margin: var(--space-1) 0 0;
	}

	/* Summary Bar */
	.summary-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}

	.summary-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* Button */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		border: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn:not(:disabled):hover {
		transform: translateY(-1px);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-primary:not(:disabled):hover {
		background: var(--accent-hover);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.card {
			padding: var(--space-4);
		}

		.summary-bar {
			flex-direction: column;
			gap: var(--space-3);
			align-items: stretch;
		}

		.summary-text {
			text-align: center;
		}
	}
</style>
