<script lang="ts">
	import { t } from '$lib/i18n';
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
		onAddressInput,
		onClearAddresses,
		onToggleNetwork,
		onSelectAll,
		onDeselectAll,
		onStartQuery,
	}: Props = $props();

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		onAddressInput(target.value);
	}
</script>

{#if executionStatus === 'idle' || executionStatus === 'error'}
	<section class="card">
		<!-- Address Input -->
		<div class="field-group">
			<div class="field-header">
				<label for="address-input" class="field-label">{t('br.addresses.label')}</label>
				{#if addresses.length > 0}
					<button class="link-button" onclick={onClearAddresses}>
						{t('br.addresses.clearAll')}
					</button>
				{/if}
			</div>

			<textarea
				id="address-input"
				class="address-textarea"
				placeholder={t('br.addresses.placeholder')}
				value={addressInput}
				oninput={handleInput}
			></textarea>

			{#if addresses.length > 0}
				<div class="address-summary">
					{#if validAddressCount > 0}
						<span class="badge badge-success">
							{t('br.addresses.valid', { count: validAddressCount })}
						</span>
					{/if}
					{#if invalidAddressCount > 0}
						<span class="badge badge-error">
							{t('br.addresses.invalid', { count: invalidAddressCount })}
						</span>
					{/if}
				</div>
			{/if}
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
			{#if canExecute}
				<span class="summary-text">
					{t('br.summary.queries', {
						addresses: validAddressCount,
						networks: selectedNetworks.length,
						total: totalQueries,
					})}
				</span>
			{:else}
				<span></span>
			{/if}

			<button
				class="btn btn-primary"
				disabled={!canExecute || isRunning}
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

	/* Address Textarea */
	.address-textarea {
		width: 100%;
		min-height: 140px;
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
		line-height: var(--leading-relaxed);
		resize: vertical;
		transition: border-color var(--motion-fast) var(--easing);
		box-sizing: border-box;
	}

	.address-textarea::placeholder {
		color: var(--fg-subtle);
	}

	.address-textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}

	.address-summary {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	/* Badges */
	.badge {
		display: inline-flex;
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.badge-success {
		background: var(--success-subtle);
		color: var(--success);
	}

	.badge-error {
		background: var(--error-subtle);
		color: var(--error);
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
