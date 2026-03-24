<script lang="ts">
	import { page } from '$app/stores';
	import { t, locale, formatDateTime, formatDate, formatCurrency, preferences } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { computeSafeAddress } from '$lib/auth/compute-safe-address.js';
	import { fetchAllBalances, formatBalance, tokenValueUsd, totalValueUsd, fetchExchangeRate, type TokenBalance } from '$lib/auth/wallet.js';
	import { getSubscriptionInfo, type SubscriptionInfo } from '$lib/subscription';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import { onMount } from 'svelte';
	import type { Address } from 'viem';

	const INDEX_BASE = 'https://webauthnp256-publickey-index.biubiu.tools';

	interface ProfileData {
		name: string;
		publicKey: string;
		credentialId: string;
		createdAt: number;
	}

	let profileData = $state<ProfileData | null>(null);
	let profileLoading = $state(true);
	let decodeError = $state(false);
	let safeAddress = $state('');
	let balances = $state<TokenBalance[]>([]);
	let balancesLoading = $state(false);
	let balancesLoaded = $state(false);
	let copiedField = $state<string | null>(null);
	let subInfo = $state<SubscriptionInfo | null>(null);
	let subLoaded = $state(false);
	let exchangeRate = $state(1);

	const total = $derived(totalValueUsd(balances) * exchangeRate);
	const userCurrency = $derived(preferences.currency);

	/** 兼容旧 base64url 格式的 profile 链接 */
	function tryDecodeBase64(code: string): ProfileData | null {
		try {
			const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
			const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
			const binary = atob(b64 + pad);
			const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
			const json = new TextDecoder().decode(bytes);
			const data = JSON.parse(json);
			if (!data.name || !data.publicKey || !data.credentialId || !data.createdAt) return null;
			return data as ProfileData;
		} catch {
			return null;
		}
	}

	/** 从 index server 查询 profile */
	async function fetchProfile(credentialId: string): Promise<ProfileData | null> {
		try {
			const params = new URLSearchParams({ rpId: window.location.hostname, credentialId });
			const res = await fetch(`${INDEX_BASE}/api/query?${params}`);
			if (!res.ok) return null;
			const data = await res.json();
			if (!data.name || !data.publicKey) return null;
			return data as ProfileData;
		} catch {
			return null;
		}
	}

	onMount(async () => {
		const code = $page.params.code ?? '';

		// 短格式：credentialId → 从 index server 查询
		// 旧格式：base64url JSON → 直接解析（向后兼容）
		let data: ProfileData | null = null;
		if (code.length < 100) {
			data = await fetchProfile(code);
		} else {
			data = tryDecodeBase64(code);
		}

		if (!data) {
			decodeError = true;
			profileLoading = false;
			return;
		}
		profileData = data;
		safeAddress = computeSafeAddress(data.publicKey);
		profileLoading = false;
		loadBalances();
		loadSubscription();
		fetchExchangeRate(preferences.currency).then(r => { exchangeRate = r; });
	});

	async function loadSubscription() {
		if (!safeAddress) return;
		try {
			subInfo = await getSubscriptionInfo(safeAddress as Address);
		} catch {
			// Contract not deployed or RPC error
		} finally {
			subLoaded = true;
		}
	}

	async function loadBalances() {
		if (!safeAddress) return;
		balancesLoading = true;
		balances = await fetchAllBalances(safeAddress);
		balancesLoading = false;
		balancesLoaded = true;
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

	function shortenAddress(addr: string): string {
		return addr.slice(0, 6) + '...' + addr.slice(-4);
	}

	function shortenCredentialId(id: string): string {
		if (id.length <= 16) return id;
		return id.slice(0, 8) + '...' + id.slice(-8);
	}

	const seoProps = $derived(getBaseSEO({
		title: profileData
			? `${profileData.name} - ${t('profilePage.title')}`
			: t('profilePage.title'),
		description: t('profilePage.description'),
		currentLocale: locale.value,
	}));
</script>

<SEO {...seoProps} />
<PageHeader />

<div class="page">
	{#if profileLoading}
		<div class="loading-card">
			<span class="spinner"></span>
		</div>
	{:else if decodeError}
		<div class="error-card" use:fadeInUp={{ delay: 0 }}>
			<div class="error-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="8" x2="12" y2="12"/>
					<line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
			</div>
			<h2>{t('profilePage.invalidLink')}</h2>
			<p>{t('profilePage.invalidLinkDesc')}</p>
		</div>
	{:else if profileData}
		<div class="profile-card" use:fadeInUp={{ delay: 0 }}>
			<!-- Avatar + Name -->
			<div class="profile-header">
				<div class="avatar" class:premium={subInfo?.isPremium}>
					{profileData.name.charAt(0).toUpperCase()}
				</div>
				<div class="name-row">
					<h1 class="name">{profileData.name}</h1>
					{#if subInfo?.isPremium}
						<span class="premium-badge">
							<svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10">
								<path d="M8 1.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12.2 3.8 14.5l.8-4.7L1.2 6.5l4.7-.7z"/>
							</svg>
							PREMIUM
						</span>
					{/if}
				</div>
				<span class="created-at">{formatDateTime(new Date(profileData.createdAt))}</span>
			</div>

			<!-- Subscription Status -->
			{#if subLoaded && subInfo?.isPremium}
				<div class="sub-status" use:fadeInUp={{ delay: 50 }}>
					<div class="sub-status-header">
						<span class="label">{t('sub.membership')}</span>
						<span class="sub-badge-active">{t('sub.active')}</span>
					</div>
					<div class="sub-status-info">
						<div class="sub-row">
							<span class="sub-label">{t('sub.expiresOn')}</span>
							<span class="sub-value">{formatDate(new Date(Number(subInfo.expiryTime) * 1000))}</span>
						</div>
						<div class="sub-row">
							<span class="sub-label">{t('sub.remaining')}</span>
							<span class="sub-value">{Math.ceil(Number(subInfo.remainingTime) / 86400)} {t('sub.days')}</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Info Section -->
			<div class="info-section" use:fadeInUp={{ delay: 100 }}>
				<!-- Wallet Address -->
				<div class="info-group">
					<span class="label">{t('profilePage.walletAddress')}</span>
					<button
						class="copyable-row"
						onclick={() => copyToClipboard(safeAddress, 'wallet')}
						title={t('auth.profile.clickToCopy')}
					>
						<span class="mono-text">{safeAddress}</span>
						{#if copiedField === 'wallet'}
							<span class="copied-badge">{t('auth.profile.copied')}</span>
						{:else}
							<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
						{/if}
					</button>
				</div>

				<!-- Public Key -->
				<div class="info-group">
					<span class="label">{t('profilePage.publicKey')}</span>
					<button
						class="copyable-row"
						onclick={() => copyToClipboard(profileData!.publicKey, 'publicKey')}
						title={t('auth.profile.clickToCopy')}
					>
						<span class="mono-text truncated">{profileData.publicKey}</span>
						{#if copiedField === 'publicKey'}
							<span class="copied-badge">{t('auth.profile.copied')}</span>
						{:else}
							<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
						{/if}
					</button>
				</div>

				<!-- Credential ID -->
				<div class="info-group">
					<span class="label">{t('profilePage.credentialId')}</span>
					<button
						class="copyable-row"
						onclick={() => copyToClipboard(profileData!.credentialId, 'credentialId')}
						title={t('auth.profile.clickToCopy')}
					>
						<span class="mono-text truncated">{profileData.credentialId}</span>
						{#if copiedField === 'credentialId'}
							<span class="copied-badge">{t('auth.profile.copied')}</span>
						{:else}
							<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<!-- Balances -->
			<div class="balances-section" use:fadeInUp={{ delay: 200 }}>
				<div class="balances-header">
					<span class="label">{t('auth.wallet.balances')}</span>
					{#if balancesLoaded && balances.length > 0 && total > 0}
						<span class="balances-total">{formatCurrency(total, userCurrency)}</span>
					{/if}
					<button class="refresh-btn" onclick={loadBalances} disabled={balancesLoading} title={t('auth.wallet.refresh')}>
						<svg class:spinning={balancesLoading} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="23 4 23 10 17 10"/>
							<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
						</svg>
					</button>
				</div>

				{#if balancesLoading && !balancesLoaded}
					<div class="balances-loading">
						<span class="spinner"></span>
					</div>
				{:else if balances.length > 0}
					<div class="balances-list">
						{#each balances.filter(t => !t.spam) as token}
							{@const valueUsd = tokenValueUsd(token)}
							<div class="balance-row">
								<div class="token-info">
									<span class="token-symbol">{token.symbol}</span>
									<span class="token-chain">{token.chainName}</span>
								</div>
								<div class="token-values">
									{#if valueUsd != null && valueUsd > 0}
										<span class="token-value">{formatCurrency(valueUsd * exchangeRate, userCurrency)}</span>
									{/if}
									<span class="token-balance">{formatBalance(token.balance)}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else if balancesLoaded}
					<div class="balances-empty">
						<span>{t('auth.wallet.noBalance')}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 560px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4);
		min-height: 100vh;
	}

	/* Loading */
	.loading-card {
		display: flex;
		justify-content: center;
		padding: var(--space-16) 0;
	}

	/* Error */
	.error-card {
		text-align: center;
		padding: var(--space-12) var(--space-6);
	}

	.error-icon {
		color: var(--fg-faint);
		margin-bottom: var(--space-4);
	}

	.error-card h2 {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.error-card p {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
	}

	/* Profile Card */
	.profile-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	/* Header */
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--border-subtle);
	}

	.avatar {
		width: 72px;
		height: 72px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
	}

	.name {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.created-at {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.avatar.premium {
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		box-shadow: 0 0 0 3px var(--bg-base), 0 0 0 4px rgba(201, 162, 39, 0.45);
	}

	.premium-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		padding: 4px 10px;
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		border-radius: 4px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	/* Subscription Status */
	.sub-status {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.sub-status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.sub-badge-active {
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

	.sub-status-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.sub-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sub-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.sub-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	/* Info */
	.info-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.info-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: var(--weight-medium);
	}

	.copyable-row {
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

	.copyable-row:hover {
		border-color: var(--border-base);
	}

	.mono-text {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		line-height: var(--leading-relaxed);
	}

	.mono-text.truncated {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.copy-icon { flex-shrink: 0; color: var(--fg-faint); }
	.copied-badge { flex-shrink: 0; font-size: var(--text-xs); color: var(--success); }

	/* Balances */
	.balances-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.balances-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.balances-total {
		flex: 1;
		text-align: right;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
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
		padding: var(--space-4);
	}

	.spinner {
		width: 20px;
		height: 20px;
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
		padding: var(--space-3) var(--space-3);
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

	.token-values {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}

	.token-value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.token-balance {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.balances-empty {
		padding: var(--space-4);
		text-align: center;
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	@media (prefers-reduced-motion: reduce) {
		.spinning, .spinner { animation: none; }
	}
</style>
