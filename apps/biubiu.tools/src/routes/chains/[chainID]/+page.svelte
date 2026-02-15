<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import ChainSearch from '$lib/components/ChainSearch.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PageFooter from '$lib/components/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Copy state for RPC endpoints
	let copiedIndex = $state<number | null>(null);

	// Logo fallback state
	let logoError = $state(false);

	// Default chain icon SVG
	const defaultLogoUrl = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="24" fill="#2d3748"/><path d="M24 8L32 24L24 32L16 24L24 8Z" fill="#a0aec0"/><path d="M24 36L32 28L24 32L16 28L24 36Z" fill="#718096"/></svg>`);

	// RPC latency state: rpcUrl -> { latency: number | null, status: 'pending' | 'success' | 'error' }
	let rpcLatencies = $state<Map<string, { latency: number | null; status: 'pending' | 'success' | 'error' }>>(new Map());

	const seoProps = $derived(
		data.chain
			? getBaseSEO({
					title: t('chains.title', { name: data.chain.name }),
					description: t('chains.description', { name: data.chain.name }),
					currentLocale: locale.value
				})
			: getBaseSEO({
					title: t('chains.notFound'),
					description: t('chains.notFound.description', { chainId: data.chainId }),
					currentLocale: locale.value
				})
	);

	// Test HTTP RPC latency
	async function testHttpRpcLatency(rpcUrl: string): Promise<{ latency: number | null; status: 'success' | 'error' }> {
		const start = performance.now();
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_chainId',
					params: [],
					id: 1
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const latency = Math.round(performance.now() - start);
				return { latency, status: 'success' };
			}
			return { latency: null, status: 'error' };
		} catch {
			return { latency: null, status: 'error' };
		}
	}

	// Test WebSocket RPC latency
	function testWsRpcLatency(rpcUrl: string): Promise<{ latency: number | null; status: 'success' | 'error' }> {
		return new Promise((resolve) => {
			const start = performance.now();
			let ws: WebSocket | null = null;
			let timeoutId: ReturnType<typeof setTimeout>;

			try {
				ws = new WebSocket(rpcUrl);

				timeoutId = setTimeout(() => {
					if (ws) {
						ws.close();
					}
					resolve({ latency: null, status: 'error' });
				}, 5000);

				ws.onopen = () => {
					ws!.send(JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_chainId',
						params: [],
						id: 1
					}));
				};

				ws.onmessage = () => {
					clearTimeout(timeoutId);
					const latency = Math.round(performance.now() - start);
					ws!.close();
					resolve({ latency, status: 'success' });
				};

				ws.onerror = () => {
					clearTimeout(timeoutId);
					ws!.close();
					resolve({ latency: null, status: 'error' });
				};
			} catch {
				if (timeoutId!) clearTimeout(timeoutId!);
				if (ws) ws.close();
				resolve({ latency: null, status: 'error' });
			}
		});
	}

	// Test RPC latency (handles both HTTP and WebSocket)
	async function testRpcLatency(rpcUrl: string): Promise<{ latency: number | null; status: 'success' | 'error' }> {
		if (rpcUrl.startsWith('http')) {
			return testHttpRpcLatency(rpcUrl);
		} else if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
			return testWsRpcLatency(rpcUrl);
		}
		return { latency: null, status: 'error' };
	}

	// Check if RPC URL is testable (HTTP or WebSocket)
	function isTestableRpc(rpc: string): boolean {
		return rpc.startsWith('http') || rpc.startsWith('wss://') || rpc.startsWith('ws://');
	}

	// Test all RPC endpoints on mount
	$effect(() => {
		if (browser && data.chain?.rpc) {
			const publicRpcs = getPublicRpcEndpoints(data.chain.rpc);

			// Initialize all testable RPCs as pending
			const initialMap = new Map<string, { latency: number | null; status: 'pending' | 'success' | 'error' }>();
			publicRpcs.forEach(rpc => {
				if (isTestableRpc(rpc)) {
					initialMap.set(rpc, { latency: null, status: 'pending' });
				}
			});
			rpcLatencies = initialMap;

			// Test each RPC endpoint
			publicRpcs.forEach(async (rpc) => {
				if (!isTestableRpc(rpc)) return;

				const result = await testRpcLatency(rpc);
				rpcLatencies = new Map(rpcLatencies).set(rpc, result);
			});
		}
	});

	async function copyToClipboard(text: string, index: number) {
		try {
			await navigator.clipboard.writeText(text);
			copiedIndex = index;
			setTimeout(() => {
				copiedIndex = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Filter out private/sensitive RPC endpoints
	function getPublicRpcEndpoints(rpcs: string[]): string[] {
		return rpcs.filter((rpc) => {
			// Filter out endpoints with API keys or private patterns
			return !rpc.includes('${') && !rpc.includes('API_KEY') && !rpc.includes('INFURA');
		});
	}

	// Get latency display class
	function getLatencyClass(latency: number | null): string {
		if (latency === null) return '';
		if (latency < 200) return 'latency-good';
		if (latency < 500) return 'latency-medium';
		return 'latency-slow';
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	{#if data.chain}
		<!-- Search Section -->
		<section class="search-section" use:fadeInUp={{ delay: 0 }}>
			<ChainSearch currentChainId={data.chain.chainId} />
		</section>

		<!-- Chain Header -->
		<section class="chain-header" use:fadeInUp={{ delay: 50 }}>
			<div class="chain-identity">
				<img
					src={logoError ? defaultLogoUrl : data.logoUrl}
					alt={data.chain.name}
					class="chain-logo"
					onerror={() => (logoError = true)}
				/>
				<div class="chain-info">
					<h1 class="chain-name">{data.chain.name}</h1>
						<div class="chain-badges">
						<span class="badge badge-primary">#{data.chain.chainId}</span>
						<span class="badge">{data.chain.shortName}</span>
						{#if data.chain.nativeCurrency}
							<span class="badge">{data.chain.nativeCurrency.symbol}</span>
						{/if}
					</div>
				</div>
			</div>
			<div class="header-links">
				{#if data.chain.infoURL}
					<a href={data.chain.infoURL} target="_blank" rel="noopener noreferrer" class="header-link">
						{t('chains.info.website')}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</a>
				{/if}
				<a
					href={`https://github.com/atshelchin/ethereum-data/blob/main/chains/eip155-${data.chain.chainId}.json`}
					target="_blank"
					rel="noopener noreferrer"
					class="header-link edit-link"
				>
					{t('chains.editOnGithub')}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				</a>
			</div>
		</section>

		<!-- Info Cards Grid -->
		<section class="info-grid" use:fadeInUp={{ delay: 100 }}>
			<!-- Native Currency Card -->
			{#if data.chain.nativeCurrency}
				<div class="info-card glass-card">
					<h3 class="card-title">{t('chains.nativeCurrency')}</h3>
					<div class="card-content">
						<div class="info-row">
							<span class="info-label">{t('chains.info.symbol')}</span>
							<span class="info-value highlight">{data.chain.nativeCurrency.symbol}</span>
						</div>
						<div class="info-row">
							<span class="info-label">{data.chain.nativeCurrency.name}</span>
							<span class="info-value">{data.chain.nativeCurrency.decimals} {t('chains.info.decimals')}</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Network Info Card -->
			<div class="info-card glass-card">
				<h3 class="card-title">{t('chains.features')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('chains.info.chainId')}</span>
						<span class="info-value mono">{data.chain.chainId}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('chains.info.networkId')}</span>
						<span class="info-value mono">{data.chain.networkId}</span>
					</div>
					{#if data.chain.features && data.chain.features.length > 0}
						<div class="feature-tags">
							{#each data.chain.features as feature}
								<span class="feature-tag">{feature.name}</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- RPC Endpoints -->
		{#if data.chain.rpc && data.chain.rpc.length > 0}
			<section class="rpc-section" use:fadeInUp={{ delay: 150 }}>
				<h2 class="section-title">{t('chains.rpcEndpoints')}</h2>
				<div class="rpc-list glass-card">
					{#each getPublicRpcEndpoints(data.chain.rpc) as rpc, index}
						{@const latencyInfo = rpcLatencies.get(rpc)}
						<div class="rpc-item">
							<code class="rpc-url">{rpc}</code>
							<div class="rpc-actions">
								{#if isTestableRpc(rpc)}
									{#if latencyInfo?.status === 'pending'}
										<span class="latency-badge latency-pending">
											<span class="latency-dot"></span>
										</span>
									{:else if latencyInfo?.status === 'success' && latencyInfo.latency !== null}
										<span class="latency-badge {getLatencyClass(latencyInfo.latency)}">
											{latencyInfo.latency}ms
										</span>
									{:else if latencyInfo?.status === 'error'}
										<span class="latency-badge latency-error">✕</span>
									{/if}
								{/if}
								<button class="copy-btn" onclick={() => copyToClipboard(rpc, index)}>
								{#if copiedIndex === index}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									<span>{t('chains.rpcEndpoints.copied')}</span>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
										<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
									</svg>
									<span>{t('chains.rpcEndpoints.copy')}</span>
								{/if}
							</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Block Explorers -->
		{#if data.chain.explorers && data.chain.explorers.length > 0}
			<section class="explorers-section" use:fadeInUp={{ delay: 200 }}>
				<h2 class="section-title">{t('chains.explorers')}</h2>
				<div class="explorers-grid">
					{#each data.chain.explorers as explorer}
						<a
							href={explorer.url}
							target="_blank"
							rel="noopener noreferrer"
							class="explorer-card glass-card"
						>
							<span class="explorer-name">{explorer.name}</span>
							<span class="explorer-link">
								{t('chains.explorers.visit')}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<line x1="7" y1="17" x2="17" y2="7" />
									<polyline points="7 7 17 7 17 17" />
								</svg>
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- ENS Registry -->
		{#if data.chain.ens?.registry}
			<section class="ens-section" use:fadeInUp={{ delay: 250 }}>
				<h2 class="section-title">{t('chains.ens')}</h2>
				<div class="glass-card ens-card">
					<code class="ens-address">{data.chain.ens.registry}</code>
				</div>
			</section>
		{/if}

		<!-- Faucets -->
		{#if data.chain.faucets && data.chain.faucets.length > 0}
			<section class="faucets-section" use:fadeInUp={{ delay: 300 }}>
				<h2 class="section-title">{t('chains.faucets')}</h2>
				<div class="faucets-list">
					{#each data.chain.faucets as faucet}
						<a href={faucet} target="_blank" rel="noopener noreferrer" class="faucet-link glass-card">
							{faucet}
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
		<!-- Not Found State -->
		<section class="not-found" use:fadeInUp={{ delay: 0 }}>
			<div class="not-found-content">
				<h1 class="not-found-title">{t('chains.notFound')}</h1>
				<p class="not-found-description">
					{t('chains.notFound.description', { chainId: data.chainId })}
				</p>
				<a href={localizeHref('/')} class="back-link">
					{t('chains.backToHome')}
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
		margin-bottom: var(--space-8);
		display: flex;
		justify-content: center;
	}

	/* Chain Header */
	.chain-header {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-8);
		flex-wrap: wrap;
	}

	.chain-identity {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.chain-logo {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-lg);
		background: var(--bg-raised);
		object-fit: contain;
	}

	.chain-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.chain-name {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0;
		line-height: 1.2;
	}

	.chain-badges {
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
		position: relative;
		z-index: 1;
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

	.feature-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.feature-tag {
		padding: var(--space-1) var(--space-2);
		background: var(--accent-muted);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--accent);
	}

	/* Section Title */
	.section-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	/* RPC Section */
	.rpc-section {
		position: relative;
		z-index: 1;
		margin-bottom: var(--space-8);
	}

	.rpc-list {
		padding: var(--space-2);
		border-radius: var(--radius-lg);
	}

	.rpc-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		transition: background var(--motion-fast) var(--easing);
	}

	.rpc-item:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.rpc-url {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.copy-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}

	.copy-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.rpc-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.latency-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.latency-good {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}

	.latency-medium {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.latency-slow {
		background: rgba(248, 113, 113, 0.15);
		color: #f87171;
	}

	.latency-error {
		background: rgba(248, 113, 113, 0.1);
		color: #f87171;
		min-width: 28px;
	}

	.latency-pending {
		background: rgba(255, 255, 255, 0.05);
		min-width: 28px;
	}

	.latency-dot {
		width: 6px;
		height: 6px;
		background: var(--fg-subtle);
		border-radius: 50%;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}

	/* Explorers Section */
	.explorers-section {
		margin-bottom: var(--space-8);
	}

	.explorers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--space-3);
	}

	.explorer-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.explorer-card:hover {
		transform: translateY(-2px);
		background: rgba(255, 255, 255, 0.08);
	}

	.explorer-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.explorer-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	/* ENS Section */
	.ens-section {
		margin-bottom: var(--space-8);
	}

	.ens-card {
		padding: var(--space-4);
		border-radius: var(--radius-md);
	}

	.ens-address {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		word-break: break-all;
	}

	/* Faucets Section */
	.faucets-section {
		margin-bottom: var(--space-8);
	}

	.faucets-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.faucet-link {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		word-break: break-all;
		transition: all var(--motion-fast) var(--easing);
	}

	.faucet-link:hover {
		color: var(--accent);
		background: rgba(255, 255, 255, 0.08);
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
		.page {
			padding: var(--space-6) var(--space-4);
		}

		.chain-header {
			flex-direction: column;
		}

		.chain-logo {
			width: 40px;
			height: 40px;
		}

		.chain-name {
			font-size: var(--text-2xl);
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.explorers-grid {
			grid-template-columns: 1fr;
		}

		.rpc-item {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-2);
		}

		.rpc-url {
			width: 100%;
		}

		.rpc-actions {
			align-self: flex-end;
		}
	}
</style>
