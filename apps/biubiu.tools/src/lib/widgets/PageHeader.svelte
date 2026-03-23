<script lang="ts">
	import { t, localizeHref } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import SettingsPanel from '$lib/widgets/SettingsPanel.svelte';
	import AuthModal from '$lib/auth/AuthModal.svelte';
	import ProfileModal from '$lib/auth/ProfileModal.svelte';
	import { authStore } from '$lib/auth';
	import SubscriptionBadge from '$lib/subscription/SubscriptionBadge.svelte';
	import SubscriptionModal from '$lib/subscription/SubscriptionModal.svelte';
	import { subscriptionStore } from '$lib/subscription';
	import logo from '$lib/assets/logo.svg';

	// Settings modal state
	let showSettings = $state(false);

	// Auth modal state
	let showAuth = $state(false);

	// Profile modal state
	let showProfile = $state(false);

	// Subscription modal state
	let showSubscription = $state(false);
	let subscriptionMode = $state<'subscribe' | 'renew' | 'transfer'>('subscribe');

	function openSubscription(mode: 'subscribe' | 'renew' | 'transfer') {
		subscriptionMode = mode;
		showSubscription = true;
	}

	// Navigation links removed from header — moved to footer

	// 登录后加载订阅状态
	$effect(() => {
		if (authStore.isLoggedIn && authStore.user?.safeAddress) {
			subscriptionStore.load(authStore.user.safeAddress as `0x${string}`);
		}
		if (!authStore.isLoggedIn) {
			subscriptionStore.reset();
		}
	});

</script>

<header class="header">
	<div class="header-content">
		<a href={localizeHref('/')} class="logo">
			<img src={logo} alt="BiuBiu Tools" class="logo-icon" />
			<span class="logo-text">BiuBiu</span>
			<span class="logo-accent">Tools</span>
		</a>

		<!-- Spacer (nav links moved to footer) -->
		<div class="nav-spacer"></div>

		<!-- Header Actions -->
		<div class="header-actions">
			{#if authStore.isLoggedIn}
				<!-- Desktop: avatar + name + badge -->
				<button
					class="user-btn desktop-only"
					onclick={() => (showProfile = true)}
					title={authStore.displayName}
				>
					<span class="user-avatar" class:premium={subscriptionStore.isPremium}>{authStore.displayName.charAt(0).toUpperCase()}</span>
					<span class="user-name">{authStore.displayName}</span>
					<SubscriptionBadge size="sm" />
				</button>
				<!-- Mobile: avatar only (tap to open profile) -->
				<button
					class="avatar-btn mobile-only"
					onclick={() => (showProfile = true)}
					aria-label={authStore.displayName}
				>
					<span class="user-avatar" class:premium={subscriptionStore.isPremium}>{authStore.displayName.charAt(0).toUpperCase()}</span>
				</button>
			{:else}
				<button
					class="auth-btn"
					onclick={() => (showAuth = true)}
					aria-label={t('auth.login.title')}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
						<circle cx="12" cy="7" r="4"/>
					</svg>
					<span class="auth-text">{t('auth.login.title')}</span>
				</button>
			{/if}

			<!-- Settings Button (always visible) -->
			<button
				class="settings-btn"
				onclick={() => (showSettings = true)}
				aria-label={t('settings.title')}
				title={t('settings.title')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"/>
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
				</svg>
			</button>
		</div>
	</div>
</header>

<!-- Auth Modal -->
<AuthModal open={showAuth} onClose={() => (showAuth = false)} />

<!-- Profile Modal -->
<ProfileModal open={showProfile} onClose={() => (showProfile = false)} onSubscription={openSubscription} />

<!-- Subscription Modal -->
<SubscriptionModal open={showSubscription} onClose={() => (showSubscription = false)} mode={subscriptionMode} />

<!-- Settings Modal -->
<ResponsiveModal open={showSettings} onClose={() => (showSettings = false)} title={t('settings.title')}>
	<SettingsPanel />
</ResponsiveModal>

<!-- Mobile Drawer removed — auth/settings are directly in header -->

<style>
	/* Header */
	.header {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: var(--glass-bg);
		backdrop-filter: blur(var(--blur-md));
		border-bottom: 1px solid var(--border-subtle);
	}

	.header-content {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-4) var(--space-6);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
	}

	@media (min-width: 1280px) {
		.header-content { max-width: 1320px; }
	}
	@media (min-width: 1600px) {
		.header-content { max-width: 1680px; }
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		text-decoration: none;
	}

	.logo-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
	}

	.logo-text {
		color: var(--fg-base);
	}

	.logo-accent {
		color: var(--accent);
	}

	/* Spacer (replaces removed nav links) */
	.nav-spacer { flex: 1; }

	/* Desktop Navigation (kept for CSS compat, unused in template) */
	.nav-desktop {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-normal);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: color var(--motion-fast) var(--easing);
	}

	.nav-link:hover {
		color: var(--fg-base);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* Settings Button */
	.settings-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing);
	}

	.settings-btn:hover {
		color: var(--fg-base);
	}

	/* Mobile Menu Button */
	.menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing);
	}

	.menu-btn:hover {
		color: var(--fg-base);
	}

	/* Mobile avatar-only button */
	.avatar-btn {
		display: flex;
		align-items: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	/* Desktop/Mobile visibility */
	.desktop-only {
		display: flex;
	}

	.mobile-only {
		display: none;
	}

	@media (max-width: 768px) {
		.nav-desktop {
			display: none;
		}

		.desktop-only {
			display: none !important;
		}

		.mobile-only {
			display: flex;
		}

		.header-content {
			padding: var(--space-3) var(--space-4);
		}
	}

	/* Drawer Content */
	.drawer-nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.drawer-links {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.drawer-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--fg-base);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border-radius: var(--radius-lg);
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-link:hover {
		background: var(--bg-raised);
	}

	.drawer-link:active {
		background: var(--accent-muted);
	}

	.drawer-link .external-icon {
		margin-left: auto;
		color: var(--fg-faint);
	}

	.drawer-divider {
		height: 1px;
		background: var(--border-subtle);
		margin: var(--space-3) 0;
	}

	.drawer-settings-btn {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: none;
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		text-align: left;
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-settings-btn:hover {
		background: var(--bg-raised);
	}

	.drawer-settings-btn:active {
		background: var(--accent-muted);
	}

	.drawer-settings-btn .chevron-icon {
		margin-left: auto;
		color: var(--fg-faint);
	}

	/* Auth Button (Desktop) */
	.auth-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.auth-btn:hover {
		color: var(--fg-base);
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}

	/* User Button (Desktop - Logged In) */
	.user-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.user-btn:hover {
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}

	.user-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}

	.user-avatar.premium {
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		box-shadow: 0 0 0 1.5px var(--bg-base), 0 0 0 2.5px rgba(201, 162, 39, 0.45);
	}

	.user-name {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Drawer Auth */
	.drawer-user-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		flex-shrink: 0;
	}

	.drawer-user-avatar.premium {
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		box-shadow: 0 0 0 1.5px var(--bg-base), 0 0 0 2.5px rgba(201, 162, 39, 0.45);
	}

</style>
