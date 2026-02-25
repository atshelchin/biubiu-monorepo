<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PageFooter from '$lib/components/PageFooter.svelte';
	import ContractSearch from '$lib/components/ContractSearch.svelte';
	import AbiViewer from '$lib/components/AbiViewer.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const seoProps = $derived(
		data.contract
			? getBaseSEO({
					title: t('contracts.title', { name: data.contract.name }),
					description: t('contracts.description', { name: data.contract.name, address: data.address }),
					currentLocale: locale.value
				})
			: getBaseSEO({
					title: t('contracts.notFound'),
					description: t('contracts.notFound.description', { address: data.address }),
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
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Search Section -->
	<section class="search-section" use:fadeInUp={{ delay: 0 }}>
		<ContractSearch currentChainId={data.chainId} currentAddress={data.address} />
	</section>

	{#if data.contract}
		<!-- Contract Header -->
		<section class="contract-header" use:fadeInUp={{ delay: 50 }}>
			<div class="contract-identity">
				<div class="contract-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
						<polyline points="14 2 14 8 20 8" />
						<path d="M8 13h2" />
						<path d="M8 17h2" />
						<path d="M14 13h2" />
						<path d="M14 17h2" />
					</svg>
				</div>
				<div class="contract-info">
					<h1 class="contract-name">{data.contract.name}</h1>
					<div class="contract-badges">
						{#if data.contract.proxy.isProxy}
							<span class="badge badge-proxy">{t('contracts.proxy')}</span>
						{:else}
							<span class="badge">{t('contracts.directContract')}</span>
						{/if}
						{#if data.contract.sourceCode.optimization.enabled}
							<span class="badge badge-optimized">{t('contracts.optimized')}</span>
						{/if}
					</div>
				</div>
			</div>
			<div class="header-links">
				{#if data.contract.explorer}
					<a href={data.contract.explorer} target="_blank" rel="noopener noreferrer" class="header-link">
						{t('contracts.explorer')}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</a>
				{/if}
				{#if data.contract.sourceCode.url}
					{@const sourceUrl = data.contract.sourceCode.commitId
						? `${data.contract.sourceCode.url}/tree/${data.contract.sourceCode.commitId}`
						: data.contract.sourceCode.url}
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer" class="header-link">
						{t('contracts.sourceCode')}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</a>
				{/if}
				<a
					href={`https://github.com/atshelchin/ethereum-data/blob/main/contracts/eip155-${data.chainId}/${data.address}/info.json`}
					target="_blank"
					rel="noopener noreferrer"
					class="header-link edit-link"
				>
					{t('contracts.editOnGithub')}
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				</a>
			</div>
		</section>

		<!-- Info Cards Grid -->
		<section class="info-grid" use:fadeInUp={{ delay: 100 }}>
			<!-- Contract Info Card -->
			<div class="info-card glass-card">
				<h3 class="card-title">{t('contracts.contractInfo')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('contracts.chainId')}</span>
						<a href={localizeHref(`/chains/${data.chainId}`)} class="info-value link">
							{data.chainId}
						</a>
					</div>
					<div class="info-row">
						<span class="info-label">{t('contracts.address')}</span>
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

			<!-- Compiler Info Card -->
			<div class="info-card glass-card">
				<h3 class="card-title">{t('contracts.compilerInfo')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('contracts.compilerVersion')}</span>
						<span class="info-value mono">{data.contract.sourceCode.compilerVersion}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('contracts.evmVersion')}</span>
						<span class="info-value">{data.contract.sourceCode.evmVersion}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('contracts.optimization')}</span>
						<span class="info-value">
							{#if data.contract.sourceCode.optimization.enabled}
								{t('contracts.enabled')} ({data.contract.sourceCode.optimization.runs} runs)
							{:else}
								{t('contracts.disabled')}
							{/if}
						</span>
					</div>
					{#if data.contract.sourceCode.commitId}
						<div class="info-row">
							<span class="info-label">{t('contracts.commitId')}</span>
							<span class="info-value mono">{data.contract.sourceCode.commitId}</span>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- Proxy Info -->
		{#if data.contract.proxy.isProxy}
			<section class="proxy-section" use:fadeInUp={{ delay: 150 }}>
				<div class="info-card glass-card">
					<h3 class="card-title">{t('contracts.proxyInfo')}</h3>
					<div class="card-content">
						<div class="info-row">
							<span class="info-label">{t('contracts.proxyType')}</span>
							<span class="info-value">{data.contract.proxy.proxyType}</span>
						</div>
						{#if data.contract.proxy.implementation}
							<div class="info-row">
								<span class="info-label">{t('contracts.implementation')}</span>
								<button class="copy-value" onclick={() => copyToClipboard(data.contract.proxy.implementation, 'impl')}>
									<span class="address-text">{data.contract.proxy.implementation.slice(0, 6)}...{data.contract.proxy.implementation.slice(-4)}</span>
									{#if copiedField === 'impl'}
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
						{/if}
					</div>
				</div>
			</section>
		{/if}

		<!-- ABI Section -->
		{#if data.payload?.abi}
			<section class="abi-section" use:fadeInUp={{ delay: 200 }}>
				<h2 class="section-title">{t('contracts.abi')}</h2>
				<AbiViewer
					abi={data.payload.abi}
					bytecode={data.payload.bytecode}
					chainId={data.chainId}
					address={data.address}
				/>
			</section>
		{/if}
	{:else}
		<!-- Not Found State -->
		<section class="not-found" use:fadeInUp={{ delay: 0 }}>
			<div class="not-found-content">
				<h1 class="not-found-title">{t('contracts.notFound')}</h1>
				<p class="not-found-description">
					{t('contracts.notFound.description', { address: data.address })}
				</p>
				<a href={localizeHref('/')} class="back-link">
					{t('contracts.backToHome')}
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

	/* Contract Header */
	.contract-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		flex-wrap: wrap;
	}

	.contract-identity {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.contract-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-muted);
		border-radius: var(--radius-lg);
		color: var(--accent);
	}

	.contract-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.contract-name {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		line-height: 1.2;
	}

	.contract-badges {
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

	.badge-proxy {
		background: rgba(251, 191, 36, 0.15);
		border-color: #fbbf24;
		color: #fbbf24;
	}

	.badge-optimized {
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
		flex-wrap: wrap;
		gap: var(--space-2);
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

	.info-value.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
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
		margin: 0;
	}

	/* Proxy Section */
	.proxy-section {
		margin-bottom: var(--space-8);
	}

	/* ABI Section */
	.abi-section {
		margin-bottom: var(--space-8);
	}

	.abi-section .section-title {
		margin-bottom: var(--space-4);
	}

	/* Glass Card */
	.glass-card {
		background: var(--glass-bg);
		border: 1px solid var(--glass-border);
		box-shadow: var(--shadow-sm);
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

		.contract-header {
			flex-direction: column;
		}

		.contract-icon {
			width: 48px;
			height: 48px;
		}

		.contract-icon svg {
			width: 24px;
			height: 24px;
		}

		.contract-name {
			font-size: var(--text-xl);
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
