<script lang="ts">
	import { t, localizeHref } from '$lib/i18n';
	import type { TranslationKey } from '$i18n';
	import ResponsiveModal from '$lib/components/ResponsiveModal.svelte';
	import ResponsiveDrawer from '$lib/components/ResponsiveDrawer.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import logo from '$lib/assets/logo.svg';

	// Settings modal state
	let showSettings = $state(false);

	// Mobile drawer state
	let showMobileDrawer = $state(false);

	// Navigation links
	const navLinks: { key: TranslationKey; href: string; icon: string; external?: boolean }[] = [
		{ key: 'nav.tools', href: '/tools/balance-radar', icon: 'tools' },
		{ key: 'nav.docs', href: '/docs', icon: 'docs', external: false },
		{ key: 'nav.github', href: 'https://github.com/atshelchin/biubiu.tools', icon: 'github', external: true }
	];

	function openSettings() {
		showMobileDrawer = false;
		showSettings = true;
	}
</script>

<header class="header">
	<div class="header-content">
		<a href={localizeHref('/')} class="logo">
			<img src={logo} alt="BiuBiu Tools" class="logo-icon" />
			<span class="logo-text">BiuBiu</span>
			<span class="logo-accent">Tools</span>
		</a>

		<!-- Desktop Navigation -->
		<nav class="nav-desktop">
			{#each navLinks as link}
				{#if link.external}
					<a href={link.href} class="nav-link" target="_blank" rel="noopener noreferrer">
						{t(link.key)}
					</a>
				{:else}
					<a href={localizeHref(link.href)} class="nav-link">
						{t(link.key)}
					</a>
				{/if}
			{/each}
		</nav>

		<!-- Header Actions -->
		<div class="header-actions">
			<!-- Settings Button (Desktop) -->
			<button
				class="settings-btn desktop-only"
				onclick={() => (showSettings = true)}
				aria-label={t('settings.title')}
				title={t('settings.title')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"/>
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
				</svg>
			</button>

			<!-- Mobile Menu Button -->
			<button
				class="menu-btn mobile-only"
				onclick={() => (showMobileDrawer = true)}
				aria-label={t('nav.menu')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="3" y1="12" x2="21" y2="12"/>
					<line x1="3" y1="6" x2="21" y2="6"/>
					<line x1="3" y1="18" x2="21" y2="18"/>
				</svg>
			</button>
		</div>
	</div>
</header>

<!-- Settings Modal -->
<ResponsiveModal open={showSettings} onClose={() => (showSettings = false)} title={t('settings.title')}>
	<SettingsPanel />
</ResponsiveModal>

<!-- Mobile Drawer -->
<ResponsiveDrawer open={showMobileDrawer} onClose={() => (showMobileDrawer = false)} title={t('nav.menu')}>
	<div class="drawer-nav">
		<!-- Navigation Links -->
		<nav class="drawer-links">
			{#each navLinks as link}
				{#if link.external}
					<a href={link.href} class="drawer-link" target="_blank" rel="noopener noreferrer" onclick={() => (showMobileDrawer = false)}>
						<span>{t(link.key)}</span>
						<svg class="external-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
							<polyline points="15 3 21 3 21 9"/>
							<line x1="10" y1="14" x2="21" y2="3"/>
						</svg>
					</a>
				{:else}
					<a href={localizeHref(link.href)} class="drawer-link" onclick={() => (showMobileDrawer = false)}>
						<span>{t(link.key)}</span>
					</a>
				{/if}
			{/each}
		</nav>

		<div class="drawer-divider"></div>

		<!-- Settings Button -->
		<button class="drawer-settings-btn" onclick={openSettings}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="3"/>
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
			</svg>
			<span>{t('settings.title')}</span>
			<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="9 18 15 12 9 6"/>
			</svg>
		</button>
	</div>
</ResponsiveDrawer>

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
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-4) var(--space-6);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
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

	/* Desktop Navigation */
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
			display: none;
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
</style>
