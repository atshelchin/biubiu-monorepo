<script lang="ts">
	import { t } from '$lib/i18n';
	import { formatDateTime } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import DepositModal from './DepositModal.svelte';
	import { authStore } from './auth-store.svelte.js';
	import { fetchAllBalances, formatBalance, type ChainBalance } from './wallet.js';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let showLogoutConfirm = $state(false);
	let showDeposit = $state(false);
	let showDetails = $state(false);
	let copiedField = $state<string | null>(null);
	let balances = $state<ChainBalance[]>([]);
	let balancesLoading = $state(false);

	const user = $derived(authStore.user);

	// 打开 modal 时加载余额
	$effect(() => {
		if (open && user?.safeAddress) {
			loadBalances();
		}
	});

	async function loadBalances() {
		if (!user?.safeAddress) return;
		balancesLoading = true;
		balances = await fetchAllBalances(user.safeAddress);
		balancesLoading = false;
	}

	function handleLogout() {
		showLogoutConfirm = false;
		authStore.logout();
		onClose();
	}

	async function copyToClipboard(value: string, field: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => { copiedField = null; }, 1500);
		} catch {
			// Fallback
		}
	}
</script>

<ResponsiveModal {open} {onClose} title={t('auth.profile.title')}>
	{#if user}
		<div class="profile-content">
			<!-- Avatar + Name -->
			<div class="profile-header">
				<div class="profile-avatar">
					{user.name.charAt(0).toUpperCase()}
				</div>
				<div class="profile-name">{user.name}</div>
				<div class="profile-created">{formatDateTime(new Date(user.createdAt))}</div>
			</div>

			<!-- Safe Address -->
			<div class="wallet-section">
				<span class="section-label">{t('auth.profile.safeAddress')}</span>
				<button
					class="address-row"
					onclick={() => copyToClipboard(user.safeAddress, 'safeAddress')}
					title={t('auth.profile.clickToCopy')}
				>
					<span class="address-text">{user.safeAddress}</span>
					{#if copiedField === 'safeAddress'}
						<span class="copied-badge">{t('auth.profile.copied')}</span>
					{:else}
						<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
						</svg>
					{/if}
				</button>
			</div>

			<!-- Balances -->
			<div class="balances-section">
				<div class="balances-header">
					<span class="section-label">{t('auth.wallet.balances')}</span>
					<button class="refresh-btn" onclick={loadBalances} disabled={balancesLoading} title={t('auth.wallet.refresh')}>
						<svg class:spinning={balancesLoading} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="23 4 23 10 17 10"/>
							<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
						</svg>
					</button>
				</div>

				{#if balancesLoading && balances.length === 0}
					<div class="balances-loading">
						<span class="spinner-sm"></span>
					</div>
				{:else if balances.length > 0}
					<div class="balances-list">
						{#each balances as chain}
							<div class="balance-row">
								<span class="chain-name">{chain.name}</span>
								<span class="chain-balance" class:zero={chain.balanceRaw === 0n} class:error={chain.error}>
									{#if chain.error}
										—
									{:else}
										{formatBalance(chain.balance)} {chain.symbol}
									{/if}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<button class="action-btn deposit" onclick={() => (showDeposit = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19"/>
					<polyline points="19 12 12 19 5 12"/>
				</svg>
				{t('auth.wallet.deposit')}
			</button>

			<!-- Technical Details (collapsed) -->
			<button
				class="details-toggle"
				onclick={() => (showDetails = !showDetails)}
			>
				<span>{t('auth.profile.technicalDetails')}</span>
				<svg
					class="chevron"
					class:expanded={showDetails}
					xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
					fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
				>
					<polyline points="6 9 12 15 18 9"/>
				</svg>
			</button>

			{#if showDetails}
				<div class="details-fields">
					<div class="detail-field">
						<span class="detail-label">{t('auth.profile.rpId')}</span>
						<span class="detail-value">{user.rpId}</span>
					</div>

					<div class="detail-field">
						<span class="detail-label">{t('auth.profile.credentialId')}</span>
						<button
							class="detail-value copyable"
							onclick={() => copyToClipboard(user.credentialId, 'credentialId')}
						>
							<span>{user.credentialId}</span>
							{#if copiedField === 'credentialId'}
								<span class="copied-badge">{t('auth.profile.copied')}</span>
							{/if}
						</button>
					</div>

					<div class="detail-field">
						<span class="detail-label">{t('auth.profile.publicKey')}</span>
						<button
							class="detail-value copyable"
							onclick={() => copyToClipboard(user.publicKey, 'publicKey')}
						>
							<span>{user.publicKey}</span>
							{#if copiedField === 'publicKey'}
								<span class="copied-badge">{t('auth.profile.copied')}</span>
							{/if}
						</button>
					</div>
				</div>
			{/if}

			<!-- Logout -->
			<button class="logout-btn" onclick={() => (showLogoutConfirm = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
					<polyline points="16 17 21 12 16 7"/>
					<line x1="21" y1="12" x2="9" y2="12"/>
				</svg>
				{t('auth.logout')}
			</button>
		</div>
	{/if}
</ResponsiveModal>

<!-- Deposit Modal -->
{#if user}
	<DepositModal
		open={showDeposit}
		onClose={() => (showDeposit = false)}
		address={user.safeAddress}
	/>
{/if}

<!-- Logout Confirm -->
<ConfirmModal
	open={showLogoutConfirm}
	title={t('auth.logout')}
	message={t('auth.logoutConfirm')}
	confirmText={t('auth.logout')}
	onConfirm={handleLogout}
	onCancel={() => (showLogoutConfirm = false)}
/>

<style>
	.profile-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Header */
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}

	.profile-avatar {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
	}

	.profile-name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.profile-created {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	/* Section label */
	.section-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: var(--weight-medium);
	}

	/* Wallet address */
	.wallet-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.address-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.address-row:hover {
		border-color: var(--border-base);
	}

	.address-text {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		line-height: var(--leading-relaxed);
	}

	.copy-icon {
		flex-shrink: 0;
		color: var(--fg-faint);
	}

	.copied-badge {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--success);
		font-family: var(--font-sans);
	}

	/* Balances */
	.balances-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.balances-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing);
	}

	.refresh-btn:hover:not(:disabled) {
		color: var(--fg-muted);
	}

	.refresh-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.balances-loading {
		display: flex;
		justify-content: center;
		padding: var(--space-3);
	}

	.spinner-sm {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.balances-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.balance-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
	}

	.balance-row + .balance-row {
		border-top: 1px solid var(--border-subtle);
	}

	.chain-name {
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.chain-balance {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.chain-balance.zero {
		color: var(--fg-faint);
	}

	.chain-balance.error {
		color: var(--fg-faint);
	}

	/* Action buttons */
	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.action-btn.deposit {
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
	}

	.action-btn.deposit:hover {
		background: var(--accent-hover);
	}

	/* Technical details toggle */
	.details-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-1) 0;
		border: none;
		background: transparent;
		color: var(--fg-faint);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing);
	}

	.details-toggle:hover {
		color: var(--fg-subtle);
	}

	.chevron {
		transition: transform var(--motion-fast) var(--easing);
	}

	.chevron.expanded {
		transform: rotate(180deg);
	}

	/* Detail fields */
	.details-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
	}

	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-label {
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	.detail-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		word-break: break-all;
		line-height: var(--leading-relaxed);
	}

	.detail-value.copyable {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		text-align: left;
	}

	.detail-value.copyable:hover {
		color: var(--fg-muted);
	}

	/* Logout */
	.logout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-faint);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.logout-btn:hover {
		color: var(--error);
		border-color: var(--error);
		background: var(--error-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.spinning,
		.spinner-sm {
			animation: none;
		}
	}
</style>
