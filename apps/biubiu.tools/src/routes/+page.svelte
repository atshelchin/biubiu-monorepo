<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import type { TranslationKey } from '$i18n';
	import { getBaseSEO, buildSiteJsonLd } from '$lib/seo';
	import SEO from '@shelchin/seo/SEO.svelte';
	import ChainLogos from '$lib/components/ChainLogos.svelte';
	import ResponsiveModal from '$lib/components/ResponsiveModal.svelte';
	import ResponsiveDrawer from '$lib/components/ResponsiveDrawer.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
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

	const seoProps = $derived(getBaseSEO({
		title: t('meta.title'),
		description: t('meta.description'),
		currentLocale: locale.value,
		jsonLd: buildSiteJsonLd(),
		ogParams: {
			type: 'website',
			subtitle: t('hero.description')
		}
	}));

	const comingTools: { id: string; nameKey: TranslationKey; descKey: TranslationKey; icon: string }[] = [
		{
			id: 'token-sender',
			nameKey: 'coming.tools.tokenSender.name',
			descKey: 'coming.tools.tokenSender.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
		},
		{
			id: 'wallet-sweep',
			nameKey: 'coming.tools.walletSweep.name',
			descKey: 'coming.tools.walletSweep.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`
		},
		{
			id: 'event-scanner',
			nameKey: 'coming.tools.eventScanner.name',
			descKey: 'coming.tools.eventScanner.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`
		},
		{
			id: 'contract-caller',
			nameKey: 'coming.tools.contractCaller.name',
			descKey: 'coming.tools.contractCaller.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 4 4-4 4"/></svg>`
		}
	];
</script>

<SEO {...seoProps} />

