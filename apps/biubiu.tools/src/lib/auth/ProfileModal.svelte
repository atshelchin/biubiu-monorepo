<script lang="ts">
	import { t } from '$lib/i18n';
	import { formatDateTime, formatDate } from '$lib/i18n';
	import { localizeHref } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import DepositModal from './DepositModal.svelte';
	import SendModal from './SendModal.svelte';
	import { authStore } from './auth-store.svelte.js';
	import { fetchAllBalances, formatBalance, type TokenBalance } from './wallet.js';
	import { subscriptionStore } from '$lib/subscription';
	import SubscriptionBadge from '$lib/subscription/SubscriptionBadge.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** 打开订阅弹窗（由 PageHeader 处理，避免弹窗嵌套） */
		onSubscription?: (mode: 'subscribe' | 'renew' | 'transfer') => void;
	}

	let { open, onClose, onSubscription }: Props = $props();

	let showLogoutConfirm = $state(false);
	let showDeposit = $state(false);
	let showSend = $state(false);
	let copiedField = $state<string | null>(null);
	let balances = $state<TokenBalance[]>([]);
	let balancesLoading = $state(false);
	let balancesLoaded = $state(false);

	const user = $derived(authStore.user);

	const profileUrl = $derived.by(() => {
		if (!user) return '';
		const payload = JSON.stringify({
			name: user.name,
			publicKey: user.publicKey,
			credentialId: user.credentialId,
			createdAt: user.createdAt
		});
		const bytes = new TextEncoder().encode(payload);
		let binary = '';
		for (const b of bytes) binary += String.fromCharCode(b);
		const code = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		return localizeHref(`/profile/${code}`);
	});

	// 每次打开 modal 都刷新余额
	$effect(() => {
		if (open && user?.safeAddress) {
			loadBalances();
		}
		if (!open) {
			balancesLoaded = false;
		}
	});

	async function loadBalances() {
		if (!user?.safeAddress) return;
		balancesLoading = true;
		balances = await fetchAllBalances(user.safeAddress);
		balancesLoading = false;
		balancesLoaded = true;
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
				<div class="profile-avatar" class:premium={subscriptionStore.isPremium}>
					{user.name.charAt(0).toUpperCase()}
				</div>
				<div class="profile-name-row">
					<span class="profile-name">{user.name}</span>
					<SubscriptionBadge size="md" />
				</div>
				<div class="profile-created">{formatDateTime(new Date(user.createdAt))}</div>
				<a class="profile-link" href={profileUrl} onclick={onClose}>
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
						<polyline points="15 3 21 3 21 9"/>
						<line x1="10" y1="14" x2="21" y2="3"/>
					</svg>
					{t('auth.profile.viewProfile')}
				</a>
			</div>

			<!-- Subscription -->
			<div class="sub-section">
				{#if subscriptionStore.isPremium}
					<div class="sub-active">
						<div class="sub-active-header">
							<span class="section-label">{t('sub.membership')}</span>
							<span class="sub-active-badge">{t('sub.active')}</span>
						</div>
						<div class="sub-active-info">
							<div class="sub-info-row">
								<span class="sub-info-label">{t('sub.expiresOn')}</span>
								<span class="sub-info-value">
									{#if subscriptionStore.expiryDate}
										{formatDate(subscriptionStore.expiryDate)}
									{/if}
								</span>
							</div>
							<div class="sub-info-row">
								<span class="sub-info-label">{t('sub.remaining')}</span>
								<span class="sub-info-value">{subscriptionStore.remainingDays} {t('sub.days')}</span>
							</div>
						</div>
						<div class="sub-actions">
							<button class="sub-action-btn" onclick={() => { onClose(); onSubscription?.('renew'); }}>
								{t('sub.renew')}
							</button>
							<button class="sub-action-btn secondary" onclick={() => { onClose(); onSubscription?.('transfer'); }}>
								{t('sub.transfer')}
							</button>
						</div>
					</div>
				{:else}
					<button class="sub-cta" onclick={() => { onClose(); onSubscription?.('subscribe'); }}>
						<div class="sub-cta-text">
							<span class="sub-cta-title">{t('sub.upgradePro')}</span>
							<span class="sub-cta-desc">{t('sub.upgradeDesc')}</span>
						</div>
						<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="9 18 15 12 9 6"/>
						</svg>
					</button>
				{/if}
			</div>

			<!-- Wallet -->
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
				<p class="wallet-warning">{t('auth.profile.walletWarning')}</p>
			</div>

			<!-- Balances (only non-zero) -->
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

				{#if balancesLoading && !balancesLoaded}
					<div class="balances-loading">
						<span class="spinner-sm"></span>
					</div>
				{:else if balances.length > 0}
					<div class="balances-list">
						{#each balances as token}
							<div class="balance-row">
								<div class="token-info">
									<span class="token-symbol">{token.symbol}</span>
									<span class="token-chain">{token.chainName}</span>
								</div>
								<span class="token-balance">{formatBalance(token.balance)}</span>
							</div>
						{/each}
					</div>
				{:else if balancesLoaded}
					<div class="balances-empty">
						<span>{t('auth.wallet.noBalance')}</span>
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="action-row">
				<button class="action-btn deposit" onclick={() => (showDeposit = true)}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19"/>
						<polyline points="19 12 12 19 5 12"/>
					</svg>
					{t('auth.wallet.deposit')}
				</button>
				<button class="action-btn send" onclick={() => (showSend = true)}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="19" x2="12" y2="5"/>
						<polyline points="5 12 12 5 19 12"/>
					</svg>
					{t('auth.send.title')}
				</button>
			</div>

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

{#if user}
	<DepositModal
		open={showDeposit}
		onClose={() => (showDeposit = false)}
		address={user.safeAddress}
	/>
	<SendModal
		open={showSend}
		onClose={() => { showSend = false; loadBalances(); }}
		balances={balances}
	/>
{/if}

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

	.profile-name-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.profile-name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.profile-avatar.premium {
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		box-shadow: 0 0 0 2.5px var(--bg-base), 0 0 0 3.5px rgba(201, 162, 39, 0.5);
	}

	.profile-created {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.profile-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-faint);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.profile-link:hover {
		color: var(--accent);
	}

	.section-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: var(--weight-medium);
	}

	/* Subscription */
	.sub-section {
		display: flex;
		flex-direction: column;
	}

	.sub-active {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.sub-active-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.sub-active-badge {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 2.5px 8px;
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		border-radius: var(--radius-full);
		text-transform: uppercase;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
	}

	.sub-active-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.sub-info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sub-info-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.sub-info-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.sub-actions {
		display: flex;
		gap: var(--space-2);
	}

	.sub-action-btn {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.sub-action-btn:hover {
		background: var(--accent-hover);
	}

	.sub-action-btn.secondary {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.sub-action-btn.secondary:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
	}

	.sub-cta {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: all var(--motion-fast) var(--easing);
	}

	.sub-cta:hover {
		border-color: var(--border-base);
		background: var(--bg-raised);
	}

	.sub-cta-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sub-cta-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.sub-cta-desc {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.sub-cta .chevron-icon {
		flex-shrink: 0;
		color: var(--fg-faint);
	}

	/* Address */
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

	.copy-icon { flex-shrink: 0; color: var(--fg-faint); }
	.copied-badge { flex-shrink: 0; font-size: var(--text-xs); color: var(--success); }

	.wallet-warning {
		font-size: var(--text-xs);
		color: var(--warning);
		margin: 0;
		line-height: var(--leading-relaxed);
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

	.refresh-btn:hover:not(:disabled) { color: var(--fg-muted); }
	.refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.spinning { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

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

	.token-info {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.token-symbol {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.token-chain {
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	.token-balance {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.balances-empty {
		padding: var(--space-3);
		text-align: center;
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	/* Actions */
	.action-row {
		display: flex;
		gap: var(--space-2);
	}

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

	.action-btn.send {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.action-btn.send:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
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
		.spinning, .spinner-sm { animation: none; }
	}
</style>
