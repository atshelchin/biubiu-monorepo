<script lang="ts">
	import { page } from '$app/state';
	import { t, localizeHref } from '$lib/i18n';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
</script>

<div class="error-page">
	<!-- Background -->
	<div class="bg-orb bg-orb-1"></div>
	<div class="bg-orb bg-orb-2"></div>

	<PageHeader />

	<!-- Content -->
	<main class="error-main">
		<div class="error-code">
			<span class="code-digit">
				{#if page.status === 404}
					4
				{:else}
					{String(page.status)[0]}
				{/if}
			</span>
			<span class="code-digit code-digit-accent">
				{#if page.status === 404}
					0
				{:else}
					{String(page.status)[1] ?? '0'}
				{/if}
			</span>
			<span class="code-digit">
				{#if page.status === 404}
					4
				{:else}
					{String(page.status)[2] ?? '0'}
				{/if}
			</span>
		</div>

		<h1 class="error-title">
			{page.status === 404 ? t('error.404.title') : t('error.generic.title')}
		</h1>
		<p class="error-description">
			{page.status === 404 ? t('error.404.description') : t('error.generic.description')}
		</p>

		<a href={localizeHref('/')} class="back-btn">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="19" y1="12" x2="5" y2="12"/>
				<polyline points="12 19 5 12 12 5"/>
			</svg>
			{t('error.backHome')}
		</a>

		<!-- Recommended pages -->
		<div class="explore-section">
			<p class="explore-label">{t('error.explore')}</p>
			<div class="explore-grid">
				<a href={localizeHref('/apps/balance-radar')} class="explore-card">
					<div class="explore-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="11" cy="11" r="8"/>
							<line x1="21" y1="21" x2="16.65" y2="16.65"/>
						</svg>
					</div>
					<div class="explore-info">
						<span class="explore-name">{t('error.featured.balanceRadar')}</span>
						<span class="explore-desc">{t('error.featured.balanceRadarDesc')}</span>
					</div>
					<svg class="explore-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
				</a>
				<a href={localizeHref('/')} class="explore-card">
					<div class="explore-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
							<polyline points="9 22 9 12 15 12 15 22"/>
						</svg>
					</div>
					<div class="explore-info">
						<span class="explore-name">{t('error.featured.home')}</span>
						<span class="explore-desc">{t('error.featured.homeDesc')}</span>
					</div>
					<svg class="explore-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
				</a>
			</div>
		</div>
	</main>

	<PageFooter />
</div>

<style>
	.error-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: hidden;
	}

	/* Background orbs */
	.bg-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		pointer-events: none;
	}

	.bg-orb-1 {
		top: -10%;
		right: -10%;
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, var(--accent) 0%, transparent 60%);
		opacity: 0.15;
	}

	.bg-orb-2 {
		bottom: -10%;
		left: -15%;
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, var(--accent-secondary) 0%, transparent 60%);
		opacity: 0.1;
	}

	/* Main */
	.error-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: var(--space-8) var(--space-6);
		max-width: 560px;
		width: 100%;
		margin: 0 auto;
		position: relative;
		z-index: 1;
	}

	/* Error code */
	.error-code {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
		user-select: none;
	}

	.code-digit {
		font-size: clamp(72px, 12vw, 120px);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.04em;
		color: var(--fg-subtle);
		opacity: 0.3;
	}

	.code-digit-accent {
		background: linear-gradient(135deg, #34D399 0%, #10B981 50%, #047857 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		opacity: 1;
	}

	.error-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-3);
		letter-spacing: -0.02em;
	}

	.error-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin-bottom: var(--space-8);
	}

	/* Back button */
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-8);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		transition: all var(--motion-fast) var(--easing);
	}

	.back-btn:hover {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(54, 160, 122, 0.25);
	}

	/* Explore section */
	.explore-section {
		margin-top: var(--space-12);
		width: 100%;
	}

	.explore-label {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin-bottom: var(--space-4);
	}

	.explore-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.explore-card {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-xl);
		text-decoration: none;
		transition: all var(--motion-normal) var(--easing);
	}

	.explore-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	.explore-card:hover .explore-arrow {
		transform: translateX(2px);
		color: var(--accent);
	}

	.explore-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: var(--bg-raised);
		border-radius: var(--radius-lg);
		color: var(--accent);
		flex-shrink: 0;
	}

	.explore-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}

	.explore-name {
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.explore-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.explore-arrow {
		color: var(--fg-subtle);
		flex-shrink: 0;
		transition: all var(--motion-fast) var(--easing);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.error-main {
			padding: var(--space-6) var(--space-4);
		}

		.explore-card {
			padding: var(--space-3) var(--space-4);
		}
	}

	@media (max-width: 480px) {
		.bg-orb-1 {
			width: 300px;
			height: 300px;
		}

		.bg-orb-2 {
			width: 250px;
			height: 250px;
		}
	}
</style>