<div class="page">
	<!-- Header -->
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

	<main class="main">
		<!-- Hero Section -->
		<section class="hero">
			<!-- Grid Pattern Background -->
			<div class="hero-grid"></div>

			<!-- Background Gradient Orbs (Multi-layer) -->
			<div class="hero-orb hero-orb-1"></div>
			<div class="hero-orb hero-orb-2"></div>
			<div class="hero-orb hero-orb-3"></div>
			<div class="hero-glow"></div>

			<div class="hero-content">
				<h1 class="hero-title">
					<span class="title-line">{t('hero.tagline')}</span>
					<span class="gradient-text">{t('hero.taglineHighlight')}</span>
				</h1>

				<p class="hero-description">{t('hero.description')}</p>

				<div class="hero-actions">
					<button class="hero-cta" onclick={() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' })}>
						{t('hero.cta')}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" y1="5" x2="12" y2="19"/>
							<polyline points="19 12 12 19 5 12"/>
						</svg>
					</button>
				</div>
			</div>

			<!-- Chain logos positioned at bottom of hero -->
			<div class="hero-chains">
				<ChainLogos />
			</div>
		</section>

		<!-- Featured Tool Section -->
		<section id="featured" class="featured" use:fadeInUp={{ delay: 0 }}>
			<div class="section-header">
				<h2 class="section-title">{t('featured.title')}</h2>
			</div>

			<a href={localizeHref('/tools/balance-radar')} class="tool-card glass-card" target="_blank" rel="noopener noreferrer">
				<h3 class="tool-name">{t('featured.balanceRadar.name')}</h3>
				<p class="tool-description">{t('featured.balanceRadar.description')}</p>
				<div class="tool-tags">
					<span class="tool-tag">{t('featured.balanceRadar.feature1')}</span>
					<span class="tool-tag">{t('featured.balanceRadar.feature2')}</span>
					<span class="tool-tag">{t('featured.balanceRadar.feature3')}</span>
				</div>
			</a>
		</section>

		<!-- Coming Soon Section -->
		<section class="coming-tools" use:fadeInUp={{ delay: 100 }}>
			<div class="section-header">
				<h2 class="section-title">{t('coming.title')}</h2>
			</div>

			<div class="tools-grid">
				{#each comingTools as tool}
					<div class="coming-card glass-card">
						<h3 class="coming-name">{t(tool.nameKey)}</h3>
						<p class="coming-desc">{t(tool.descKey)}</p>
					</div>
				{/each}
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="footer" use:fadeInUp={{ delay: 200 }}>
		<div class="footer-content">
			<div class="social-links">
				<a href="https://github.com/atshelchin/biubiu.tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="GitHub">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
					</svg>
				</a>
				<a href="https://x.com/biubiu_tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="X">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
					</svg>
				</a>
				<a href="https://discord.gg/GWXXQ7fXaZ" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Discord">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
					</svg>
				</a>
				<a href="https://t.me/+ABMpMG1islA4NTVl" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Telegram">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
					</svg>
				</a>
				<a href="https://www.youtube.com/@biubiu_tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="YouTube">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
					</svg>
				</a>
			</div>
			<p class="footer-text">
				{@html t('footer.madeWith',{love:`<span style="color: var(--error);">&#9829;</span>`})}  · {t('footer.openSource')}
			</p>
		</div>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

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
	}

	/* Main */
	.main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--space-6);
		width: 100%;
	}

	/* Hero */
	.hero {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		overflow: hidden;
		/* Break out of parent container to full width */
		width: 100vw;
		margin-left: calc(-50vw + 50%);
		margin-top: -80px;
		padding: calc(80px + var(--space-12)) var(--space-6) var(--space-12);
	}

	/* Grid Pattern Background */
	.hero-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(54, 160, 122, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(54, 160, 122, 0.03) 1px, transparent 1px);
		background-size: 60px 60px;
		mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 70%);
		-webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 70%);
		pointer-events: none;
	}

	/* Hero Background Orbs (Multi-layer depth) */
	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		pointer-events: none;
		animation: float 20s ease-in-out infinite;
	}

	@keyframes float {
		0%, 100% { transform: translate(0, 0); }
		25% { transform: translate(10px, -15px); }
		50% { transform: translate(-5px, 10px); }
		75% { transform: translate(-10px, -5px); }
	}

	.hero-orb-1 {
		top: -15%;
		right: -5%;
		width: 800px;
		height: 800px;
		background: radial-gradient(circle, var(--accent) 0%, transparent 60%);
		opacity: 0.25;
		animation-delay: 0s;
	}

	.hero-orb-2 {
		bottom: -10%;
		left: -20%;
		width: 700px;
		height: 700px;
		background: radial-gradient(circle, var(--accent-secondary) 0%, transparent 60%);
		opacity: 0.18;
		animation-delay: -7s;
	}

	.hero-orb-3 {
		top: 30%;
		right: -25%;
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, var(--accent-tertiary) 0%, transparent 60%);
		opacity: 0.12;
		animation-delay: -14s;
	}

	.hero-glow {
		position: absolute;
		inset: 0;
		background: var(--gradient-hero);
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 900px;
		padding: 0 var(--space-4);
		text-align: center;
	}

	.hero-chains {
		position: absolute;
		bottom: var(--space-8);
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		width: 100%;
		max-width: 1000px;
		padding: 0 var(--space-4);
	}

	.hero-title {
		font-size: calc(var(--text-6xl) * 1.2);
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		color: var(--fg-base);
		margin-bottom: var(--space-8);
	}

	.title-line {
		display: block;
		background: linear-gradient(180deg, var(--fg-base) 0%, var(--fg-muted) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.gradient-text {
		display: block;
		background: linear-gradient(135deg, #34D399 0%, #10B981 50%, #047857 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-description {
		font-size: var(--text-lg);
		color: var(--fg-subtle);
		max-width: 600px;
		margin: 0 auto var(--space-12);
		line-height: var(--leading-relaxed);
		letter-spacing: 0.01em;
	}

	.hero-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		margin-bottom: var(--space-16);
		flex-wrap: wrap;
	}

	.hero-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-12);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-lg);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border: 1px solid var(--border-base);
		cursor: pointer;
		border-radius: var(--radius-lg);
		transition: all var(--motion-fast) var(--easing);
	}

	.hero-cta:hover {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(54, 160, 122, 0.25);
	}

	/* Glass Card - Apple style */
	.glass-card {
		position: relative;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		transition: all var(--motion-normal) var(--easing);
	}

	/* Featured Section */
	.featured {
		padding: var(--space-16) 0;
	}

	.section-header {
		margin-bottom: var(--space-8);
	}

	.section-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.tool-card {
		display: block;
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		text-decoration: none;
		cursor: pointer;
	}

	.tool-card:hover {
		transform: translateY(-2px);
		background: rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	.tool-name {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}

	.tool-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin-bottom: var(--space-4);
	}

	.tool-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.tool-tag {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border-radius: var(--radius-sm);
	}

	/* Coming Tools Section */
	.coming-tools {
		padding: var(--space-16) 0;
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-6);
	}

	.coming-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-8);
		border-radius: var(--radius-xl);
		transition: all var(--motion-normal) var(--easing);
	}

	.coming-card:hover {
		transform: translateY(-2px);
		background: rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	.coming-name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}

	.coming-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	/* Footer */
	.footer {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-8) 0;
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--space-6);
		text-align: center;
	}

	.social-links {
		display: flex;
		justify-content: center;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.social-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		color: var(--fg-muted);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		transition: all var(--motion-fast) var(--easing);
	}

	.social-link:hover {
		color: var(--accent);
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	.footer-text {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
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

	/* Responsive */
	@media (max-width: 768px) {
		.header-content {
			padding: var(--space-3) var(--space-4);
		}

		.hero {
			min-height: 100vh;
			min-height: 100dvh;
			margin-top: -64px;
			padding: calc(64px + var(--space-8)) var(--space-4) var(--space-8);
		}

		.hero-grid {
			background-size: 40px 40px;
		}

		.hero-orb-1 {
			width: 350px;
			height: 350px;
			top: -5%;
			right: -15%;
		}

		.hero-orb-2 {
			width: 300px;
			height: 300px;
			bottom: 5%;
			left: -20%;
		}

		.hero-orb-3 {
			width: 200px;
			height: 200px;
			top: 40%;
			right: -30%;
		}

		.hero-title {
			font-size: calc(var(--text-3xl) * 1.1);
			letter-spacing: -0.02em;
		}

		.hero-description {
			font-size: var(--text-base);
		}

		.hero-actions {
			flex-direction: column;
			gap: var(--space-3);
			width: 100%;
			justify-content: center;
		}

		.hero-cta {
			width: 100%;
			justify-content: center;
		}

		.hero-chains {
			bottom: var(--space-4);
		}

		.tool-card {
			flex-direction: column;
			padding: var(--space-6);
		}

		.tools-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Reduced Motion */
	@media (prefers-reduced-motion: reduce) {
		.hero-orb,
		.gradient-text {
			animation: none;
		}
	}
</style>
