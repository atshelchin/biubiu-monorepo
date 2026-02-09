<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO, buildSiteJsonLd } from '$lib/seo';
	import SEO from '@shelchin/seo/SEO.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	const seoProps = getBaseSEO({
		title: t('meta.title'),
		description: t('meta.description'),
		currentLocale: locale.value,
		jsonLd: buildSiteJsonLd(),
		ogParams: {
			type: 'website',
			subtitle: t('hero.description')
		}
	});
</script>

<SEO {...seoProps} />

<div class="page">
	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<a href={localizeHref('/')} class="logo">
				<span class="logo-text">BiuBiu</span>
				<span class="logo-accent">Tools</span>
			</a>

			<nav class="nav">
				<a href={localizeHref('/')} class="nav-link active">{t('nav.home')}</a>
				<a href={localizeHref('/tools')} class="nav-link">{t('nav.tools')}</a>
			</nav>

			<div class="header-actions">
				<div class="locale-switch">
					<a href="/en" class="locale-btn" class:active={locale.value === 'en'}>EN</a>
					<a href="/zh" class="locale-btn" class:active={locale.value === 'zh'}>ZH</a>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="main">
		<!-- Hero Section -->
		<section class="hero">
			<div class="hero-glow"></div>
			<div class="hero-content">
				<h1 class="hero-title">
					{t('hero.tagline')}
					<span class="gradient-text">{t('hero.taglineHighlight')}</span>
				</h1>
				<p class="hero-description">{t('hero.description')}</p>
				<a href={localizeHref('/tools/balance-radar')} class="hero-cta">
					{t('hero.cta')}
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="5" y1="12" x2="19" y2="12"/>
						<polyline points="12 5 19 12 12 19"/>
					</svg>
				</a>
			</div>
		</section>

		<!-- Featured Tool Section -->
		<section class="featured">
			<div class="section-header">
				<h2 class="section-title">{t('featured.title')}</h2>
			</div>

			<div class="tool-card">
				<div class="tool-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="2" y1="12" x2="22" y2="12"/>
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
					</svg>
				</div>
				<div class="tool-content">
					<h3 class="tool-name">{t('featured.balanceRadar.name')}</h3>
					<p class="tool-description">{t('featured.balanceRadar.description')}</p>

					<div class="tool-features">
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature1')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature1Desc')}</span>
							</div>
						</div>
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature2')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature2Desc')}</span>
							</div>
						</div>
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature3')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature3Desc')}</span>
							</div>
						</div>
					</div>

					<a href={localizeHref('/tools/balance-radar')} class="tool-cta">
						{t('featured.balanceRadar.cta')}
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="5" y1="12" x2="19" y2="12"/>
							<polyline points="12 5 19 12 12 19"/>
						</svg>
					</a>
				</div>
			</div>
		</section>

		<!-- Coming Soon Section -->
		<section class="coming-soon">
			<div class="coming-content">
				<h2 class="coming-title">{t('coming.title')}</h2>
				<p class="coming-description">{t('coming.description')}</p>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="footer">
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
		gap: var(--space-1);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		text-decoration: none;
	}

	.logo-text {
		color: var(--fg-base);
	}

	.logo-accent {
		color: var(--accent);
	}

	.nav {
		display: flex;
		gap: var(--space-6);
	}

	.nav-link {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--fg-base);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.locale-switch {
		display: flex;
		gap: var(--space-1);
	}

	.locale-btn {
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		text-decoration: none;
		border-radius: var(--radius-sm);
		transition: all var(--motion-fast) var(--easing);
	}

	.locale-btn:hover {
		color: var(--fg-base);
		background: var(--accent-subtle);
	}

	.locale-btn.active {
		color: var(--accent);
		background: var(--accent-muted);
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
		padding: var(--space-24) 0;
		text-align: center;
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
	}

	.hero-title {
		font-size: var(--text-5xl);
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		color: var(--fg-base);
		margin-bottom: var(--space-4);
	}

	.gradient-text {
		background: var(--gradient-text);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-description {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		max-width: 600px;
		margin: 0 auto var(--space-8);
		line-height: var(--leading-relaxed);
	}

	.hero-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-6);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		text-decoration: none;
		border-radius: var(--radius-lg);
		box-shadow: var(--glow-accent);
		transition: all var(--motion-fast) var(--easing);
	}

	.hero-cta:hover {
		background: var(--accent-hover);
		transform: translateY(-2px);
		box-shadow: var(--glow-intense);
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
		display: flex;
		gap: var(--space-8);
		padding: var(--space-8);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		transition: all var(--motion-normal) var(--easing);
	}

	.tool-card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-lg);
	}

	.tool-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: var(--accent-muted);
		border-radius: var(--radius-lg);
		color: var(--accent);
	}

	.tool-content {
		flex: 1;
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
		margin-bottom: var(--space-6);
	}

	.tool-features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.feature {
		display: flex;
		gap: var(--space-3);
	}

	.feature-icon {
		flex-shrink: 0;
		color: var(--success);
	}

	.feature-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.feature-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.feature-desc {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.tool-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--accent-muted);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: all var(--motion-fast) var(--easing);
	}

	.tool-cta:hover {
		background: var(--accent);
		color: var(--accent-fg);
	}

	/* Coming Soon */
	.coming-soon {
		padding: var(--space-16) 0;
		text-align: center;
	}

	.coming-content {
		padding: var(--space-12);
		background: var(--gradient-glow);
		border-radius: var(--radius-2xl);
	}

	.coming-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}

	.coming-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
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
	/* Responsive */
	@media (max-width: 768px) {
		.header-content {
			padding: var(--space-3) var(--space-4);
		}

		.nav {
			display: none;
		}

		.hero {
			padding: var(--space-16) 0;
		}

		.hero-title {
			font-size: var(--text-3xl);
		}

		.hero-description {
			font-size: var(--text-base);
		}

		.tool-card {
			flex-direction: column;
			padding: var(--space-6);
		}

		.tool-features {
			grid-template-columns: 1fr;
		}
	}
</style>
