<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t, formatNumber } from '$lib/i18n';
	import { LineEditor, FileUploadModal } from '@shelchin/proeditor-sveltekit';
	import type { NetworkInfo, TokenInfo } from '$lib/pda-apps/balance-radar/modules/config.js';
	import AddNetworkModal from './AddNetworkModal.svelte';
	import AddTokenModal from './AddTokenModal.svelte';

	interface Props {
		/** Current editor content, mirrored back into the LineEditor when set externally. */
		addressInput: string;
		selectedNetworks: string[];
		availableNetworks: NetworkInfo[];
		availableTokens: Record<string, TokenInfo[]>;
		selectedTokens: Record<string, string[]>;
		executionStatus: string;
		errorMessage: string;
		isRunning: boolean;
		onSetValidAddresses: (addresses: string[]) => void;
		onToggleNetwork: (network: string) => void;
		onSelectAll: () => void;
		onDeselectAll: () => void;
		onToggleToken: (network: string, tokenId: string) => void;
		onAddCustomNetwork: (data: {
			name: string;
			chainId: number;
			rpcs: string[];
			symbol: string;
			decimals: number;
		}) => Promise<void> | void;
		onRemoveCustomNetwork: (chainId: number) => void;
		onFetchTokenMetadata: (
			network: string,
			address: string,
		) => Promise<{ symbol: string; decimals: number }>;
		onAddCustomToken: (
			network: string,
			data: { address: string; symbol: string; decimals: number },
		) => Promise<void> | void;
		onRemoveCustomToken: (network: string, address: string) => void;
		onStartQuery: () => void;
	}

	let {
		addressInput,
		selectedNetworks,
		availableNetworks,
		availableTokens,
		selectedTokens,
		executionStatus,
		errorMessage,
		isRunning,
		onSetValidAddresses,
		onToggleNetwork,
		onSelectAll,
		onDeselectAll,
		onToggleToken,
		onAddCustomNetwork,
		onRemoveCustomNetwork,
		onFetchTokenMetadata,
		onAddCustomToken,
		onRemoveCustomToken,
		onStartQuery,
	}: Props = $props();

	// LineEditor ref and bindable outputs
	let editorRef = $state<ReturnType<typeof LineEditor>>();
	let validLines = $state<string[]>([]);
	let editorValidCount = $state(0);
	let editorErrorCount = $state(0);
	let editorDuplicateCount = $state(0);

	// Bidirectional sync: loop guard + debounce
	let lastSyncedLines = '';
	let lastSyncedInput = '';
	let syncTimer: ReturnType<typeof setTimeout> | undefined;

	// Modal state
	let showAddNetwork = $state(false);
	let addTokenForNetwork = $state<string | null>(null);

	onDestroy(() => {
		if (syncTimer) clearTimeout(syncTimer);
	});

	// Ethereum address validator
	const validateAddress = (line: string) =>
		/^0x[a-fA-F0-9]{40}$/.test(line) ? null : t('br.lineEditor.validation.invalidAddress');

	// LineEditor i18n from app translations
	const lineEditorI18n = $derived({
		upload: t('br.lineEditor.upload'),
		statusBar: {
			valid: t('br.lineEditor.statusBar.valid'),
			clear: t('br.lineEditor.statusBar.clear'),
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
	const localTotalQueries = $derived(
		editorValidCount *
			selectedNetworks.reduce((sum, n) => sum + (selectedTokens[n]?.length ?? 0), 0),
	);
	const localCanExecute = $derived(localTotalQueries > 0);
	// Heads-up (not a blocker) when a run is big enough to take minutes.
	const isLargeRun = $derived(localTotalQueries > 50000);

	// Lookup helpers
	const networkByKey = $derived(
		new Map(availableNetworks.map((n) => [n.key, n] as const)),
	);
	const existingChainIds = $derived(availableNetworks.map((n) => n.chainId));

	function tokensFor(network: string): TokenInfo[] {
		return availableTokens[network] ?? [];
	}
	function existingTokenAddresses(network: string): string[] {
		return tokensFor(network)
			.filter((tk) => tk.kind === 'erc20')
			.map((tk) => tk.id);
	}

	// User → Module: debounced sync of validLines only
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
				<span class="field-label">{t('br.addresses.label')}</span>
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
					<button class="link-button" onclick={() => (showAddNetwork = true)}>
						{t('br.networks.addCustom')}
					</button>
					<span class="separator">|</span>
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
				{#each availableNetworks as network (network.key)}
					{@const selected = selectedNetworks.includes(network.key)}
					<div class="chip-wrap">
						<button
							class="chip"
							class:chip-selected={selected}
							onclick={() => onToggleNetwork(network.key)}
						>
							{network.name}
							<span class="chip-symbol">({network.symbol})</span>
							{#if network.isCustom}
								<span class="badge">{t('br.networks.customBadge')}</span>
							{/if}
						</button>
						{#if network.isCustom}
							<button
								class="chip-remove"
								title={t('br.networks.remove')}
								aria-label={t('br.networks.remove')}
								onclick={() => onRemoveCustomNetwork(network.chainId)}
							>
								×
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Per-network Token Selectors -->
		{#each selectedNetworks as networkKey (networkKey)}
			{@const net = networkByKey.get(networkKey)}
			{#if net}
				<div class="field-group token-group">
					<div class="field-header">
						<span class="field-label token-label">
							{net.name}
							<span class="token-label-sub">· {t('br.tokens.label')}</span>
						</span>
						<button class="link-button" onclick={() => (addTokenForNetwork = networkKey)}>
							{t('br.tokens.addCustom')}
						</button>
					</div>

					<div class="network-chips">
						{#each tokensFor(networkKey) as tk (tk.id)}
							{@const tokenSelected = (selectedTokens[networkKey] ?? []).includes(tk.id)}
							<div class="chip-wrap">
								<button
									class="chip chip-token"
									class:chip-selected={tokenSelected}
									onclick={() => onToggleToken(networkKey, tk.id)}
								>
									{tk.symbol}
									{#if tk.kind === 'native'}
										<span class="chip-symbol">({t('br.tokens.native')})</span>
									{/if}
									{#if tk.isCustom}
										<span class="badge">{t('br.tokens.customBadge')}</span>
									{/if}
								</button>
								{#if tk.isCustom && tk.address}
									<button
										class="chip-remove"
										title={t('br.tokens.remove')}
										aria-label={t('br.tokens.remove')}
										onclick={() => onRemoveCustomToken(networkKey, tk.address!)}
									>
										×
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}

		<!-- Error from previous run -->
		{#if executionStatus === 'error' && errorMessage}
			<div class="error-banner">
				<strong>{t('br.error.title')}</strong>
				<p>{errorMessage}</p>
			</div>
		{/if}

		<!-- Large-run heads-up -->
		{#if isLargeRun}
			<div class="scale-warning">
				{t('br.summary.largeWarning', { total: formatNumber(localTotalQueries) })}
			</div>
		{/if}

		<!-- Summary & Start -->
		<div class="summary-bar">
			{#if localCanExecute}
				<span class="summary-text">
					{t('br.summary.totalQueries', { total: localTotalQueries })}
				</span>
			{:else}
				<span class="summary-hint">{t('br.summary.hint')}</span>
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

	<AddNetworkModal
		open={showAddNetwork}
		onClose={() => (showAddNetwork = false)}
		{existingChainIds}
		onSubmit={onAddCustomNetwork}
	/>

	{#if addTokenForNetwork}
		{@const net = networkByKey.get(addTokenForNetwork)}
		<AddTokenModal
			open={true}
			onClose={() => (addTokenForNetwork = null)}
			networkKey={addTokenForNetwork}
			networkName={net?.name ?? addTokenForNetwork}
			existingAddresses={existingTokenAddresses(addTokenForNetwork)}
			onFetchMetadata={(address) => onFetchTokenMetadata(addTokenForNetwork!, address)}
			onSubmit={(data) => onAddCustomToken(addTokenForNetwork!, data)}
		/>
	{/if}
{/if}

<style>
	.card {
		background: var(--bg-elevated);
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

	.token-group {
		margin-bottom: var(--space-4);
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

	.token-label-sub {
		color: var(--fg-subtle);
		font-weight: var(--weight-normal);
	}

	.editor-wrapper {
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	/* Network / Token Chips */
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

	.chip-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
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

	.chip-token {
		font-size: var(--text-xs);
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

	.chip:focus-visible,
	.chip-remove:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.chip-symbol {
		font-size: var(--text-xs);
		opacity: 0.7;
	}

	.badge {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		color: var(--fg-subtle);
		border: 1px solid var(--border-subtle);
	}

	.chip-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		margin-left: -6px;
		margin-right: 2px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--bg-elevated, var(--bg-raised));
		color: var(--fg-muted);
		font-size: var(--text-sm);
		line-height: 1;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.chip-remove:hover {
		background: var(--error-subtle);
		color: var(--error);
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

	.link-button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
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

	.summary-hint {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	.scale-warning {
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
		background: var(--warning-subtle);
		border: 1px solid var(--warning);
		border-radius: var(--radius-md);
		font-size: var(--text-xs);
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

	.btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
