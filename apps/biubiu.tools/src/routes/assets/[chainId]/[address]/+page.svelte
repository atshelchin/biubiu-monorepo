<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PageFooter from '$lib/components/PageFooter.svelte';
	import AssetSearch from '$lib/components/AssetSearch.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Logo fallback state
	let logoError = $state(false);

	// Default token icon SVG
	const defaultLogoUrl = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="32" fill="#2d3748"/><text x="32" y="40" text-anchor="middle" fill="#a0aec0" font-size="24" font-family="system-ui">${data.asset?.symbol?.[0] || '?'}</text></svg>`);

	const seoProps = $derived(
		data.asset
			? getBaseSEO({
					title: t('assets.title', { name: data.asset.name, symbol: data.asset.symbol }),
					description: data.asset.description || t('assets.description', { name: data.asset.name, symbol: data.asset.symbol }),
					currentLocale: locale.value
				})
			: getBaseSEO({
					title: t('assets.notFound'),
					description: t('assets.notFound.description', { address: data.address }),
					currentLocale: locale.value
				})
	);

	// Copy state
	let copiedField = $state<string | null>(null);

	async function copyToClipboard(text: string, field: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedField = field;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Get link icon based on name
	function getLinkIcon(name: string): string {
		const icons: Record<string, string> = {
			github: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
			x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
			telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
			discord: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z',
			medium: 'M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z',
			facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
			coingecko: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z',
			coinmarketcap: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z'
		};
		return icons[name.toLowerCase()] || 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z';
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Search Section -->
	<section class="search-section" use:fadeInUp={{ delay: 0 }}>
		<AssetSearch currentChainId={data.chainId} currentAddress={data.address} />
	</section>

	{#if data.asset}
		<!-- Asset Header -->
		<section class="asset-header" use:fadeInUp={{ delay: 50 }}>
			<div class="asset-identity">
				<img
					src={logoError ? defaultLogoUrl : data.logoUrl}
					alt={data.asset.name}
					class="asset-logo"
					onerror={() => (logoError = true)}
				/>
				<div class="asset-info">
					<h1 class="asset-name">{data.asset.name}</h1>
					<div class="asset-badges">
						<span class="badge badge-primary">{data.asset.symbol}</span>
						<span class="badge">{data.asset.type}</span>
						{#if data.asset.status}
							<span class="badge badge-status" class:active={data.asset.status === 'active'}>
								{data.asset.status}
							</span>
						{/if}
					</div>
				</div>
			</div>
			<div class="header-links">
				{#if data.asset.website}
					<a href={data.asset.website} target="_blank" rel="noopener noreferrer" class="header-link">
						{t('assets.website')}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</a>
				{/if}
				{#if data.asset.explorer}
					<a href={data.asset.explorer} target="_blank" rel="noopener noreferrer" class="header-link">
						{t('assets.explorer')}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</a>
				{/if}
				<a
					href={`https://github.com/atshelchin/ethereum-data/blob/main/assets/eip155-${data.chainId}/${data.address}/info.json`}
					target="_blank"
					rel="noopener noreferrer"
					class="header-link edit-link"
				>
					{t('assets.editOnGithub')}
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				</a>
			</div>
		</section>

		<!-- Description -->
		{#if data.asset.description}
			<section class="description-section" use:fadeInUp={{ delay: 100 }}>
				<p class="description">{data.asset.description}</p>
			</section>
		{/if}

		<!-- Info Cards Grid -->
		<section class="info-grid" use:fadeInUp={{ delay: 150 }}>
			<!-- Token Info Card -->
			<div class="info-card glass-card">
				<h3 class="card-title">{t('assets.tokenInfo')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('assets.symbol')}</span>
						<span class="info-value highlight">{data.asset.symbol}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('assets.decimals')}</span>
						<span class="info-value mono">{data.asset.decimals}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('assets.type')}</span>
						<span class="info-value">{data.asset.type}</span>
					</div>
				</div>
			</div>

			<!-- Network Info Card -->
			<div class="info-card glass-card">
				<h3 class="card-title">{t('assets.networkInfo')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('assets.chainId')}</span>
						<a href={localizeHref(`/chains/${data.chainId}`)} class="info-value link">
							{data.chainId}
						</a>
					</div>
					<div class="info-row">
						<span class="info-label">{t('assets.contract')}</span>
						<button class="copy-value" onclick={() => copyToClipboard(data.address, 'address')}>
							<span class="address-text">{data.address.slice(0, 6)}...{data.address.slice(-4)}</span>
							{#if copiedField === 'address'}
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
									<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
								</svg>
							{/if}
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- Tags -->
		{#if data.asset.tags && data.asset.tags.length > 0}
			<section class="tags-section" use:fadeInUp={{ delay: 200 }}>
				<h2 class="section-title">{t('assets.tags')}</h2>
				<div class="tags-list">
					{#each data.asset.tags as tag}
						<span class="tag">{tag}</span>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Social Links -->
		{#if data.asset.links && data.asset.links.length > 0}
			<section class="links-section" use:fadeInUp={{ delay: 250 }}>
				<h2 class="section-title">{t('assets.links')}</h2>
				<div class="links-grid">
					{#each data.asset.links as link}
						<a href={link.url} target="_blank" rel="noopener noreferrer" class="link-card glass-card">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="link-icon">
								<path d={getLinkIcon(link.name)} />
							</svg>
							<span class="link-name">{link.name}</span>
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="external-icon">
								<line x1="7" y1="17" x2="17" y2="7" />
								<polyline points="7 7 17 7 17 17" />
							</svg>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
		<!-- Not Found State -->
		<section class="not-found" use:fadeInUp={{ delay: 0 }}>
			<div class="not-found-content">
				<h1 class="not-found-title">{t('assets.notFound')}</h1>
				<p class="not-found-description">
					{t('assets.notFound.description', { address: data.address })}
				</p>
				<a href={localizeHref('/')} class="back-link">
					{t('assets.backToHome')}
				</a>
			</div>
		</section>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

	/* Search Section */
	.search-section {
		position: relative;
		z-index: 100;
		margin-bottom: var(--space-6);
	}

	/* Asset Header */
	.asset-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		flex-wrap: wrap;
	}

	.asset-identity {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.asset-logo {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-lg);
		background: var(--bg-raised);
		object-fit: contain;
	}

	.asset-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.asset-name {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		line-height: 1.2;
	}

	.asset-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: var(--space-1) var(--space-3);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.badge-primary {
		background: var(--accent-muted);
		border-color: var(--accent);
		color: var(--accent);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.badge-status {
		text-transform: capitalize;
	}

	.badge-status.active {
		background: rgba(52, 211, 153, 0.15);
		border-color: #34d399;
		color: #34d399;
	}

	.header-links {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.header-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.header-link:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.header-link.edit-link {
		border-color: var(--border-subtle);
	}

	/* Description */
	.description-section {
		margin-bottom: var(--space-8);
	}

	.description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: 1.6;
		margin: 0;
	}

	/* Info Grid */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.info-card {
		padding: var(--space-5);
		border-radius: var(--radius-lg);
	}

	.card-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-4);
	}

	.card-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.info-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.info-value {
		font-size: var(--text-sm);
		color: var(--fg-base);
		font-weight: var(--weight-medium);
	}

	.info-value.highlight {
		font-size: var(--text-lg);
		color: var(--accent);
	}

	.info-value.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.info-value.link {
		color: var(--accent);
		text-decoration: none;
	}

	.info-value.link:hover {
		text-decoration: underline;
	}

	.copy-value {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-family: var(--font-mono, ui-monospace, monospace);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.copy-value:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.address-text {
		white-space: nowrap;
	}

	/* Section Title */
	.section-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	/* Tags */
	.tags-section {
		margin-bottom: var(--space-8);
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.tag {
		padding: var(--space-2) var(--space-4);
		background: var(--accent-muted);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--accent);
		text-transform: capitalize;
	}

	/* Links */
	.links-section {
		margin-bottom: var(--space-8);
	}

	.links-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-3);
	}

	.link-card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.link-card:hover {
		transform: translateY(-2px);
		background: rgba(255, 255, 255, 0.08);
	}

	.link-icon {
		color: var(--fg-muted);
		flex-shrink: 0;
	}

	.link-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		text-transform: capitalize;
		flex: 1;
	}

	.external-icon {
		color: var(--fg-subtle);
		flex-shrink: 0;
	}

	/* Glass Card */
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Not Found */
	.not-found {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
	}

	.not-found-content {
		max-width: 400px;
	}

	.not-found-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	.not-found-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: 0 0 var(--space-6);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-6);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: all var(--motion-fast) var(--easing);
	}

	.back-link:hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
	}

	/* Responsive */
	@media (max-width: 768px) {
		main.page {
			padding: var(--space-6) var(--space-4);
		}

		.asset-header {
			flex-direction: column;
		}

		.asset-logo {
			width: 48px;
			height: 48px;
		}

		.asset-name {
			font-size: var(--text-xl);
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.links-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
